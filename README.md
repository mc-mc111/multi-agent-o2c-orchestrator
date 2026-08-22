# Order-to-Cash (O2C) Multi-Agent Orchestration Platform

An Operations & Ingestion Command Center automating the B2B Order-to-Cash lifecycle via a multi-agent state machine (LangGraph + FastAPI), Neon PostgreSQL database, Cloudinary document storage, local OCR ingestion engine, real-time Server-Sent Events (SSE) telemetry, and Next.js frontend.

## System Architecture

- **Backend**: FastAPI, LangGraph, SQLModel (Async SQLAlchemy), Neon PostgreSQL, PyTesseract / pdfplumber OCR, Cloudinary SDK.
- **Frontend**: Next.js 14 App Router, Tailwind/Vanilla CSS, Lucide icons, SSE real-time event streaming.
- **AI Engine**: Gemini 3.6 Flash via `google-genai` dynamically configured from environment variables.

## Quick Start

### 1. Backend Setup
```bash
cd backend
py -3.13 -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python -m app.db.seed
uvicorn app.main:app --reload --port 8000
```

### 2. Docker Execution
```bash
docker-compose up --build
```

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
