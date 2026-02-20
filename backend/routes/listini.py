from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_user, require_superadmin
from database import get_db
from models_db import Listino, ListinoAccess, User

router = APIRouter(prefix="/api/listini", tags=["listini"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class CatalogItem(BaseModel):
    id: str | None = None
    category: str
    label: str
    potenza_kw: float
    accumulo_kwh: float = 0.0
    prezzo_eur: float

    def with_generated_id(self) -> "CatalogItem":
        if not self.id:
            return self.model_copy(update={"id": f"custom-{uuid.uuid4().hex[:8]}"})
        return self


class CreateListinoRequest(BaseModel):
    name: str
    catalog_items: list[CatalogItem] = []
    listino_data: dict | None = None  # Free-form sections JSON


class UpdateListinoRequest(BaseModel):
    name: str | None = None
    catalog_items: list[CatalogItem] | None = None
    listino_data: dict | None = None  # Free-form sections JSON


class ListinoResponse(BaseModel):
    id: int
    name: str
    owner_id: int
    owner_email: str
    catalog_items: list[dict]
    listino_data: dict | None = None
    created_at: datetime
    updated_at: datetime
    assigned_to: list[int]

    class Config:
        from_attributes = True


class ListinoSummary(BaseModel):
    id: int
    name: str
    owner_id: int
    owner_email: str
    items_count: int
    created_at: datetime
    updated_at: datetime
    assigned_to: list[int]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _sections_to_items(sections: list[dict]) -> list[dict]:
    """Extract catalog items from free-form listino sections."""
    import uuid as _uuid

    items: list[dict] = []
    for section in sections:
        cat_title = section.get("title", "").strip()
        raw_cols = section.get("columns", [])
        cols = [str(c).lower().strip() for c in raw_cols]
        rows = section.get("rows", [])

        def find(col_list, *patterns) -> int:
            for p in patterns:
                for i, c in enumerate(col_list):
                    if p in c:
                        return i
            return -1

        label_idx = find(cols, "label", "configurazione", "descrizione", "nome", "conf")
        kw_idx = find(cols, "potenza", " kw")
        if kw_idx < 0:
            for i, c in enumerate(cols):
                if c == "kw" or c.endswith(" kw"):
                    kw_idx = i; break
        if kw_idx < 0:
            for i, c in enumerate(cols):
                if "kw" in c and "kwh" not in c:
                    kw_idx = i; break
        kwh_idx = find(cols, "kwh", "accumulo")
        prezzo_idx = find(cols, "prezzo", "€", "euro", "importo", "costo")

        for row in rows:
            def get(idx: int) -> str:
                if idx < 0 or idx >= len(row):
                    return ""
                return str(row[idx]).strip()

            def get_num(idx: int) -> float:
                v = get(idx).replace(",", ".").replace(" ", "").replace("€", "").replace("%", "")
                try:
                    return float(v)
                except ValueError:
                    return 0.0

            item_label = get(label_idx) if label_idx >= 0 else get(0)
            if not item_label:
                continue

            items.append({
                "id": f"imp-{_uuid.uuid4().hex[:8]}",
                "category": cat_title,
                "label": item_label,
                "potenza_kw": get_num(kw_idx) if kw_idx >= 0 else 0.0,
                "accumulo_kwh": get_num(kwh_idx) if kwh_idx >= 0 else 0.0,
                "prezzo_eur": get_num(prezzo_idx) if prezzo_idx >= 0 else 0.0,
            })

    return items


def _listino_to_response(l: Listino) -> ListinoResponse:
    return ListinoResponse(
        id=l.id,
        name=l.name,
        owner_id=l.owner_id,
        owner_email=l.owner.email if l.owner else "",
        catalog_items=l.get_items(),
        listino_data=l.get_listino_data(),
        created_at=l.created_at,
        updated_at=l.updated_at,
        assigned_to=[a.user_id for a in l.accesses],
    )


def _listino_to_summary(l: Listino) -> ListinoSummary:
    return ListinoSummary(
        id=l.id,
        name=l.name,
        owner_id=l.owner_id,
        owner_email=l.owner.email if l.owner else "",
        items_count=len(l.get_items()),
        created_at=l.created_at,
        updated_at=l.updated_at,
        assigned_to=[a.user_id for a in l.accesses],
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[ListinoSummary])
def list_listini(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ListinoSummary]:
    if current_user.role == "superadmin":
        listini = db.query(Listino).all()
    else:
        owned_ids = {l.id for l in current_user.owned_listini}
        assigned_ids = {a.listino_id for a in current_user.assigned_listini}
        all_ids = owned_ids | assigned_ids
        listini = db.query(Listino).filter(Listino.id.in_(all_ids)).all()
    return [_listino_to_summary(l) for l in listini]


@router.post("", response_model=ListinoResponse, status_code=status.HTTP_201_CREATED)
def create_listino(
    body: CreateListinoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ListinoResponse:
    items = [item.with_generated_id().model_dump() for item in body.catalog_items]
    listino = Listino(
        name=body.name,
        owner_id=current_user.id,
    )
    listino.set_items(items)
    listino.set_listino_data(body.listino_data)
    db.add(listino)
    db.commit()
    db.refresh(listino)
    return _listino_to_response(listino)


@router.get("/{listino_id}", response_model=ListinoResponse)
def get_listino(
    listino_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ListinoResponse:
    listino = db.query(Listino).filter(Listino.id == listino_id).first()
    if not listino:
        raise HTTPException(status_code=404, detail="Listino non trovato")

    if current_user.role != "superadmin":
        is_owner = listino.owner_id == current_user.id
        is_assigned = any(a.user_id == current_user.id for a in listino.accesses)
        if not is_owner and not is_assigned:
            raise HTTPException(status_code=403, detail="Accesso negato")

    return _listino_to_response(listino)


@router.put("/{listino_id}", response_model=ListinoResponse)
def update_listino(
    listino_id: int,
    body: UpdateListinoRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ListinoResponse:
    listino = db.query(Listino).filter(Listino.id == listino_id).first()
    if not listino:
        raise HTTPException(status_code=404, detail="Listino non trovato")

    if current_user.role != "superadmin" and listino.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accesso negato")

    if body.name is not None:
        listino.name = body.name
    if body.catalog_items is not None and len(body.catalog_items) > 0:
        items = [item.with_generated_id().model_dump() for item in body.catalog_items]
        listino.set_items(items)
    if body.listino_data is not None:
        listino.set_listino_data(body.listino_data)
        # Auto-extract catalog_items from sections whenever listino_data is saved
        sections = body.listino_data.get("sections", [])
        if sections:
            extracted = _sections_to_items(sections)
            if extracted:
                listino.set_items(extracted)
    listino.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(listino)
    return _listino_to_response(listino)


@router.delete("/{listino_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_listino(
    listino_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    listino = db.query(Listino).filter(Listino.id == listino_id).first()
    if not listino:
        raise HTTPException(status_code=404, detail="Listino non trovato")

    if current_user.role != "superadmin" and listino.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Accesso negato")

    db.delete(listino)
    db.commit()


@router.post("/{listino_id}/assign/{user_id}", status_code=status.HTTP_200_OK)
def assign_listino(
    listino_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_superadmin),
) -> dict:
    listino = db.query(Listino).filter(Listino.id == listino_id).first()
    if not listino:
        raise HTTPException(status_code=404, detail="Listino non trovato")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utente non trovato")

    existing = db.query(ListinoAccess).filter(
        ListinoAccess.listino_id == listino_id,
        ListinoAccess.user_id == user_id,
    ).first()
    if existing:
        return {"status": "already_assigned"}

    access = ListinoAccess(listino_id=listino_id, user_id=user_id)
    db.add(access)
    db.commit()
    return {"status": "assigned"}


@router.delete("/{listino_id}/assign/{user_id}", status_code=status.HTTP_200_OK)
def unassign_listino(
    listino_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_superadmin),
) -> dict:
    access = db.query(ListinoAccess).filter(
        ListinoAccess.listino_id == listino_id,
        ListinoAccess.user_id == user_id,
    ).first()
    if not access:
        raise HTTPException(status_code=404, detail="Assegnazione non trovata")

    db.delete(access)
    db.commit()
    return {"status": "unassigned"}
