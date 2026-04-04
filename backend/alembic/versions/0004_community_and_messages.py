"""Add community posts, comments, likes, conversations and messages tables

Revision ID: 0004_community_and_messages
Revises: 0003_orders_commissions_paid
Create Date: 2026-04-03 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0004_community_and_messages"
down_revision = "0003_orders_commissions_paid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # community_posts
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community_posts (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            content     TEXT NOT NULL,
            images      JSON NOT NULL DEFAULT '[]',
            likes       INTEGER NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at  TIMESTAMPTZ
        )
    """))

    # community_comments
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS community_comments (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content     TEXT NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at  TIMESTAMPTZ
        )
    """))

    # post_likes
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS post_likes (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (post_id, user_id)
        )
    """))

    # conversations
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS conversations (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
            subject     VARCHAR(255) NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_conversations_user_id ON conversations(user_id)"))

    # dm_messages
    conn.execute(sa.text("""
        CREATE TABLE IF NOT EXISTS dm_messages (
            id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content_enc       TEXT NOT NULL,
            media_enc         TEXT,
            is_admin          BOOLEAN NOT NULL DEFAULT FALSE,
            read              BOOLEAN NOT NULL DEFAULT FALSE,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    conn.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_dm_messages_conv_id ON dm_messages(conversation_id)"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS dm_messages"))
    conn.execute(sa.text("DROP TABLE IF EXISTS conversations"))
    conn.execute(sa.text("DROP TABLE IF EXISTS post_likes"))
    conn.execute(sa.text("DROP TABLE IF EXISTS community_comments"))
    conn.execute(sa.text("DROP TABLE IF EXISTS community_posts"))
