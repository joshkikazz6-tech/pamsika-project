"""
Orders endpoints — create from cart snapshot, direct order (guest + auth), clear cart after.
"""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional

from app.db.session import get_db
from app.models.order import Order, OrderItem
from app.models.cart import Cart, CartItem
from app.models.product import Product
from app.models.user import User
from app.schemas.common import OrderCreate, OrderOut
from app.api.deps import get_current_user
from app.services.audit import log_action

router = APIRouter(prefix="/orders", tags=["orders"])


async def _optional_user(request: Request, db: AsyncSession) -> Optional[User]:
    """Resolve user from Bearer token if present — returns None for guests."""
    from app.api.deps import bearer_scheme
    from app.core.security import decode_token
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


# ── Cart checkout (authenticated only) ────────────────────────────────────────

@router.post("", response_model=OrderOut, status_code=201)
async def create_order(
    payload: OrderCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Cart)
        .where(Cart.user_id == current_user.id)
        .options(selectinload(Cart.items).selectinload(CartItem.product))
    )
    cart = result.scalar_one_or_none()

    if not cart or not cart.items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    ref = request.query_params.get("ref") or request.headers.get("X-Affiliate-Ref")
    if not ref and current_user.is_affiliate and current_user.affiliate_id:
        ref = current_user.affiliate_id

    total = sum(i.price_at_add * i.quantity for i in cart.items)

    order = Order(
        user_id=current_user.id,
        total_amount=total,
        payment_method=payload.payment_method,
        contact_info=payload.contact_info,
    )
    db.add(order)
    await db.flush()

    for item in cart.items:
        snapshot = {
            "id": str(item.product.id),
            "name": item.product.name,
            "price": item.product.price,
            "images": item.product.images,
            "category": item.product.category,
            "commission_percent": item.product.commission_percent,
        }
        order_item = OrderItem(
            order_id=order.id,
            product_id=item.product_id,
            product_snapshot=snapshot,
            quantity=item.quantity,
            unit_price=item.price_at_add,
            affiliate_id=ref,
        )
        db.add(order_item)

    for item in list(cart.items):
        await db.delete(item)

    await db.flush()

    # INTEGRITY GUARD — verify OrderItems were persisted before committing
    item_check = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order.id)
    )
    if not item_check.scalars().all():
        raise HTTPException(status_code=500, detail="Order items failed to persist")

    await log_action(db, "create_order", user_id=current_user.id,
                     resource="order", resource_id=str(order.id))

    result = await db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.items))
    )
    saved_order = result.scalar_one()
    # INTEGRITY GUARD: ensure items were persisted
    if not saved_order.items:
        raise HTTPException(status_code=500, detail="Order creation failed: no items persisted")
    return saved_order


# ── Direct "Order Now" — works for GUESTS and logged-in users ─────────────────

@router.post("/direct", status_code=201)
async def create_direct_order(
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Create an order directly from a list of items — NO cart, NO login required.
    Works for guests and authenticated users alike.

    Payload:
    {
      "payment_method": "whatsapp" | "email" | "messenger",
      "contact_info":  { "reference": "ORD-XXX", "name": "...", "phone": "..." },
      "items":         [{ "product_id": "<uuid>", "quantity": 1 }],
      "affiliate_ref": "DOLO-XXXX-1234"   // optional
    }
    """
    items_payload = payload.get("items", [])
    if not items_payload:
        raise HTTPException(status_code=400, detail="No items provided")

    payment_method = payload.get("payment_method", "whatsapp")
    contact_info   = payload.get("contact_info", {})

    # Resolve caller — may be None for guests
    current_user = await _optional_user(request, db)

    # Affiliate ref: payload field -> query param -> header -> caller's own affiliate_id
    ref = (
        payload.get("affiliate_ref")
        or request.query_params.get("ref")
        or request.headers.get("X-Affiliate-Ref")
    )
    if not ref and current_user and current_user.is_affiliate and current_user.affiliate_id:
        ref = current_user.affiliate_id

    # Load products and build order items
    order_items_data: list = []
    total = 0.0
    for item_req in items_payload:
        pid = item_req.get("product_id")
        qty = int(item_req.get("quantity", 1))
        if not pid or qty < 1:
            continue
        prod_result = await db.execute(
            select(Product).where(
                Product.id == pid,
                Product.is_active == True,
                Product.deleted_at.is_(None),
            )
        )
        product = prod_result.scalar_one_or_none()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {pid} not found")
        total += product.price * qty
        order_items_data.append((product, qty))

    if not order_items_data:
        raise HTTPException(status_code=400, detail="No valid items")

    order = Order(
        user_id=current_user.id if current_user else None,
        total_amount=round(total, 2),
        payment_method=payment_method,
        contact_info=contact_info,
    )
    db.add(order)
    await db.flush()

    for product, qty in order_items_data:
        snapshot = {
            "id":                 str(product.id),
            "name":               product.name,
            "price":              product.price,
            "images":             product.images,
            "category":           product.category,
            "commission_percent": product.commission_percent,
        }
        order_item = OrderItem(
            order_id=order.id,
            product_id=product.id,
            product_snapshot=snapshot,
            quantity=qty,
            unit_price=product.price,
            affiliate_id=ref,
        )
        db.add(order_item)

    await db.flush()

    # INTEGRITY GUARD — verify OrderItems were persisted before committing
    item_check = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order.id)
    )
    if not item_check.scalars().all():
        raise HTTPException(status_code=500, detail="Order items failed to persist")

    await log_action(
        db, "create_direct_order",
        user_id=current_user.id if current_user else None,
        resource="order",
        resource_id=str(order.id),
    )

    result = await db.execute(
        select(Order).where(Order.id == order.id).options(selectinload(Order.items))
    )
    saved = result.scalar_one()
    # INTEGRITY GUARD: ensure items were persisted
    if not saved.items:
        raise HTTPException(status_code=500, detail="Order creation failed: no items persisted")
    # Return plain dict so no Pydantic auth validation blocks guest responses
    return {
        "id":             str(saved.id),
        "user_id":        str(saved.user_id) if saved.user_id else None,
        "total_amount":   saved.total_amount,
        "payment_method": saved.payment_method,
        "status":         saved.status,
        "contact_info":   saved.contact_info,
        "created_at":     saved.created_at.isoformat(),
        "items": [
            {
                "id":               str(i.id),
                "product_id":       str(i.product_id) if i.product_id else None,
                "product_snapshot": i.product_snapshot,
                "quantity":         i.quantity,
                "unit_price":       i.unit_price,
                "affiliate_id":     i.affiliate_id,
            }
            for i in saved.items
        ],
    }


# ── User order history (authenticated) ────────────────────────────────────────

@router.get("", response_model=list[OrderOut])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Order)
        .where(Order.user_id == current_user.id, Order.deleted_at.is_(None))
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )
    return result.scalars().all()


@router.delete("")
async def clear_all_orders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete all orders in the current user's history."""
    result = await db.execute(
        select(Order)
        .where(Order.user_id == current_user.id, Order.deleted_at.is_(None))
    )
    orders = result.scalars().all()
    now = datetime.now(timezone.utc)
    for order in orders:
        order.deleted_at = now
    await db.flush()
    return {"detail": f"Cleared {len(orders)} orders from history"}


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Order)
        .where(
            Order.id == order_id,
            Order.user_id == current_user.id,
            Order.deleted_at.is_(None),
        )
        .options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.delete("/{order_id}")
async def delete_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a single order from user's history."""
    result = await db.execute(
        select(Order)
        .where(
            Order.id == order_id,
            Order.user_id == current_user.id,
            Order.deleted_at.is_(None),
        )
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return {"detail": "Order removed from history"}
