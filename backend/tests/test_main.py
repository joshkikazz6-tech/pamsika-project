"""Tests: products, cart, orders, affiliate, admin permissions."""

import uuid
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.product import Product
from tests.conftest import auth_headers


async def make_product(db: AsyncSession, **kwargs) -> Product:
    defaults = dict(
        name="Test Product",
        description="A test product",
        price=1500.0,
        category="Electronics",
        images=[],
        commission_percent=5.0,
    )
    defaults.update(kwargs)
    p = Product(**defaults)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


# ── Products ──────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_products_empty(client: AsyncClient):
    r = await client.get("/api/v1/products")
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "total" in data


@pytest.mark.asyncio
async def test_get_product_increments_views(client: AsyncClient, db_session):
    p = await make_product(db_session)
    initial_views = p.views
    r = await client.get(f"/api/v1/products/{p.id}")
    assert r.status_code == 200
    await db_session.refresh(p)
    assert p.views == initial_views + 1


@pytest.mark.asyncio
async def test_get_product_not_found(client: AsyncClient):
    r = await client.get(f"/api/v1/products/{uuid.uuid4()}")
    assert r.status_code == 404


# ── Cart ──────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cart_guest_flow(client: AsyncClient, db_session):
    p = await make_product(db_session)
    r = await client.post(
        "/api/v1/cart/items",
        json={"product_id": str(p.id), "quantity": 2},
        headers={"X-Session-Id": "guest-sess-123"},
    )
    assert r.status_code == 201

    r2 = await client.get("/api/v1/cart", headers={"X-Session-Id": "guest-sess-123"})
    assert r2.status_code == 200
    assert len(r2.json()["items"]) == 1
    assert r2.json()["total"] == p.price * 2


@pytest.mark.asyncio
async def test_cart_authenticated(client: AsyncClient, db_session, regular_user):
    p = await make_product(db_session)
    headers = auth_headers(regular_user)
    r = await client.post("/api/v1/cart/items", json={"product_id": str(p.id), "quantity": 1}, headers=headers)
    assert r.status_code == 201

    r2 = await client.get("/api/v1/cart", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["total"] == p.price


@pytest.mark.asyncio
async def test_cart_invalid_quantity(client: AsyncClient, db_session, regular_user):
    p = await make_product(db_session)
    r = await client.post(
        "/api/v1/cart/items",
        json={"product_id": str(p.id), "quantity": 0},
        headers=auth_headers(regular_user),
    )
    assert r.status_code == 422


# ── Orders ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_order_empty_cart(client: AsyncClient, regular_user):
    r = await client.post(
        "/api/v1/orders",
        json={"payment_method": "whatsapp", "contact_info": {"phone": "+265999000001"}},
        headers=auth_headers(regular_user),
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_create_order_success(client: AsyncClient, db_session, regular_user):
    p = await make_product(db_session)
    headers = auth_headers(regular_user)

    await client.post("/api/v1/cart/items", json={"product_id": str(p.id), "quantity": 1}, headers=headers)

    r = await client.post(
        "/api/v1/orders",
        json={"payment_method": "email", "contact_info": {"email": "test@test.com"}},
        headers=headers,
    )
    assert r.status_code == 201
    data = r.json()
    assert data["total_amount"] == p.price
    assert data["payment_method"] == "email"
    assert len(data["items"]) == 1

    # Cart should be cleared
    cart_r = await client.get("/api/v1/cart", headers=headers)
    assert cart_r.json()["items"] == []


@pytest.mark.asyncio
async def test_order_invalid_payment_method(client: AsyncClient, db_session, regular_user):
    p = await make_product(db_session)
    headers = auth_headers(regular_user)
    await client.post("/api/v1/cart/items", json={"product_id": str(p.id), "quantity": 1}, headers=headers)
    r = await client.post(
        "/api/v1/orders",
        json={"payment_method": "paypal", "contact_info": {}},
        headers=headers,
    )
    assert r.status_code == 422


# ── Favorites ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_favorites_lifecycle(client: AsyncClient, db_session, regular_user):
    p = await make_product(db_session)
    headers = auth_headers(regular_user)

    r = await client.post(f"/api/v1/favorites/{p.id}", headers=headers)
    assert r.status_code == 201

    r2 = await client.get("/api/v1/favorites", headers=headers)
    assert len(r2.json()) == 1

    r3 = await client.delete(f"/api/v1/favorites/{p.id}", headers=headers)
    assert r3.status_code == 200

    r4 = await client.get("/api/v1/favorites", headers=headers)
    assert len(r4.json()) == 0


# ── Admin Permissions ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_create_product(client: AsyncClient, admin_user):
    r = await client.post("/api/v1/admin/products", json={
        "name": "Admin Product",
        "description": "Created by admin",
        "price": 2000.0,
        "category": "Clothing",
        "commission_percent": 8.0,
    }, headers=auth_headers(admin_user))
    assert r.status_code == 201
    assert r.json()["name"] == "Admin Product"


@pytest.mark.asyncio
async def test_regular_user_cannot_access_admin(client: AsyncClient, regular_user):
    r = await client.post("/api/v1/admin/products", json={
        "name": "Hack",
        "description": "x",
        "price": 1.0,
        "category": "x",
    }, headers=auth_headers(regular_user))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_unauthenticated_cannot_access_admin(client: AsyncClient):
    r = await client.get("/api/v1/admin/users")
    assert r.status_code == 401


# ── Affiliate ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_affiliate_dashboard(client: AsyncClient, affiliate_user):
    r = await client.get("/api/v1/affiliate/dashboard", headers=auth_headers(affiliate_user))
    assert r.status_code == 200
    data = r.json()
    assert "affiliate_id" in data
    assert "commission_balance" in data


@pytest.mark.asyncio
async def test_non_affiliate_cannot_access_dashboard(client: AsyncClient, regular_user):
    r = await client.get("/api/v1/affiliate/dashboard", headers=auth_headers(regular_user))
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_affiliate_click_tracking(client: AsyncClient, db_session, affiliate_user):
    p = await make_product(db_session)
    r = await client.post("/api/v1/affiliate/click", json={
        "affiliate_id": affiliate_user.affiliate_id,
        "product_id": str(p.id),
    })
    assert r.status_code == 201


@pytest.mark.asyncio
async def test_withdrawal_insufficient_balance(client: AsyncClient, affiliate_user):
    r = await client.post("/api/v1/affiliate/withdraw", json={
        "amount": 999999.0,
        "method": "bank",
        "payout_details": {"account": "123456"},
    }, headers=auth_headers(affiliate_user))
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_withdrawal_success(client: AsyncClient, affiliate_user):
    r = await client.post("/api/v1/affiliate/withdraw", json={
        "amount": 100.0,
        "method": "mobile_money",
        "payout_details": {"phone": "+265999000001"},
    }, headers=auth_headers(affiliate_user))
    assert r.status_code == 201
    assert r.json()["status"] == "pending"


# ── Audit Logs ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_can_view_audit_logs(client: AsyncClient, admin_user):
    r = await client.get("/api/v1/admin/audit-logs", headers=auth_headers(admin_user))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
