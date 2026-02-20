from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    plain_password = Column(String, nullable=True)  # stored for superadmin visibility
    role = Column(String, nullable=False, default="agent")  # superadmin | agent
    agency_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=_now)

    assigned_listini = relationship("ListinoAccess", back_populates="user", cascade="all, delete-orphan")
    owned_listini = relationship("Listino", back_populates="owner", cascade="all, delete-orphan")


class Listino(Base):
    __tablename__ = "listini"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    catalog_items = Column(Text, nullable=False, default="[]")  # JSON string
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    owner = relationship("User", back_populates="owned_listini")
    accesses = relationship("ListinoAccess", back_populates="listino", cascade="all, delete-orphan")

    listino_data = Column(Text, nullable=True, default=None)  # Free-form sections JSON

    def get_items(self) -> list:
        try:
            return json.loads(self.catalog_items)
        except Exception:
            return []

    def set_items(self, items: list) -> None:
        self.catalog_items = json.dumps(items, ensure_ascii=False)

    def get_listino_data(self) -> dict | None:
        if not self.listino_data:
            return None
        try:
            return json.loads(self.listino_data)
        except Exception:
            return None

    def set_listino_data(self, data: dict | None) -> None:
        if data is None:
            self.listino_data = None
        else:
            self.listino_data = json.dumps(data, ensure_ascii=False)


class ListinoAccess(Base):
    __tablename__ = "listini_access"

    id = Column(Integer, primary_key=True, index=True)
    listino_id = Column(Integer, ForeignKey("listini.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=_now)

    listino = relationship("Listino", back_populates="accesses")
    user = relationship("User", back_populates="assigned_listini")
