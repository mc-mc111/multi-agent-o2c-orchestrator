from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except Exception:
        return None

async def hash_password_pgcrypto(session: AsyncSession, password: str) -> str:
    """Hashes password using PostgreSQL pgcrypto crypt function."""
    try:
        result = await session.execute(
            text("SELECT crypt(:password, gen_salt('bf', 8)) AS hashed;"),
            {"password": password}
        )
        row = result.fetchone()
        if row and row.hashed:
            return row.hashed
    except Exception as e:
        # Fallback to bcrypt string if pgcrypto fails in sqlite/mock
        import passlib.hash
        return passlib.hash.bcrypt.hash(password)

async def verify_password_pgcrypto(session: AsyncSession, plain_password: str, hashed_password: str) -> bool:
    """Verifies password using PostgreSQL pgcrypto comparison."""
    try:
        result = await session.execute(
            text("SELECT (:hashed_password = crypt(:plain_password, :hashed_password)) AS is_match;"),
            {"plain_password": plain_password, "hashed_password": hashed_password}
        )
        row = result.fetchone()
        if row is not None:
            return bool(row.is_match)
    except Exception:
        pass
    
    # Fallback to passlib
    try:
        import passlib.hash
        return passlib.hash.bcrypt.verify(plain_password, hashed_password)
    except Exception:
        return False
