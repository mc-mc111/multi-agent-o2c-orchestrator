from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship

class User(SQLModel, table=True):
    __tablename__ = "users"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, nullable=False)
    hashed_password: str = Field(nullable=False)
    full_name: str = Field(default="Enterprise Admin")
    role: str = Field(default="admin")
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Customer(SQLModel, table=True):
    __tablename__ = "customers"
    
    id: str = Field(primary_key=True) # e.g. CUST-101
    name: str = Field(index=True)
    email: str = Field(unique=True)
    credit_limit: float = Field(default=50000.0)
    current_exposure: float = Field(default=0.0)
    shipping_address: str
    billing_address: str
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class InventorySKU(SQLModel, table=True):
    __tablename__ = "inventory_skus"
    
    sku: str = Field(primary_key=True) # e.g. SKU-SERVER-01
    name: str = Field(index=True)
    description: Optional[str] = None
    unit_price: float = Field(gt=0)
    available_quantity: int = Field(default=0)
    reserved_quantity: int = Field(default=0)
    reorder_threshold: int = Field(default=10)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Order(SQLModel, table=True):
    __tablename__ = "orders"
    
    id: str = Field(primary_key=True) # e.g. ORD-2026-0001
    customer_id: str = Field(foreign_key="customers.id")
    raw_input_type: str = Field(default="text") # text, json, pdf, image
    raw_input_url: Optional[str] = None
    status: str = Field(default="PENDING") # PENDING, VALIDATED, VALIDATION_ERROR, INVENTORY_RESERVED, INVENTORY_EXCEPTION, INVOICE_GENERATED, COMPLETED, HELD_FOR_REVIEW, REJECTED
    subtotal: float = Field(default=0.0)
    tax_amount: float = Field(default=0.0)
    shipping_cost: float = Field(default=0.0)
    total_amount: float = Field(default=0.0)
    risk_score: float = Field(default=0.0)
    risk_level: str = Field(default="LOW") # LOW, MEDIUM, HIGH
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class OrderItem(SQLModel, table=True):
    __tablename__ = "order_items"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: str = Field(foreign_key="orders.id")
    sku: str = Field(foreign_key="inventory_skus.sku")
    requested_qty: int = Field(gt=0)
    allocated_qty: int = Field(default=0)
    backordered_qty: int = Field(default=0)
    unit_price: float = Field(gt=0)
    line_total: float = Field(default=0.0)

class Invoice(SQLModel, table=True):
    __tablename__ = "invoices"
    
    id: str = Field(primary_key=True) # e.g. INV-2026-0001
    order_id: str = Field(foreign_key="orders.id")
    customer_id: str = Field(foreign_key="customers.id")
    payment_terms: str = Field(default="Net 30")
    total_amount: float
    html_url: Optional[str] = None
    pdf_url: Optional[str] = None
    status: str = Field(default="ISSUED") # ISSUED, PAID, CANCELLED
    issued_at: datetime = Field(default_factory=datetime.utcnow)

class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: str = Field(index=True)
    agent_name: str # ValidationAgent, InventoryAgent, BillingAgent, RiskAgent, Orchestrator
    status: str # SUCCESS, ERROR, EXCEPTION, PENDING
    message: str
    payload_json: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
