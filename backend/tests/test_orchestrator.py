import pytest
import asyncio
from fastapi.testclient import TestClient
from app.main import app
from app.agents.graph import o2c_graph
from app.agents.state import O2CState

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["model"] == "gemini-3.6-flash"

def test_ingest_order_text():
    response = client.post(
        "/api/v1/ingest",
        data={
            "input_type": "text",
            "raw_text": "Order Request from Customer CUST-1001\nLine Items:\n- SKU-SERVER-01: 2 units"
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert "order_id" in data
    assert data["parsed_payload"]["customer_id"] == "CUST-1001"

@pytest.mark.asyncio
async def test_full_graph_execution():
    initial_state: O2CState = {
        "order_id": "ORD-TEST-001",
        "customer_id": "CUST-1001",
        "shipping_address": "100 Innovation Way",
        "billing_address": "100 Innovation Way",
        "input_items": [{"sku": "SKU-SERVER-01", "requested_qty": 1, "unit_price": 3500.0}],
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
        "audit_logs": []
    }
    
    final_state = await o2c_graph.ainvoke(initial_state)
    assert final_state["validation_status"] == "VALIDATED"
    assert final_state["inventory_status"] == "INVENTORY_RESERVED"
    assert final_state["billing_status"] == "INVOICE_GENERATED"
    assert final_state["overall_status"] in ["COMPLETED", "HELD_FOR_REVIEW"]
