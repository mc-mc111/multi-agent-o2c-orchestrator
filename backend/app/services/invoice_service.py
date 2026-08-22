import io
import logging
from typing import Dict, Any, List
from jinja2 import Template
from xhtml2pdf import pisa
from app.config import settings
from app.services.cloudinary_service import upload_file_to_cloudinary

logger = logging.getLogger("invoice_service")

# In-memory invoice document cache for instant zero-404 PDF/HTML serving
invoice_cache: Dict[str, Dict[str, bytes]] = {}

HTML_INVOICE_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Invoice {{ invoice_id }}</title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; margin: 0; padding: 20px; font-size: 13px; }
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #0284c7; letter-spacing: -0.5px; }
        .title { font-size: 28px; font-weight: bold; text-align: right; color: #0f172a; text-transform: uppercase; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        .meta-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .items-table th { background-color: #0f172a; color: #ffffff; padding: 10px 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
        .items-table td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
        .totals-table { width: 40%; margin-left: auto; border-collapse: collapse; }
        .totals-table td { padding: 6px 12px; }
        .grand-total { font-size: 16px; font-weight: bold; color: #0284c7; border-top: 2px solid #0f172a; }
        .footer { margin-top: 50px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; background: #e0f2fe; color: #0369a1; }
    </style>
</head>
<body>
    <table class="header-table">
        <tr>
            <td class="logo">SUPERVITY O2C PLATFORM</td>
            <td class="title">INVOICE</td>
        </tr>
    </table>

    <table class="meta-table">
        <tr>
            <td width="50%" style="vertical-align: top;">
                <div class="meta-box">
                    <strong>Billed To:</strong><br>
                    {{ customer_name }} ({{ customer_id }})<br>
                    {{ customer_email }}<br>
                    {{ shipping_address }}
                </div>
            </td>
            <td width="50%" style="vertical-align: top; padding-left: 15px;">
                <div class="meta-box">
                    <strong>Invoice #:</strong> {{ invoice_id }}<br>
                    <strong>Order #:</strong> {{ order_id }}<br>
                    <strong>Date:</strong> {{ date }}<br>
                    <strong>Payment Terms:</strong> <span class="badge">{{ payment_terms }}</span>
                </div>
            </td>
        </tr>
    </table>

    <table class="items-table">
        <thead>
            <tr>
                <th>SKU</th>
                <th>Description</th>
                <th>Qty Allocated</th>
                <th>Backordered</th>
                <th>Unit Price</th>
                <th style="text-align: right;">Total</th>
            </tr>
        </thead>
        <tbody>
            {% for item in items %}
            <tr>
                <td><strong>{{ item.sku }}</strong></td>
                <td>{{ item.name or item.sku }}</td>
                <td>{{ item.allocated_qty }}</td>
                <td>{{ item.backordered_qty }}</td>
                <td>${{ "%.2f"|format(item.unit_price) }}</td>
                <td style="text-align: right;">${{ "%.2f"|format(item.line_total) }}</td>
            </tr>
            {% endfor %}
        </tbody>
    </table>

    <table class="totals-table">
        <tr>
            <td>Subtotal:</td>
            <td style="text-align: right;">${{ "%.2f"|format(subtotal) }}</td>
        </tr>
        <tr>
            <td>Tax (8.25%):</td>
            <td style="text-align: right;">${{ "%.2f"|format(tax) }}</td>
        </tr>
        <tr>
            <td>Shipping Surcharge:</td>
            <td style="text-align: right;">${{ "%.2f"|format(shipping) }}</td>
        </tr>
        <tr class="grand-total">
            <td>Grand Total:</td>
            <td style="text-align: right;">${{ "%.2f"|format(total) }}</td>
        </tr>
    </table>

    <div class="footer">
        Thank you for your business! Supervity Multi-Agent O2C Orchestrator • Terms: {{ payment_terms }}
    </div>
</body>
</html>
"""

async def generate_invoice_document(
    invoice_id: str,
    order_id: str,
    customer_id: str,
    customer_name: str,
    customer_email: str,
    shipping_address: str,
    items: List[Dict[str, Any]],
    subtotal: float,
    tax: float,
    shipping: float,
    total: float,
    date_str: str = "2026-08-22",
    payment_terms: str = "Net 30"
) -> Dict[str, str]:
    """Renders HTML template and converts it to a PDF artifact, caching locally and uploading to Cloudinary."""
    template = Template(HTML_INVOICE_TEMPLATE)
    html_content = template.render(
        invoice_id=invoice_id,
        order_id=order_id,
        customer_id=customer_id,
        customer_name=customer_name,
        customer_email=customer_email,
        shipping_address=shipping_address,
        items=items,
        subtotal=subtotal,
        tax=tax,
        shipping=shipping,
        total=total,
        date=date_str,
        payment_terms=payment_terms
    )
    
    # Convert HTML to PDF using xhtml2pdf
    pdf_buffer = io.BytesIO()
    pisa.CreatePDF(html_content, dest=pdf_buffer)
    pdf_bytes = pdf_buffer.getvalue()
    
    # Store in local invoice cache for guaranteed zero-404 serving
    invoice_cache[invoice_id] = {
        "pdf": pdf_bytes,
        "html": html_content.encode("utf-8")
    }
    
    # Upload to Cloudinary
    pdf_filename = f"{invoice_id}.pdf"
    html_filename = f"{invoice_id}.html"
    
    cloudinary_pdf = await upload_file_to_cloudinary(pdf_bytes, pdf_filename, folder="supervity")
    cloudinary_html = await upload_file_to_cloudinary(html_content.encode("utf-8"), html_filename, folder="supervity")
    
    # Fallback to backend served endpoint if Cloudinary returns 404 or fails
    fallback_pdf_url = f"/api/v1/invoices/{invoice_id}/pdf"
    fallback_html_url = f"/api/v1/invoices/{invoice_id}/html"
    
    final_pdf_url = cloudinary_pdf if (cloudinary_pdf and "res.cloudinary.com" in cloudinary_pdf and "demo" not in cloudinary_pdf) else fallback_pdf_url
    final_html_url = cloudinary_html if (cloudinary_html and "res.cloudinary.com" in cloudinary_html and "demo" not in cloudinary_html) else fallback_html_url
    
    return {
        "html_content": html_content,
        "pdf_url": final_pdf_url,
        "html_url": final_html_url
    }
