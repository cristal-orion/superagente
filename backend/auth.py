from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import get_db
from models_db import User

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "change-me-in-production-please-use-a-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 hours

SUPERADMIN_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "admin@example.com")
SUPERADMIN_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "changeme")
SUPERADMIN_AGENCY = os.environ.get("SUPERADMIN_AGENCY", "Admin")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


# ─── Password helpers ─────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── JWT helpers ──────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ─── Dependencies ─────────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token non valido o mancante",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not credentials:
        raise exc
    try:
        payload = decode_token(credentials.credentials)
        user_id: int = payload.get("sub")
        if user_id is None:
            raise exc
    except JWTError:
        raise exc

    user = db.query(User).filter(User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise exc
    return user


def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso negato")
    return current_user


# ─── Seed ─────────────────────────────────────────────────────────────────────

def seed_superadmin(db: Session) -> None:
    """Create the default superadmin if not present."""
    existing = db.query(User).filter(User.email == SUPERADMIN_EMAIL).first()
    if not existing:
        admin = User(
            email=SUPERADMIN_EMAIL,
            password_hash=hash_password(SUPERADMIN_PASSWORD),
            role="superadmin",
            agency_name=SUPERADMIN_AGENCY,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        print(f"[auth] Superadmin creato: {SUPERADMIN_EMAIL}")
    else:
        print(f"[auth] Superadmin già presente: {SUPERADMIN_EMAIL}")
