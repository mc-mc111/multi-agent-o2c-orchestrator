import logging
from datetime import datetime
from typing import Dict, Any, List
from sqlmodel import select
from app.db.database import async_session_maker
from app.db.models import Customer, InventorySKU, Order, OrderItem, Invoice, AuditLog
from app.agents.state import O2CState
from app.services.invoice_service import generate_invoice_document

logger = logging.getLogger("agent_nodes")

async def _save_or_update_order(session, state: O2CState, status: str, total_amount: float = 0.0, risk_score: float = 0.0, risk_level: str = "LOW"):
    order_id = state["order_id"]
    stmt = select(Order).where(Order.id == order_id)
    order_obj = (await session.execute(stmt)).scalar_one_or_none()
    
    if not order_obj:
        order_obj = Order(
            id=order_id,
            customer_id=state.get("customer_id", "UNKNOWN"),
            raw_input_type="text",
            status=status,
            subtotal=state.get("subtotal", 0.0),
            tax_amount=state.get("tax_amount", 0.0),
            shipping_cost=state.get("shipping_cost", 0.0),
            total_amount=total_amount,
            risk_score=risk_score,
            risk_level=risk_level
        )
        session.add(order_obj)
    else:
        order_obj.status = status
        order_obj.subtotal = state.get("subtotal", 0.0)
        order_obj.tax_amount = state.get("tax_amount", 0.0)
        order_obj.shipping_cost = state.get("shipping_cost", 0.0)
        order_obj.total_amount = total_amount
        order_obj.risk_score = risk_score
        order_obj.risk_level = risk_level
        order_obj.updated_at = datetime.utcnow()
        session.add(order_obj)
    await session.flush()
    return order_obj

# --- STAGE 1: VALIDATION AGENT ---
async def validation_node(state: O2CState) -> Dict[str, Any]:
    logger.info(f"ValidationAgent processing Order {state['order_id']}")
    audit_logs = list(state.get("audit_logs", []))
    errors = []
    
    async with async_session_maker() as session:
        cust_id = state.get("customer_id")
        cust_stmt = select(Customer).where(Customer.id == cust_id)
        customer = (await session.execute(cust_stmt)).scalar_one_or_none()
        
        if not customer:
            errors.append(f"Customer ID '{cust_id}' not found in active master database.")
        elif not customer.is_active:
            errors.append(f"Customer '{customer.name}' is inactive.")
            
        items = state.get("input_items", [])
        if not items:
            errors.append("Order contains no line items.")
            
        for idx, item in enumerate(items):
            if item.get("requested_qty", 0) <= 0:
                errors.append(f"Line item #{idx+1} ({item.get('sku')}) has non-positive quantity: {item.get('requested_qty')}")
                
        # Ensure Order row exists in Neon DB
        await _save_or_update_order(session, state, status="VALIDATION_ERROR" if errors else "VALIDATING")
        await session.commit()
        
    if errors:
        log_entry = {
            "agent_name": "ValidationAgent",
            "status": "ERROR",
            "message": f"Validation failed with {len(errors)} violation(s).",
            "payload": {"errors": errors},
            "timestamp": datetime.utcnow().isoformat()
        }
        audit_logs.append(log_entry)
        return {
            "validation_status": "VALIDATION_FAILED",
            "validation_errors": errors,
            "current_agent": "ValidationAgent",
            "overall_status": "VALIDATION_ERROR",
            "audit_logs": audit_logs
        }
    
    log_entry = {
        "agent_name": "ValidationAgent",
        "status": "SUCCESS",
        "message": f"Master entity '{customer.name}' authenticated. Order structure valid.",
        "payload": {"customer_name": customer.name, "items_count": len(items)},
        "timestamp": datetime.utcnow().isoformat()
    }
    audit_logs.append(log_entry)
    
    return {
        "validation_status": "VALIDATED",
        "validation_errors": [],
        "customer_name": customer.name,
        "customer_email": customer.email,
        "shipping_address": state.get("shipping_address") or customer.shipping_address,
        "billing_address": state.get("billing_address") or customer.billing_address,
        "current_agent": "ValidationAgent",
        "overall_status": "VALIDATING",
        "audit_logs": audit_logs
    }

# --- STAGE 2: INVENTORY AGENT ---
async def inventory_node(state: O2CState) -> Dict[str, Any]:
    logger.info(f"InventoryAgent checking physical stock for Order {state['order_id']}")
    audit_logs = list(state.get("audit_logs", []))
    input_items = state.get("input_items", [])
    human_res = state.get("human_resolution")
    
    reservations = []
    exceptions = []
    
    async with async_session_maker() as session:
        for item in input_items:
            sku_code = item.get("sku")
            requested_qty = item.get("requested_qty", 1)
            
            sku_stmt = select(InventorySKU).where(InventorySKU.sku == sku_code)
            sku_obj = (await session.execute(sku_stmt)).scalar_one_or_none()
            
            if not sku_obj:
                exceptions.append({
                    "sku": sku_code,
                    "reason": "SKU not found in warehouse inventory",
                    "requested_qty": requested_qty,
                    "available_qty": 0
                })
                continue
                
            unit_price = item.get("unit_price") or sku_obj.unit_price
            avail_qty = sku_obj.available_quantity
            
            override_action = None
            if human_res and "overrides" in human_res:
                override_action = human_res["overrides"].get(sku_code)
                
            if override_action == "REMOVE":
                continue
            elif override_action == "KEEP_PARTIAL":
                allocated_qty = avail_qty
                backordered_qty = max(0, requested_qty - avail_qty)
            else:
                if avail_qty >= requested_qty:
                    allocated_qty = requested_qty
                    backordered_qty = 0
                else:
                    allocated_qty = max(0, avail_qty)
                    backordered_qty = requested_qty - allocated_qty
                    exceptions.append({
                        "sku": sku_code,
                        "name": sku_obj.name,
                        "requested_qty": requested_qty,
                        "available_qty": avail_qty,
                        "allocated_qty": allocated_qty,
                        "backordered_qty": backordered_qty
                    })
                    
            if allocated_qty > 0:
                sku_obj.available_quantity -= allocated_qty
                sku_obj.reserved_quantity += allocated_qty
                session.add(sku_obj)
                
            reservations.append({
                "sku": sku_code,
                "name": sku_obj.name,
                "requested_qty": requested_qty,
                "allocated_qty": allocated_qty,
                "backordered_qty": backordered_qty,
                "unit_price": unit_price,
                "line_total": allocated_qty * unit_price
            })
            
        new_status = "HELD_FOR_DECISION" if (exceptions and not human_res) else "INVENTORY_CHECK"
        await _save_or_update_order(session, state, status=new_status)
        await session.commit()
        
    if exceptions and not human_res:
        log_entry = {
            "agent_name": "InventoryAgent",
            "status": "EXCEPTION",
            "message": f"Inventory exception detected on {len(exceptions)} item(s). Pausing graph for human resolution.",
            "payload": {"exceptions": exceptions, "reservations": reservations},
            "timestamp": datetime.utcnow().isoformat()
        }
        audit_logs.append(log_entry)
        
        return {
            "inventory_status": "INVENTORY_EXCEPTION",
            "inventory_reservations": reservations,
            "inventory_exceptions": exceptions,
            "current_agent": "InventoryAgent",
            "overall_status": "HELD_FOR_DECISION",
            "audit_logs": audit_logs
        }
        
    log_entry = {
        "agent_name": "InventoryAgent",
        "status": "SUCCESS",
        "message": f"Stock reserved for {len(reservations)} item(s). Allocated quantities locked.",
        "payload": {"reservations": reservations},
        "timestamp": datetime.utcnow().isoformat()
    }
    audit_logs.append(log_entry)
    
    return {
        "inventory_status": "INVENTORY_RESERVED",
        "inventory_reservations": reservations,
        "inventory_exceptions": [],
        "current_agent": "InventoryAgent",
        "overall_status": "INVENTORY_CHECK",
        "audit_logs": audit_logs
    }

# --- STAGE 3: BILLING AGENT ---
async def billing_node(state: O2CState) -> Dict[str, Any]:
    logger.info(f"BillingAgent computing financial math for Order {state['order_id']}")
    audit_logs = list(state.get("audit_logs", []))
    reservations = state.get("inventory_reservations", [])
    
    subtotal = sum(item["line_total"] for item in reservations)
    tax_rate = 0.0825
    tax_amount = round(subtotal * tax_rate, 2)
    shipping_cost = 50.00 if subtotal < 5000.0 else 0.0
    total_amount = round(subtotal + tax_amount + shipping_cost, 2)
    
    invoice_id = f"INV-2026-{state['order_id'].split('-')[-1]}"
    
    doc_artifacts = await generate_invoice_document(
        invoice_id=invoice_id,
        order_id=state["order_id"],
        customer_id=state["customer_id"],
        customer_name=state.get("customer_name", "Enterprise Customer"),
        customer_email=state.get("customer_email", "billing@customer.com"),
        shipping_address=state.get("shipping_address", "N/A"),
        items=reservations,
        subtotal=subtotal,
        tax=tax_amount,
        shipping=shipping_cost,
        total=total_amount
    )
    
    async with async_session_maker() as session:
        # Ensure Order row exists
        await _save_or_update_order(session, state, status="BILLING", total_amount=total_amount)
        
        inv_stmt = select(Invoice).where(Invoice.id == invoice_id)
        inv_record = (await session.execute(inv_stmt)).scalar_one_or_none()
        
        if not inv_record:
            inv_record = Invoice(
                id=invoice_id,
                order_id=state["order_id"],
                customer_id=state["customer_id"],
                payment_terms="Net 30",
                total_amount=total_amount,
                html_url=doc_artifacts["html_url"],
                pdf_url=doc_artifacts["pdf_url"],
                status="ISSUED"
            )
            session.add(inv_record)
        else:
            inv_record.total_amount = total_amount
            inv_record.html_url = doc_artifacts["html_url"]
            inv_record.pdf_url = doc_artifacts["pdf_url"]
            session.add(inv_record)
            
        await session.commit()
        
    log_entry = {
        "agent_name": "BillingAgent",
        "status": "SUCCESS",
        "message": f"Invoice {invoice_id} generated. Subtotal: ${subtotal:.2f}, Tax: ${tax_amount:.2f}, Shipping: ${shipping_cost:.2f}, Total: ${total_amount:.2f}.",
        "payload": {
            "invoice_id": invoice_id,
            "total": total_amount,
            "pdf_url": doc_artifacts["pdf_url"]
        },
        "timestamp": datetime.utcnow().isoformat()
    }
    audit_logs.append(log_entry)
    
    return {
        "billing_status": "INVOICE_GENERATED",
        "subtotal": subtotal,
        "tax_amount": tax_amount,
        "shipping_cost": shipping_cost,
        "total_amount": total_amount,
        "invoice_id": invoice_id,
        "invoice_pdf_url": doc_artifacts["pdf_url"],
        "invoice_html_url": doc_artifacts["html_url"],
        "current_agent": "BillingAgent",
        "overall_status": "BILLING",
        "audit_logs": audit_logs
    }

# --- STAGE 4: RISK AGENT ---
async def risk_node(state: O2CState) -> Dict[str, Any]:
    logger.info(f"RiskAgent scoring credit exposure for Order {state['order_id']}")
    audit_logs = list(state.get("audit_logs", []))
    total_amount = state.get("total_amount", 0.0)
    cust_id = state.get("customer_id")
    
    risk_flags = []
    risk_score = 15.0
    
    async with async_session_maker() as session:
        cust_stmt = select(Customer).where(Customer.id == cust_id)
        customer = (await session.execute(cust_stmt)).scalar_one_or_none()
        
        if customer:
            exposure_pct = ((customer.current_exposure + total_amount) / customer.credit_limit) * 100
            if exposure_pct > 90:
                risk_flags.append(f"Credit exposure exceeds 90% threshold ({exposure_pct:.1f}% limit used).")
                risk_score += 45.0
            elif exposure_pct > 75:
                risk_flags.append(f"Credit exposure exceeds 75% limit.")
                risk_score += 25.0
                
    if total_amount > 10000.0:
        risk_flags.append(f"High Order Value flag (${total_amount:,.2f} > $10,000 limit).")
        risk_score += 30.0
        
    if risk_score > 60.0:
        risk_level = "HIGH_RISK"
        overall_status = "HELD_FOR_REVIEW"
    elif risk_score > 35.0:
        risk_level = "MEDIUM_RISK"
        overall_status = "HELD_FOR_REVIEW"
    else:
        risk_level = "LOW_RISK"
        overall_status = "COMPLETED"
        
    log_entry = {
        "agent_name": "RiskAgent",
        "status": "SUCCESS",
        "message": f"Risk assessment finalized: {risk_level} (Score: {risk_score:.1f}/100). Status: {overall_status}.",
        "payload": {"risk_level": risk_level, "risk_score": risk_score, "flags": risk_flags},
        "timestamp": datetime.utcnow().isoformat()
    }
    audit_logs.append(log_entry)
    
    async with async_session_maker() as session:
        await _save_or_update_order(
            session,
            state,
            status=overall_status,
            total_amount=total_amount,
            risk_score=risk_score,
            risk_level=risk_level
        )
        
        for res in state.get("inventory_reservations", []):
            item_obj = OrderItem(
                order_id=state["order_id"],
                sku=res["sku"],
                requested_qty=res["requested_qty"],
                allocated_qty=res["allocated_qty"],
                backordered_qty=res["backordered_qty"],
                unit_price=res["unit_price"],
                line_total=res["line_total"]
            )
            session.add(item_obj)
            
        for log in audit_logs:
            audit_obj = AuditLog(
                order_id=state["order_id"],
                agent_name=log["agent_name"],
                status=log["status"],
                message=log["message"],
                payload_json=str(log.get("payload", {}))
            )
            session.add(audit_obj)
            
        await session.commit()
        
    return {
        "risk_status": risk_level,
        "risk_score": risk_score,
        "risk_flags": risk_flags,
        "current_agent": "RiskAgent",
        "overall_status": overall_status,
        "audit_logs": audit_logs
    }
