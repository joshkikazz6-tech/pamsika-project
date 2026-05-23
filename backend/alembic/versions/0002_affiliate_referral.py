"""Add referred_by column to users for affiliate sub-commission system

Revision ID: 0002_affiliate_referral
Revises: 0001_initial
Create Date: 2026-03-31 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

revision = "0002_affiliate_referral"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use raw connection to check if column already exists before adding.
    # On a fresh database, 0001_initial already includes referred_by, so
    # this migration must be a no-op in that case.
    conn = op.get_bind()
    result = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='users' AND column_name='referred_by'"
    ))
    if result.fetchone() is None:
        op.add_column(
            "users",
            sa.Column("referred_by", sa.String(64), nullable=True),
        )
        op.create_index("ix_users_referred_by", "users", ["referred_by"])


def downgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='users' AND column_name='referred_by'"
    ))
    if result.fetchone() is not None:
        op.drop_index("ix_users_referred_by", table_name="users")
        op.drop_column("users", "referred_by")
