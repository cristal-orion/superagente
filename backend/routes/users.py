from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import hash_password, require_superadmin
from database import get_db
from models_db import User

router = APIRouter(prefix="/api/users", tags=["users"])


class CreateUserRequest(BaseModel):
    email: str
    password: str
    agency_name: str | None = None
    role: str = "agent"


class UpdateUserRequest(BaseModel):
    agency_name: str | None = None
    is_active: bool | None = None
    password: str | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    agency_name: str | None
    is_active: bool
    plain_password: str | None = None

    class Config:
        from_attributes = True


@router.get("", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _admin=Depends(require_superadmin),
) -> list[UserResponse]:
    users = db.query(User).all()
    return [UserResponse.model_validate(u) for u in users]


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: CreateUserRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_superadmin),
) -> UserResponse:
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")

    if body.role not in ("superadmin", "agent"):
        raise HTTPException(status_code=400, detail="Ruolo non valido")

    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        plain_password=body.password,
        role=body.role,
        agency_name=body.agency_name,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_superadmin),
) -> UserResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    if body.agency_name is not None:
        user.agency_name = body.agency_name
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password:
        user.password_hash = hash_password(body.password)
        user.plain_password = body.password

    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.post("/{user_id}/set-password", response_model=UserResponse)
def set_password(
    user_id: int,
    body: UpdateUserRequest,
    db: Session = Depends(get_db),
    _admin=Depends(require_superadmin),
) -> UserResponse:
    """Set a new password for a user (superadmin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if not body.password:
        raise HTTPException(status_code=400, detail="Password obbligatoria")
    user.password_hash = hash_password(body.password)
    user.plain_password = body.password
    db.commit()
    db.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_superadmin),
) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Non puoi eliminare il tuo account")
    db.delete(user)
    db.commit()
