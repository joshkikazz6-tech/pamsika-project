"""
Community feed — posts, likes, comments.
"""
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.community import CommunityPost, CommunityComment, PostLike
from app.models.user import User
from app.api.deps import get_current_user, get_current_admin

router = APIRouter(prefix="/community", tags=["community"])


class PostCreate(BaseModel):
    content: str
    images: list[str] = []


def _serialize_post(p: CommunityPost) -> dict:
    comments = [c for c in (p.comments or []) if c.deleted_at is None]
    return {
        "id": str(p.id),
        "user_id": str(p.user_id) if p.user_id else None,
        "author": p.author.full_name if p.author else "Unknown",
        "content": p.content,
        "images": p.images or [],
        "likes": p.likes,
        "created_at": p.created_at.isoformat(),
        "comments": [
            {
                "id": str(c.id),
                "content": c.content,
                "author": c.user.full_name if c.user else "User",
                "user_id": str(c.user_id),
                "created_at": c.created_at.isoformat(),
            }
            for c in comments
        ],
        "liked_by_ids": [str(l.user_id) for l in (p.liked_by or [])],
    }


@router.get("/posts")
async def list_posts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CommunityPost)
        .where(CommunityPost.deleted_at.is_(None))
        .options(
            selectinload(CommunityPost.author),
            selectinload(CommunityPost.comments).selectinload(CommunityComment.user),
            selectinload(CommunityPost.liked_by),
        )
        .order_by(CommunityPost.created_at.desc())
    )
    posts = result.scalars().all()
    return [_serialize_post(p) for p in posts]


@router.post("/posts")
async def create_post(
    payload: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    post = CommunityPost(
        user_id=current_user.id,
        content=payload.content,
        images=payload.images,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    post.author = current_user
    post.comments = []
    post.liked_by = []
    return _serialize_post(post)


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(CommunityPost).where(CommunityPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if str(post.user_id) != str(current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    post.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return {"detail": "Post deleted"}


@router.post("/posts/{post_id}/like")
async def like_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CommunityPost).where(CommunityPost.id == post_id, CommunityPost.deleted_at.is_(None))
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    existing = await db.execute(
        select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == current_user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Already liked")

    db.add(PostLike(post_id=post.id, user_id=current_user.id))
    post.likes = (post.likes or 0) + 1
    await db.flush()
    return {"detail": "Liked", "likes": post.likes}


@router.post("/posts/{post_id}/comments")
async def add_comment(
    post_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CommunityPost).where(CommunityPost.id == post_id, CommunityPost.deleted_at.is_(None))
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Post not found")

    content = (payload.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    comment = CommunityComment(post_id=post_id, user_id=current_user.id, content=content)
    db.add(comment)
    await db.flush()
    return {
        "detail": "Comment added",
        "id": str(comment.id),
        "author": current_user.full_name,
        "content": content,
    }


@router.delete("/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    post_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(CommunityComment).where(CommunityComment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if str(comment.user_id) != str(current_user.id) and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Not allowed")
    comment.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    return {"detail": "Comment deleted"}