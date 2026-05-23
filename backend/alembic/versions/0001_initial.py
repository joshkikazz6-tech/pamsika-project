"""Initial schema — all tables

Revision ID: 0001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            full_name VARCHAR(255) NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            is_admin BOOLEAN NOT NULL DEFAULT FALSE,
            is_affiliate BOOLEAN NOT NULL DEFAULT FALSE,
            affiliate_id VARCHAR(64),
            affiliate_clicks INTEGER NOT NULL DEFAULT 0,
            affiliate_sales INTEGER NOT NULL DEFAULT 0,
            affiliate_commission_balance FLOAT NOT NULL DEFAULT 0.0,
            referred_by VARCHAR(64),
            last_login_ip VARCHAR(45),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            deleted_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users(email)"))
    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_affiliate_id ON users(affiliate_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_referred_by ON users(referred_by)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS products (
            id UUID PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            price FLOAT NOT NULL,
            category VARCHAR(100) NOT NULL,
            subcategory VARCHAR(100),
            location VARCHAR(100),
            images JSON NOT NULL,
            views INTEGER NOT NULL DEFAULT 0,
            likes INTEGER NOT NULL DEFAULT 0,
            commission_percent FLOAT NOT NULL DEFAULT 5.0,
            badge VARCHAR(20),
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            deleted_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_products_category ON products(category)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS carts (
            id UUID PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            session_id VARCHAR(128),
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_carts_user_id ON carts(user_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_carts_session_id ON carts(session_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS cart_items (
            id UUID PRIMARY KEY,
            cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
            product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            quantity INTEGER NOT NULL,
            price_at_add FLOAT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cart_items_product_id ON cart_items(product_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS orders (
            id UUID PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            total_amount FLOAT NOT NULL,
            payment_method VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            contact_info JSON NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            deleted_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_orders_user_id ON orders(user_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS order_items (
            id UUID PRIMARY KEY,
            order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            product_id UUID REFERENCES products(id) ON DELETE SET NULL,
            product_snapshot JSON NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price FLOAT NOT NULL,
            affiliate_id VARCHAR(64)
        )
    """))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS favorites (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT now(),
            UNIQUE (user_id, product_id)
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_favorites_user_id ON favorites(user_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_favorites_product_id ON favorites(product_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS affiliate_clicks (
            id UUID PRIMARY KEY,
            affiliate_id VARCHAR(64) NOT NULL,
            product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            ip_address VARCHAR(45) NOT NULL,
            user_agent VARCHAR(512),
            clicked_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_affiliate_clicks_affiliate_id ON affiliate_clicks(affiliate_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_affiliate_clicks_product_id ON affiliate_clicks(product_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            amount FLOAT NOT NULL,
            method VARCHAR(50) NOT NULL,
            encrypted_payout_details TEXT NOT NULL,
            status VARCHAR(50) NOT NULL DEFAULT 'pending',
            admin_note TEXT,
            reviewed_by UUID,
            created_at TIMESTAMPTZ DEFAULT now(),
            reviewed_at TIMESTAMPTZ,
            deleted_at TIMESTAMPTZ
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_affiliate_withdrawals_user_id ON affiliate_withdrawals(user_id)"))

    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id UUID PRIMARY KEY,
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            action VARCHAR(100) NOT NULL,
            resource VARCHAR(100),
            resource_id VARCHAR(100),
            ip_address VARCHAR(45),
            user_agent VARCHAR(512),
            metadata JSON,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_logs_user_id ON audit_logs(user_id)"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(text("DROP TABLE IF EXISTS audit_logs CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS affiliate_withdrawals CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS affiliate_clicks CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS favorites CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS order_items CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS orders CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS cart_items CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS carts CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS products CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS users CASCADE"))