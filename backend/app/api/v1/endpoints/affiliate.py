"""
Affiliate endpoints — dashboard, referral links, click tracking, withdrawals.
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.user import User
from app.models.product import Product
from app.models.affiliate import AffiliateClick, AffiliateWithdrawal, WithdrawalStatus
from app.schemas.common import (
    AffiliateDashboard, ReferralLinkOut, AffiliateClickIn,
    WithdrawalCreate, WithdrawalOut,
)
from app.api.deps import get_current_user, get_current_affiliate, get_client_ip
from app.core.encryption import encrypt_data
from app.core.config import settings
from app.services.audit import log_action

router = APIRouter(prefix="/affiliate", tags=["affiliate"])


@router.get("/validate-invite/{invite_id}")
async def validate_invite(
    invite_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Validate an affiliate invite ID and return the inviter's display name.
    Called by the frontend when a user lands on ?aff_invite=... to show them
    who invited them before they register."""
    result = await db.execute(
        select(User).where(
            User.affiliate_id == invite_id,
            User.is_affiliate == True,
            User.deleted_at.is_(None),
        )
    )
    inviter = result.scalar_one_or_none()
    if not inviter:
        raise HTTPException(status_code=404, detail="Invalid invite link")
    return {
        "affiliate_id": inviter.affiliate_id,
        "inviter_name": inviter.full_name,
    }


@router.post("/join", status_code=201)
async def join_affiliate(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Register the current user as an affiliate (Dolo). Idempotent."""
    if current_user.is_affiliate:
        return {"detail": "Already an affiliate", "affiliate_id": current_user.affiliate_id}

    # Generate a unique affiliate ID: DOLO-<NAME4>-<RAND4>
    base = current_user.email.split("@")[0].replace(".", "").replace("_", "").upper()[:4].ljust(4, "X")
    import random
    rand = str(random.randint(1000, 9999))
    aff_id = f"DOLO-{base}-{rand}"

    # Ensure uniqueness
    existing = await db.execute(select(User).where(User.affiliate_id == aff_id))
    if existing.scalar_one_or_none():
        aff_id = f"DOLO-{base}-{random.randint(1000, 9999)}"

    current_user.is_affiliate = True
    current_user.affiliate_id = aff_id
    await db.flush()
    await log_action(db, "join_affiliate", user_id=current_user.id,
                     ip_address=get_client_ip(request))
    return {"detail": "Joined affiliate programme", "affiliate_id": aff_id}


@router.get("/withdrawals", response_model=list[WithdrawalOut])
async def my_withdrawals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_affiliate),
):
    """List the current affiliate's withdrawal requests."""
    result = await db.execute(
        select(AffiliateWithdrawal)
        .where(AffiliateWithdrawal.user_id == current_user.id,
               AffiliateWithdrawal.deleted_at.is_(None))
        .order_by(AffiliateWithdrawal.created_at.desc())
    )
    return result.scalars().all()


@router.post("/withdrawal", response_model=WithdrawalOut, status_code=201)
async def request_withdrawal_v2(
    payload: dict,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_affiliate),
):
    """Flexible withdrawal endpoint that accepts amount, method, details dict."""
    amount = float(payload.get("amount", 0))
    method = payload.get("method", "")
    details = payload.get("details", {})

    if amount < 2000:
        raise HTTPException(status_code=400, detail="Minimum withdrawal is MWK 2,000")
    if amount > current_user.affiliate_commission_balance:
        raise HTTPException(status_code=400, detail=f"Insufficient balance: {current_user.affiliate_commission_balance}")
    if not method:
        raise HTTPException(status_code=400, detail="method is required")

    from app.core.encryption import encrypt_data
    encrypted = encrypt_data(str(details))

    withdrawal = AffiliateWithdrawal(
        user_id=current_user.id,
        amount=amount,
        method=method,
        encrypted_payout_details=encrypted,
    )
    db.add(withdrawal)
    current_user.affiliate_commission_balance -= amount
    await db.flush()
    await log_action(db, "withdrawal_request", user_id=current_user.id,
                     resource="withdrawal", resource_id=str(withdrawal.id),
                     ip_address=get_client_ip(request),
                     metadata={"amount": amount, "method": method})
    return withdrawal



@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_affiliate),
):
    from app.models.order import Order, OrderItem
    from sqlalchemy.orm import selectinload
    from sqlalchemy import distinct

    # Fetch orders linked to this affiliate (via order items)
    orders_result = await db.execute(
        select(Order)
        .join(OrderItem, Order.id == OrderItem.order_id)
        .where(
            OrderItem.affiliate_id == current_user.affiliate_id,
            Order.deleted_at.is_(None),
        )
        .options(selectinload(Order.items))
        .order_by(Order.created_at.desc())
    )
    linked_orders = orders_result.scalars().unique().all()

    # Total earned = sum of commissions from COMPLETED orders only
    # (commission_balance is credited on completion, so this matches what can be withdrawn)
    completed_orders = [o for o in linked_orders if o.status == "completed"]
    total_earned = round(sum(
        item.unit_price * item.quantity * float(item.product_snapshot.get("commission_percent", 5)) / 100
        for order in completed_orders
        for item in order.items if item.affiliate_id == current_user.affiliate_id
    ), 2) if completed_orders else 0.0

    # Build sales history
    sales_history = []
    for order in linked_orders:
        for item in order.items:
            if item.affiliate_id == current_user.affiliate_id:
                sales_history.append({
                    "order_id": str(order.id),
                    "order_status": order.status,
                    "product_name": item.product_snapshot.get("name", ""),
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "commission": round(item.unit_price * item.quantity * float(item.product_snapshot.get("commission_percent", 5)) / 100, 2),
                    "created_at": order.created_at.isoformat(),
                })

    # ── Smart product recommendations ─────────────────────────────────────────
    # Find categories this affiliate has most clicks on (from affiliate_clicks table)
    clicks_result = await db.execute(
        select(AffiliateClick.product_id, func.count(AffiliateClick.id).label("click_count"))
        .where(AffiliateClick.affiliate_id == current_user.affiliate_id)
        .group_by(AffiliateClick.product_id)
        .order_by(func.count(AffiliateClick.id).desc())
        .limit(20)
    )
    clicked_product_ids = [str(row.product_id) for row in clicks_result.all()]

    recommended_products = []
    if clicked_product_ids:
        # Find the categories of the most-clicked products
        cat_result = await db.execute(
            select(Product.category, func.count(Product.id).label("cnt"))
            .where(Product.id.in_(clicked_product_ids), Product.is_active == True, Product.deleted_at.is_(None))
            .group_by(Product.category)
            .order_by(func.count(Product.id).desc())
            .limit(2)
        )
        top_categories = [row.category for row in cat_result.all()]

        if top_categories:
            cat_prods_result = await db.execute(
                select(Product)
                .where(
                    Product.category.in_(top_categories),
                    Product.is_active == True,
                    Product.deleted_at.is_(None),
                )
                .order_by(Product.commission_percent.desc(), Product.views.desc())
                .limit(8)
            )
            recommended_products = [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "price": p.price,
                    "category": p.category,
                    "commission_percent": p.commission_percent,
                    "images": p.images,
                }
                for p in cat_prods_result.scalars().all()
            ]

    # Fallback: if no clicks yet, show products with highest commissions
    if not recommended_products:
        high_comm_result = await db.execute(
            select(Product)
            .where(Product.is_active == True, Product.deleted_at.is_(None))
            .order_by(Product.commission_percent.desc(), Product.views.desc())
            .limit(8)
        )
        recommended_products = [
            {
                "id": str(p.id),
                "name": p.name,
                "price": p.price,
                "category": p.category,
                "commission_percent": p.commission_percent,
                "images": p.images,
            }
            for p in high_comm_result.scalars().all()
        ]

    # Sub-affiliate earnings: 5% of commissions earned by affiliates this user invited
    sub_aff_result = await db.execute(
        select(User).where(
            User.referred_by == current_user.affiliate_id,
            User.is_affiliate == True,
            User.deleted_at.is_(None),
        )
    )
    invited_affiliates = sub_aff_result.scalars().all()
    invited_affiliates_count = len(invited_affiliates)

    # Calculate sub-affiliate earnings from COMPLETED order items referred by affiliates this user invited.
    sub_affiliate_total_earned = 0.0
    if invited_affiliates:
        invited_aff_ids = [u.affiliate_id for u in invited_affiliates if u.affiliate_id]
        if invited_aff_ids:
            from app.models.order import Order, OrderItem as OI2
            sub_orders_result = await db.execute(
                select(OI2)
                .join(Order, OI2.order_id == Order.id)
                .where(
                    OI2.affiliate_id.in_(invited_aff_ids),
                    Order.status == "completed",
                    Order.deleted_at.is_(None),
                )
            )
            sub_items = sub_orders_result.scalars().all()
            sub_affiliate_total_earned = round(sum(
                item.unit_price * item.quantity
                * float(item.product_snapshot.get("commission_percent", 5)) / 100
                * 0.05  # inviter gets 5% of sub-affiliate's commission
                for item in sub_items
            ), 2)

    # Grand total earned = direct commissions + sub-affiliate cut
    grand_total_earned = round(total_earned + sub_affiliate_total_earned, 2)

    base_url = settings.FRONTEND_URL
    personal_referral_link = f"{base_url}?aff_invite={current_user.affiliate_id}"

    return {
        "affiliate_id": current_user.affiliate_id,
        "clicks": current_user.affiliate_clicks,
        "sales": current_user.affiliate_sales,
        "commission_balance": current_user.affiliate_commission_balance,
        "total_earned": grand_total_earned,
        "direct_earned": total_earned,
        "sub_affiliate_earned": sub_affiliate_total_earned,
        "sales_history": sales_history,
        "personal_referral_link": personal_referral_link,
        "recommended_products": recommended_products,
        "invited_affiliates_count": invited_affiliates_count,
    }


@router.get("/referral-link/{product_id}", response_model=ReferralLinkOut)
async def referral_link(
    product_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_affiliate),
):
    result = await db.execute(
        select(Product).where(Product.id == product_id, Product.is_active == True)
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    base_url = settings.FRONTEND_URL
    referral_url = f"{base_url}/products/{product_id}?ref={current_user.affiliate_id}"

    return ReferralLinkOut(
        product_id=product.id,
        referral_url=referral_url,
        commission_percent=product.commission_percent,
    )


@router.post("/click", status_code=201)
async def track_click(
    payload: AffiliateClickIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    # Validate affiliate exists
    result = await db.execute(
        select(User).where(User.affiliate_id == payload.affiliate_id, User.is_affiliate == True)
    )
    affiliate_user = result.scalar_one_or_none()
    if not affiliate_user:
        raise HTTPException(status_code=404, detail="Affiliate not found")

    # Validate product exists
    prod_result = await db.execute(
        select(Product).where(Product.id == payload.product_id, Product.is_active == True)
    )
    if not prod_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Product not found")

    ip = get_client_ip(request)
    ua = request.headers.get("User-Agent", "")

    click = AffiliateClick(
        affiliate_id=payload.affiliate_id,
        product_id=payload.product_id,
        ip_address=ip,
        user_agent=ua[:512],
    )
    db.add(click)

    # Increment user click counter
    affiliate_user.affiliate_clicks += 1
    await db.flush()
    return {"detail": "Click tracked"}


# Duplicate /withdraw route removed — frontend uses /withdrawal (above).
# WithdrawalCreate schema is kept imported for potential future use.
