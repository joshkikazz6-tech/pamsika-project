# Pa_mSikA — Production System v4.0

> **Premium Malawian Marketplace** — Fully integrated fullstack system.
> UI from `pamsika_v3` · Backend from `pamsika_fixed` · Production-ready Docker deployment.

---

## 🏗️ Architecture

```
pamsika_production_v4/
├── docker-compose.yml        # Orchestrates all 4 services
├── nginx.conf                # Reverse proxy + static file serving
├── .env.example              # Environment variable template
├── frontend/                 # Final UI (pamsika_v3 design)
│   ├── index.html            # Single-page app shell
│   ├── css/style.css         # Full design system (gold theme)
│   ├── js/api.js             # API client — all backend calls
│   ├── js/app.js             # App logic (auth, cart, products...)
│   ├── service-worker.js     # PWA — static-only caching
│   ├── manifest.json         # PWA manifest
│   └── icons/                # App icons (192, 512px)
└── backend/                  # FastAPI backend (preserved + extended)
    ├── app/
    │   ├── api/v1/endpoints/ # Auth, Products, Cart, Orders, Affiliate, Admin
    │   ├── models/           # SQLAlchemy ORM models
    │   ├── schemas/          # Pydantic request/response schemas
    │   ├── core/             # Config, security, encryption
    │   ├── db/               # Async session, base
    │   ├── middleware/        # Security middleware
    │   └── services/         # Audit logging
    ├── alembic/              # DB migrations
    ├── seed.py               # Seeds admin + sample products
    ├── requirements.txt
    └── Dockerfile
```

## 🚀 Quick Start

**1. Clone and configure:**
```bash
cp .env.example .env
# Edit .env — set SECRET_KEY and ENCRYPTION_KEY
openssl rand -hex 64          # → SECRET_KEY
python3 -c "import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"  # → ENCRYPTION_KEY
```

**2. Start everything:**
```bash
docker-compose up -d --build
```

**3. Access:**
| Service | URL |
|---|---|
| 🌐 Marketplace | http://localhost |
| 📡 API Docs | http://localhost/api/docs |

**Default admin login:** `admin@pamsika.mw` / `admin123`
*(Change in `backend/seed.py` before production!)*

---

## 🔌 Services

| Container | Image | Port | Purpose |
|---|---|---|---|
| `nginx` | nginx:1.25-alpine | 80 | Serves frontend + proxies `/api/` |
| `api` | custom (FastAPI) | 8000 (internal) | REST API |
| `db` | postgres:16-alpine | 5432 (internal) | Primary database |
| `redis` | redis:7-alpine | 6379 (internal) | Rate limiting cache |

---

## 🔑 Key Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/auth/register` | — | Register user |
| POST | `/api/v1/auth/login` | — | Login → JWT |
| GET | `/api/v1/products` | — | List products (paginated, filterable) |
| GET | `/api/v1/products/hot` | — | Hot products |
| GET | `/api/v1/cart` | Bearer | Get cart |
| POST | `/api/v1/cart/items` | Bearer | Add to cart |
| POST | `/api/v1/orders` | Bearer | Create order from cart |
| POST | `/api/v1/affiliate/join` | Bearer | Become a Dolo (affiliate) |
| GET | `/api/v1/affiliate/dashboard` | Bearer+Affiliate | Affiliate stats |
| GET | `/api/v1/admin/stats` | Bearer+Admin | Overview KPIs |

Full interactive docs: `http://localhost/api/docs`

---

## 🛡️ Security

- JWT access tokens (15 min) + HttpOnly refresh cookies (7 days)
- Token rotation on refresh
- AES-256 encrypted payout details
- Rate limiting (slowapi)
- CORS configured via `ALLOWED_ORIGINS`
- Soft deletes on all key models
- Audit log on every mutation

---

## 🧑‍💼 Admin Panel

Access: type `pamsika` anywhere on the site, or go to `/#admin-pamsika`.
Requires an account with `is_admin=True` in the database.

---

## 📦 Seed Data

The seed script runs automatically on first start. It creates:
- 1 admin user (`admin@pamsika.mw`)
- 22 sample products across all categories

Re-seed manually:
```bash
docker-compose exec api python seed.py
```
