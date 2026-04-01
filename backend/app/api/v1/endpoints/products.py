"""
Products endpoints — public read, admin write.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.product import Product
from app.schemas.product import ProductOut, PaginatedProducts
from app.api.deps import get_current_admin

router = APIRouter(prefix="/products", tags=["products"])


def _active(q):
    return q.where(Product.is_active == True, Product.deleted_at.is_(None))


@router.get("", response_model=PaginatedProducts)
async def list_products(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    location: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    sort: Optional[str] = Query("newest", enum=["newest", "views", "price_asc", "price_desc"]),
    db: AsyncSession = Depends(get_db),
):
    q = select(Product)
    q = _active(q)

    if search:
        term = f"%{search}%"
        q = q.where(or_(Product.name.ilike(term), Product.description.ilike(term)))
    if category:
        q = q.where(Product.category == category)
    if subcategory:
        q = q.where(Product.subcategory == subcategory)
    if location:
        q = q.where(Product.location == location)
    if min_price is not None:
        q = q.where(Product.price >= min_price)
    if max_price is not None:
        q = q.where(Product.price <= max_price)

    sort_map = {
        "newest": Product.created_at.desc(),
        "views": Product.views.desc(),
        "price_asc": Product.price.asc(),
        "price_desc": Product.price.desc(),
    }
    q = q.order_by(sort_map[sort])

    total_result = await db.execute(select(func.count()).select_from(q.subquery()))
    total = total_result.scalar()

    q = q.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)
    products = result.scalars().all()

    return PaginatedProducts(
        items=products,
        total=total,
        page=page,
        per_page=per_page,
        pages=-(-total // per_page),
    )


@router.get("/hot", response_model=list[ProductOut])
async def hot_products(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        _active(select(Product)).where(Product.badge == "HOT").order_by(Product.views.desc()).limit(20)
    )
    return result.scalars().all()


@router.get("/new", response_model=list[ProductOut])
async def new_products(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        _active(select(Product)).where(Product.badge == "NEW").order_by(Product.created_at.desc()).limit(20)
    )
    return result.scalars().all()


@router.get("/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        _active(select(Product)).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    product.views += 1
    await db.flush()
    return product
