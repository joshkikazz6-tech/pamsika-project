"""Fix dm_messages and community tables idempotently

Revision ID: 0005_fix_schema_idempotent
Revises: 0004_community_and_messages
Create Date: 2026-04-04 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0005_fix_schema_idempotent"
down_revision = "0004_community_and_messages"
branch_labels = None
depends_on = None


def _has_column(conn, table, column):
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name=:t AND column_name=:c"
    ), {"t": table, "c": column})
    return result.fetchone() is not None


def _table_exists(conn, table):
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name=:t"
    ), {"t": table})
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()

    # Ensure community_posts has images and deleted_at
    if _table_exists(conn, "community_posts"):
        if not _has_column(conn, "community_posts", "images"):
            conn.execute(sa.text(
                "ALTER TABLE community_posts ADD COLUMN images JSON NOT NULL DEFAULT '[]'"
            ))
        if not _has_column(conn, "community_posts", "deleted_at"):
            conn.execute(sa.text(
                "ALTER TABLE community_posts ADD COLUMN deleted_at TIMESTAMPTZ"
            ))

    # Ensure community_comments has deleted_at
    if _table_exists(conn, "community_comments"):
        if not _has_column(conn, "community_comments", "deleted_at"):
            conn.execute(sa.text(
                "ALTER TABLE community_comments ADD COLUMN deleted_at TIMESTAMPTZ"
            ))

    # Fix dm_messages: rename content->content_enc, add media_enc
    if _table_exists(conn, "dm_messages"):
        if _has_column(conn, "dm_messages", "content") and not _has_column(conn, "dm_messages", "content_enc"):
            conn.execute(sa.text(
                "ALTER TABLE dm_messages RENAME COLUMN content TO content_enc"
            ))
        if not _has_column(conn, "dm_messages", "media_enc"):
            conn.execute(sa.text(
                "ALTER TABLE dm_messages ADD COLUMN media_enc TEXT"
            ))
        if not _has_column(conn, "dm_messages", "content_enc"):
            conn.execute(sa.text(
                "ALTER TABLE dm_messages ADD COLUMN content_enc TEXT NOT NULL DEFAULT ''"
            ))


def downgrade() -> None:
    pass  # not reversible
