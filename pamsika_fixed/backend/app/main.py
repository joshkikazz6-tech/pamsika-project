"""
Pa_mSikA Backend — Production Entry Point
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text

from app.core.config import settings
from app.api.v1.router import api_router
from app.middleware.security import SecurityHeadersMiddleware
from app.db.session import engine
from app.db.base import Base


# ── Suppress /health spam from uvicorn access log ────────────────────────────
class _SuppressHealthCheck(logging.Filter):
    def filter(self, record):
        return "GET /health" not in record.getMessage()

logging.getLogger("uvicorn.access").addFilter(_SuppressHealthCheck())


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── CREATE TABLES SAFELY ─────────────────────────────────────────────────
    # create_all with checkfirst=True prevents the duplicate ENUM crash that
    # occurs when 2 uvicorn workers both try to CREATE TYPE at the same time.
    # We also wrap in a try/except so a race on the ENUM still doesn't kill startup.
    async with engine.begin() as conn:
        try:
            await conn.run_sync(Base.metadata.create_all, checkfirst=True)
        except Exception:
            # If another worker already created the types/tables, that's fine.
            pass
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

if settings.ENVIRONMENT == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.ALLOWED_HOSTS,
    )

app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "1.0.0"}
