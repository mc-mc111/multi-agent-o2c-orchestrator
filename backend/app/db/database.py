import re
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlmodel import SQLModel
from app.config import settings

# Async SQLAlchemy Engine for Neon PostgreSQL
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# asyncpg expects 'ssl' parameter rather than 'sslmode'
if "sslmode=" in db_url:
    db_url = db_url.replace("sslmode=", "ssl=")
if "channel_binding=" in db_url:
    # remove channel_binding for asyncpg if present
    db_url = re.sub(r"&?channel_binding=[^&]+", "", db_url)

engine = create_async_engine(
    db_url,
    echo=False,
    future=True,
    pool_pre_ping=True
)

async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_async_session():
    async with async_session_maker() as session:
        yield session

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
