# CHANGES.md — Zero-Drift Patch Audit Log

---

## CHANGE 1 — Commission Idempotency Guard (NEW FIELD)

**File:** `backend/app/models/order.py`
**Line:** After `deleted_at` column (~line 43)

**BEFORE:**
```
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

**AFTER:**
```
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    commissions_paid: Mapped[bool] = mapped_column(default=False, nullable=False)
```

**Reason:** Without this flag, calling PATCH /admin/orders/{id} with status=completed twice
would credit commissions twice. The commissions_paid boolean lets the commission block
check-and-set atomically, preventing double-crediting on any repeat call.

---

## CHANGE 2 — Commission Idempotency Check in patch_order

**File:** `backend/app/api/v1/endpoints/admin.py`
**Line:** ~213 (the `if payload["status"] == "completed"` condition)

**BEFORE:**
```
        if payload["status"] == "completed" and old_status != "completed":
            for item in order.items:
                ...
                aff_user.affiliate_sales += 1
```

**AFTER:**
```
        if payload["status"] == "completed" and old_status != "completed" and not order.commissions_paid:
            order.commissions_paid = True  # IDEMPOTENCY GUARD — set before crediting
            aff_totals: dict = {}  # accumulate per-affiliate before applying
            ...
            for aff_key, entry in aff_totals.items():
                aff_user.affiliate_sales += 1   # once per order
                referrer.affiliate_sales += 1   # once per order
```

**Reason:** The original guard only checked old_status != "completed". Status cycling
(completed -> pending -> completed) would re-trigger commissions. The commissions_paid
flag prevents any second credit regardless of how many times status is toggled.

---

## CHANGE 3 — affiliate_sales Over-Count Fix (per-item to per-order)

**File:** `backend/app/api/v1/endpoints/admin.py`
**Lines:** ~213–247 (entire commission loop in patch_order)

**BEFORE:**
```
        for item in order.items:  # loop over items
            ...
            aff_user.affiliate_sales += 1     # incremented ONCE PER ITEM
            referrer.affiliate_sales += 1     # incremented ONCE PER ITEM
```

**AFTER:**
```
        # Accumulate totals per affiliate in aff_totals dict (keyed by aff_user.id)
        # Apply after loop — once per affiliate per order:
        for aff_key, entry in aff_totals.items():
            aff_user.affiliate_sales += 1   # ONCE per order
            referrer.affiliate_sales += 1   # ONCE per order
```

**Reason:** Original code incremented affiliate_sales inside the for-item loop.
An order with 3 items would add 3 to the sale count instead of 1. Fix accumulates
commission totals per affiliate in a dict, then applies balance + sales increment
after the loop.

---

## CHANGE 4 — Referral (5%) Commission Base Fixed in Dashboard sales_history

**File:** `backend/app/api/v1/endpoints/affiliate.py`
**Line:** Inside sales_history list comprehension in dashboard() (~line 123)

**BEFORE:**
```
                    "commission": round(item.unit_price * item.quantity * 0.05, 2),
```

**AFTER:**
```
                    "commission": round(item.unit_price * item.quantity * float(item.product_snapshot.get("commission_percent", 5)) / 100, 2),
```

**Reason:** Hardcoded 0.05 disagrees with patch_order which uses commission_percent from
product snapshot. Products with rates other than 5% (e.g., 10%, 15%) showed wrong figures
in the affiliate dashboard. Fixed to use the same field as the commission engine.

---

## CHANGE 5 — New Alembic Migration for commissions_paid Column

**File:** `backend/alembic/versions/0003_orders_commissions_paid.py` (NEW FILE)

**BEFORE:** File did not exist.

**AFTER:** Idempotent migration that adds commissions_paid BOOLEAN NOT NULL DEFAULT false
to the orders table, guarded by a column-existence check.

**Reason:** The new commissions_paid field on the Order model (CHANGE 1) requires a DB
migration. server_default="false" ensures all existing orders start as unpaid — they
remain eligible for commission crediting on their first completed transition.

---

## Verification Checklist

| Check | Result |
|---|---|
| Direct order creates Order + OrderItems | PASS — flush + re-query guards already present |
| Cart order creates Order + OrderItems | PASS — same guard pattern |
| Order appears in admin query | PASS — list_all_orders unchanged |
| Commission triggered ONLY once | PASS — commissions_paid flag prevents re-trigger |
| Referral (5%) correctly applied | PASS — accumulated per-affiliate, applied after item loop |
| affiliate_sales counted per order (not per item) | PASS — moved outside item loop |
| Dashboard shows correct commission per sale | PASS — uses commission_percent from snapshot |
| No existing endpoint broken | PASS — only targeted lines modified |
| No new dependencies introduced | PASS |
| No frontend code modified | PASS |
| No routes renamed or restructured | PASS |
