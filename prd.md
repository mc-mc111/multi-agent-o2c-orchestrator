# Product Requirement Document (PRD)

**Project Title:** Enterprise Order-to-Cash (O2C) Multi-Agent Orchestration Platform

**Target Architecture:** Full-Stack Decoupled System (Vercel + Render + PostgreSQL + Cloudinary)

**Execution Window:** 24-Hour Production-Grade Implementation

---

## 1. System Vision & Objective

The objective of this platform is to automate the B2B Order-to-Cash (O2C) lifecycle. The system ingests multi-modal sales inputs (unstructured text, raw JSON, and PDF/Image purchase orders), normalizes them into structured Pydantic schemas via deterministic extraction, and executes a multi-agent state machine using LangGraph.

The application is designed as an **Operations & Ingestion Dashboard** for enterprise sales and operations teams, prioritizing system observability, state-machine determinism, and real-time execution streaming.

---

## 2. Core Operational Workflow (The 4-Stage Pipeline)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          STAGE 0: INGESTION NODE                        │
│   Input: Raw Text | Email JSON | Uploaded Purchase Order (PDF/PNG)      │
│   Operation: Format Detection -> Tesseract OCR / pdfplumber Extraction  │
│   Output: Normalized Pydantic OrderRequest Payload                      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       CENTRAL ORCHESTRATOR AGENT                        │
│   Role: Manages Global Order State (O2CState), Directs Agent Graph,      │
│         Handles Handoff Telemetry, Logs Audit Trails                    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
      ┌──────────────────┬───────────┴───────────┬──────────────────┐
      │ (If Valid)       │ (If In Stock)         │ (If Billed)      │
      ▼                  ▼                       ▼                  ▼
┌─────────────┐   ┌─────────────┐         ┌─────────────┐    ┌─────────────┐
│   STAGE 1   │   │   STAGE 2   │         │   STAGE 3   │    │   STAGE 4   │
│ Validation  │──►│  Inventory  │────────►│   Billing   │──► │    Risk     │
│    Agent    │   │    Agent    │         │    Agent    │    │    Agent    │
└─────────────┘   └─────────────┘         └─────────────┘    └─────────────┘
  • Master Data     • Stock Check           • Financial Math   • Credit Check
  • Schema Bounds   • Reservations          • Invoice Gen      • Score Assignment
  • Field Audits    • Exception Routing     • Term Binds       • Final Approval

```

---

## 3. Detailed Stage Breakdown

### Stage 0: Multi-Modal Ingestion Node

* **Input Modalities:** Raw email string, formatted JSON payload, or file upload (PDF/PNG/JPG).
* **Extraction Strategy:**
* **Digital PDFs:** Processed via `pdfplumber` to extract text and embedded table elements.
* **Scanned Images/PDFs:** Processed via OS-level `tesseract-ocr` binary wrappers (`pytesseract`).


* **Normalization:** Regex and deterministic string parsers convert extracted text directly into a structured `OrderRequest` schema before entering the graph.

### Stage 1: Validation Agent

* **Role:** Enforces structural completeness and master entity authenticity.
* **Checks:** Required headers (`customer_id`, `order_date`, `shipping_address`), positive line-item quantities ($>0$), valid unit price floats, and active customer lookup in the PostgreSQL database.
* **Routing:**
* `VALIDATED` $\rightarrow$ Hands execution state back to Orchestrator to trigger Stage 2.
* `VALIDATION_FAILED` $\rightarrow$ Halts graph execution, updates state to `VALIDATION_ERROR`, appends specific violation messages, and bypasses downstream stages.



### Stage 2: Inventory Agent

* **Role:** Cross-references requested SKUs against physical warehouse stock levels in PostgreSQL via Prisma Client Python.
* **Checks:** Batched stock query for all line items; verifies `available_quantity`.
* **Actions:** Soft-reserves stock in the database upon verification.
* **Routing:**
* `INVENTORY_RESERVED` $\rightarrow$ Hands execution state back to Orchestrator to trigger Stage 3.
* `INVENTORY_EXCEPTION` $\rightarrow$ Detects partial shortages or zero-stock states, calculates missing stock deltas, logs backorder requirements, and routes to an Exception Resolution path.



### Stage 3: Billing Agent

* **Role:** Constructs financial artifacts and updates order financial states.
* **Checks:** Subtotal calculations per line item, applicable tax rates, shipping surcharge logic, and final total derivation.
* **Artifact Generation:** Generates structured invoice data, assigns a unique `invoice_id`, binds payment terms (e.g., Net 30), and persists the invoice record.
* **Routing:**
* `INVOICE_GENERATED` $\rightarrow$ Hands execution state back to Orchestrator to trigger Stage 4.
* `BILLING_ERROR` $\rightarrow$ Halts execution on calculation/currency mismatches.



### Stage 4: Risk Agent

* **Role:** Evaluates financial security, fraud likelihood, and credit thresholds.
* **Checks:** High order-value flags (e.g., orders $> \$10,000$), shipping vs. billing address anomalies, and customer credit exposure.
* **Risk Categorization:**
* `LOW_RISK` $\rightarrow$ Order automatically marked as `COMPLETED`.
* `MEDIUM_RISK` / `HIGH_RISK` $\rightarrow$ Order marked as `HELD_FOR_REVIEW` with risk scores and warning flags appended to the audit trail.



---

## 4. Central Environment Configuration Strategy

**Strict Requirement:** Zero hardcoded API keys, database connection strings, or external endpoints are permitted anywhere in source code or client-side assets. A single central configuration manages environment variables across local development and production deployments.

### Environment Variable Dictionary

```
# Application Environment
ENVIRONMENT="production"
PORT=8000

# Security & CORS
ALLOWED_ORIGINS="https://your-app.vercel.app,http://localhost:3000"

# AI Model Provider
GEMINI_API_KEY="your-gemini-api-key"
MODEL_NAME="gemini-2.5-flash"

# Database Architecture (PostgreSQL + Prisma ORM)
DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public"

# Asset & Media Storage (Cloudinary)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Frontend Integration
NEXT_PUBLIC_API_BASE_URL="https://your-api.onrender.com"

```

---

## 5. Technical Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER (Vercel)                             │
│  Framework: React / Next.js (App Router)                                │
│  Responsibilities: Dual-panel Operations Command Center UI,             │
│                    File/Text Ingestion Forms, Real-Time SSE Stream      │
│                    Telemetry Display, Invoice Artifact Viewer           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTPS / REST / SSE Stream
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    BACKEND LAYER (Render - Docker)                      │
│  Framework: FastAPI (Asynchronous Python)                               │
│  System Binaries: tesseract-ocr, libtesseract-dev, poppler-utils         │
│  Core Libraries: LangGraph (State Graph Orchestrator),                  │
│                  Prisma Client Python (Async ORM), Pydantic v2,         │
│                  pdfplumber, pytesseract                                │
└────────────────────────────┬─────────────────────────────┬──────────────┘
                             │                             │
              Async Queries  │                             │ Asset Uploads
                             ▼                             ▼
┌─────────────────────────────────────────┐   ┌───────────────────────────┐
│            DATABASE LAYER               │   │      STORAGE LAYER        │
│  Engine: Hosted PostgreSQL              │   │  Provider: Cloudinary     │
│  Models: Customer, Inventory, Order,    │   │  Artifacts: Raw PO Files, │
│          Invoice, AuditLog              │   │             Invoice PDFs  │
└─────────────────────────────────────────┘   └───────────────────────────┘

```

---

## 6. Frontend Interface Specification (Operations Command Center)

The interface avoids consumer shopping-cart paradigms and is organized into a **Two-Panel Operations Command Center**:

### Left Panel: Ingestion & Input Selector

* **Multi-Modal Tabs:**
1. *Text / Email Paste:* Text area for raw email or customer message inputs.
2. *Raw JSON:* Input editor for structured JSON purchase orders.
3. *File Upload:* Drop zone accepting PDF, PNG, or JPG files.


* **Control Actions:** `[ Execute O2C Orchestrator ]` trigger button.
* **Parsed Schema Preview:** Card rendering the mapped `OrderRequest` Pydantic payload returned by the Ingestion Node.

### Right Panel: Real-Time Multi-Agent Telemetry

* **Live Execution Stream:** Connected to FastAPI Server-Sent Events (SSE) endpoints.
* **Agent Cards (Rendered Dynamically):**
* *Validation Card:* Real-time badge status (`Passed`/`Failed`) + master data logs.
* *Inventory Card:* Stock reservation readouts (`SKU: 50 requested, 120 available`).
* *Billing Card:* Invoice generation status + itemized total breakdown.
* *Risk Card:* Risk level indicator (`Low`/`Medium`/`High`) + evaluated flags.


* **Final Deliverable View:** Downloadable invoice preview link (hosted on Cloudinary) and an Executive Summary narrative generated by the Orchestrator.

---

## 7. Deployment & Infrastructure Strategy

1. **Backend Infrastructure (Render):**
* Packaged as a single **Docker Container**.
* Multi-stage build installing OS-level OCR dependencies (`tesseract-ocr`, `poppler-utils`) and running FastAPI via `uvicorn`.
* **Keep-Alive Strategy:** External cron-job pinging `/health` every 10 minutes to eliminate free-tier container sleep states.


2. **Frontend Infrastructure (Vercel):**
* Deployed via direct GitHub integration.
* Leverages `NEXT_PUBLIC_API_BASE_URL` pointing to the Render instance for API calls and SSE subscriptions.


3. **Database & Storage Layer:**
* Hosted PostgreSQL instance accessed via Prisma async client.
* Cloudinary SDK handling document storage and CDN URL resolution.