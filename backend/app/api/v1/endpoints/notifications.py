"""
Push notification endpoints — subscribe, send new product alerts, re-engagement.
Uses Web Push Protocol (VAPID). No external service needed.
"""
import json
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.user import User
from app.api.deps import get_current_user, get_current_admin

router = APIRouter(prefix="/notifications", tags=["notifications"])

# In-memory subscription store (persists per worker lifetime)
# Format: {user_id_or_guest_key: {endpoint, keys}}
_subscriptions: dict = {}


@router.post("/subscribe")
async def subscribe(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    """Store a push subscription from the browser."""
    subscription = payload.get("subscription")
    user_id = payload.get("user_id", "guest")
    if not subscription or not subscription.get("endpoint"):
        raise HTTPException(status_code=400, detail="Invalid subscription")
    _subscriptions[user_id] = subscription
    return {"detail": "Subscribed"}


@router.post("/unsubscribe")
async def unsubscribe(payload: dict):
    user_id = payload.get("user_id", "guest")
    _subscriptions.pop(user_id, None)
    return {"detail": "Unsubscribed"}


@router.post("/broadcast")
async def broadcast_notification(
    payload: dict,
    admin: User = Depends(get_current_admin),
):
    """Admin sends a notification to all subscribed users."""
    title = payload.get("title", "Pa_mSikA")
    body = payload.get("body", "")
    url = payload.get("url", "/")
    sent = 0
    failed = 0
    dead = []
    for key, sub in list(_subscriptions.items()):
        try:
            await _send_push(sub, title, body, url)
            sent += 1
        except Exception:
            failed += 1
            dead.append(key)
    for key in dead:
        _subscriptions.pop(key, None)
    return {"sent": sent, "failed": failed}


@router.get("/count")
async def subscriber_count(admin: User = Depends(get_current_admin)):
    return {"count": len(_subscriptions)}


async def _send_push(subscription: dict, title: str, body: str, url: str = "/"):
    """Send a Web Push notification using pywebpush if available, else skip."""
    try:
        from pywebpush import webpush, WebPushException
        from app.core.config import settings
        webpush(
            subscription_info=subscription,
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{settings.SMTP_USER}"},
        )
    except ImportError:
        pass  # pywebpush not installed, skip silently


async def notify_new_product(product_name: str, product_id: str, frontend_url: str):
    """Called when admin adds a new product."""
    url = f"{frontend_url}/?product={product_id}"
    for sub in list(_subscriptions.values()):
        try:
            await _send_push(sub, "🆕 New on Pa_mSikA!", product_name, url)
        except Exception:
            pass
