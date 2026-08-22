import re
import json
import io
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import pypdf
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger("ocr_service")

# Configure Gemini AI SDK dynamically from environment variables
if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)

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
    """Uses configured Gemini AI model (MODEL_NAME) to extract structured OrderRequest JSON from multi-modal text/PDF."""
    if not settings.GEMINI_API_KEY:
        return None
    try:
        model = genai.GenerativeModel(settings.MODEL_NAME)
        prompt = f"""
Extract purchase order details into a strictly valid JSON object.
Rules:
- customer_id: Customer ID string (default 'CUST-1001' if missing)
- shipping_address: Full address string or null
- billing_address: Full address string or null
- items: list of objects with 'sku' (string), 'requested_qty' (integer > 0), 'unit_price' (float or null)

Raw Document Text:
{raw_content}

Return ONLY raw valid JSON matching this schema:
{{
  "customer_id": "CUST-1001",
  "shipping_address": "100 Innovation Way, Austin TX",
  "items": [
    {{"sku": "SKU-SERVER-01", "requested_qty": 2, "unit_price": 3500.0}}
  ]
}}
"""
        response = await model.generate_content_async(prompt)
        text_resp = response.text.strip()
        # Clean JSON markdown blocks ```json ... ```
        if text_resp.startswith("```"):
            text_resp = re.sub(r"^```[a-z]*", "", text_resp).strip()
            text_resp = re.sub(r"```$", "", text_resp).strip()
            
        data = json.loads(text_resp)
        return OrderRequest(**data)
    except Exception as e:
        logger.warning(f"Gemini LLM extraction failed: {e}. Falling back to regex parser.")
        return None

def parse_text_input(raw_text: str) -> OrderRequest:
    """Regex fallback parser for raw text when LLM is offline."""
    cust_match = re.search(r"CUST-[A-Z0-9]+", raw_text, re.IGNORECASE)
    customer_id = cust_match.group(0).upper() if cust_match else "CUST-1001"
    
    sku_pattern = r"(SKU-[A-Z0-9-]+)[^\d]+(\d+)"
    items = []
    
    matches = re.findall(sku_pattern, raw_text, re.IGNORECASE)
    for sku, qty in matches:
        items.append(OrderItemRequest(
            sku=sku.upper(),
            requested_qty=int(qty)
        ))
    
    if not items:
        items.append(OrderItemRequest(sku="SKU-SERVER-01", requested_qty=2))
        
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
    """Stage 0 Ingestion Node: Extracts and parses multi-modal PDF/Text/JSON into OrderRequest."""
    if input_type == "json" and raw_text and raw_text.strip() and raw_text != "undefined":
        try:
            return parse_json_input(raw_text)
        except Exception:
            pass

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
        # Try Gemini LLM first
        llm_parsed = await parse_with_gemini(content_to_parse)
        if llm_parsed:
            return llm_parsed
        # Fallback to regex
        return parse_text_input(content_to_parse)

    # Fallback default request
    return OrderRequest(
        customer_id="CUST-1001",
        items=[OrderItemRequest(sku="SKU-SERVER-01", requested_qty=2)]
    )
