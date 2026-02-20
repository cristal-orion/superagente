from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import (
    create_access_token,
    get_current_user,
    verify_password,
)
from database import get_db
from models_db import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    agency_name: str | None
    user_id: int


class MeResponse(BaseModel):
    id: int
    email: str
    role: str
    agency_name: str | None
    is_active: bool


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenziali non valide",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account disabilitato",
        )
    token = create_access_token({"sub": str(user.id)})
    return TokenResponse(
        access_token=token,
        role=user.role,
        agency_name=user.agency_name,
        user_id=user.id,
    )


@router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)) -> MeResponse:
    return MeResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        agency_name=current_user.agency_name,
        is_active=current_user.is_active,
    )
