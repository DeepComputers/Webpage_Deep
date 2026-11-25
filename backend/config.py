import os
from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "database" / "db.sqlite3"
FRONTEND_DIR = BASE_DIR / "frontend"
ASSETS_DIR = FRONTEND_DIR / "assets"
UPLOADS_DIR = ASSETS_DIR / "uploads"

# Server Network Settings
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))
WEB_CONCURRENCY = os.environ.get("WEB_CONCURRENCY", "1")

# Redis Cache & Rate Limit Settings
REDIS_URL = os.environ.get("REDIS_URL", "").strip() or None
API_RATE_LIMIT = int(os.environ.get("API_RATE_LIMIT", "100"))
API_RATE_WINDOW_SECONDS = 60

# Authentication Settings
ADMIN_MASTER_KEY = os.environ.get("ADMIN_MASTER_KEY", "").strip()
FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "deep-computers-4528c")

# File Upload Settings
ALLOWED_UPLOAD_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg", ".pdf"}

# Product Categories
CATEGORY_CHOICES = [
    {"value": "laptops", "label": "Laptops & Desktops"},
    {"value": "cctv", "label": "CCTV & Security"},
    {"value": "storage", "label": "Storage"},
    {"value": "ram", "label": "RAM"},
    {"value": "routers", "label": "Routers & Wi-Fi"},
    {"value": "printers", "label": "Printers"},
    {"value": "ink", "label": "Ink & Toners"},
    {"value": "adapters", "label": "Adapters & Chargers"},
    {"value": "speakers", "label": "Speakers & Audio"},
    {"value": "accessories", "label": "Accessories"},
    {"value": "cables", "label": "Cables & Connectors"},
    {"value": "daily-use", "label": "Daily Tech Essentials"},
]
CATEGORY_LABELS = {c["value"]: c["label"] for c in CATEGORY_CHOICES}
CATEGORY_LABELS["pendrives"] = "Storage"
