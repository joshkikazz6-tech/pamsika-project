"""
Pa_mSikA Backend — Production Entry Point
"""

import logging
import os
import sqlalchemy as sa
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.api.v1.router import api_router
from app.middleware.security import SecurityHeadersMiddleware
from app.db.session import engine
from app.db.base import Base
from app.models.user import User                                           # noqa
from app.models.product import Product                                     # noqa
from app.models.cart import Cart, CartItem                                 # noqa
from app.models.order import Order, OrderItem                              # noqa
from app.models.favorite import Favorite                                   # noqa
from app.models.affiliate import AffiliateClick, AffiliateWithdrawal      # noqa
from app.models.audit import AuditLog                                      # noqa
from app.models.community import CommunityPost, CommunityComment, PostLike # noqa
from app.models.messages import Conversation, Message                      # noqa

logger = logging.getLogger(__name__)


class _SuppressHealthCheck(logging.Filter):
    def filter(self, record):
        return "GET /health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_SuppressHealthCheck())


async def _run(sql: str):
    """Run a single SQL statement in its own transaction. Never raises."""
    try:
        async with engine.begin() as conn:
            await conn.execute(sa.text(sql))
        logger.info(f"OK: {sql[:80]}")
    except Exception as e:
        logger.debug(f"Skipped ({e.__class__.__name__}): {sql[:80]}")


async def _fix_schema():
    """
    Idempotent schema fix — each statement runs in its own transaction
    so a failure on one never affects the others.
    """
    # ── community_posts ───────────────────────────────────────────────────────
    await _run("""
        CREATE TABLE IF NOT EXISTS community_posts (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            content    TEXT NOT NULL,
            images     JSON NOT NULL DEFAULT '[]',
            likes      INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at TIMESTAMPTZ
        )
    """)
    await _run("ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS images JSON NOT NULL DEFAULT '[]'")
    await _run("ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ")

    # ── community_comments ────────────────────────────────────────────────────
    await _run("""
        CREATE TABLE IF NOT EXISTS community_comments (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id    UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
            user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content    TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at TIMESTAMPTZ
        )
    """)
    await _run("ALTER TABLE community_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ")

    # ── post_likes ────────────────────────────────────────────────────────────
    await _run("""
        CREATE TABLE IF NOT EXISTS post_likes (
            id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (post_id, user_id)
        )
    """)

    # ── conversations ─────────────────────────────────────────────────────────
    await _run("""
        CREATE TABLE IF NOT EXISTS conversations (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
            subject    VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    await _run("CREATE INDEX IF NOT EXISTS ix_conversations_user_id ON conversations(user_id)")

    # ── dm_messages ───────────────────────────────────────────────────────────
    # Create with correct schema if missing
    await _run("""
        CREATE TABLE IF NOT EXISTS dm_messages (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content_enc     TEXT NOT NULL DEFAULT '',
            media_enc       TEXT,
            is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
            read            BOOLEAN NOT NULL DEFAULT FALSE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)
    await _run("CREATE INDEX IF NOT EXISTS ix_dm_messages_conv_id ON dm_messages(conversation_id)")

    # Rename content->content_enc if the old column exists (each in own transaction)
    # First check if 'content' column exists
    try:
        async with engine.connect() as conn:
            result = await conn.execute(sa.text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name='dm_messages' AND column_name='content'
            """))
            row = result.fetchone()
        if row:
            await _run("ALTER TABLE dm_messages RENAME COLUMN content TO content_enc")
            logger.info("Renamed dm_messages.content -> content_enc")
    except Exception as e:
        logger.warning(f"Column check failed: {e}")

    await _run("ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS media_enc TEXT")
    await _run("ALTER TABLE dm_messages ADD COLUMN IF NOT EXISTS content_enc TEXT NOT NULL DEFAULT ''")

    logger.info("Schema fix complete")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    # Create standard tables
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all, checkfirst=True)
    except Exception as e:
        logger.warning(f"create_all: {e}")

    # Fix schema with a timeout so startup never hangs
    try:
        await asyncio.wait_for(_fix_schema(), timeout=20.0)
    except asyncio.TimeoutError:
        logger.warning("_fix_schema timed out — skipping")
    except Exception as e:
        logger.warning(f"_fix_schema error: {e}")

    yield
    await engine.dispose()


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Pa_mSikA API",
    description="Premium Marketplace + Affiliate Platform",
    version="1.0.0",
    docs_url="/api/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/api/redoc" if settings.ENVIRONMENT != "production" else None,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
)

# Always allow the Render internal hostname and localhost regardless of config
_trusted_hosts = list(settings.ALLOWED_HOSTS) + ["localhost", "127.0.0.1", "*.onrender.com"]
if settings.ENVIRONMENT == "production" and "*" not in _trusted_hosts:
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=_trusted_hosts,
    )

app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}


# ── Serve frontend ────────────────────────────────────────────────────────────
UPLOADS_DIR = "/app/uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))

if os.path.isdir(FRONTEND_DIR):
    app.mount("/css", StaticFiles(directory=os.path.join(FRONTEND_DIR, "css")), name="css")
    app.mount("/js", StaticFiles(directory=os.path.join(FRONTEND_DIR, "js")), name="js")
    _icons_dir = os.path.join(FRONTEND_DIR, "icons")
    if os.path.isdir(_icons_dir):
        app.mount("/icons", StaticFiles(directory=_icons_dir), name="icons")

    @app.get("/manifest.json", include_in_schema=False)
    async def serve_manifest():
        return FileResponse(os.path.join(FRONTEND_DIR, "manifest.json"), media_type="application/manifest+json")

    @app.get("/service-worker.js", include_in_schema=False)
    async def serve_sw():
        return FileResponse(os.path.join(FRONTEND_DIR, "service-worker.js"), media_type="application/javascript")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))