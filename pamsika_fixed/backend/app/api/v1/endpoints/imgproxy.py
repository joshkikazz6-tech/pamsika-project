"""
Image proxy endpoint — fetches external images server-side and serves them
with correct CORS headers so canvas-based download works in the browser.

Usage:  GET /api/v1/imgproxy?url=https://images.unsplash.com/...

Security:
- Only proxies http/https URLs
- Blocks private/local IP ranges (SSRF protection)
- Hard 10 MB response limit
- 15-second timeout
"""

import re
import ipaddress
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/imgproxy", tags=["imgproxy"])

# Allowed content-type prefixes
_ALLOWED_CT = ("image/",)

# Maximum response size: 10 MB
_MAX_BYTES = 10 * 1024 * 1024

# Private / loopback IP ranges (SSRF guard)
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _is_private(host: str) -> bool:
    """Return True if host resolves to a private/loopback address."""
    try:
        addr = ipaddress.ip_address(host)
        return any(addr in net for net in _PRIVATE_NETWORKS)
    except ValueError:
        # hostname — block obvious internal names
        return host in ("localhost", "db", "redis", "api") or host.endswith(".local")


def _validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed")
    host = parsed.hostname or ""
    if not host:
        raise HTTPException(status_code=400, detail="Invalid URL: missing host")
    if _is_private(host):
        raise HTTPException(status_code=403, detail="Private/internal URLs are not allowed")
    return url


@router.get("")
async def proxy_image(url: str = Query(..., description="External image URL to proxy")):
    """
    Fetch an external image and re-serve it with CORS headers so the browser
    can use it in a canvas element for download.
    """
    safe_url = _validate_url(url)

    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; PamsikaBot/1.0)",
        "Accept": "image/*,*/*;q=0.8",
        "Referer": "https://pamsika.mw/",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, max_redirects=5) as client:
            async with client.stream("GET", safe_url, headers=headers) as resp:
                if resp.status_code not in (200, 206):
                    raise HTTPException(
                        status_code=resp.status_code,
                        detail=f"Upstream returned {resp.status_code}",
                    )

                ct = resp.headers.get("content-type", "image/jpeg")
                if not any(ct.startswith(p) for p in _ALLOWED_CT):
                    raise HTTPException(status_code=415, detail="Upstream is not an image")

                # Stream with size limit
                chunks = []
                total = 0
                async for chunk in resp.aiter_bytes(chunk_size=65536):
                    total += len(chunk)
                    if total > _MAX_BYTES:
                        raise HTTPException(status_code=413, detail="Image too large (>10 MB)")
                    chunks.append(chunk)

        body = b"".join(chunks)

        response_headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Cache-Control": "public, max-age=86400, immutable",
            "Content-Type": ct,
            "Content-Length": str(len(body)),
            "Cross-Origin-Resource-Policy": "cross-origin",
        }

        return StreamingResponse(
            iter([body]),
            status_code=200,
            headers=response_headers,
            media_type=ct,
        )

    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Upstream timed out")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach upstream: {exc}")
