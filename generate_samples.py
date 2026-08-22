import os
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from PIL import Image, ImageDraw, ImageFont

def generate_samples():
    samples_dir = os.path.join(os.path.dirname(__file__), "samples")
    os.makedirs(samples_dir, exist_ok=True)
    
    # 1. Create sample_po_1001.pdf
    pdf1_path = os.path.join(samples_dir, "sample_po_1001.pdf")
    c1 = canvas.Canvas(pdf1_path, pagesize=letter)
    c1.setFont("Helvetica-Bold", 18)
    c1.drawString(50, 750, "PURCHASE ORDER")
    c1.setFont("Helvetica", 12)
    c1.drawString(50, 720, "PO Number: PO-2026-9901")
    c1.drawString(50, 700, "Customer ID: CUST-1001")
    c1.drawString(50, 680, "Company: Acme Enterprise Inc.")
    c1.drawString(50, 660, "Ship To: 100 Innovation Way, Austin TX 78701")
    
    c1.setFont("Helvetica-Bold", 12)
    c1.drawString(50, 610, "Item SKU")
    c1.drawString(250, 610, "Description")
    c1.drawString(450, 610, "Quantity")
    
    c1.setFont("Helvetica", 11)
    c1.drawString(50, 580, "SKU-SERVER-01")
    c1.drawString(250, 580, "Enterprise AI Rack Server")
    c1.drawString(450, 580, "2")
    
    c1.drawString(50, 550, "SKU-GPU-01")
    c1.drawString(250, 550, "NVIDIA H100 Tensor Core GPU")
    c1.drawString(450, 550, "1")
    
    c1.save()
    print(f"Generated {pdf1_path}")

    # 2. Create sample_po_1002.pdf (Inventory Shortage Case)
    pdf2_path = os.path.join(samples_dir, "sample_po_1002.pdf")
    c2 = canvas.Canvas(pdf2_path, pagesize=letter)
    c2.setFont("Helvetica-Bold", 18)
    c2.drawString(50, 750, "PURCHASE ORDER (BULK)")
    c2.setFont("Helvetica", 12)
    c2.drawString(50, 720, "PO Number: PO-2026-9902")
    c2.drawString(50, 700, "Customer ID: CUST-1002")
    c2.drawString(50, 680, "Company: Apex Logistics Global")
    c2.drawString(50, 660, "Ship To: 500 Freight Way, Chicago IL 60607")
    
    c2.setFont("Helvetica-Bold", 12)
    c2.drawString(50, 610, "Item SKU")
    c2.drawString(250, 610, "Description")
    c2.drawString(450, 610, "Quantity")
    
    c2.setFont("Helvetica", 11)
    c2.drawString(50, 580, "SKU-SERVER-01")
    c2.drawString(250, 580, "Enterprise AI Rack Server")
    c2.drawString(450, 580, "50")
    
    c2.save()
    print(f"Generated {pdf2_path}")

    # 3. Create sample_po_1001.png
    img1_path = os.path.join(samples_dir, "sample_po_1001.png")
    img1 = Image.new('RGB', (800, 1000), color=(255, 255, 255))
    d1 = ImageDraw.Draw(img1)
    d1.rectangle([(20, 20), (780, 980)], outline=(30, 41, 59), width=3)
    d1.text((50, 50), "OFFICIAL PURCHASE ORDER", fill=(15, 23, 42))
    d1.text((50, 90), "Customer ID: CUST-1001", fill=(30, 41, 59))
    d1.text((50, 120), "Ship To: 100 Innovation Way, Austin TX 78701", fill=(30, 41, 59))
    d1.text((50, 180), "Line Items:", fill=(15, 23, 42))
    d1.text((50, 220), "1. SKU-SERVER-01 - Qty: 2", fill=(15, 23, 42))
    d1.text((50, 250), "2. SKU-GPU-01 - Qty: 1", fill=(15, 23, 42))
    img1.save(img1_path)
    print(f"Generated {img1_path}")

    # 4. Create sample_po_1002.png
    img2_path = os.path.join(samples_dir, "sample_po_1002.png")
    img2 = Image.new('RGB', (800, 1000), color=(255, 255, 255))
    d2 = ImageDraw.Draw(img2)
    d2.rectangle([(20, 20), (780, 980)], outline=(30, 41, 59), width=3)
    d2.text((50, 50), "PURCHASE ORDER - BULK REQUEST", fill=(15, 23, 42))
    d2.text((50, 90), "Customer ID: CUST-1002", fill=(30, 41, 59))
    d2.text((50, 120), "Ship To: 500 Freight Way, Chicago IL 60607", fill=(30, 41, 59))
    d2.text((50, 180), "Line Items:", fill=(15, 23, 42))
    d2.text((50, 220), "1. SKU-SERVER-01 - Qty: 50", fill=(15, 23, 42))
    img2.save(img2_path)
    print(f"Generated {img2_path}")

if __name__ == "__main__":
    generate_samples()
