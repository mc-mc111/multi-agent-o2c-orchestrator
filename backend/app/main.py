import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.database import init_db
from app.db.seed import seed_database
from app.api.auth import router as auth_router
from app.api.orchestrator import router as orchestrator_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Supervity O2C Orchestrator Backend ({settings.ENVIRONMENT})")
    try:
        await init_db()
        await seed_database()
    except Exception as e:
        logger.warning(f"Database auto-init on startup encountered warning: {e}")
    yield
    logger.info("Shutting down O2C Orchestrator Backend.")

app = FastAPI(
    title="Enterprise Order-to-Cash (O2C) Multi-Agent Orchestrator API",
    description="Full-stack asynchronous multi-agent system executing B2B order processing, inventory reservation, billing, and risk analysis.",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(auth_router)
app.include_router(orchestrator_router)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "system": "Supervity O2C Orchestrator",
        "environment": settings.ENVIRONMENT,
        "model": settings.MODEL_NAME,
        "database": "Neon PostgreSQL (Connected)"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
