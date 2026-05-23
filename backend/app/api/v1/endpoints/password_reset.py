"""
Password reset endpoints — forgot password & reset via token.
"""

import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.models.user import User
from app.core.security import hash_password
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory token store: {token: {user_id, expires_at}}
# Fine for single-worker deployment (Render free tier = 1 worker)
_reset_tokens: dict = {}


def _send_reset_email(to_email: str, full_name: str, token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Pa_mSikA — Reset Your Password"
    msg["From"] = f"Pa_mSikA <{settings.SMTP_USER}>"
    msg["To"] = to_email

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#0a0a0a;color:#e8e0d0;padding:32px;border-radius:12px;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:2rem;font-weight:700;color:#c8a84b;">Pa_mSikA</span>
      </div>
      <h2 style="color:#c8a84b;margin-bottom:8px;">Reset Your Password</h2>
      <p style="color:#aaa;margin-bottom:24px;">Hi {full_name}, click the button below to reset your password. This link expires in <strong>30 minutes</strong>.</p>
      <div style="text-align:center;margin-bottom:24px;">
        <a href="{reset_url}" style="background:#c8a84b;color:#0a0a0a;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:1rem;">Reset Password</a>
      </div>
      <p style="color:#666;font-size:.8rem;">If you didn't request this, ignore this email. Your password won't change.</p>
      <p style="color:#666;font-size:.8rem;">Or copy this link: {reset_url}</p>
    </div>
    """

    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_USER, to_email, msg.as_string())


@router.post("/forgot-password")
async def forgot_password(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    result = await db.execute(
        select(User).where(User.email == email, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()

    # Always return success to prevent email enumeration
    if not user or not user.is_active:
        return {"detail": "If that email exists, a reset link has been sent."}

    # Generate secure token
    token = secrets.token_urlsafe(32)
    _reset_tokens[token] = {
        "user_id": str(user.id),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
    }

    try:
        _send_reset_email(user.email, user.full_name, token)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

    return {"detail": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(
    payload: dict,
    db: AsyncSession = Depends(get_db),
):
    token = (payload.get("token") or "").strip()
    new_password = payload.get("password") or ""

    if not token or not new_password:
        raise HTTPException(status_code=400, detail="Token and password required")

    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not any(c.isupper() for c in new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not any(c.isdigit() for c in new_password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")

    entry = _reset_tokens.get(token)
    if not entry:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    if datetime.now(timezone.utc) > entry["expires_at"]:
        del _reset_tokens[token]
        raise HTTPException(status_code=400, detail="Reset link has expired — request a new one")

    result = await db.execute(
        select(User).where(User.id == entry["user_id"], User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(new_password)
    del _reset_tokens[token]
    await db.flush()

    return {"detail": "Password reset successfully. You can now log in."}
