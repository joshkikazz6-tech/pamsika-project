"""
Notifications — email all users or specific groups.
Push subscriptions stored for web push (optional).
"""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.models.user import User
from app.api.deps import get_current_admin
from app.core.config import settings

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Push subscription store
_subscriptions: dict = {}


@router.post("/subscribe")
async def subscribe(payload: dict):
    subscription = payload.get("subscription")
    user_id = payload.get("user_id", "guest")
    if not subscription or not subscription.get("endpoint"):
        raise HTTPException(status_code=400, detail="Invalid subscription")
    _subscriptions[user_id] = subscription
    return {"detail": "Subscribed"}


@router.get("/count")
async def subscriber_count(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    result = await db.execute(
        select(User).where(User.is_active == True, User.deleted_at.is_(None))
    )
    users = result.scalars().all()
    return {"count": len(users), "push_subscribers": len(_subscriptions)}


@router.post("/broadcast")
async def broadcast_notification(
    payload: dict,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Send email notification to ALL active users."""
    title = payload.get("title", "Pa_mSikA Update")
    body = payload.get("body", "")
    url = payload.get("url", settings.FRONTEND_URL)
    if not title or not body:
        raise HTTPException(status_code=400, detail="Title and body required")

    # Get all active users
    result = await db.execute(
        select(User).where(User.is_active == True, User.deleted_at.is_(None))
    )
    users = result.scalars().all()

    if not users:
        return {"sent": 0, "message": "No users to notify"}

    # Send emails in background so request doesn't time out
    emails = [u.email for u in users]
    background_tasks.add_task(_send_bulk_email, emails, title, body, url)

    # Also send push notifications to subscribers
    for sub in list(_subscriptions.values()):
        try:
            await _send_push(sub, title, body, url)
        except Exception:
            pass

    return {"sent": len(emails), "message": f"Sending to {len(emails)} users in background"}


def _send_bulk_email(emails: list, title: str, body: str, url: str):
    """Send notification emails to a list of addresses."""
    if not settings.SMTP_PASSWORD:
        return  # Email not configured

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e8e0d0;padding:32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:2rem;font-weight:700;color:#c8a84b;">Pa_mSikA</span>
      </div>
      <h2 style="color:#c8a84b;margin-bottom:12px;">{title}</h2>
      <p style="color:#ccc;margin-bottom:24px;line-height:1.6;">{body}</p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="{url}" style="background:#c8a84b;color:#0a0a0a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;">
          View on Pa_mSikA →
        </a>
      </div>
      <p style="color:#555;font-size:.75rem;text-align:center;">
        Pa_mSikA · Lilongwe, Malawi · 
        <a href="{settings.FRONTEND_URL}" style="color:#c8a84b;">Visit site</a>
      </p>
    </div>
    """

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            for email in emails:
                try:
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = f"Pa_mSikA — {title}"
                    msg["From"] = f"Pa_mSikA <{settings.SMTP_USER}>"
                    msg["To"] = email
                    msg.attach(MIMEText(html, "html"))
                    server.sendmail(settings.SMTP_USER, email, msg.as_string())
                except Exception:
                    continue  # Skip failed individual emails
    except Exception:
        pass


async def _send_push(subscription: dict, title: str, body: str, url: str = "/"):
    try:
        import json
        from pywebpush import webpush
        webpush(
            subscription_info=subscription,
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{settings.SMTP_USER}"},
        )
    except Exception:
        pass


async def notify_new_product(product_name: str, product_id: str, db: AsyncSession):
    """Called when admin adds a new product — emails all users."""
    url = f"{settings.FRONTEND_URL}/?product={product_id}"
    result = await db.execute(
        select(User).where(User.is_active == True, User.deleted_at.is_(None))
    )
    users = result.scalars().all()
    emails = [u.email for u in users]
    _send_bulk_email(emails, "🆕 New Product on Pa_mSikA!", product_name, url)
