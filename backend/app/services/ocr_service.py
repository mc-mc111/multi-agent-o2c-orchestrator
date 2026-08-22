import re
import json
import io
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import pypdf
from google import genai
from app.config import settings

logger = logging.getLogger("ocr_service")

# Initialize official google-genai client
ai_client = None
if settings.GEMINI_API_KEY:
    try:
        ai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as e:
        logger.warning(f"Failed to initialize google-genai client: {e}")

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

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extracts plain text from PDF bytes using pypdf."""
    extracted_text = ""
    try:
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        for page in reader.pages:
            t = page.extract_text()
            if t:
                extracted_text += t + "\n"
    except Exception as e:
        logger.error(f"pypdf extraction error: {e}")
    return extracted_text.strip()

async def parse_with_gemini(raw_content: str) -> Optional[OrderRequest]:
    """Uses official google-genai client (MODEL_NAME) to extract structured OrderRequest JSON from multi-modal text/PDF."""
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

Raw Document Text:
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
        logger.warning(f"Gemini LLM extraction failed: {e}. Falling back to regex parser.")
        return None

def parse_text_input(raw_text: str) -> OrderRequest:
    """Regex parser for raw text extracting exact SKUs and quantities."""
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
        raise ValueError("Could not find any SKU codes (e.g. SKU-SERVER-01) or item quantities in input.")
        
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
    """Stage 0 Ingestion Node: Dynamic multi-modal PDF/Text/JSON ingestion."""
    if input_type == "json" and raw_text and raw_text.strip() and raw_text != "undefined":
        return parse_json_input(raw_text)

    content_to_parse = ""
    if input_type == "file" and file_bytes:
        if filename and filename.lower().endswith(".pdf"):
            content_to_parse = extract_text_from_pdf(file_bytes)
        else:
            try:
                content_to_parse = file_bytes.decode("utf-8", errors="ignore")
            except Exception:
                content_to_parse = ""

    elif raw_text and raw_text.strip() and raw_text != "undefined":
        content_to_parse = raw_text

    if content_to_parse:
        llm_parsed = await parse_with_gemini(content_to_parse)
        if llm_parsed:
            return llm_parsed
        return parse_text_input(content_to_parse)

    raise ValueError("Empty or unreadable order input provided. Please provide text, JSON, or a PDF file.")
