"""
Promo codes — admin creates, users apply at checkout.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import get_db
from app.models.user import User
from app.api.deps import get_current_user, get_current_admin
from app.db.base import Base
from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

router = APIRouter(prefix="/promo", tags=["promo"])


class PromoCode(Base):
    __tablename__ = "promo_codes"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    discount_percent: Mapped[float] = mapped_column(Float, nullable=False)
    max_uses: Mapped[int] = mapped_column(Integer, default=0)  # 0 = unlimited
    uses: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


@router.get("/validate/{code}")
async def validate_promo(code: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PromoCode).where(
            PromoCode.code == code.upper().strip(),
            PromoCode.is_active == True,
        )
    )
    promo = result.scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=404, detail="Invalid promo code")
    if promo.expires_at and datetime.now(timezone.utc) > promo.expires_at:
        raise HTTPException(status_code=400, detail="Promo code has expired")
    if promo.max_uses > 0 and promo.uses >= promo.max_uses:
        raise HTTPException(status_code=400, detail="Promo code has reached its usage limit")
    return {"code": promo.code, "discount_percent": promo.discount_percent, "valid": True}


@router.post("/admin/create")
async def create_promo(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    code = (payload.get("code") or "").upper().strip()
    discount = float(payload.get("discount_percent", 0))
    if not code or not 1 <= discount <= 100:
        raise HTTPException(status_code=400, detail="Invalid code or discount")
    existing = await db.execute(select(PromoCode).where(PromoCode.code == code))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Code already exists")
    promo = PromoCode(
        code=code,
        discount_percent=discount,
        max_uses=int(payload.get("max_uses", 0)),
        expires_at=payload.get("expires_at"),
    )
    db.add(promo)
    await db.flush()
    return {"detail": "Promo code created", "code": code}


@router.get("/admin/list")
async def list_promos(db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(PromoCode).order_by(PromoCode.created_at.desc()))
    promos = result.scalars().all()
    return [{"id": str(p.id), "code": p.code, "discount_percent": p.discount_percent,
             "uses": p.uses, "max_uses": p.max_uses, "is_active": p.is_active,
             "expires_at": p.expires_at.isoformat() if p.expires_at else None} for p in promos]


@router.delete("/admin/{promo_id}")
async def delete_promo(promo_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(PromoCode).where(PromoCode.id == promo_id))
    promo = result.scalar_one_or_none()
    if not promo:
        raise HTTPException(status_code=404, detail="Promo not found")
    await db.delete(promo)
    await db.flush()
    return {"detail": "Deleted"}
