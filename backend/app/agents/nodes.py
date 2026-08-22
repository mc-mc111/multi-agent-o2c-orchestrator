"""
O2C Multi-Agent Nodes — LLM-Powered via Gemini
================================================
Each node:
  1. Pulls real data from Neon/Postgres (SQLModel async)
  2. Builds a rich context prompt for Gemini
  3. Calls Gemini, parses the structured JSON decision
  4. Uses that decision to drive the DB mutation & audit log
  5. Falls back to conservative rule-based logic only if the LLM call fails
"""
import asyncio
import json
import logging
import re
from datetime import datetime
from typing import Dict, Any, List, Optional

from sqlmodel import select
from app.db.database import async_session_maker
from app.db.models import Customer, InventorySKU, Order, OrderItem, Invoice, AuditLog
from app.agents.state import O2CState
from app.services.invoice_service import generate_invoice_document
from app.config import settings

logger = logging.getLogger("agent_nodes")

# ---------------------------------------------------------------------------
# Shared Gemini helper
# ---------------------------------------------------------------------------
_ai_client = None

def _get_ai_client():
    global _ai_client
    if _ai_client is not None:
        return _ai_client
    if not settings.GEMINI_API_KEY:
        return None
    try:
        from google import genai
        _ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
        return _ai_client
    except Exception as e:
        logger.warning(f"Failed to initialise Gemini client: {e}")
        return None


async def _call_llm(system_prompt: str, user_message: str, max_retries: int = 2) -> Optional[dict]:
    """
    Fire a Gemini call via thread executor (SDK is synchronous).
    Applies asyncio timeout (12s) + exponential backoff retry for 503/429.
    Falls back gracefully (returns None) on any failure so rule-based logic takes over.
    """
    client = _get_ai_client()
    if not client:
        logger.warning("No Gemini client — rule-based fallback.")
        return None

    loop = asyncio.get_event_loop()

    def _sync_call():
        from google.genai import types
        return client.models.generate_content(
            model=settings.MODEL_NAME,
            contents=[
                types.Content(
                    role="user",
                    parts=[types.Part(text=f"{system_prompt}\n\n---\n\n{user_message}")]
                )
            ]
        )

    last_error = None
    for attempt in range(max_retries):
        try:
            # Run sync SDK in thread pool so it doesn't block the event loop;
            # wrap with a 12-second hard timeout.
            response = await asyncio.wait_for(
                loop.run_in_executor(None, _sync_call),
                timeout=12.0
            )
            text = response.text.strip()
            text = re.sub(r"^```[a-z]*\n?", "", text).strip()
            text = re.sub(r"\n?```$", "", text).strip()
            return json.loads(text)
        except asyncio.TimeoutError:
            logger.warning(f"LLM timed out (attempt {attempt+1}/{max_retries})")
            last_error = "Timeout"
        except json.JSONDecodeError as e:
            logger.error(f"LLM non-JSON (attempt {attempt+1}): {e}")
            return None  # retry won't help
        except Exception as e:
            err_str = str(e)
            last_error = e
            if any(code in err_str for code in ["503", "429", "UNAVAILABLE", "RESOURCE_EXHAUSTED"]):
                wait = attempt + 1  # 1s, 2s
                logger.warning(f"LLM rate-limited (attempt {attempt+1}/{max_retries}), retry in {wait}s")
                await asyncio.sleep(wait)
            else:
                logger.error(f"LLM non-retryable error: {e}")
                return None

    logger.warning(f"LLM exhausted retries ({max_retries}), using rule-based fallback. Last: {last_error}")
    return None


# ---------------------------------------------------------------------------
# DB helper
# ---------------------------------------------------------------------------
async def _save_or_update_order(session, state: O2CState, status: str,
                                 total_amount: float = 0.0,
                                 risk_score: float = 0.0,
                                 risk_level: str = "LOW"):
    order_id = state["order_id"]
    raw_cust_id = state.get("customer_id", "CUST-1001")

    cust_stmt = select(Customer.id).where(Customer.id == raw_cust_id)
    existing_cust_id = (await session.execute(cust_stmt)).scalar_one_or_none()

    if not existing_cust_id:
        first_cust = (await session.execute(select(Customer.id))).scalars().first()
        valid_cust_id = first_cust if first_cust else "CUST-1001"
    else:
        valid_cust_id = raw_cust_id

    stmt = select(Order).where(Order.id == order_id)
    order_obj = (await session.execute(stmt)).scalar_one_or_none()

    if not order_obj:
        order_obj = Order(
            id=order_id,
            customer_id=valid_cust_id,
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


# ===========================================================================
# STAGE 1 — VALIDATION AGENT (LLM-Driven)
# ===========================================================================
VALIDATION_SYSTEM_PROMPT = """You are the **Validation Agent** in an Order-to-Cash (O2C) orchestration pipeline.

Your job:
- Verify that the customer exists and is active in the master data.
- Verify that every line item has a positive quantity > 0.
- Detect obvious fraud signals such as unrecognised customer IDs, negative quantities, duplicate SKUs.
- Flag anything suspicious even if it doesn't block the order outright (add it to warnings).

You will receive a JSON object with:
  - customer data from the database (or null if not found)
  - the order's line items as submitted

Respond with a single raw JSON object (no markdown fences) matching EXACTLY this schema:
{
  "is_valid": true | false,
  "errors": ["<blocking error messages>"],
  "warnings": ["<non-blocking concerns>"],
  "reasoning": "<1-2 sentence explanation of your decision>",
  "customer_verified_name": "<name from DB or null>"
}"""


async def validation_node(state: O2CState) -> Dict[str, Any]:
    logger.info(f"ValidationAgent (LLM) processing Order {state['order_id']}")
    audit_logs = list(state.get("audit_logs", []))

    # ---- Fetch real customer data from DB ----
    async with async_session_maker() as session:
        cust_id = state.get("customer_id")
        cust_stmt = select(Customer).where(Customer.id == cust_id)
        customer = (await session.execute(cust_stmt)).scalar_one_or_none()

        all_customers = (await session.execute(select(Customer))).scalars().all()
        known_customer_ids = [c.id for c in all_customers]

        customer_data = None
        if customer:
            customer_data = {
                "id": customer.id,
                "name": customer.name,
                "email": customer.email,
                "is_active": customer.is_active,
                "credit_limit": customer.credit_limit,
                "current_exposure": customer.current_exposure,
                "shipping_address": customer.shipping_address,
                "billing_address": customer.billing_address,
            }

        items = state.get("input_items", [])

        # ---- Build user message ----
        user_message = json.dumps({
            "order_id": state["order_id"],
            "customer_id_submitted": cust_id,
            "customer_in_database": customer_data,
            "known_customer_ids": known_customer_ids,
            "line_items": items
        }, indent=2)

        # ---- Call LLM ----
        decision = await _call_llm(VALIDATION_SYSTEM_PROMPT, user_message)

        # ---- Fallback if LLM fails ----
        if decision is None:
            is_valid = customer is not None and customer.is_active and len(items) > 0
            errors = []
            if not customer:
                errors.append(f"Customer ID '{cust_id}' not found in active master database.")
            elif not customer.is_active:
                errors.append(f"Customer is inactive.")
            if not items:
                errors.append("Order contains no line items.")
            decision = {
                "is_valid": is_valid,
                "errors": errors,
                "warnings": [],
                "reasoning": "Rule-based fallback (LLM unavailable).",
                "customer_verified_name": customer.name if customer else None
            }

        # ---- Persist order row ----
        status = "VALIDATING" if decision.get("is_valid") else "VALIDATION_ERROR"
        await _save_or_update_order(session, state, status=status)
        await session.commit()

    errors = decision.get("errors", [])
    warnings = decision.get("warnings", [])
    reasoning = decision.get("reasoning", "")
    is_valid = decision.get("is_valid", False)

    msg = f"[LLM] {reasoning}"
    if warnings:
        msg += f" | Warnings: {'; '.join(warnings)}"

    audit_entry = {
        "agent_name": "ValidationAgent",
        "status": "SUCCESS" if is_valid else "ERROR",
        "message": msg if is_valid else f"[LLM] Validation failed — {'; '.join(errors)}",
        "payload": {"errors": errors, "warnings": warnings, "reasoning": reasoning},
        "timestamp": datetime.utcnow().isoformat()
    }
    audit_logs.append(audit_entry)

    if not is_valid:
        return {
            "validation_status": "VALIDATION_FAILED",
            "validation_errors": errors,
            "current_agent": "ValidationAgent",
            "overall_status": "VALIDATION_ERROR",
            "audit_logs": audit_logs
        }

    return {
        "validation_status": "VALIDATED",
        "validation_errors": [],
        "validation_warnings": warnings,
        "customer_name": decision.get("customer_verified_name") or (customer.name if customer else ""),
        "customer_email": customer.email if customer else "",
        "shipping_address": state.get("shipping_address") or (customer.shipping_address if customer else ""),
        "billing_address": state.get("billing_address") or (customer.billing_address if customer else ""),
        "current_agent": "ValidationAgent",
        "overall_status": "VALIDATING",
        "audit_logs": audit_logs
    }


# ===========================================================================
# STAGE 2 — INVENTORY AGENT (LLM-Driven)
# ===========================================================================
INVENTORY_SYSTEM_PROMPT = """You are the **Inventory Agent** in an Order-to-Cash (O2C) orchestration pipeline.

Your job:
- Review each ordered SKU against live warehouse stock levels.
- Decide how much to allocate for each SKU.
- Identify shortages and decide whether they constitute a blocking exception.
- If a human has already provided a resolution (KEEP_PARTIAL / REMOVE / SUBSTITUTE), honour it.

Rules:
- You can only allocate up to what is physically available.
- If available >= requested: fully allocate, no exception.
- If available < requested AND no human resolution: mark as EXCEPTION — do NOT proceed.
- If human said KEEP_PARTIAL: allocate whatever is available, backorder the rest.
- If human said REMOVE: skip this SKU entirely.
- If human said SUBSTITUTE and a substitute_sku was provided: use that SKU instead.

Respond with a single raw JSON object matching this schema:
{
  "allocations": [
    {
      "sku": "<sku code>",
      "name": "<product name>",
      "requested_qty": <int>,
      "allocated_qty": <int>,
      "backordered_qty": <int>,
      "unit_price": <float>,
      "line_total": <float>,
      "action": "FULFILLED | PARTIAL | SKIPPED | SUBSTITUTED",
      "note": "<why>"
    }
  ],
  "exceptions": [
    {
      "sku": "<sku>",
      "name": "<name>",
      "requested_qty": <int>,
      "available_qty": <int>,
      "shortage_qty": <int>
    }
  ],
  "has_blocking_exception": true | false,
  "reasoning": "<brief explanation>"
}"""


async def inventory_node(state: O2CState) -> Dict[str, Any]:
    logger.info(f"InventoryAgent (LLM) checking stock for Order {state['order_id']}")
    audit_logs = list(state.get("audit_logs", []))
    input_items = state.get("input_items", [])
    human_res = state.get("human_resolution")

    # ---- Fetch live stock levels from DB ----
    async with async_session_maker() as session:
        all_skus = (await session.execute(select(InventorySKU))).scalars().all()
        stock_map: Dict[str, InventorySKU] = {s.sku: s for s in all_skus}

        stock_context = [
            {
                "sku": s.sku,
                "name": s.name,
                "available_quantity": s.available_quantity,
                "reserved_quantity": s.reserved_quantity,
                "unit_price": s.unit_price
            }
            for s in all_skus
        ]

        user_message = json.dumps({
            "order_id": state["order_id"],
            "line_items_requested": input_items,
            "live_warehouse_stock": stock_context,
            "human_resolution": human_res or None
        }, indent=2)

        # ---- Call LLM ----
        decision = await _call_llm(INVENTORY_SYSTEM_PROMPT, user_message)

        # ---- Fallback ----
        if decision is None:
            allocations = []
            exceptions = []
            for item in input_items:
                sku_code = item.get("sku")
                requested = item.get("requested_qty", 1)
                sku_obj = stock_map.get(sku_code)
                if not sku_obj:
                    exceptions.append({"sku": sku_code, "name": sku_code, "requested_qty": requested, "available_qty": 0, "shortage_qty": requested})
                    continue
                available = sku_obj.available_quantity
                allocated = min(requested, available)
                backorder = requested - allocated
                if backorder > 0:
                    exceptions.append({"sku": sku_code, "name": sku_obj.name, "requested_qty": requested, "available_qty": available, "shortage_qty": backorder})
                allocations.append({
                    "sku": sku_code, "name": sku_obj.name,
                    "requested_qty": requested, "allocated_qty": allocated,
                    "backordered_qty": backorder,
                    "unit_price": sku_obj.unit_price,
                    "line_total": allocated * sku_obj.unit_price,
                    "action": "FULFILLED" if backorder == 0 else "PARTIAL",
                    "note": "Rule-based fallback"
                })
            decision = {
                "allocations": allocations,
                "exceptions": exceptions,
                "has_blocking_exception": len(exceptions) > 0 and not human_res,
                "reasoning": "Rule-based fallback (LLM unavailable)."
            }

        allocations = decision.get("allocations", [])
        exceptions = decision.get("exceptions", [])
        has_exception = decision.get("has_blocking_exception", False)

        # ---- Apply DB mutations (stock reservation) ----
        for alloc in allocations:
            sku_code = alloc["sku"]
            allocated_qty = alloc.get("allocated_qty", 0)
            sku_obj = stock_map.get(sku_code)

            if sku_obj and allocated_qty > 0:
                sku_obj.available_quantity = max(0, sku_obj.available_quantity - allocated_qty)
                sku_obj.reserved_quantity += allocated_qty
                session.add(sku_obj)

            if allocated_qty > 0:
                oi = OrderItem(
                    order_id=state["order_id"],
                    sku=alloc["sku"],
                    requested_qty=alloc["requested_qty"],
                    allocated_qty=allocated_qty,
                    backordered_qty=alloc.get("backordered_qty", 0),
                    unit_price=alloc.get("unit_price", 0.0),
                    line_total=alloc.get("line_total", 0.0)
                )
                session.add(oi)

        new_status = "HELD_FOR_DECISION" if has_exception else "INVENTORY_CHECK"
        await _save_or_update_order(session, state, status=new_status)
        await session.commit()

    if has_exception:
        audit_logs.append({
            "agent_name": "InventoryAgent",
            "status": "EXCEPTION",
            "message": f"[LLM] {decision.get('reasoning', '')} — {len(exceptions)} item(s) need human resolution.",
            "payload": {"exceptions": exceptions, "allocations": allocations},
            "timestamp": datetime.utcnow().isoformat()
        })
        return {
            "inventory_status": "INVENTORY_EXCEPTION",
            "inventory_reservations": allocations,
            "inventory_exceptions": exceptions,
            "current_agent": "InventoryAgent",
            "overall_status": "HELD_FOR_DECISION",
            "audit_logs": audit_logs
        }

    audit_logs.append({
        "agent_name": "InventoryAgent",
        "status": "SUCCESS",
        "message": f"[LLM] {decision.get('reasoning', '')} — {len(allocations)} SKU(s) allocated.",
        "payload": {"allocations": allocations},
        "timestamp": datetime.utcnow().isoformat()
    })
    return {
        "inventory_status": "INVENTORY_RESERVED",
        "inventory_reservations": allocations,
        "inventory_exceptions": [],
        "current_agent": "InventoryAgent",
        "overall_status": "INVENTORY_CHECK",
        "audit_logs": audit_logs
    }


# ===========================================================================
# STAGE 3 — BILLING AGENT (LLM-Driven)
# ===========================================================================
BILLING_SYSTEM_PROMPT = """You are the **Billing Agent** in an Order-to-Cash (O2C) orchestration pipeline.

Your job:
- Compute the financial summary for this order based on the allocated inventory.
- Apply the correct tax rate (use 8.25% as default US state tax; adjust reasoning if address suggests different jurisdiction).
- Apply or waive shipping costs (waive if subtotal > $5,000 as per company policy; add $50 otherwise).
- Calculate total = subtotal + tax + shipping.
- Flag any billing anomalies (e.g. zero-value orders, missing prices, extremely high discounts).

Respond with a single raw JSON object matching this schema:
{
  "subtotal": <float>,
  "tax_rate": <float>,
  "tax_amount": <float>,
  "shipping_cost": <float>,
  "total_amount": <float>,
  "payment_terms": "<e.g. Net 30>",
  "billing_notes": ["<any anomaly or note>"],
  "reasoning": "<brief justification>"
}"""


async def billing_node(state: O2CState) -> Dict[str, Any]:
    logger.info(f"BillingAgent (LLM) computing financials for Order {state['order_id']}")
    audit_logs = list(state.get("audit_logs", []))
    reservations = state.get("inventory_reservations", [])

    user_message = json.dumps({
        "order_id": state["order_id"],
        "customer_id": state.get("customer_id"),
        "shipping_address": state.get("shipping_address"),
        "allocated_items": reservations
    }, indent=2)

    decision = await _call_llm(BILLING_SYSTEM_PROMPT, user_message)

    # ---- Fallback ----
    if decision is None:
        subtotal = sum(item.get("line_total", 0) for item in reservations)
        tax_amount = round(subtotal * 0.0825, 2)
        shipping_cost = 0.0 if subtotal > 5000 else 50.0
        total_amount = round(subtotal + tax_amount + shipping_cost, 2)
        decision = {
            "subtotal": subtotal,
            "tax_rate": 0.0825,
            "tax_amount": tax_amount,
            "shipping_cost": shipping_cost,
            "total_amount": total_amount,
            "payment_terms": "Net 30",
            "billing_notes": [],
            "reasoning": "Rule-based fallback (LLM unavailable)."
        }

    subtotal = float(decision.get("subtotal", 0))
    tax_amount = float(decision.get("tax_amount", 0))
    shipping_cost = float(decision.get("shipping_cost", 0))
    total_amount = float(decision.get("total_amount", 0))
    payment_terms = decision.get("payment_terms", "Net 30")

    invoice_id = f"INV-2026-{state['order_id'].split('-')[-1]}"

    doc_artifacts = await generate_invoice_document(
        invoice_id=invoice_id,
        order_id=state["order_id"],
        customer_id=state["customer_id"],
        customer_name=state.get("customer_name", "Customer"),
        customer_email=state.get("customer_email", "billing@customer.com"),
        shipping_address=state.get("shipping_address", "N/A"),
        items=reservations,
        subtotal=subtotal,
        tax=tax_amount,
        shipping=shipping_cost,
        total=total_amount
    )

    async with async_session_maker() as session:
        await _save_or_update_order(session, state, status="BILLING", total_amount=total_amount)

        inv_stmt = select(Invoice).where(Invoice.id == invoice_id)
        inv_record = (await session.execute(inv_stmt)).scalar_one_or_none()
        if not inv_record:
            inv_record = Invoice(
                id=invoice_id,
                order_id=state["order_id"],
                customer_id=state["customer_id"],
                payment_terms=payment_terms,
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

    billing_notes = decision.get("billing_notes", [])
    msg = f"[LLM] {decision.get('reasoning', '')} — Invoice {invoice_id} issued. Total: ${total_amount:.2f} ({payment_terms})."
    if billing_notes:
        msg += f" Notes: {'; '.join(billing_notes)}"

    audit_logs.append({
        "agent_name": "BillingAgent",
        "status": "SUCCESS",
        "message": msg,
        "payload": {"invoice_id": invoice_id, "subtotal": subtotal, "tax": tax_amount, "shipping": shipping_cost, "total": total_amount, "notes": billing_notes},
        "timestamp": datetime.utcnow().isoformat()
    })

    return {
        "billing_status": "INVOICE_GENERATED",
        "inventory_reservations": reservations,
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


# ===========================================================================
# STAGE 4 — RISK AGENT (LLM-Driven)
# ===========================================================================
RISK_SYSTEM_PROMPT = """You are the **Risk & Compliance Agent** in an Order-to-Cash (O2C) orchestration pipeline.

Your job:
- Perform holistic risk assessment on this order using all available context.
- Consider: order value vs credit limit, credit exposure %, customer history, unusual SKU combos, abnormally large quantities, shipping destination anomalies.
- Assign a numeric risk score 0-100 where:
    0-30   = LOW_RISK  (auto-approve, status COMPLETED)
    31-65  = MEDIUM_RISK (flag for review, status HELD_FOR_REVIEW)
    66-100 = HIGH_RISK (hold for manual approval, status HELD_FOR_REVIEW)
- List every specific risk flag you identify.
- Provide clear reasoning that a credit manager could read.

Respond with a single raw JSON object matching this schema:
{
  "risk_score": <float 0-100>,
  "risk_level": "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK",
  "overall_status": "COMPLETED" | "HELD_FOR_REVIEW",
  "risk_flags": ["<specific flag>"],
  "recommended_action": "<what should happen next>",
  "reasoning": "<detailed justification for credit manager>"
}"""


async def risk_node(state: O2CState) -> Dict[str, Any]:
    logger.info(f"RiskAgent (LLM) scoring Order {state['order_id']}")
    audit_logs = list(state.get("audit_logs", []))
    total_amount = state.get("total_amount", 0.0)
    cust_id = state.get("customer_id")

    async with async_session_maker() as session:
        cust_stmt = select(Customer).where(Customer.id == cust_id)
        customer = (await session.execute(cust_stmt)).scalar_one_or_none()

        customer_context = None
        if customer:
            projected_exposure = customer.current_exposure + total_amount
            exposure_pct = (projected_exposure / customer.credit_limit * 100) if customer.credit_limit else 0
            customer_context = {
                "id": customer.id,
                "name": customer.name,
                "credit_limit": customer.credit_limit,
                "current_exposure": customer.current_exposure,
                "projected_exposure_after_order": projected_exposure,
                "credit_utilisation_pct": round(exposure_pct, 2),
                "is_active": customer.is_active
            }

    user_message = json.dumps({
        "order_id": state["order_id"],
        "total_order_value": total_amount,
        "customer": customer_context,
        "shipping_address": state.get("shipping_address"),
        "allocated_items": state.get("inventory_reservations", []),
        "invoice_id": state.get("invoice_id"),
        "validation_warnings": state.get("validation_warnings", [])
    }, indent=2)

    decision = await _call_llm(RISK_SYSTEM_PROMPT, user_message)

    # ---- Fallback ----
    if decision is None:
        risk_score = 15.0
        risk_flags = []
        if customer:
            exp_pct = ((customer.current_exposure + total_amount) / (customer.credit_limit or 1)) * 100
            if exp_pct > 90:
                risk_score += 45
                risk_flags.append(f"Credit utilisation {exp_pct:.1f}% > 90% threshold.")
            elif exp_pct > 75:
                risk_score += 25
                risk_flags.append(f"Credit utilisation {exp_pct:.1f}% > 75%.")
        if total_amount > 10000:
            risk_score += 30
            risk_flags.append(f"High order value ${total_amount:,.2f}.")
        risk_level = "HIGH_RISK" if risk_score > 65 else ("MEDIUM_RISK" if risk_score > 35 else "LOW_RISK")
        overall_status = "COMPLETED" if risk_level == "LOW_RISK" else "HELD_FOR_REVIEW"
        decision = {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "overall_status": overall_status,
            "risk_flags": risk_flags,
            "recommended_action": "Auto-approve" if overall_status == "COMPLETED" else "Manual credit review required.",
            "reasoning": "Rule-based fallback (LLM unavailable)."
        }

    risk_score = float(decision.get("risk_score", 15.0))
    risk_level = decision.get("risk_level", "LOW_RISK")
    overall_status = decision.get("overall_status", "COMPLETED")
    risk_flags = decision.get("risk_flags", [])
    reasoning = decision.get("reasoning", "")
    recommended_action = decision.get("recommended_action", "")

    # Persist final order + audit trail
    async with async_session_maker() as session:
        await _save_or_update_order(
            session, state,
            status=overall_status,
            total_amount=total_amount,
            risk_score=risk_score,
            risk_level=risk_level
        )

        # ---- Release reserved stock when order COMPLETES ----
        # reserved_quantity was locked by InventoryAgent; on completion we move it
        # out of reserved (it's now committed/shipped) so inventory shows real numbers.
        if overall_status == "COMPLETED":
            for res in state.get("inventory_reservations", []):
                alloc_qty = res.get("allocated_qty", 0)
                if alloc_qty > 0:
                    sku_stmt = select(InventorySKU).where(InventorySKU.sku == res["sku"])
                    sku_obj = (await session.execute(sku_stmt)).scalar_one_or_none()
                    if sku_obj:
                        sku_obj.reserved_quantity = max(0, sku_obj.reserved_quantity - alloc_qty)
                        session.add(sku_obj)

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

    audit_logs.append({
        "agent_name": "RiskAgent",
        "status": "SUCCESS",
        "message": f"[LLM] {reasoning} | Score: {risk_score:.1f}/100 | {risk_level} | {recommended_action}",
        "payload": {
            "risk_score": risk_score,
            "risk_level": risk_level,
            "risk_flags": risk_flags,
            "recommended_action": recommended_action
        },
        "timestamp": datetime.utcnow().isoformat()
    })

    return {
        "risk_status": risk_level,
        "risk_score": risk_score,
        "risk_flags": risk_flags,
        "inventory_reservations": state.get("inventory_reservations", []),
        "subtotal": state.get("subtotal", 0.0),
        "tax_amount": state.get("tax_amount", 0.0),
        "shipping_cost": state.get("shipping_cost", 0.0),
        "total_amount": total_amount,
        "invoice_id": state.get("invoice_id"),
        "invoice_pdf_url": state.get("invoice_pdf_url"),
        "invoice_html_url": state.get("invoice_html_url"),
        "customer_name": state.get("customer_name"),
        "customer_email": state.get("customer_email"),
        "current_agent": "RiskAgent",
        "overall_status": overall_status,
        "audit_logs": audit_logs
    }
