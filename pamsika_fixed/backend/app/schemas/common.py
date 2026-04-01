"""
Schemas: Cart, Order, Favorite, Affiliate, Withdrawal.
"""

import uuid
from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, field_validator


# ── Cart ─────────────────────────────────────────────────────────────────────

class CartItemAdd(BaseModel):
    product_id: uuid.UUID
    quantity: int = 1

    @field_validator("quantity")
    @classmethod
    def positive_qty(cls, v):
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v


class CartItemUpdate(BaseModel):
    quantity: int

    @field_validator("quantity")
    @classmethod
    def positive_qty(cls, v):
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v


class CartItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    quantity: int
    price_at_add: float
    product: Optional[Any] = None  # Populated as ProductOut by _serialize_cart in cart.py


class CartOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    items: List[CartItemOut]
    total: float


# ── Order ─────────────────────────────────────────────────────────────────────

class OrderCreate(BaseModel):
    payment_method: str
    contact_info: dict

    @field_validator("payment_method")
    @classmethod
    def valid_method(cls, v):
        if v not in ("whatsapp", "email", "messenger"):
            raise ValueError("payment_method must be whatsapp, email, or messenger")
        return v


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_snapshot: dict
    quantity: int
    unit_price: float


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    total_amount: float
    payment_method: str
    status: str
    contact_info: dict
    items: List[OrderItemOut]
    created_at: datetime


# ── Favorite ─────────────────────────────────────────────────────────────────

class FavoriteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    product_id: uuid.UUID
    created_at: datetime


# ── Affiliate ─────────────────────────────────────────────────────────────────

class AffiliateDashboard(BaseModel):
    affiliate_id: str
    clicks: int
    sales: int
    commission_balance: float


class ReferralLinkOut(BaseModel):
    product_id: uuid.UUID
    referral_url: str
    commission_percent: float


class AffiliateClickIn(BaseModel):
    affiliate_id: str
    product_id: uuid.UUID


# ── Withdrawal ─────────────────────────────────────────────────────────────────

class WithdrawalCreate(BaseModel):
    amount: float
    method: str
    payout_details: dict  # Will be encrypted

    @field_validator("amount")
    @classmethod
    def positive_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("method")
    @classmethod
    def valid_method(cls, v):
        if v not in ("bank", "mobile_money", "wallet"):
            raise ValueError("method must be bank, mobile_money, or wallet")
        return v


class WithdrawalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    amount: float
    method: str
    status: str
    admin_note: Optional[str]
    created_at: datetime
    reviewed_at: Optional[datetime]


class AdminWithdrawalOut(WithdrawalOut):
    user_id: uuid.UUID
    payout_details: Optional[dict] = None   # decrypted by the endpoint
    affiliate_email: Optional[str] = None   # joined from users table


class WithdrawalReview(BaseModel):
    note: Optional[str] = None


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: Optional[uuid.UUID]
    action: str
    resource: Optional[str]
    resource_id: Optional[str]
    ip_address: Optional[str]
    created_at: datetime


# ── Admin User ─────────────────────────────────────────────────────────────────

class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    is_active: bool
    is_admin: bool
    is_affiliate: bool
    affiliate_id: Optional[str]
    created_at: datetime
    last_login_ip: Optional[str]
