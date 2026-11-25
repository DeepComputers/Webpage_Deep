# 💻 Deep Computers & Telecom — Web & Catalog Platform (Clean Build)

> Serving customers since 1999 • High-Performance E-Commerce Catalog, On-Demand Custom Orders, and Storefront

This is the clean, streamlined build of the **Deep Computers & Telecom** platform. It eliminates all unnecessary files, legacy Django leftovers, node_modules bloat, and binary duplicates, delivering a lightning-fast, production-ready system.

---

## 🗂️ Clean Project Directory Structure

```
D:\2\
│
├── 🎨 frontend/        # Complete Presentation Layer (Pure Vanilla HTML, CSS, JS)
│   ├── assets/         # Stylesheets, JavaScript, Brand Logos, Sliders & Uploads
│   ├── index.html      # Homepage & Storefront
│   ├── catalog.html    # Product Catalog with instant category/search filtering
│   ├── onorder.html    # On-Demand custom bookings & WhatsApp quote generator
│   ├── services.html   # Computer & telecom repair services
│   ├── admin.html      # Protected store management dashboard
│   ├── manifest.json   # Progressive Web App manifest
│   └── logo.ico        # Favicon
│
├── ⚙️ backend/         # Server-Side Application Layer (FastAPI REST APIs)
│   ├── config.py       # Centralized configuration & environment variables
│   ├── database.py     # High-performance SQLite engine with WAL mode
│   ├── auth.py         # Firebase authentication and optional environment-configured owner key
│   └── app.py          # FastAPI endpoints, routes, upload handler & static mount
│
├── 🗄️ database/        # Storage Layer
│   └── db.sqlite3      # Single source-of-truth SQLite database (109+ products)
│
├── start.bat           # 1-Click Windows launcher (verifies deps & opens browser)
├── run.py              # Python runner (`python run.py`)
├── requirements.txt    # Lean dependencies (FastAPI, Uvicorn, Pydantic, Multipart)
└── .gitignore          # Keeps repository clean from cache & temp files
```

---

## 🚀 How to Run

### Method 1: 1-Click Launch (Recommended)
Double-click **`start.bat`**.  
The script automatically:
1. Verifies Python 3 installation.
2. Checks and installs required dependencies (`fastapi`, `uvicorn`, `pydantic`, `python-multipart`).
3. Connects the unlimited-bandwidth Cloudflare tunnel.
4. Synchronizes with your **Permanent Cloudflare Worker Gateway**.
5. Opens your store in the browser.

### Method 2: Command Line
```powershell
# 1. Install dependencies
python -m pip install -r requirements.txt

# 2. Run the server
python run.py
```

---

## 🌐 Live URLs & Access

### Permanent Public URLs (Unlimited Bandwidth • Never Changes)
- **Storefront**: [https://deepcomputers.deepcomputers.workers.dev/](https://deepcomputers.deepcomputers.workers.dev/)
- **Product Catalog**: [https://deepcomputers.deepcomputers.workers.dev/catalog](https://deepcomputers.deepcomputers.workers.dev/catalog)
- **On-Demand Custom Orders**: [https://deepcomputers.deepcomputers.workers.dev/onorder](https://deepcomputers.deepcomputers.workers.dev/onorder)
- **Services & Repairs**: [https://deepcomputers.deepcomputers.workers.dev/services](https://deepcomputers.deepcomputers.workers.dev/services)
- **Admin Dashboard**: [https://deepcomputers.deepcomputers.workers.dev/admin](https://deepcomputers.deepcomputers.workers.dev/admin)

### Local Machine URLs
- **Local Store**: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)
- **API Health Check**: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

---

## 🛡️ Admin Portal Access
- Navigate to **`https://deepcomputers.deepcomputers.workers.dev/admin`** (or `http://127.0.0.1:8000/admin`).
- Sign in with an account enabled for the Firebase project.
- If using the optional API owner key, configure it locally with the `ADMIN_MASTER_KEY` environment variable. Never commit that value.
- Manage products, brands, partner certificates, and incoming customer inquiries.

Worker tunnel synchronization requires the same locally configured `SYNC_KEY` environment variable as the Cloudflare Worker secret. Without it, the application skips Worker synchronization.

---

## ⚡ What was Cleaned Up
- **Removed 9,450+ unnecessary `node_modules` files** (saved ~150 MB).
- **Removed duplicate HTML/CSS files** previously duplicated across root and frontend.
- **Removed dead legacy Django codebase** (models, migrations, wsgi, asgi, manage.py).
- **Removed heavy test binaries & duplicate k6 executables** (saved ~130 MB).
- **Unified database** to a single source of truth at `database/db.sqlite3`.
- **Organized modular backend** with dedicated `config.py`, `database.py`, `auth.py`, and `app.py`.
