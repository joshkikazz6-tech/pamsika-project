"""
Image upload endpoint — admin only.
Accepts multipart file uploads, saves to /app/uploads/, returns public URLs.
"""

import os
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse

from app.api.deps import get_current_admin
from app.models.user import User

router = APIRouter(prefix="/admin/upload", tags=["admin"])

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_FILE_SIZE = 8 * 1024 * 1024  # 8 MB per file
MAX_FILES = 10


@router.post("/images")
async def upload_images(
    files: List[UploadFile] = File(...),
    admin: User = Depends(get_current_admin),
):
    """Upload one or more product images. Returns list of public URLs."""
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} images per upload")

    urls = []
    for file in files:
        # Validate content type
        if file.content_type not in ALLOWED_TYPES:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported file type: {file.content_type}. Use JPEG, PNG, WebP or GIF.",
            )

        # Read and check size
        data = await file.read()
        if len(data) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File {file.filename!r} exceeds 8 MB limit")

        # Save with unique name to avoid collisions
        ext = Path(file.filename or "image.jpg").suffix.lower() or ".jpg"
        filename = f"{uuid.uuid4().hex}{ext}"
        dest = UPLOAD_DIR / filename
        dest.write_bytes(data)

        urls.append(f"/uploads/{filename}")

    return {"urls": urls}
