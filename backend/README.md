# Pa_mSikA Backend

Production-grade REST API for the Pa_mSikA marketplace + affiliate platform.  
Built with **FastAPI · PostgreSQL · SQLAlchemy (async) · Alembic · JWT · AES-256**.

---

## Architecture

```
app/
├── api/v1/endpoints/   # Route handlers (auth, products, cart, orders, favorites, affiliate, admin, analytics)
├── core/               # Config, JWT security, AES-256 encryption
├── db/                 # Async engine, session, declarative base
├── middleware/         # Security headers (HSTS, CSP, X-Frame-Options …)
├── models/             # SQLAlchemy ORM models
├── schemas/            # Pydantic v2 request/response schemas
└── services/           # Audit logging service
alembic/                # DB migrations
tests/                  # pytest async test suite
```

---

## Quick Start (Docker — recommended)

### 1. Clone and configure

```bash
cp .env.example .env
```

Edit `.env` — at minimum set these three secrets:

```bash
# Generate a strong JWT secret
SECRET_KEY=$(openssl rand -hex 64)

# Generate a 32-byte AES key (base64-encoded)
ENCRYPTION_KEY=$(python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())")
```

### 2. Start all services

```bash
docker compose up --build
```

The API will be available at **http://localhost:8000**.

### 3. Seed development data (optional)

```bash
docker compose exec api python seed.py
```

This creates:
- Admin account: `admin@pamsika.mw` / `Admin@12345`
- Affiliate account: `affiliate@pamsika.mw` / `Affiliate@12345`
- 6 sample products

### 4. Interactive docs

```
http://localhost:8000/api/docs
```

---

## Local Development (without Docker)

### Prerequisites
- Python 3.11+
- PostgreSQL 14+
- (Optional) Redis 7+

### Setup

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # Edit DATABASE_URL_ASYNC, SECRET_KEY, ENCRYPTION_KEY

alembic upgrade head             # Run migrations
python seed.py                   # Seed sample data (optional)

uvicorn app.main:app --reload    # Start dev server
```

---

## Running Tests

```bash
pip install -r requirements.txt
pytest                           # Runs full suite with coverage report
pytest -v tests/test_auth.py    # Single file
```

Coverage threshold is **80%** — enforced via `pyproject.toml`.

---

## API Reference

All routes are prefixed with `/api/v1`.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login — returns access token; sets refresh cookie |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Clear refresh cookie |
| GET  | `/auth/me` | Current user profile |

**Token flow:** access token (15 min) returned in response body; refresh token (7 days) stored in `HttpOnly` cookie at `/api/v1/auth` path only.

### Products (public)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/products` | Paginated list — supports `search`, `category`, `location`, `min_price`, `max_price`, `sort` |
| GET | `/products/hot` | Products with `badge=HOT` |
| GET | `/products/new` | Products with `badge=NEW` |
| GET | `/products/{id}` | Single product — increments view count |

### Cart

Pass `X-Session-Id` header for guest carts. Guest cart merges into user cart on first authenticated request.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cart` | Get cart with total |
| POST | `/cart/items` | Add item |
| PUT | `/cart/items/{id}` | Update quantity |
| DELETE | `/cart/items/{id}` | Remove item |
| DELETE | `/cart` | Clear cart |

### Orders (auth required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/orders` | Create from cart snapshot; clears cart |
| GET | `/orders` | User's order history |
| GET | `/orders/{id}` | Single order |

### Favorites (auth required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/favorites` | List |
| POST | `/favorites/{product_id}` | Add |
| DELETE | `/favorites/{product_id}` | Remove |

### Affiliate (affiliate role required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/affiliate/dashboard` | Clicks, sales, balance |
| GET | `/affiliate/referral-link/{product_id}` | Generate tracking URL |
| POST | `/affiliate/click` | Track referral click (public) |
| POST | `/affiliate/withdraw` | Request withdrawal |

### Admin (admin role required)

| Method | Path | Description |
|--------|------|-------------|
| POST/PUT/DELETE | `/admin/products/{id}` | Product CRUD |
| GET | `/admin/orders` | All orders |
| GET | `/admin/users` | All users |
| GET | `/admin/audit-logs` | Audit trail |
| GET | `/admin/withdrawals` | All withdrawal requests |
| PUT | `/admin/withdrawals/{id}/approve` | Approve |
| PUT | `/admin/withdrawals/{id}/reject` | Reject + refund balance |
| GET | `/admin/analytics` | Aggregated metrics |

---

## Security Overview

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcrypt, cost factor 12 |
| Access tokens | JWT HS256, 15-minute expiry |
| Refresh tokens | Rotated on every use, `HttpOnly` cookie |
| Payout data | AES-256-GCM encryption at rest |
| Input validation | Pydantic v2, strict mode |
| Rate limiting | slowapi — 60 req/min global, 10/min on auth |
| CORS | Restricted to `ALLOWED_ORIGINS` |
| Security headers | HSTS, CSP, X-Frame-Options, X-Content-Type-Options |
| Soft deletes | `deleted_at` timestamp on all critical tables |
| Audit logging | Every sensitive action recorded with IP + timestamp |

---

## Environment Variables

See `.env.example` for the full list. Required for production:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL_ASYNC` | PostgreSQL async connection string |
| `SECRET_KEY` | JWT signing key (min 64 hex chars) |
| `ENCRYPTION_KEY` | AES-256 key — 32 random bytes, base64-encoded |
| `ALLOWED_ORIGINS` | JSON array of permitted frontend origins |
| `COOKIE_SECURE` | Set `true` in production (requires HTTPS) |

---

## Database Migrations

```bash
# Apply all migrations
alembic upgrade head

# Create a new migration after model changes
alembic revision --autogenerate -m "describe change"

# Rollback one step
alembic downgrade -1
```

---

## Production Deployment Notes

1. Set `ENVIRONMENT=production` — disables `/api/docs` and `/api/redoc`.
2. Set `COOKIE_SECURE=true` — requires HTTPS.
3. Set `ALLOWED_ORIGINS` to your exact frontend domain.
4. Use a reverse proxy (nginx/Caddy) to terminate TLS.
5. Scale workers: edit `CMD` in `Dockerfile` — e.g. `--workers 4` for 4 CPU cores.
6. Rotate `SECRET_KEY` and `ENCRYPTION_KEY` via your secrets manager; never commit to VCS.
