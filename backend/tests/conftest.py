"""
Shared test fixtures — in-memory SQLite async engine for speed.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.main import app
from app.db.base import Base
from app.db.session import get_db
from app.core.security import hash_password, create_access_token
from app.models.user import User

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with SessionLocal() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session):
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def regular_user(db_session):
    user = User(
        email="user@test.com",
        password_hash=hash_password("Password1"),
        full_name="Test User",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session):
    user = User(
        email="admin@test.com",
        password_hash=hash_password("Password1"),
        full_name="Admin User",
        is_admin=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def affiliate_user(db_session):
    import uuid
    user = User(
        email="affiliate@test.com",
        password_hash=hash_password("Password1"),
        full_name="Affiliate User",
        is_affiliate=True,
        affiliate_id=f"AFF-{uuid.uuid4().hex[:8].upper()}",
        affiliate_commission_balance=500.0,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


def auth_headers(user: User) -> dict:
    token = create_access_token(str(user.id), {"is_admin": user.is_admin})
    return {"Authorization": f"Bearer {token}"}
