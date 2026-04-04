import asyncio
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine
import os

async def fix():
    engine = create_async_engine(os.environ['DATABASE_URL_ASYNC'])
    async with engine.begin() as conn:
        await conn.execute(sa.text('''CREATE TABLE IF NOT EXISTS reviews (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, rating INTEGER NOT NULL, comment TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ)'''))
        await conn.execute(sa.text('''CREATE TABLE IF NOT EXISTS promo_codes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(32) UNIQUE NOT NULL, discount_percent FLOAT NOT NULL, max_uses INTEGER NOT NULL DEFAULT 0, uses INTEGER NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())'''))
        print('Tables created!')

asyncio.run(fix())