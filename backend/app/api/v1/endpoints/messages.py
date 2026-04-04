"""
DM system — buyer ↔ admin, linked to orders.
Auto-notifies via email on new message.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Mapped, mapped_column, relationship, selectinload
from app.db.session import get_db
from app.models.user import User
from app.models.order import Order
from app.api.deps import get_current_user, get_current_admin
from app.db.base import Base
from sqlalchemy import String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

router = APIRouter(prefix="/messages", tags=["messages"])


class Conversation(Base):
    __tablename__ = "conversations"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")
    user: Mapped["User"] = relationship("User")
    order: Mapped["Order"] = relationship("Order")


class Message(Base):
    __tablename__ = "dm_messages"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
    sender: Mapped["User"] = relationship("User")


# ── User endpoints ────────────────────────────────────────────────────────────

@router.get("/my")
async def my_conversations(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .options(selectinload(Conversation.messages), selectinload(Conversation.order))
        .order_by(Conversation.updated_at.desc())
    )
    convs = result.scalars().all()
    return [_serialize_conv(c, current_user.id) for c in convs]


@router.post("/start")
async def start_conversation(payload: dict, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    order_id = payload.get("order_id")
    subject = (payload.get("subject") or "Order Enquiry").strip()
    first_message = (payload.get("message") or "").strip()
    if not first_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Check if conversation already exists for this order
    if order_id:
        existing = await db.execute(
            select(Conversation).where(Conversation.user_id == current_user.id, Conversation.order_id == order_id)
        )
        conv = existing.scalar_one_or_none()
        if conv:
            # Just add message to existing conversation
            msg = Message(conversation_id=conv.id, sender_id=current_user.id, content=first_message, is_admin=False)
            db.add(msg)
            conv.updated_at = datetime.now(timezone.utc)
            await db.flush()
            await _notify_admin(current_user.full_name, first_message, str(conv.id))
            return {"conversation_id": str(conv.id), "detail": "Message sent"}

    conv = Conversation(user_id=current_user.id, order_id=order_id, subject=subject)
    db.add(conv)
    await db.flush()
    msg = Message(conversation_id=conv.id, sender_id=current_user.id, content=first_message, is_admin=False)
    db.add(msg)
    await db.flush()
    await _notify_admin(current_user.full_name, first_message, str(conv.id))
    return {"conversation_id": str(conv.id), "detail": "Conversation started"}


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id)
        .options(selectinload(Conversation.messages).selectinload(Message.sender), selectinload(Conversation.order))
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if str(conv.user_id) != str(current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    # Mark admin messages as read for user
    for m in conv.messages:
        if m.is_admin and not m.read:
            m.read = True
    await db.flush()
    return _serialize_conv(conv, current_user.id)


@router.post("/{conversation_id}/reply")
async def reply(conversation_id: str, payload: dict, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    content = (payload.get("content") or "").strip()
    if not content:
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
    msg = Message(conversation_id=conv.id, sender_id=current_user.id, content=content, is_admin=is_admin)
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    await db.flush()
    # Notify the other party
    if is_admin:
        await _notify_user(conv.user, content, conversation_id)
    else:
        await _notify_admin(current_user.full_name, content, conversation_id)
    return {"detail": "Sent", "id": str(msg.id), "created_at": msg.created_at.isoformat()}


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.get("/admin/all")
async def all_conversations(db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages), selectinload(Conversation.user), selectinload(Conversation.order))
        .order_by(Conversation.updated_at.desc())
    )
    convs = result.scalars().all()
    return [_serialize_conv(c, admin.id, is_admin=True) for c in convs]


@router.get("/admin/unread-count")
async def unread_count(db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(
        select(func.count(Message.id))
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.is_admin == False, Message.read == False)
    )
    count = result.scalar() or 0
    return {"count": count}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize_conv(conv: Conversation, viewer_id, is_admin: bool = False) -> dict:
    unread = sum(1 for m in conv.messages if not m.read and (m.is_admin if not is_admin else not m.is_admin))
    order_ref = str(conv.order_id)[:8].upper() if conv.order_id else None
    return {
        "id": str(conv.id),
        "subject": conv.subject,
        "order_id": str(conv.order_id) if conv.order_id else None,
        "order_ref": order_ref,
        "user_name": conv.user.full_name if conv.user else "User",
        "user_email": conv.user.email if conv.user else "",
        "unread": unread,
        "updated_at": conv.updated_at.isoformat(),
        "messages": [
            {
                "id": str(m.id),
                "content": m.content,
                "is_admin": m.is_admin,
                "sender": m.sender.full_name if m.sender else ("Admin" if m.is_admin else "User"),
                "read": m.read,
                "created_at": m.created_at.isoformat(),
            }
            for m in conv.messages
        ],
    }


async def _notify_admin(sender_name: str, message: str, conv_id: str):
    from app.api.v1.endpoints.notifications import _send_email
    from app.core.config import settings
    if not settings.SMTP_PASSWORD:
        return
    try:
        _send_email(
            settings.SMTP_USER, "Pa_mSikA Admin",
            f"💬 New message from {sender_name}",
            message[:200],
            f"{settings.FRONTEND_URL}/?view=messages&conv={conv_id}"
        )
    except Exception:
        pass


async def _notify_user(user: User, message: str, conv_id: str):
    from app.api.v1.endpoints.notifications import _send_email
    from app.core.config import settings
    if not settings.SMTP_PASSWORD:
        return
    try:
        _send_email(
            user.email, user.full_name,
            "💬 New message from Pa_mSikA",
            message[:200],
            f"{settings.FRONTEND_URL}/?view=messages&conv={conv_id}"
        )
    except Exception:
        pass
