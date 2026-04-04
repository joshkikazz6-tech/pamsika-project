"""
Community feed — admin posts, users comment and like.
Content sanitized before storage.
"""
import re
import html as _html
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from app.db.session import get_db
from app.models.user import User
from app.models.community import CommunityPost, CommunityComment, PostLike
from app.api.deps import get_current_user, get_current_admin

router = APIRouter(prefix="/community", tags=["community"])


def _sanitize(text: str, max_len: int = 2000) -> str:
    """Strip HTML tags, decode entities, normalize whitespace."""
    clean = re.sub(r"<[^>]+>", "", text or "")
    clean = _html.unescape(clean)
    clean = re.sub(r"[ \t]+", " ", clean).strip()
    return clean[:max_len]


@router.get("/posts")
async def get_posts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CommunityPost)
        .where(CommunityPost.deleted_at.is_(None))
        .options(
            selectinload(CommunityPost.comments).selectinload(CommunityComment.user),
            selectinload(CommunityPost.liked_by)
        )
        .order_by(CommunityPost.created_at.desc())
    )
    posts = result.scalars().all()
    return [_serialize_post(p) for p in posts]


@router.post("/posts")
async def create_post(
    payload: dict,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    content = _sanitize(payload.get("content") or "")
    images = payload.get("images", [])
    if not content and not images:
        raise HTTPException(status_code=400, detail="Post needs content or images")
    post = CommunityPost(content=content, images=images)
    db.add(post)
    await db.flush()
    # Notify all users
    from app.api.v1.endpoints.notifications import _send_email
    from app.core.config import settings
    if settings.SMTP_PASSWORD:
        users_result = await db.execute(
            select(User).where(User.is_active == True, User.deleted_at.is_(None))
        )
        users = users_result.scalars().all()
        for u in users:
            try:
                _send_email(u.email, u.full_name, "📢 New Post on Pa_mSikA Community",
                           content[:120] + ("…" if len(content) > 120 else ""),
                           f"{settings.FRONTEND_URL}/?view=community")
            except Exception:
                pass
    return {"detail": "Post created", "id": str(post.id)}


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, db: AsyncSession = Depends(get_db), admin: User = Depends(get_current_admin)):
    result = await db.execute(select(CommunityPost).where(CommunityPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return {"detail": "Deleted"}


@router.post("/posts/{post_id}/like")
async def toggle_like(post_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(CommunityPost).where(CommunityPost.id == post_id, CommunityPost.deleted_at.is_(None)))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    existing = await db.execute(select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == current_user.id))
    like = existing.scalar_one_or_none()
    if like:
        await db.delete(like)
        post.likes = max(0, post.likes - 1)
        liked = False
    else:
        db.add(PostLike(post_id=post.id, user_id=current_user.id))
        post.likes += 1
        liked = True
    await db.flush()
    return {"likes": post.likes, "liked": liked}


@router.post("/posts/{post_id}/comments")
async def add_comment(post_id: str, payload: dict, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    content = _sanitize(payload.get("content") or "", max_len=1000)
    if not content:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    result = await db.execute(select(CommunityPost).where(CommunityPost.id == post_id, CommunityPost.deleted_at.is_(None)))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Post not found")
    comment = CommunityComment(post_id=post_id, user_id=current_user.id, content=content)
    db.add(comment)
    await db.flush()
    return {"detail": "Comment added", "id": str(comment.id), "author": current_user.full_name, "content": content}


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(CommunityComment).where(CommunityComment.id == comment_id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Not found")
    if str(c.user_id) != str(current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    c.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return {"detail": "Deleted"}


def _serialize_post(p: CommunityPost) -> dict:
    comments = [c for c in (p.comments or []) if not c.deleted_at]
    return {
        "id": str(p.id),
        "content": p.content,
        "images": p.images or [],
        "likes": p.likes,
        "created_at": p.created_at.isoformat(),
        "comments": [{"id": str(c.id), "content": c.content, "author": c.user.full_name if c.user else "User",
                      "user_id": str(c.user_id), "created_at": c.created_at.isoformat()} for c in comments],
        "liked_by_ids": [str(l.user_id) for l in (p.liked_by or [])],
    }
