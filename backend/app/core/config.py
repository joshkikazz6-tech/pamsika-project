"""
Application configuration — all values from environment variables.
"""

from typing import List
from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl, field_validator


class Settings(BaseSettings):
    # Environment
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: str
    DATABASE_URL_ASYNC: str

    # Redis (optional)
    REDIS_URL: str = "redis://localhost:6379/0"
    USE_REDIS: bool = False

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    ADMIN_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours for admin sessions
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Encryption (AES-256 for payout data)
    ENCRYPTION_KEY: str  # 32-byte base64-encoded key

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]
    ALLOWED_HOSTS: List[str] = ["*"]

    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 60
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10

    # Frontend URL (used for generating affiliate/referral links)
    FRONTEND_URL: str = "https://pamsika.onrender.com"

    # Email (SMTP for password reset)
    SMTP_USER: str = "Pamsika8@gmail.com"
    SMTP_PASSWORD: str = ""

    # Admin
    ADMIN_EMAIL: str = "admin@pamsika.mw"

    # Cookie settings
    COOKIE_SECURE: bool = True
    COOKIE_SAMESITE: str = "lax"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
