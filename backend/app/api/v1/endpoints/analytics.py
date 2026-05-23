"""
Analytics endpoint — admin-only aggregated metrics.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.models.user import User
from app.models.product import Product
from app.models.order import Order, OrderStatus
from app.models.affiliate import AffiliateClick, AffiliateWithdrawal
from app.api.deps import get_current_admin

router = APIRouter(prefix="/admin/analytics", tags=["analytics"])


@router.get("")
async def get_analytics(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    # Total users
    total_users = (await db.execute(
        select(func.count()).select_from(User).where(User.deleted_at.is_(None))
    )).scalar()

    # Total active products
    total_products = (await db.execute(
        select(func.count()).select_from(Product).where(
            Product.is_active == True, Product.deleted_at.is_(None)
        )
    )).scalar()

    # Orders by status
    order_counts = (await db.execute(
        select(Order.status, func.count().label("count"))
        .where(Order.deleted_at.is_(None))
        .group_by(Order.status)
    )).all()
    orders_by_status = {row.status: row.count for row in order_counts}

    # Total revenue (completed orders)
    total_revenue = (await db.execute(
        select(func.coalesce(func.sum(Order.total_amount), 0))
        .where(Order.status == OrderStatus.completed, Order.deleted_at.is_(None))
    )).scalar()

    # Total affiliate clicks
    total_clicks = (await db.execute(
        select(func.count()).select_from(AffiliateClick)
    )).scalar()

    # Pending withdrawals count + total amount
    pending_withdrawals = (await db.execute(
        select(func.count(), func.coalesce(func.sum(AffiliateWithdrawal.amount), 0))
        .where(AffiliateWithdrawal.status == "pending")
    )).one()

    # Top 5 products by views
    top_products = (await db.execute(
        select(Product.id, Product.name, Product.views, Product.category)
        .where(Product.is_active == True, Product.deleted_at.is_(None))
        .order_by(Product.views.desc())
        .limit(5)
    )).all()

    # Total affiliates
    total_affiliates = (await db.execute(
        select(func.count()).select_from(User).where(
            User.is_affiliate == True, User.deleted_at.is_(None)
        )
    )).scalar()

    return {
        "users": {
            "total": total_users,
            "total_affiliates": total_affiliates,
        },
        "products": {
            "total_active": total_products,
            "top_by_views": [
                {"id": str(p.id), "name": p.name, "views": p.views, "category": p.category}
                for p in top_products
            ],
        },
        "orders": {
            "by_status": orders_by_status,
            "total_revenue_mwk": float(total_revenue),
        },
        "affiliate": {
            "total_clicks": total_clicks,
            "pending_withdrawals_count": pending_withdrawals[0],
            "pending_withdrawals_amount_mwk": float(pending_withdrawals[1]),
        },
    }
