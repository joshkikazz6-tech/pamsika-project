"""Tests: authentication flow."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    r = await client.post("/api/v1/auth/register", json={
        "email": "newuser@test.com",
        "password": "Password1",
        "full_name": "New User",
    })
    assert r.status_code == 201
    assert "access_token" in r.json()


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, regular_user):
    r = await client.post("/api/v1/auth/register", json={
        "email": "user@test.com",
        "password": "Password1",
        "full_name": "Dupe",
    })
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_register_weak_password(client: AsyncClient):
    r = await client.post("/api/v1/auth/register", json={
        "email": "weak@test.com",
        "password": "short",
        "full_name": "Weak",
    })
    assert r.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, regular_user):
    r = await client.post("/api/v1/auth/login", json={
        "email": "user@test.com",
        "password": "Password1",
    })
    assert r.status_code == 200
    assert "access_token" in r.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, regular_user):
    r = await client.post("/api/v1/auth/login", json={
        "email": "user@test.com",
        "password": "WrongPass1",
    })
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, regular_user):
    from tests.conftest import auth_headers
    r = await client.get("/api/v1/auth/me", headers=auth_headers(regular_user))
    assert r.status_code == 200
    assert r.json()["email"] == "user@test.com"


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    r = await client.get("/api/v1/auth/me")
    assert r.status_code == 401
