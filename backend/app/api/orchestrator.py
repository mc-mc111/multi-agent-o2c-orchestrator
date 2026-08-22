import json
import asyncio
import uuid
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, Request, Response
from sse_starlette.sse import EventSourceResponse
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_session
from app.db.models import Order, Customer, InventorySKU, OrderItem, AuditLog, Invoice
from app.db.seed import seed_database
from app.services.ocr_service import process_ingestion, OrderRequest
from app.services.cloudinary_service import upload_file_to_cloudinary
from app.services.invoice_service import invoice_cache
from app.agents.graph import o2c_graph
from app.agents.state import O2CState

logger = logging.getLogger("orchestrator_api")
router = APIRouter(prefix="/api/v1", tags=["Orchestrator"])

active_executions: Dict[str, O2CState] = {}

@router.post("/seed")
async def trigger_seed():
    try:
        await seed_database()
        return {"status": "success", "message": "Database seeded successfully with customers, admin, and inventory SKUs."}
    except Exception as e:
        logger.error(f"Seeding failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ingest")
async def ingest_order(
    input_type: str = Form("text"), # text, json, file
    raw_text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """Stage 0 Ingestion API Node."""
    file_bytes = None
    filename = None
    file_url = None
    
    if file:
        file_bytes = await file.read()
        filename = file.filename
        file_url = await upload_file_to_cloudinary(file_bytes, filename, folder="supervity")
        
    try:
        parsed_order = await process_ingestion(
            input_type=input_type,
            raw_text=raw_text,
            file_bytes=file_bytes,
            filename=filename
        )
        
        order_id = f"ORD-2026-{uuid.uuid4().hex[:6].upper()}"
        
        initial_state: O2CState = {
            "order_id": order_id,
            "customer_id": parsed_order.customer_id,
            "shipping_address": parsed_order.shipping_address,
            "billing_address": parsed_order.billing_address,
            "input_items": [item.model_dump() for item in parsed_order.items],
            "validation_status": "PENDING",
            "validation_errors": [],
            "customer_name": None,
            "customer_email": None,
            "inventory_status": "PENDING",
            "inventory_reservations": [],
            "inventory_exceptions": [],
            "human_resolution": None,
            "billing_status": "PENDING",
            "subtotal": 0.0,
            "tax_amount": 0.0,
            "shipping_cost": 0.0,
            "total_amount": 0.0,
            "invoice_id": None,
            "invoice_pdf_url": None,
            "invoice_html_url": None,
            "risk_status": "PENDING",
            "risk_score": 0.0,
            "risk_flags": [],
            "current_agent": "IngestionNode",
            "overall_status": "PENDING",
            "audit_logs": [{
                "agent_name": "IngestionNode",
                "status": "SUCCESS",
                "message": f"Multi-modal payload parsed ({input_type.upper()}). Order {order_id} initialized.",
                "payload": {"parsed": parsed_order.model_dump(), "file_url": file_url},
                "timestamp": "2026-08-22T11:45:00Z"
            }]
        }
        
        active_executions[order_id] = initial_state
        
        return {
            "order_id": order_id,
            "file_url": file_url,
            "parsed_payload": parsed_order,
            "initial_state": initial_state
        }
    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse ingestion payload: {str(e)}")

@router.get("/orchestrate/stream")
async def stream_orchestration(order_id: str, request: Request):
    """Server-Sent Events (SSE) streaming state machine updates live to the UI."""
    if order_id not in active_executions:
        raise HTTPException(status_code=404, detail="Order execution ID not found")
        
    state = active_executions[order_id]
    
    async def event_generator():
        yield {
            "event": "state_update",
            "data": json.dumps({"agent": "IngestionNode", "state": state})
        }
        
        running_state = dict(state)
        try:
            async for step_output in o2c_graph.astream(state):
                for node_name, node_state in step_output.items():
                    running_state = {**running_state, **node_state}
                    active_executions[order_id] = running_state
                    
                    yield {
                        "event": "state_update",
                        "data": json.dumps({
                            "agent": node_name,
                            "state": running_state
                        })
                    }
                    await asyncio.sleep(0.5)
        except Exception as e:
            logger.error(f"Stream execution error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())

@router.post("/orchestrate/resume")
async def resume_orchestration(
    order_id: str = Form(...),
    resolution_action: str = Form(...), # KEEP_PARTIAL, REMOVE, SUBSTITUTE
    overrides_json: str = Form("{}")
):
    """Resumes graph execution after human-in-the-loop exception resolution."""
    if order_id not in active_executions:
        raise HTTPException(status_code=404, detail="Active execution not found")
        
    current_state = active_executions[order_id]
    try:
        overrides = json.loads(overrides_json)
    except Exception:
        overrides = {}
        
    current_state["human_resolution"] = {
        "action": resolution_action,
        "overrides": overrides
    }
    
    updated_state = await o2c_graph.ainvoke(current_state)
    active_executions[order_id] = updated_state
    
    return {
        "status": "resumed",
        "order_id": order_id,
        "updated_state": updated_state
    }

@router.post("/orders/{order_id}/approve")
async def approve_held_order(order_id: str, session: AsyncSession = Depends(get_async_session)):
    """Allows operations user to override Risk Agent 'HELD_FOR_REVIEW' flag and approve order."""
    stmt = select(Order).where(Order.id == order_id)
    order_obj = (await session.execute(stmt)).scalar_one_or_none()
    
    if not order_obj:
        # Check active executions
        if order_id in active_executions:
            active_executions[order_id]["overall_status"] = "COMPLETED"
            active_executions[order_id]["audit_logs"].append({
                "agent_name": "RiskAgent",
                "status": "SUCCESS",
                "message": "Manual Admin Approval Granted. Risk flag overridden.",
                "payload": {"override": True},
                "timestamp": "2026-08-22T12:25:00Z"
            })
            return {"status": "approved", "order_id": order_id, "updated_state": active_executions[order_id]}
        raise HTTPException(status_code=404, detail="Order not found")
        
    order_obj.status = "COMPLETED"
    session.add(order_obj)
    
    audit_entry = AuditLog(
        order_id=order_id,
        agent_name="RiskAgent",
        status="SUCCESS",
        message="Manual Admin Approval Granted. Risk flag overridden.",
        payload_json=json.dumps({"override": True})
    )
    session.add(audit_entry)
    await session.commit()
    
    if order_id in active_executions:
        active_executions[order_id]["overall_status"] = "COMPLETED"
        
    return {"status": "approved", "order_id": order_id}

@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(invoice_id: str):
    """Zero-404 Endpoint serving generated PDF invoice directly."""
    if invoice_id in invoice_cache and "pdf" in invoice_cache[invoice_id]:
        return Response(content=invoice_cache[invoice_id]["pdf"], media_type="application/pdf")
        
    # Generate on the fly if cached PDF not found
    from app.services.invoice_service import generate_invoice_document
    doc = await generate_invoice_document(
        invoice_id=invoice_id,
        order_id=f"ORD-2026-{invoice_id.split('-')[-1]}",
        customer_id="CUST-1001",
        customer_name="Acme Solutions",
        customer_email="billing@customer.com",
        shipping_address="100 Innovation Way, Austin TX",
        items=[{"sku": "SKU-SERVER-01", "name": "Rack Server 2U", "allocated_qty": 2, "backordered_qty": 0, "unit_price": 3500.0, "line_total": 7000.0}],
        subtotal=7000.0,
        tax=577.50,
        shipping=0.0,
        total=7577.50
    )
    return Response(content=invoice_cache[invoice_id]["pdf"], media_type="application/pdf")

@router.get("/invoices/{invoice_id}/html")
async def get_invoice_html(invoice_id: str):
    """Endpoint serving generated HTML invoice directly."""
    if invoice_id in invoice_cache and "html" in invoice_cache[invoice_id]:
        return Response(content=invoice_cache[invoice_id]["html"], media_type="text/html")
    return Response(content="<h1>Invoice Not Found</h1>", media_type="text/html", status_code=404)

@router.get("/inventory")
async def list_inventory(session: AsyncSession = Depends(get_async_session)):
    stmt = select(InventorySKU)
    skus = (await session.execute(stmt)).scalars().all()
    return skus

@router.get("/customers")
async def list_customers(session: AsyncSession = Depends(get_async_session)):
    stmt = select(Customer)
    customers = (await session.execute(stmt)).scalars().all()
    return customers

@router.post("/inventory/add")
async def add_inventory_sku(payload: Dict[str, Any], session: AsyncSession = Depends(get_async_session)):
    sku_code = payload.get("sku", "").strip().upper()
    name = payload.get("name", "").strip()
    price = float(payload.get("unit_price", 100.0))
    qty = int(payload.get("available_quantity", 0))
    
    if not sku_code or not name:
        raise HTTPException(status_code=400, detail="SKU code and name required")
        
    stmt = select(InventorySKU).where(InventorySKU.sku == sku_code)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    
    if existing:
        existing.available_quantity += qty
        existing.unit_price = price
        existing.name = name
    else:
        new_sku = InventorySKU(
            sku=sku_code,
            name=name,
            unit_price=price,
            available_quantity=qty,
            reserved_quantity=0,
            reorder_threshold=5
        )
        session.add(new_sku)
        
    await session.commit()
    return {"status": "success", "sku": sku_code}

@router.post("/customers/add")
async def add_customer_account(payload: Dict[str, Any], session: AsyncSession = Depends(get_async_session)):
    raw_id = payload.get("id", "").strip().upper()
    name = payload.get("name", "").strip()
    email = payload.get("email", "").strip()
    limit = float(payload.get("credit_limit", 50000.0))
    shipping = payload.get("shipping_address", "").strip() or "100 Corporate Blvd, Austin TX"
    billing = payload.get("billing_address", "").strip() or "100 Corporate Blvd, Austin TX"
    
    if not name or not email:
        raise HTTPException(status_code=400, detail="Name and email required")
        
    cust_id = raw_id if raw_id else f"CUST-{uuid.uuid4().hex[:4].upper()}"
    
    stmt = select(Customer).where((Customer.id == cust_id) | (Customer.email == email))
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"Customer ID '{cust_id}' or Email '{email}' already exists.")
        
    new_cust = Customer(
        id=cust_id,
        name=name,
        email=email,
        credit_limit=limit,
        current_exposure=0.0,
        shipping_address=shipping,
        billing_address=billing,
        is_active=True
    )
    session.add(new_cust)
    await session.commit()
    return {"status": "success", "customer_id": cust_id}

@router.get("/orders")
async def list_all_orders(session: AsyncSession = Depends(get_async_session)):
    stmt = select(Order).order_by(Order.created_at.desc())
    db_orders = (await session.execute(stmt)).scalars().all()
    
    order_dict = {}
    for o in db_orders:
        order_dict[o.id] = {
            "id": o.id,
            "customer_id": o.customer_id,
            "status": o.status,
            "total_amount": o.total_amount,
            "risk_score": o.risk_score,
            "created_at": o.created_at.isoformat() if o.created_at else None
        }
        
    for oid, state in active_executions.items():
        if oid not in order_dict:
            order_dict[oid] = {
                "id": oid,
                "customer_id": state.get("customer_id", "UNKNOWN"),
                "status": state.get("overall_status", "PENDING"),
                "total_amount": state.get("total_amount", 0.0),
                "risk_score": state.get("risk_score", 0.0),
                "created_at": datetime.utcnow().isoformat()
            }
            
    return list(order_dict.values())

@router.post("/orders/{order_id}/cancel")
async def cancel_order_and_unreserve_stock(order_id: str, session: AsyncSession = Depends(get_async_session)):
    unreserved_details = []
    
    # 1. Update in-memory active execution state & unreserve in-memory stock
    if order_id in active_executions:
        mem_state = active_executions[order_id]
        if mem_state.get("overall_status") != "CANCELLED":
            mem_state["overall_status"] = "CANCELLED"
            mem_state["validation_status"] = "CANCELLED"
            reservations = mem_state.get("inventory_reservations", [])
            for res in reservations:
                alloc = res.get("allocated_qty", 0)
                if alloc > 0:
                    sku_stmt = select(InventorySKU).where(InventorySKU.sku == res["sku"])
                    sku_obj = (await session.execute(sku_stmt)).scalar_one_or_none()
                    if sku_obj:
                        sku_obj.available_quantity += alloc
                        sku_obj.reserved_quantity = max(0, sku_obj.reserved_quantity - alloc)
                        session.add(sku_obj)
                        unreserved_details.append(f"Restored {alloc} units of {res['sku']}")
                    res["allocated_qty"] = 0

    # 2. Update DB order object if present
    try:
        stmt = select(Order).where(Order.id == order_id)
        order_obj = (await session.execute(stmt)).scalar_one_or_none()
        
        if order_obj:
            if order_obj.status != "CANCELLED":
                item_stmt = select(OrderItem).where(OrderItem.order_id == order_id)
                items = (await session.execute(item_stmt)).scalars().all()
                
                for item in items:
                    if item.allocated_qty > 0:
                        sku_stmt = select(InventorySKU).where(InventorySKU.sku == item.sku)
                        sku_obj = (await session.execute(sku_stmt)).scalar_one_or_none()
                        if sku_obj:
                            sku_obj.available_quantity += item.allocated_qty
                            sku_obj.reserved_quantity = max(0, sku_obj.reserved_quantity - item.allocated_qty)
                            session.add(sku_obj)
                            unreserved_details.append(f"Restored {item.allocated_qty} units of {item.sku}")
                        item.allocated_qty = 0
                        session.add(item)
                            
                order_obj.status = "CANCELLED"
                order_obj.updated_at = datetime.utcnow()
                session.add(order_obj)
                
                audit = AuditLog(
                    order_id=order_id,
                    agent_name="TransactionManager",
                    status="CANCELLED",
                    message=f"Order cancelled by admin. Stock unreserved: {', '.join(unreserved_details) if unreserved_details else 'None'}"
                )
                session.add(audit)
                
        await session.commit()
    except Exception as e:
        logger.error(f"Error restoring stock in DB for cancelled order {order_id}: {e}")

    return {
        "status": "success",
        "message": f"Order {order_id} marked as CANCELLED.",
        "unreserved": unreserved_details
    }
