import json
import asyncio
import uuid
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, Request
from sse_starlette.sse import EventSourceResponse
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_async_session
from app.db.models import Order, Customer, InventorySKU, AuditLog
from app.db.seed import seed_database
from app.services.ocr_service import process_ingestion, OrderRequest
from app.services.cloudinary_service import upload_file_to_cloudinary
from app.agents.graph import o2c_graph
from app.agents.state import O2CState

logger = logging.getLogger("orchestrator_api")
router = APIRouter(prefix="/api/v1", tags=["Orchestrator"])

# In-memory execution store for active SSE runs
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
        
        # Execute LangGraph asynchronously
        try:
            async for step_output in o2c_graph.astream(state):
                for node_name, node_state in step_output.items():
                    active_executions[order_id] = {**state, **node_state}
                    current_state = active_executions[order_id]
                    
                    yield {
                        "event": "state_update",
                        "data": json.dumps({
                            "agent": node_name,
                            "state": current_state
                        })
                    }
                    await asyncio.sleep(0.5) # smooth animation pace for UI
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
    overrides_json: str = Form("{}") # e.g. {"SKU-MONITOR-03": "REMOVE"}
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
    
    # Resume graph execution from inventory node
    updated_state = await o2c_graph.ainvoke(current_state)
    active_executions[order_id] = updated_state
    
    return {
        "status": "resumed",
        "order_id": order_id,
        "updated_state": updated_state
    }

@router.get("/orders")
async def list_orders(session: AsyncSession = Depends(get_async_session)):
    stmt = select(Order).order_by(Order.created_at.desc())
    orders = (await session.execute(stmt)).scalars().all()
    return orders

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
