from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_async_session
from app.db.models import User
from app.services.auth_service import hash_password_pgcrypto, verify_password_pgcrypto, create_access_token

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = "Operations Officer"

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str
    full_name: str

@router.post("/register", response_model=TokenResponse)
async def register_user(payload: RegisterRequest, session: AsyncSession = Depends(get_async_session)):
    stmt = select(User).where(User.email == payload.email)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="User email already registered")
        
    hashed_pwd = await hash_password_pgcrypto(session, payload.password)
    user = User(
        email=payload.email,
        hashed_password=hashed_pwd,
        full_name=payload.full_name,
        role="admin"
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    
    token = create_access_token({"sub": user.email, "role": user.role})
    return TokenResponse(access_token=token, email=user.email, full_name=user.full_name)

@router.post("/login", response_model=TokenResponse)
async def login_user(payload: LoginRequest, session: AsyncSession = Depends(get_async_session)):
    stmt = select(User).where(User.email == payload.email)
    user = (await session.execute(stmt)).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    is_valid = await verify_password_pgcrypto(session, payload.password, user.hashed_password)
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    token = create_access_token({"sub": user.email, "role": user.role})
    return TokenResponse(access_token=token, email=user.email, full_name=user.full_name)
