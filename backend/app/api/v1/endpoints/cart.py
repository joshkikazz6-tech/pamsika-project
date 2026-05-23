"""
Cart endpoints — guest (X-Session-Id header) + authenticated users. Merges on login.
"""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional

from app.db.session import get_db
from app.models.cart import Cart, CartItem
from app.models.product import Product
from app.models.user import User
from app.schemas.common import CartOut, CartItemOut, CartItemAdd, CartItemUpdate
from app.api.deps import bearer_scheme
from app.core.security import decode_token

router = APIRouter(prefix="/cart", tags=["cart"])


async def _resolve_user(request: Request, db: AsyncSession) -> Optional[User]:
    """Extract user from Bearer token if present, otherwise return None."""
    try:
        creds = await bearer_scheme(request)
        if not creds:
            return None
        payload = decode_token(creds.credentials)
        if not payload or payload.get("type") != "access":
            return None
        result = await db.execute(
            select(User).where(User.id == payload["sub"], User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()
        return user if (user and user.is_active) else None
    except Exception:
        return None


async def _load_cart_by_user(db: AsyncSession, user_id) -> Optional[Cart]:
    """Load a user's cart with all items and products eagerly loaded."""
    result = await db.execute(
        select(Cart)
        .where(Cart.user_id == user_id)
        .options(selectinload(Cart.items).selectinload(CartItem.product))
    )
    return result.scalar_one_or_none()


async def _load_cart_by_session(db: AsyncSession, session_id: str) -> Optional[Cart]:
    """Load a guest cart by session_id with all items and products eagerly loaded."""
    result = await db.execute(
        select(Cart)
        .where(Cart.session_id == session_id, Cart.user_id.is_(None))
        .options(selectinload(Cart.items).selectinload(CartItem.product))
    )
    return result.scalar_one_or_none()


async def _get_or_create_cart(
    db: AsyncSession,
    user: Optional[User],
    session_id: Optional[str],
) -> Cart:
    if user:
        cart = await _load_cart_by_user(db, user.id)
        if not cart:
            cart = Cart(user_id=user.id)
            db.add(cart)
            await db.flush()
            # Reload so items list is populated (empty list, not lazy proxy)
            cart = await _load_cart_by_user(db, user.id)

        # Merge guest cart on login
        if session_id:
            guest_result = await db.execute(
                select(Cart)
                .where(Cart.session_id == session_id, Cart.user_id.is_(None))
                .options(selectinload(Cart.items))
            )
            guest_cart = guest_result.scalar_one_or_none()
            if guest_cart and guest_cart.items:
                for item in guest_cart.items:
                    existing = next(
                        (i for i in cart.items if str(i.product_id) == str(item.product_id)), None
                    )
                    if existing:
                        existing.quantity += item.quantity
                    else:
                        new_item = CartItem(
                            cart_id=cart.id,
                            product_id=item.product_id,
                            quantity=item.quantity,
                            price_at_add=item.price_at_add,
                        )
                        db.add(new_item)
                await db.delete(guest_cart)
                await db.flush()
                # Reload merged cart with products
                cart = await _load_cart_by_user(db, user.id)
        return cart

    if not session_id:
        session_id = str(uuid.uuid4())

    cart = await _load_cart_by_session(db, session_id)
    if not cart:
        cart = Cart(session_id=session_id)
        db.add(cart)
        await db.flush()
        # Reload so items list is populated (empty list, not lazy proxy)
        cart = await _load_cart_by_session(db, session_id)
    return cart


def _cart_total(cart: Cart) -> float:
    return sum(i.price_at_add * i.quantity for i in cart.items)


def _serialize_cart(cart: Cart) -> CartOut:
    """
    Manually serialize cart to avoid Pydantic trying to auto-serialize
    the nested SQLAlchemy Product ORM object (which causes PydanticSerializationError).
    """
    from app.schemas.product import ProductOut
    items_out = []
    for i in cart.items:
        product_data = None
        if i.product is not None:
            product_data = ProductOut.model_validate(i.product)
        items_out.append(CartItemOut(
            id=i.id,
            product_id=i.product_id,
            quantity=i.quantity,
            price_at_add=i.price_at_add,
            product=product_data,
        ))
    return CartOut(id=cart.id, items=items_out, total=_cart_total(cart))


@router.get("", response_model=CartOut)
async def get_cart(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_session_id: Optional[str] = Header(default=None),
):
    user = await _resolve_user(request, db)
    cart = await _get_or_create_cart(db, user, x_session_id)
    return _serialize_cart(cart)


@router.post("/items", status_code=201)
async def add_item(
    payload: CartItemAdd,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_session_id: Optional[str] = Header(default=None),
):
    user = await _resolve_user(request, db)

    prod_result = await db.execute(
        select(Product).where(Product.id == payload.product_id, Product.is_active == True)
    )
    product = prod_result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    cart = await _get_or_create_cart(db, user, x_session_id)

    existing = next((i for i in cart.items if str(i.product_id) == str(payload.product_id)), None)
    if existing:
        existing.quantity += payload.quantity
    else:
        item = CartItem(
            cart_id=cart.id,
            product_id=payload.product_id,
            quantity=payload.quantity,
            price_at_add=product.price,
        )
        db.add(item)

    await db.flush()
    return {"detail": "Item added"}


@router.put("/items/{item_id}")
async def update_item(
    item_id: str,
    payload: CartItemUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CartItem).where(CartItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    item.quantity = payload.quantity
    return {"detail": "Updated"}


@router.delete("/items/{item_id}")
async def remove_item(item_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(CartItem).where(CartItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    await db.delete(item)
    return {"detail": "Removed"}


@router.delete("")
async def clear_cart(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_session_id: Optional[str] = Header(default=None),
):
    user = await _resolve_user(request, db)
    cart = await _get_or_create_cart(db, user, x_session_id)
    for item in list(cart.items):
        await db.delete(item)
    return {"detail": "Cart cleared"}
