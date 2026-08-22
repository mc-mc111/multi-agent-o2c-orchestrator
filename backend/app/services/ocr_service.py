import re
import json
import io
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import pypdf
import pdfplumber
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger("ocr_service")

# Initialize official google-genai client
ai_client = None
if settings.GEMINI_API_KEY:
    try:
        ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as e:
        logger.warning(f"Failed to initialize google-genai client: {e}")

class BoundingBox(BaseModel):
    ymin: float  # Top % (0..100)
    xmin: float  # Left % (0..100)
    ymax: float  # Bottom % (0..100)
    xmax: float  # Right % (0..100)

class OrderItemRequest(BaseModel):
    sku: str
    requested_qty: int = Field(gt=0)
    unit_price: Optional[float] = None
    sku_bbox: Optional[BoundingBox] = None
    qty_bbox: Optional[BoundingBox] = None

class OrderRequest(BaseModel):
    customer_id: str
    shipping_address: Optional[str] = None
    billing_address: Optional[str] = None
    customer_id_bbox: Optional[BoundingBox] = None
    shipping_address_bbox: Optional[BoundingBox] = None
    items: List[OrderItemRequest]

def extract_pdf_words_and_boxes(pdf_bytes: bytes) -> tuple[str, List[Dict[str, Any]]]:
    """Uses pdfplumber to extract words along with normalized bounding box coordinates [ymin, xmin, ymax, xmax]."""
    full_text = ""
    words_data = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            for page in pdf.pages:
                p_width = float(page.width) or 1.0
                p_height = float(page.height) or 1.0
                
                words = page.extract_words()
                for w in words:
                    txt = w["text"]
                    full_text += txt + " "
                    # Normalize to 0..100 percentage coordinates
                    xmin = round((w["x0"] / p_width) * 100, 2)
                    ymin = round((w["top"] / p_height) * 100, 2)
                    xmax = round((w["x1"] / p_width) * 100, 2)
                    ymax = round((w["bottom"] / p_height) * 100, 2)
                    
                    words_data.append({
                        "text": txt,
                        "bbox": BoundingBox(ymin=ymin, xmin=xmin, ymax=ymax, xmax=xmax)
                    })
                full_text += "\n"
    except Exception as e:
        logger.error(f"pdfplumber word bounding box extraction error: {e}")
    return full_text.strip(), words_data

def locate_bounding_boxes(order_req: OrderRequest, words_data: List[Dict[str, Any]]) -> OrderRequest:
    """Matches extracted tokens against word coordinates to assign bounding boxes."""
    if not words_data:
        # Default mock bounding boxes if pure text
        order_req.customer_id_bbox = BoundingBox(ymin=12, xmin=10, ymax=16, xmax=35)
        order_req.shipping_address_bbox = BoundingBox(ymin=18, xmin=10, ymax=26, xmax=50)
        for i, item in enumerate(order_req.items):
            top_offset = 35 + (i * 8)
            item.sku_bbox = BoundingBox(ymin=top_offset, xmin=10, ymax=top_offset + 5, xmax=38)
            item.qty_bbox = BoundingBox(ymin=top_offset, xmin=45, ymax=top_offset + 5, xmax=55)
        return order_req

    # Match Customer ID
    for w in words_data:
        if order_req.customer_id.lower() in w["text"].lower() or "cust" in w["text"].lower():
            order_req.customer_id_bbox = w["bbox"]
            break
            
    # Match Items SKUs and Quantities
    for item in order_req.items:
        for w in words_data:
            if item.sku.lower() in w["text"].lower() or w["text"].lower() in item.sku.lower():
                item.sku_bbox = w["bbox"]
                break
        if not item.sku_bbox:
            item.sku_bbox = BoundingBox(ymin=40, xmin=10, ymax=45, xmax=40)
        if not item.qty_bbox:
            item.qty_bbox = BoundingBox(ymin=40, xmin=45, ymax=45, xmax=55)
            
    if not order_req.customer_id_bbox:
        order_req.customer_id_bbox = BoundingBox(ymin=12, xmin=10, ymax=16, xmax=35)

    return order_req

def parse_json_input(raw_json: str) -> OrderRequest:
    data = json.loads(raw_json)
    req = OrderRequest(**data)
    return locate_bounding_boxes(req, [])

async def parse_multimodal_document_with_vision(file_bytes: bytes, filename: Optional[str] = None) -> Optional[OrderRequest]:
    """Uses Gemini Vision Multimodal LLM to analyze uploaded PDF or Image documents."""
    if not ai_client:
        return None
    try:
        mime_type = "application/pdf"
        if filename:
            fn = filename.lower()
            if fn.endswith(".png"):
                mime_type = "image/png"
            elif fn.endswith(".jpg") or fn.endswith(".jpeg"):
                mime_type = "image/jpeg"
                
        prompt = """
Extract purchase order details into a strictly valid JSON object.
Rules:
- customer_id: Customer ID string (e.g. CUST-1001) or "UNKNOWN_CUSTOMER" if missing
- shipping_address: Full shipping address string or null
- billing_address: Full billing address string or null
- items: list of objects with 'sku' (string), 'requested_qty' (integer > 0), 'unit_price' (float or null)

Return ONLY raw valid JSON.
"""
        response = ai_client.models.generate_content(
            model=settings.MODEL_NAME,
            contents=[
                types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
                prompt
            ]
        )
        text_resp = response.text.strip()
        if text_resp.startswith("```"):
            text_resp = re.sub(r"^```[a-z]*", "", text_resp).strip()
            text_resp = re.sub(r"```$", "", text_resp).strip()
            
        data = json.loads(text_resp)
        return OrderRequest(**data)
    except Exception as e:
        logger.error(f"Gemini Vision extraction failed: {e}")
        return None

def parse_text_regex_fallback(raw_text: str) -> OrderRequest:
    """Regex parser for plain text fallback."""
    cust_match = re.search(r"CUST-[A-Z0-9]+", raw_text, re.IGNORECASE)
    customer_id = cust_match.group(0).upper() if cust_match else "UNKNOWN_CUSTOMER"
    
    sku_pattern = r"(SKU-[A-Z0-9-]+)[^\d]+(\d+)"
    items = []
    
    matches = re.findall(sku_pattern, raw_text, re.IGNORECASE)
    for sku, qty in matches:
        items.append(OrderItemRequest(
            sku=sku.upper(),
            requested_qty=int(qty)
        ))
        
    if not items:
        raise ValueError("Could not find any SKU codes or item quantities in input.")
        
    req = OrderRequest(
        customer_id=customer_id,
        items=items
    )
    return locate_bounding_boxes(req, [])

async def process_ingestion(
    input_type: str,
    raw_text: Optional[str] = None,
    file_bytes: Optional[bytes] = None,
    filename: Optional[str] = None
) -> OrderRequest:
    """Stage 0 Ingestion Node: Extracts bounding boxes for PDF/Image and text ingestion."""
    if input_type == "json" and raw_text and raw_text.strip() and raw_text != "undefined":
        return parse_json_input(raw_text)

    words_data = []
    extracted_text = ""

    if input_type == "file" and file_bytes:
        if filename and filename.lower().endswith(".pdf"):
            extracted_text, words_data = extract_pdf_words_and_boxes(file_bytes)
            
        # First try Gemini Vision on file bytes
        parsed_doc = await parse_multimodal_document_with_vision(file_bytes, filename)
        if parsed_doc:
            return locate_bounding_boxes(parsed_doc, words_data)
            
        if extracted_text.strip():
            return parse_text_regex_fallback(extracted_text)

    if raw_text and raw_text.strip() and raw_text != "undefined":
        return parse_text_regex_fallback(raw_text)

    raise ValueError("Empty or unreadable order input. Please provide text, JSON, or upload a document.")
