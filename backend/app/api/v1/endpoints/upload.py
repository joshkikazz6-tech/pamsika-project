"""
Image upload endpoint — admin only.
Uses Cloudinary in production, local disk in development.
"""

import os
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File

from app.api.deps import get_current_admin
from app.models.user import User
from app.core.config import settings

router = APIRouter(prefix="/admin/upload", tags=["admin"])

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 MB
MAX_FILES = 10

CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "")


async def _upload_to_cloudinary(data: bytes, filename: str) -> str:
    """Upload bytes to Cloudinary, return secure URL."""
    import httpx, base64
    # Parse CLOUDINARY_URL: cloudinary://api_key:api_secret@cloud_name
    url = CLOUDINARY_URL.replace("cloudinary://", "")
    api_key, rest = url.split(":", 1)
    api_secret, cloud_name = rest.rsplit("@", 1)

    upload_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload"
    b64 = base64.b64encode(data).decode()
    ext = Path(filename).suffix.lstrip(".") or "jpg"
    data_uri = f"data:image/{ext};base64,{b64}"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(upload_url, data={
            "file": data_uri,
            "api_key": api_key,
            "upload_preset": "pamsika_products",
        })
        if resp.status_code != 200:
            # Try without upload_preset (signed upload)
            import hashlib, time
            timestamp = str(int(time.time()))
            sig_str = f"timestamp={timestamp}{api_secret}"
            signature = hashlib.sha1(sig_str.encode()).hexdigest()
            resp = await client.post(upload_url, data={
                "file": data_uri,
                "api_key": api_key,
                "timestamp": timestamp,
                "signature": signature,
            })
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Cloudinary error: {resp.text}")
        return resp.json()["secure_url"]


async def _upload_local(data: bytes, filename: str) -> str:
    """Save to local disk, return relative URL."""
    upload_dir = Path("/app/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(filename).suffix.lower() or ".jpg"
    fname = f"{uuid.uuid4().hex}{ext}"
    (upload_dir / fname).write_bytes(data)
    return f"/uploads/{fname}"


@router.post("/images")
async def upload_images(
    files: List[UploadFile] = File(...),
    admin: User = Depends(get_current_admin),
):
    """Upload product images. Uses Cloudinary if CLOUDINARY_URL is set, else local disk."""
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} images per upload")

    use_cloudinary = bool(CLOUDINARY_URL)
    urls = []

    for file in files:
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=415, detail=f"Unsupported type: {file.content_type}")

        data = await file.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"{file.filename!r} exceeds 8 MB")

        if use_cloudinary:
            url = await _upload_to_cloudinary(data, file.filename or "image.jpg")
        else:
            url = await _upload_local(data, file.filename or "image.jpg")

        urls.append(url)

    return {"urls": urls}


@router.post("/message-images", tags=["messages"])
async def upload_message_images(
    files: List[UploadFile] = File(...),
    current_user=Depends(__import__('app.api.deps', fromlist=['get_current_user']).get_current_user),
):
    """Upload images for DM messages. Available to any authenticated user."""
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 images per message")

    use_cloudinary = bool(CLOUDINARY_URL)
    urls = []

    for file in files:
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(status_code=415, detail=f"Unsupported type: {file.content_type}")
        data = await file.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"{file.filename!r} exceeds 8 MB")
        if use_cloudinary:
            url = await _upload_to_cloudinary(data, file.filename or "image.jpg")
        else:
            url = await _upload_local(data, file.filename or "image.jpg")
        urls.append(url)

    return {"urls": urls}
