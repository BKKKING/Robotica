"""Simple admin auth using in-memory token store & JWT scaffolding."""
from __future__ import annotations
from fastapi import APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import Optional, Dict, Set
from jose import jwt, JWTError
from passlib.context import CryptContext
import os

load_dotenv()  # asegura cargar .env antes de leer variables

SECRET = os.getenv("SECRET_KEY", "dev-secret")
ALGO = os.getenv("ALGORITHM", "HS256")
ACCESS_MIN = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
ADMIN_USER = "admin"
_admin_plain = "123456"
# Use a pre-computed bcrypt hash to avoid runtime bcrypt issues on Windows
# This hash is for password "123456"
ADMIN_PASS_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyNiAYMyzJ/I1K"

active_tokens: Set[str] = set()

router = APIRouter(prefix="/auth", tags=["auth"])    

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


def create_token(sub: str) -> str:
    exp = datetime.utcnow() + timedelta(minutes=ACCESS_MIN)
    to_encode = {"sub": sub, "exp": exp}
    return jwt.encode(to_encode, SECRET, algorithm=ALGO)


def verify_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        sub: str = payload.get("sub")  # type: ignore
        if not sub:
            raise HTTPException(status_code=401, detail="Token inválido")
        if token not in active_tokens:
            raise HTTPException(status_code=401, detail="Token revocado")
        return sub
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")


def get_current_admin(authorization: str = Header(None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Falta Authorization Bearer")
    token = authorization.split(None,1)[1]
    return verify_token(token)

@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest):
    if data.username != ADMIN_USER or not pwd.verify(data.password, ADMIN_PASS_HASH):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")
    token = create_token(data.username)
    active_tokens.add(token)
    return TokenResponse(access_token=token)

@router.post("/logout")
async def logout(authorization: str = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        return {"detail": "No había sesión"}
    token = authorization.split(None,1)[1]
    active_tokens.discard(token)
    return {"detail": "Sesión terminada"}

@router.get("/me")
async def me(user: str = Depends(get_current_admin)):
    return {"user": user}

