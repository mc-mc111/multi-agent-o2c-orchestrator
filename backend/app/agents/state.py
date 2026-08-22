from typing import TypedDict, List, Dict, Any, Optional

class O2CState(TypedDict):
    order_id: str
    customer_id: str
    shipping_address: Optional[str]
    billing_address: Optional[str]
    input_items: List[Dict[str, Any]] # raw requested [{sku, requested_qty, unit_price}]
    
    # Validation Node Outputs
    validation_status: str # "VALIDATED" or "VALIDATION_FAILED"
    validation_errors: List[str]
    validation_warnings: List[str]  # Non-blocking LLM warnings
    customer_name: Optional[str]
    customer_email: Optional[str]
    
    # Inventory Node Outputs
    inventory_status: str # "INVENTORY_RESERVED" or "INVENTORY_EXCEPTION"
    inventory_reservations: List[Dict[str, Any]] # [{sku, requested_qty, allocated_qty, backordered_qty, unit_price, line_total}]
    inventory_exceptions: List[Dict[str, Any]] # list of items with shortages
    human_resolution: Optional[Dict[str, Any]] # user choice if exception triggered
    
    # Billing Node Outputs
    billing_status: str # "INVOICE_GENERATED" or "BILLING_ERROR"
    subtotal: float
    tax_amount: float
    shipping_cost: float
    total_amount: float
    invoice_id: Optional[str]
    invoice_pdf_url: Optional[str]
    invoice_html_url: Optional[str]
    
    # Risk Node Outputs
    risk_status: str # "LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"
    risk_score: float
    risk_flags: List[str]
    
    # Graph Execution State
    current_agent: str
    overall_status: str # PENDING, VALIDATING, INVENTORY_CHECK, HELD_FOR_DECISION, BILLING, RISK_CHECK, COMPLETED, REJECTED
    audit_logs: List[Dict[str, Any]] # step-by-step logs for telemetry
