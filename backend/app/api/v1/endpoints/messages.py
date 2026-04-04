"""
DM system — buyer ↔ admin.
- Messages encrypted at rest with AES-256-GCM.
- Content sanitized (strip HTML, limit length).
- Admin can start a conversation by searching users by email/name.
- Media attachments supported per message.
"""
import re
import html as _html
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.models.user import User
from app.models.messages import Conversation, Message
from app.api.deps import get_current_user, get_current_admin
from app.core.encryption import encrypt_data, decrypt_data

router = APIRouter(prefix="/messages", tags=["messages"])

MAX_MESSAGE_LENGTH = 4000
MAX_MEDIA_URLS = 5
ALLOWED_MEDIA_SCHEMES = ("https://", "http://", "/uploads/")


# ── Sanitization ──────────────────────────────────────────────────────────────

def _sanitize_text(raw: str) -> str:
    if not raw:
        return ""
    clean = re.sub(r"<[^>]+>", "", raw)
    clean = _html.unescape(clean)
    clean = re.sub(r"[ \t]+", " ", clean).strip()
    return clean[:MAX_MESSAGE_LENGTH]


def _sanitize_media_urls(urls: list) -> list:
    if not isinstance(urls, list):
        return []
    return [u.strip() for u in urls[:MAX_MEDIA_URLS]
            if isinstance(u, str) and any(u.startswith(s) for s in ALLOWED_MEDIA_SCHEMES)]


# ── Encryption helpers ────────────────────────────────────────────────────────

def _enc(text: str) -> str:
    return encrypt_data(text or "")

def _dec(enc: str) -> str:
    try:
        return decrypt_data(enc)
    except Exception:
        return "[encrypted]"

def _enc_media(urls: list) -> str | None:
    if not urls:
        return None
    import json
    return encrypt_data(json.dumps(urls))

def _dec_media(enc: str | None) -> list:
    if not enc:
        return []
    import json
    try:
        return json.loads(decrypt_data(enc))
    except Exception:
        return []


# ── User endpoints ────────────────────────────────────────────────────────────

@router.get("/my")
async def my_conversations(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.updated_at.desc())
    )
    return [_serialize_conv(c, current_user.id) for c in result.scalars().all()]


@router.post("/start")
async def start_conversation(payload: dict, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    order_id = payload.get("order_id")
    subject = _sanitize_text(payload.get("subject") or "General Enquiry")[:200] or "General Enquiry"
    first_message = _sanitize_text(payload.get("message") or "")
    media_urls = _sanitize_media_urls(payload.get("media_urls") or [])
    if not first_message and not media_urls:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    if order_id:
        existing = await db.execute(
            select(Conversation).where(Conversation.user_id == current_user.id, Conversation.order_id == order_id)
        )
        conv = existing.scalar_one_or_none()
        if conv:
            db.add(Message(conversation_id=conv.id, sender_id=current_user.id,
                           content_enc=_enc(first_message), media_enc=_enc_media(media_urls), is_admin=False))
            conv.updated_at = datetime.now(timezone.utc)
            await db.flush()
            await _notify_admin(current_user.full_name, first_message, str(conv.id))
            return {"conversation_id": str(conv.id), "detail": "Message sent"}

    conv = Conversation(user_id=current_user.id, order_id=order_id, subject=subject)
    db.add(conv)
    await db.flush()
    db.add(Message(conversation_id=conv.id, sender_id=current_user.id,
                   content_enc=_enc(first_message), media_enc=_enc_media(media_urls), is_admin=False))
    await db.flush()
    await _notify_admin(current_user.full_name, first_message, str(conv.id))
    return {"conversation_id": str(conv.id), "detail": "Conversation started"}


@router.get("/admin/all")
async def all_conversations(db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages), selectinload(Conversation.user))
        .order_by(Conversation.updated_at.desc())
    )
    return [_serialize_conv(c, admin.id, is_admin=True) for c in result.scalars().all()]


@router.get("/admin/unread-count")
async def unread_count(db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(
        select(func.count(Message.id))
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.is_admin == False, Message.read == False)
    )
    return {"count": result.scalar() or 0}


@router.get("/admin/search-users")
async def search_users(q: str = Query(..., min_length=1), db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    term = f"%{q.strip().lower()}%"
    result = await db.execute(
        select(User).where(
            User.deleted_at.is_(None), User.is_active == True,
            or_(func.lower(User.email).like(term), func.lower(User.full_name).like(term))
        ).limit(10)
    )
    return [{"id": str(u.id), "email": u.email, "full_name": u.full_name} for u in result.scalars().all()]


@router.post("/admin/start")
async def admin_start_conversation(payload: dict, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    user_id = payload.get("user_id")
    subject = _sanitize_text(payload.get("subject") or "Message from Pa_mSikA")[:200]
    first_message = _sanitize_text(payload.get("message") or "")
    media_urls = _sanitize_media_urls(payload.get("media_urls") or [])
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id required")
    if not first_message and not media_urls:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    user_result = await db.execute(select(User).where(User.id == user_id, User.is_active == True, User.deleted_at.is_(None)))
    target_user = user_result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Always create a fresh conversation so the user clearly sees the new message
    conv = Conversation(user_id=user_id, subject=subject)
    db.add(conv)
    await db.flush()

    db.add(Message(conversation_id=conv.id, sender_id=admin.id,
                   content_enc=_enc(first_message), media_enc=_enc_media(media_urls), is_admin=True))
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await _notify_user(target_user, first_message, str(conv.id))
    return {"conversation_id": str(conv.id), "detail": "Message sent"}


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.messages).selectinload(Message.sender))
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if str(conv.user_id) != str(current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    for m in conv.messages:
        if not m.read:
            if current_user.is_admin and not m.is_admin:
                m.read = True
            elif not current_user.is_admin and m.is_admin:
                m.read = True
    await db.flush()
    return _serialize_conv(conv, current_user.id, is_admin=current_user.is_admin)


@router.post("/{conversation_id}/reply")
async def reply(conversation_id: str, payload: dict, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    content = _sanitize_text(payload.get("content") or "")
    media_urls = _sanitize_media_urls(payload.get("media_urls") or [])
    if not content and not media_urls:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    result = await db.execute(
        select(Conversation).where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.user))
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    if str(conv.user_id) != str(current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    is_admin = current_user.is_admin
    msg = Message(conversation_id=conv.id, sender_id=current_user.id,
                  content_enc=_enc(content), media_enc=_enc_media(media_urls), is_admin=is_admin)
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()
    if is_admin:
        await _notify_user(conv.user, content, conversation_id)
    else:
        await _notify_admin(current_user.full_name, content, conversation_id)
    return {"detail": "Sent", "id": str(msg.id), "created_at": msg.created_at.isoformat()}


# ── Serialization ─────────────────────────────────────────────────────────────

def _serialize_conv(conv: Conversation, viewer_id, is_admin: bool = False) -> dict:
    unread = sum(1 for m in conv.messages if not m.read and (not m.is_admin if is_admin else m.is_admin))
    return {
        "id": str(conv.id),
        "subject": conv.subject,
        "order_id": str(conv.order_id) if conv.order_id else None,
        "order_ref": str(conv.order_id)[:8].upper() if conv.order_id else None,
        "user_name": conv.user.full_name if conv.user else "User",
        "user_email": conv.user.email if conv.user else "",
        "user_id": str(conv.user_id),
        "unread": unread,
        "updated_at": conv.updated_at.isoformat(),
        "messages": [
            {
                "id": str(m.id),
                "content": _dec(m.content_enc),
                "media_urls": _dec_media(m.media_enc),
                "is_admin": m.is_admin,
                "sender": m.sender.full_name if m.sender else ("Admin" if m.is_admin else "User"),
                "read": m.read,
                "created_at": m.created_at.isoformat(),
            }
            for m in conv.messages
        ],
    }


# ── Email helpers ─────────────────────────────────────────────────────────────

async def _notify_admin(sender_name: str, message: str, conv_id: str):
    from app.api.v1.endpoints.notifications import _send_bulk_email
    from app.core.config import settings
    import threading
    if not settings.SMTP_PASSWORD:
        return
    try:
        t = threading.Thread(
            target=_send_bulk_email,
            args=([settings.SMTP_USER], f"💬 New message from {sender_name}",
                  (message or "[media]")[:200],
                  f"{settings.FRONTEND_URL}/?view=messages&conv={conv_id}"),
            daemon=True
        )
        t.start()
    except Exception:
        pass


async def _notify_user(user: User, message: str, conv_id: str):
    from app.api.v1.endpoints.notifications import _send_bulk_email
    from app.core.config import settings
    import threading
    if not settings.SMTP_PASSWORD:
        return
    try:
        t = threading.Thread(
            target=_send_bulk_email,
            args=([user.email], "💬 New message from Pa_mSikA",
                  (message or "[media]")[:200],
                  f"{settings.FRONTEND_URL}/?view=messages&conv={conv_id}"),
            daemon=True
        )
        t.start()
    except Exception:
        pass