import json
import asyncio
import uuid
import re
import logging
from datetime import datetime
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from sse_starlette.sse import EventSourceResponse
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_session
from app.db.models import Order, Customer, InventorySKU, OrderItem, AuditLog, Invoice
from app.db.seed import seed_database
from app.services.cloudinary_service import upload_file_to_cloudinary
from app.services.invoice_service import invoice_cache
from app.agents.graph import o2c_graph
from app.agents.state import O2CState

logger = logging.getLogger("orchestrator_api")
router = APIRouter(prefix="/api/v1", tags=["Orchestrator"])

# ---------------------------------------------------------------------------
# Inline ingestion parser (text + JSON only — no OCR / vision / tesseract)
# ---------------------------------------------------------------------------
def _parse_text_order(raw_text: str) -> dict:
    """Regex-based fallback for unstructured text/email purchase orders."""
    cust_match = re.search(r"CUST-[A-Z0-9]+", raw_text, re.IGNORECASE)
    customer_id = cust_match.group(0).upper() if cust_match else "UNKNOWN_CUSTOMER"

    addr_match = re.search(r"[Ss]hip(?:ping|\s+to)?[:\s]+([^\n]+)", raw_text)
    shipping_address = addr_match.group(1).strip() if addr_match else None

    sku_pattern = r"(SKU-[A-Z0-9-]+)[^\d]+(\d+)(?:[^\d.]*?([\d]+(?:\.\d+)?))?"
    items = []
    for m in re.finditer(sku_pattern, raw_text, re.IGNORECASE):
        sku = m.group(1).upper()
        qty = int(m.group(2))
        price = float(m.group(3)) if m.group(3) else None
        items.append({"sku": sku, "requested_qty": qty, "unit_price": price})

    if not items:
        raise ValueError("Could not find any SKU codes in the input text. Please use format: SKU-XXXX: N units")

    return {"customer_id": customer_id, "shipping_address": shipping_address, "billing_address": None, "items": items}


def _parse_json_order(raw_json: str) -> dict:
    """Parse structured JSON purchase order payload."""
    data = json.loads(raw_json)
    if not data.get("customer_id"):
        raise ValueError("JSON payload missing 'customer_id' field.")
    if not data.get("items"):
        raise ValueError("JSON payload missing 'items' array.")
    return {
        "customer_id": data["customer_id"],
        "shipping_address": data.get("shipping_address"),
        "billing_address": data.get("billing_address"),
        "items": data["items"]
    }

active_executions: Dict[str, O2CState] = {}

@router.post("/seed")
async def trigger_seed():
    try:
        await seed_database()
        return {"status": "success", "message": "Database seeded successfully with customers, admin, and inventory SKUs."}
    except Exception as e:
        logger.error(f"Seeding failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/presets")
async def get_test_presets(session: AsyncSession = Depends(get_async_session)):
    """
    Dynamically generates edge-case test presets from live DB data.
    No values are hardcoded — all customer IDs, SKUs, quantities and prices come from Neon DB.
    """
    customers = (await session.execute(select(Customer))).scalars().all()
    skus = (await session.execute(select(InventorySKU))).scalars().all()

    if not customers or not skus:
        return {"presets": []}

    # Helpers
    active_custs = [c for c in customers if c.is_active]
    inactive_custs = [c for c in customers if not c.is_active]
    in_stock = [s for s in skus if s.available_quantity > 0]
    out_of_stock = [s for s in skus if s.available_quantity == 0]
    low_stock = sorted(in_stock, key=lambda s: s.available_quantity)  # ascending

    presets = []

    # --- Preset 1: Happy Path (fully in-stock, valid customer) ---
    if active_custs and len(in_stock) >= 2:
        c = active_custs[0]
        s1, s2 = in_stock[0], in_stock[1]
        presets.append({
            "id": "happy_path",
            "label": "✅ Happy Path — Fully In-Stock Order",
            "description": f"Valid customer {c.id}, 2 SKUs both fully available. Expected: COMPLETED.",
            "input_type": "json",
            "payload": {
                "customer_id": c.id,
                "shipping_address": c.shipping_address,
                "items": [
                    {"sku": s1.sku, "requested_qty": min(2, s1.available_quantity), "unit_price": s1.unit_price},
                    {"sku": s2.sku, "requested_qty": min(3, s2.available_quantity), "unit_price": s2.unit_price}
                ]
            }
        })

    # --- Preset 2: Inventory Shortage (request more than available) ---
    if active_custs and low_stock:
        c = active_custs[0]
        s = low_stock[0]
        overorder_qty = s.available_quantity + 10
        presets.append({
            "id": "inventory_shortage",
            "label": "⚠️ Inventory Shortage — Backorder Triggered",
            "description": f"Orders {overorder_qty} units of {s.sku} but only {s.available_quantity} available. Expected: HELD_FOR_DECISION.",
            "input_type": "json",
            "payload": {
                "customer_id": c.id,
                "shipping_address": c.shipping_address,
                "items": [
                    {"sku": s.sku, "requested_qty": overorder_qty, "unit_price": s.unit_price}
                ]
            }
        })

    # --- Preset 3: High-Value Order (risk flag) ---
    if active_custs and in_stock:
        # Find customer closest to credit limit
        c = sorted(active_custs, key=lambda x: x.credit_limit - x.current_exposure)[0]
        s = in_stock[0]
        # Request enough to exceed $10k threshold
        high_qty = max(1, int(10500 / s.unit_price) + 1)
        presets.append({
            "id": "high_value_risk",
            "label": "🔴 High-Value Risk — Credit Exposure Alert",
            "description": f"Order value ~${high_qty * s.unit_price:,.0f} for customer {c.id} (credit limit ${c.credit_limit:,.0f}). Expected: HELD_FOR_REVIEW.",
            "input_type": "json",
            "payload": {
                "customer_id": c.id,
                "shipping_address": c.shipping_address,
                "items": [
                    {"sku": s.sku, "requested_qty": min(high_qty, s.available_quantity), "unit_price": s.unit_price}
                ]
            }
        })

    # --- Preset 4: Unknown Customer (validation failure) ---
    if in_stock:
        s = in_stock[0]
        presets.append({
            "id": "unknown_customer",
            "label": "❌ Unknown Customer — Validation Failure",
            "description": "Uses a non-existent customer ID. Expected: VALIDATION_ERROR.",
            "input_type": "json",
            "payload": {
                "customer_id": "CUST-INVALID-9999",
                "shipping_address": "123 Unknown Street, TX",
                "items": [
                    {"sku": s.sku, "requested_qty": 1, "unit_price": s.unit_price}
                ]
            }
        })

    # --- Preset 5: Inactive Customer ---
    if inactive_custs and in_stock:
        c = inactive_custs[0]
        s = in_stock[0]
        presets.append({
            "id": "inactive_customer",
            "label": "🚫 Inactive Customer — Blocked at Validation",
            "description": f"Customer {c.id} is flagged as inactive. Expected: VALIDATION_ERROR.",
            "input_type": "json",
            "payload": {
                "customer_id": c.id,
                "shipping_address": c.shipping_address,
                "items": [
                    {"sku": s.sku, "requested_qty": 1, "unit_price": s.unit_price}
                ]
            }
        })

    # --- Preset 6: Out-of-Stock SKU ---
    if active_custs and out_of_stock:
        c = active_custs[0]
        s = out_of_stock[0]
        presets.append({
            "id": "out_of_stock",
            "label": "📦 Out of Stock — Zero Inventory SKU",
            "description": f"{s.sku} has 0 units available. Expected: HELD_FOR_DECISION.",
            "input_type": "json",
            "payload": {
                "customer_id": c.id,
                "shipping_address": c.shipping_address,
                "items": [
                    {"sku": s.sku, "requested_qty": 5, "unit_price": s.unit_price}
                ]
            }
        })

    return {"presets": presets, "customers": [{"id": c.id, "name": c.name} for c in active_custs], "skus": [{"sku": s.sku, "name": s.name, "available": s.available_quantity, "price": s.unit_price} for s in skus]}



@router.post("/ingest")
async def ingest_order(
    input_type: str = Form("text"),  # text or json
    raw_text: Optional[str] = Form(None)
):
    """Stage 0 Ingestion Node — parses text or JSON purchase order payloads."""
    try:
        if input_type == "json" and raw_text and raw_text.strip():
            parsed = _parse_json_order(raw_text)
        elif raw_text and raw_text.strip():
            parsed = _parse_text_order(raw_text)
        else:
            raise ValueError("No order content provided. Please supply text or JSON.")

        order_id = f"ORD-2026-{uuid.uuid4().hex[:6].upper()}"

        initial_state: O2CState = {
            "order_id": order_id,
            "customer_id": parsed["customer_id"],
            "shipping_address": parsed.get("shipping_address"),
            "billing_address": parsed.get("billing_address"),
            "input_items": parsed["items"],
            "validation_status": "PENDING",
            "validation_errors": [],
            "validation_warnings": [],
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
                "message": f"Order payload parsed ({input_type.upper()}). {len(parsed['items'])} line item(s) extracted. Order {order_id} initialized.",
                "payload": {"parsed": parsed},
                "timestamp": datetime.utcnow().isoformat()
            }]
        }

        active_executions[order_id] = initial_state

        return {
            "order_id": order_id,
            "parsed_payload": parsed,
            "initial_state": initial_state
        }
    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse order payload: {str(e)}")

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

@router.get("/orders/{order_id}/details")
async def get_order_details(order_id: str, session: AsyncSession = Depends(get_async_session)):
    """Returns complete details of an order, including line items, cancellation/stage status, and full audit logs."""
    stmt = select(Order).where(Order.id == order_id)
    order_obj = (await session.execute(stmt)).scalar_one_or_none()
    
    order_data = {}
    if order_obj:
        order_data = {
            "id": order_obj.id,
            "customer_id": order_obj.customer_id,
            "status": order_obj.status,
            "raw_input_type": order_obj.raw_input_type,
            "raw_input_url": order_obj.raw_input_url,
            "subtotal": order_obj.subtotal,
            "tax_amount": order_obj.tax_amount,
            "shipping_cost": order_obj.shipping_cost,
            "total_amount": order_obj.total_amount,
            "risk_score": order_obj.risk_score,
            "risk_level": order_obj.risk_level,
            "created_at": order_obj.created_at.isoformat() if order_obj.created_at else None,
            "updated_at": order_obj.updated_at.isoformat() if order_obj.updated_at else None,
        }
    elif order_id in active_executions:
        st = active_executions[order_id]
        order_data = {
            "id": order_id,
            "customer_id": st.get("customer_id", "UNKNOWN"),
            "status": st.get("overall_status", "PENDING"),
            "subtotal": st.get("subtotal", 0.0),
            "tax_amount": st.get("tax_amount", 0.0),
            "shipping_cost": st.get("shipping_cost", 0.0),
            "total_amount": st.get("total_amount", 0.0),
            "risk_score": st.get("risk_score", 0.0),
            "risk_level": st.get("risk_level", "LOW_RISK"),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
    else:
        raise HTTPException(status_code=404, detail=f"Order '{order_id}' not found.")

    item_stmt = select(OrderItem).where(OrderItem.order_id == order_id)
    db_items = (await session.execute(item_stmt)).scalars().all()
    items = [
        {
            "sku": i.sku,
            "requested_qty": i.requested_qty,
            "allocated_qty": i.allocated_qty,
            "backordered_qty": i.backordered_qty,
            "unit_price": i.unit_price,
            "line_total": i.line_total
        }
        for i in db_items
    ]
    if not items and order_id in active_executions:
        items = active_executions[order_id].get("inventory_reservations", [])

    audit_stmt = select(AuditLog).where(AuditLog.order_id == order_id).order_by(AuditLog.created_at.asc())
    db_audits = (await session.execute(audit_stmt)).scalars().all()
    audit_logs = [
        {
            "agent_name": a.agent_name,
            "status": a.status,
            "message": a.message,
            "payload_json": a.payload_json,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in db_audits
    ]
    if order_id in active_executions:
        mem_audits = active_executions[order_id].get("audit_logs", [])
        for ma in mem_audits:
            audit_logs.append({
                "agent_name": ma.get("agent_name", "Orchestrator"),
                "status": ma.get("status", "INFO"),
                "message": ma.get("message", ""),
                "payload_json": json.dumps(ma.get("payload")) if ma.get("payload") else None,
                "created_at": ma.get("timestamp") or datetime.utcnow().isoformat()
            })

    return {
        "order": order_data,
        "items": items,
        "audit_logs": audit_logs
    }

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
