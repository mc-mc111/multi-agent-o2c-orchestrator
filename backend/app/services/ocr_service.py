import re
import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("ocr_service")

class OrderItemRequest(BaseModel):
    sku: str
    requested_qty: int = Field(gt=0)
    unit_price: Optional[float] = None

class OrderRequest(BaseModel):
    customer_id: str
    shipping_address: Optional[str] = None
    billing_address: Optional[str] = None
    items: List[OrderItemRequest]

def parse_json_input(raw_json: str) -> OrderRequest:
    data = json.loads(raw_json)
    return OrderRequest(**data)

def parse_text_input(raw_text: str) -> OrderRequest:
    """Parses raw text/email order using deterministic regex string matching with fallback."""
    # Look for Customer ID (e.g. CUST-1001, CUST-101)
    cust_match = re.search(r"CUST-[A-Z0-9]+", raw_text, re.IGNORECASE)
    customer_id = cust_match.group(0).upper() if cust_match else "CUST-1001"
    
    # Look for SKUs and Quantities
    # e.g., SKU-SERVER-01: 5 units @ $3500
    sku_pattern = r"(SKU-[A-Z0-9-]+)[^\d]+(\d+)"
    items = []
    
    matches = re.findall(sku_pattern, raw_text, re.IGNORECASE)
    for sku, qty in matches:
        items.append(OrderItemRequest(
            sku=sku.upper(),
            requested_qty=int(qty)
        ))
    
    if not items:
        # Fallback default item if unparsed
        items.append(OrderItemRequest(sku="SKU-SERVER-01", requested_qty=2))
        
    return OrderRequest(
        customer_id=customer_id,
        items=items
    )

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    extracted_text = ""
    try:
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    extracted_text += text + "\n"
    except Exception as e:
        logger.error(f"Error in pdfplumber extraction: {e}")
    return extracted_text

def extract_text_from_image(image_bytes: bytes) -> str:
    extracted_text = ""
    try:
        from PIL import Image
        import pytesseract
        import io
        image = Image.open(io.BytesIO(image_bytes))
        extracted_text = pytesseract.image_to_string(image)
    except Exception as e:
        logger.error(f"Error in pytesseract OCR extraction: {e}")
    return extracted_text

async def process_ingestion(
    input_type: str,
    raw_text: Optional[str] = None,
    file_bytes: Optional[bytes] = None,
    filename: Optional[str] = None
) -> OrderRequest:
    """Stage 0 Ingestion Node: Converts raw multi-modal payload to normalized OrderRequest."""
    if input_type == "json" and raw_text:
        return parse_json_input(raw_text)
    
    elif input_type == "text" and raw_text:
        return parse_text_input(raw_text)
        
    elif input_type == "file" and file_bytes:
        extracted = ""
        is_pdf = filename and filename.lower().endswith(".pdf")
        if is_pdf:
            extracted = extract_text_from_pdf(file_bytes)
        
        if not extracted or not is_pdf:
            extracted = extract_text_from_image(file_bytes)
            
        if extracted.strip():
            return parse_text_input(extracted)
    
    # Default fallback demo request
    return OrderRequest(
        customer_id="CUST-1001",
        items=[OrderItemRequest(sku="SKU-SERVER-01", requested_qty=5)]
    )
