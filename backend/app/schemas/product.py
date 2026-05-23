"""
Product schemas.
"""

import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, field_validator


class ProductCreate(BaseModel):
    name: str
    description: str
    price: float
    category: str
    subcategory: Optional[str] = None
    location: Optional[str] = None
    images: List[str] = []
    commission_percent: float = 5.0
    badge: Optional[str] = None

    @field_validator("price")
    @classmethod
    def positive_price(cls, v):
        if v <= 0:
            raise ValueError("Price must be positive")
        return v

    @field_validator("badge")
    @classmethod
    def validate_badge(cls, v):
        if v and v not in ("HOT", "NEW"):
            raise ValueError("Badge must be HOT, NEW, or null")
        return v

    @field_validator("commission_percent")
    @classmethod
    def validate_commission(cls, v):
        if not (0 <= v <= 100):
            raise ValueError("Commission percent must be between 0 and 100")
        return v


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    location: Optional[str] = None
    images: Optional[List[str]] = None
    commission_percent: Optional[float] = None
    badge: Optional[str] = None
    is_active: Optional[bool] = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str
    price: float
    category: str
    subcategory: Optional[str]
    location: Optional[str]
    images: List[str]
    views: int
    likes: int
    commission_percent: float
    badge: Optional[str]
    is_active: bool
    created_at: datetime


class PaginatedProducts(BaseModel):
    items: List[ProductOut]
    total: int
    page: int
    per_page: int
    pages: int
