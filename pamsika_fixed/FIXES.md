# Pa_mSikA — Enhancement & Bug-Fix Log

## Critical Fixes

### 1. Admin Session Fix
- `ACCESS_TOKEN_EXPIRE_MINUTES` raised to 60 min; `ADMIN_TOKEN_EXPIRE_MINUTES = 480` (8 h) added.
- `create_access_token()` uses admin expiry when `is_admin=True` is in token payload.
- `REFRESH_TOKEN_EXPIRE_DAYS` raised from 7 → 30 days.
- `api.js` now sends `credentials: 'include'` on every request for seamless token rotation.

### 2. Cart Fix
- `Cart.load()` now calls `this._render()` after populating items, so cart always reflects latest state.

---

## Affiliate Dashboard Enhancements

### Missing Route Decorator
- **Root cause**: `dashboard()` had no `@router.get("/dashboard")` decorator — endpoint was unreachable.
- **Fix**: Decorator added. Dashboard now works.

### Enhanced Dashboard Data
Returns: affiliate_id, commission_balance, total_earned, clicks, sales, **sales_history**, **personal_referral_link**.

### Commission Logic
- Commission only credited when admin marks order **completed**.
- Order items store `affiliate_id` from `?ref=` param, enabling full traceability.

---

## Admin Panel Enhancements

### Missing Route Decorator
- `list_all_orders()` had no `@router.get("/orders")` decorator — fixed.

### Commission Crediting
- `PATCH /admin/orders/{id}` → status `completed` now credits 5% commission to linked affiliate.

### Products
- Multi-image textarea (one URL per line).
- **Edit** button on each product row.
- Commission %, badge, subcategory fields in add form.

### Users Tab
- New 👥 Users tab listing all registered users.

---

## Product Interactions

### Zoom
- Click image to toggle zoom (1× ↔ 2.2×). 🔍+/🔍− buttons for incremental zoom up to 3×. Auto-resets on slide change.

### Download & Share
- ⬇️ Download button saves current product image.
- 📤 Share button uses Web Share API or copies link.
- Affiliate product modal has dedicated Download Image + Copy Post Text buttons.
