"""Add commissions_paid flag to orders for idempotency

Revision ID: 0003_orders_commissions_paid
Revises: 0002_affiliate_referral
Create Date: 2026-03-31 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "0003_orders_commissions_paid"
down_revision = "0002_affiliate_referral"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='orders' AND column_name='commissions_paid'"
    ))
    if result.fetchone() is None:
        op.add_column(
            "orders",
            sa.Column("commissions_paid", sa.Boolean(), nullable=False, server_default="false"),
        )


def downgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='orders' AND column_name='commissions_paid'"
    ))
    if result.fetchone() is not None:
        op.drop_column("orders", "commissions_paid")
