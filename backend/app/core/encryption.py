"""
AES-256 encryption for sensitive financial data (payout details).
"""

import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.core.config import settings


def _get_key() -> bytes:
    # Support both standard base64 and URL-safe base64 (- and _ chars)
    raw = base64.urlsafe_b64decode(settings.ENCRYPTION_KEY + "==")
    if len(raw) != 32:
        raise ValueError("ENCRYPTION_KEY must be exactly 32 bytes when decoded.")
    return raw


def encrypt_data(plaintext: str) -> str:
    """Encrypt a string with AES-256-GCM. Returns base64-encoded nonce+ciphertext."""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    ct = aesgcm.encrypt(nonce, plaintext.encode(), None)
    combined = nonce + ct
    return base64.b64encode(combined).decode()


def decrypt_data(encrypted: str) -> str:
    """Decrypt a string encrypted with encrypt_data."""
    key = _get_key()
    aesgcm = AESGCM(key)
    combined = base64.b64decode(encrypted)
    nonce = combined[:12]
    ct = combined[12:]
    return aesgcm.decrypt(nonce, ct, None).decode()
