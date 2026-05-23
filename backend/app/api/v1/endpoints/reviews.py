"""
Product reviews & ratings endpoint.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import get_db
from app.models.user import User
from app.models.order import Order, OrderItem
from app.api.deps import get_current_user
from app.db.base import Base
from sqlalchemy import String, Integer, Float, Text, ForeignKey, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID

router = APIRouter(prefix="/reviews", tags=["reviews"])


class Review(Base):
    __tablename__ = "reviews"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


@router.get("/{product_id}")
async def get_reviews(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Review, User.full_name)
        .join(User, Review.user_id == User.id)
        .where(Review.product_id == product_id, Review.deleted_at.is_(None))
        .order_by(Review.created_at.desc())
    )
    rows = result.all()
    reviews = [
        {
            "id": str(r.Review.id),
            "rating": r.Review.rating,
            "comment": r.Review.comment,
            "reviewer": r.full_name,
            "created_at": r.Review.created_at.isoformat(),
        }
        for r in rows
    ]
    avg = round(sum(r["rating"] for r in reviews) / len(reviews), 1) if reviews else 0
    return {"reviews": reviews, "average": avg, "count": len(reviews)}


@router.post("/{product_id}")
async def add_review(
    product_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rating = int(payload.get("rating", 0))
    if not 1 <= rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Check user has ordered this product
    ordered = await db.execute(
        select(OrderItem).join(Order, OrderItem.order_id == Order.id)
        .where(
            Order.user_id == current_user.id,
            OrderItem.product_id == product_id,
            Order.status == "completed",
            Order.deleted_at.is_(None),
        )
    )
    if not ordered.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="You can only review products you have purchased")

    # Check not already reviewed
    existing = await db.execute(
        select(Review).where(Review.product_id == product_id, Review.user_id == current_user.id, Review.deleted_at.is_(None))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already reviewed this product")

    review = Review(
        product_id=product_id,
        user_id=current_user.id,
        rating=rating,
        comment=payload.get("comment", "").strip() or None,
    )
    db.add(review)
    await db.flush()
    return {"detail": "Review submitted", "id": str(review.id)}


@router.delete("/{review_id}")
async def delete_review(
    review_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Review).where(Review.id == review_id, Review.user_id == current_user.id)
    )
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    review.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return {"detail": "Review deleted"}
