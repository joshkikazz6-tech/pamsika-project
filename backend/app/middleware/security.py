"""
Middleware: injects production-grade security headers on every response.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=()"
        # HSTS should only be set in production (HTTPS). Sending it over HTTP
        # causes browsers to refuse future HTTP connections, breaking dev/HTTP setups.
        # Set this header at the reverse-proxy (nginx/CDN) level for HTTPS only.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https:; "
            "font-src 'self' https://fonts.gstatic.com https: data:; "
            "img-src 'self' data: https: blob:; "
            "connect-src 'self' https: wss: http://localhost http://127.0.0.1; "
            "worker-src 'self' blob:; "
            "manifest-src 'self';"
        )
        return response