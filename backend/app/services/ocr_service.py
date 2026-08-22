import re
import json
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from google import genai
from google.genai import types
from app.config import settings

logger = logging.getLogger("ocr_service")

# Initialize official google-genai client for Gemini Vision multimodal analysis
ai_client = None
if settings.GEMINI_API_KEY:
    try:
        ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as e:
        logger.warning(f"Failed to initialize google-genai Vision client: {e}")

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

async def parse_multimodal_document_with_vision(file_bytes: bytes, filename: Optional[str] = None) -> Optional[OrderRequest]:
    """Uses Gemini Vision Multimodal LLM (gemini-3.6-flash) to directly analyze uploaded PDF or Image documents."""
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
Analyze this purchase order document image/PDF using Vision.
Extract all order details into a strictly valid JSON object.
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
        logger.error(f"Gemini Vision multimodal document extraction failed: {e}")
        return None

async def parse_text_with_gemini(raw_content: str) -> Optional[OrderRequest]:
    """Uses Gemini LLM to parse text payloads into structured OrderRequest."""
    if not ai_client:
        return None
    try:
        prompt = f"""
Extract purchase order details into a strictly valid JSON object.
Rules:
- customer_id: Customer ID string (e.g. CUST-1001) or "UNKNOWN_CUSTOMER" if missing
- shipping_address: Full shipping address string or null
- billing_address: Full billing address string or null
- items: list of objects with 'sku' (string), 'requested_qty' (integer > 0), 'unit_price' (float or null)

Raw Text:
{raw_content}

Return ONLY raw valid JSON.
"""
        response = ai_client.models.generate_content(
            model=settings.MODEL_NAME,
            contents=prompt
        )
        text_resp = response.text.strip()
        if text_resp.startswith("```"):
            text_resp = re.sub(r"^```[a-z]*", "", text_resp).strip()
            text_resp = re.sub(r"```$", "", text_resp).strip()
            
        data = json.loads(text_resp)
        return OrderRequest(**data)
    except Exception as e:
        logger.error(f"Gemini LLM text extraction failed: {e}")
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
        
    return OrderRequest(
        customer_id=customer_id,
        items=items
    )

async def process_ingestion(
    input_type: str,
    raw_text: Optional[str] = None,
    file_bytes: Optional[bytes] = None,
    filename: Optional[str] = None
) -> OrderRequest:
    """Stage 0 Ingestion Node: Gemini Vision Multimodal PDF/Image & Text ingestion."""
    if input_type == "json" and raw_text and raw_text.strip() and raw_text != "undefined":
        return parse_json_input(raw_text)

    if input_type == "file" and file_bytes:
        # Use Gemini Vision LLM directly on PDF/Image document bytes!
        parsed_doc = await parse_multimodal_document_with_vision(file_bytes, filename)
        if parsed_doc:
            return parsed_doc
        # Fallback text decoding if vision fails
        try:
            txt = file_bytes.decode("utf-8", errors="ignore")
            if txt.strip():
                return parse_text_regex_fallback(txt)
        except Exception:
            pass

    if raw_text and raw_text.strip() and raw_text != "undefined":
        parsed_txt = await parse_text_with_gemini(raw_text)
        if parsed_txt:
            return parsed_txt
        return parse_text_regex_fallback(raw_text)

    raise ValueError("Empty or unreadable order input. Please provide text, JSON, or upload a document.")
