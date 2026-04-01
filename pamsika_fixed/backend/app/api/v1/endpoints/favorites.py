"""
Favorites endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError

from app.db.session import get_db
from app.models.favorite import Favorite
from app.models.product import Product
from app.models.user import User
from app.schemas.common import FavoriteOut
from app.api.deps import get_current_user

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("", response_model=list[FavoriteOut])
async def list_favorites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Favorite).where(Favorite.user_id == current_user.id).order_by(Favorite.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{product_id}", status_code=201)
async def add_favorite(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    prod = await db.execute(select(Product).where(Product.id == product_id, Product.is_active == True))
    if not prod.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Product not found")

    fav = Favorite(user_id=current_user.id, product_id=product_id)
    db.add(fav)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Already in favorites")
    return {"detail": "Added to favorites"}


@router.delete("/{product_id}")
async def remove_favorite(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.product_id == product_id,
        )
    )
    fav = result.scalar_one_or_none()
    if not fav:
        raise HTTPException(status_code=404, detail="Favorite not found")
    await db.delete(fav)
    return {"detail": "Removed from favorites"}
