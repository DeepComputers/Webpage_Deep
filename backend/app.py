import base64
import logging
import mimetypes
import os
import re
import shutil
import time
import urllib.parse
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Callable, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Header, Query, Request, Response, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.staticfiles import StaticFiles

from backend.config import (
    ADMIN_MASTER_KEY,
    ALLOWED_UPLOAD_EXTENSIONS,
    API_RATE_LIMIT,
    API_RATE_WINDOW_SECONDS,
    ASSETS_DIR,
    BASE_DIR,
    CATEGORY_CHOICES,
    CATEGORY_LABELS,
    FRONTEND_DIR,
    REDIS_URL,
    UPLOADS_DIR,
)
from backend.database import get_db, init_db
from backend.auth import get_current_admin

# Ensure modern web formats are registered
mimetypes.init()
mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")

logger = logging.getLogger("deep_computers")
logging.basicConfig(level=logging.INFO)

# Initialize database schema on startup
init_db()


# ---------------------------------------------------------------------------
# In-Memory Cache for Sub-Millisecond Public Reads
# ---------------------------------------------------------------------------
class MemoryCache:
    def __init__(self):
        self.brands: Optional[list[dict[str, Any]]] = None
        self.certificates: Optional[list[dict[str, Any]]] = None
        self.products: Optional[list[dict[str, Any]]] = None

    def invalidate_brands(self):
        self.brands = None
        self.products = None

    def invalidate_certificates(self):
        self.certificates = None

    def invalidate_products(self):
        self.products = None

    def invalidate_all(self):
        self.brands = None
        self.certificates = None
        self.products = None


memory_cache = MemoryCache()


# ---------------------------------------------------------------------------
# Lifespan: Optional Redis Rate-Limiting and Multi-Worker Cache Sync
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(application: FastAPI):
    redis_client = None
    if REDIS_URL:
        try:
            import redis.asyncio as aioredis
            redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
            await redis_client.ping()
            logger.info("Connected to Redis for multi-worker cache sync and rate limiting.")
        except Exception as e:
            logger.warning("Redis not available: %s. Continuing with in-memory caching.", e)
            redis_client = None

    application.state.redis = redis_client
    try:
        yield
    finally:
        if redis_client is not None:
            await redis_client.aclose()


# ---------------------------------------------------------------------------
# FastAPI Application Setup
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Deep Computers & Telecom API",
    version="2.0.0",
    description="High-performance, standalone FastAPI catalog & admin system",
    lifespan=lifespan,
)

# Gzip compression for all text/json responses >= 500 bytes
app.add_middleware(GZipMiddleware, minimum_size=500)

# Cross-Origin Resource Sharing for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_tunnel_and_security_headers(request: Request, call_next):
    # Auto-redirect direct browser visits on temporary tunnel subdomains
    # to the permanent Cloudflare Worker domain so customers always use the permanent URL.
    host = request.headers.get("host", "").lower()
    forwarded_host = request.headers.get("x-forwarded-host", "").lower()

    if not forwarded_host and "trycloudflare.com" in host:
        if request.method in ("GET", "HEAD") and not request.url.path.startswith("/api/"):
            target_url = f"https://deepcomputers.deepcomputers.workers.dev{request.url.path}"
            if request.url.query:
                target_url += f"?{request.url.query}"
            return RedirectResponse(url=target_url, status_code=307)

    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


# ---------------------------------------------------------------------------
# Cache-Control Static File Mount
# ---------------------------------------------------------------------------
class CachedStaticFiles(StaticFiles):
    """StaticFiles mount with HTTP Cache-Control headers."""
    def file_response(self, *args, **kwargs) -> Response:
        resp = super().file_response(*args, **kwargs)
        scope = args[1] if len(args) > 1 else kwargs.get("scope")
        path = scope.get("path", "") if isinstance(scope, dict) else ""

        # Versioned or long-lived static media
        if any(path.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico", ".woff2"]):
            resp.headers["Cache-Control"] = "public, max-age=2592000, immutable"  # 30 days
        else:
            resp.headers["Cache-Control"] = "public, max-age=3600"  # 1 hour for js/css
        return resp


ASSETS_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", CachedStaticFiles(directory=ASSETS_DIR), name="assets")


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class ProductPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    category: str = Field(..., max_length=40)
    brand_id: Optional[int] = None
    description: Optional[str] = ""
    image_url: Optional[str] = ""
    price: Optional[float] = None
    original_price: Optional[float] = None
    product_url: Optional[str] = ""
    display_order: Optional[int] = 0
    is_published: Optional[bool] = True
    subtype: Optional[str] = ""
    stock_status: Optional[str] = "in_stock"
    badge: Optional[str] = ""
    warranty: Optional[str] = ""


class CertificatePayload(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)
    issuer: Optional[str] = ""
    description: Optional[str] = ""
    credential_id: Optional[str] = ""
    issued_on: Optional[str] = None
    expires_on: Optional[str] = None
    document_url: Optional[str] = ""
    display_order: Optional[int] = 0
    is_published: Optional[bool] = True


class BrandPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    summary: Optional[str] = ""
    website_url: Optional[str] = ""
    logo_url: Optional[str] = ""
    display_order: Optional[int] = 0
    is_published: Optional[bool] = True


class OnDemandOrderPayload(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=10, max_length=20)
    product_title: str = Field(..., min_length=2, max_length=200)
    brand: Optional[str] = ""
    category: Optional[str] = ""
    notes: Optional[str] = ""


class OnDemandStatusPayload(BaseModel):
    status: str


def normalize_image_url(url: Optional[str]) -> str:
    """Normalizes Google Drive links or direct URLs to clean thumbnails."""
    if not url:
        return ""
    clean = url.strip()
    if clean.startswith("//"):
        clean = "https:" + clean
    patterns = [
        r"/file(?:/u/\d+)?/d/([a-zA-Z0-9_-]+)",
        r"[?&]id=([a-zA-Z0-9_-]+)",
        r"drive\.google\.com/open\?id=([a-zA-Z0-9_-]+)",
        r"drive\.google\.com/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)",
        r"docs\.google\.com/file/d/([a-zA-Z0-9_-]+)",
    ]
    for p in patterns:
        m = re.search(p, clean, re.IGNORECASE)
        if m:
            file_id = m.group(1)
            return f"https://drive.google.com/thumbnail?id={file_id}&sz=w1000"
    return clean


async def invalidate_cache(callback: Callable[[], None]) -> None:
    """Invalidates in-memory and shared Redis cache."""
    callback()
    if hasattr(app.state, "redis") and app.state.redis:
        try:
            await app.state.redis.incr("deep-computers:cache-generation")
        except Exception:
            pass


# ---------------------------------------------------------------------------
# API Routes: Health & Upload
# ---------------------------------------------------------------------------
@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health_check():
    return {
        "status": "ok",
        "engine": "FastAPI (Pure Standalone)",
        "service": "Deep Computers & Telecom API",
        "version": "2.0.0",
        "timestamp": int(time.time()),
    }


@app.post("/api/upload")
async def upload_file(
    file: UploadFile = File(...),
    admin_user: dict = Depends(get_current_admin),
):
    ext = Path(file.filename or "").suffix.lower()
    if not ext or ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported format '{ext}'. Allowed: JPG, PNG, WEBP, GIF, SVG, PDF",
        )

    clean_filename = f"{int(time.time())}_{uuid.uuid4().hex[:8]}{ext}"
    dest_path = UPLOADS_DIR / clean_filename

    try:
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error("Error saving upload: %s", e)
        raise HTTPException(status_code=500, detail="Could not save file to disk.")

    return {
        "success": True,
        "filename": clean_filename,
        "url": f"/assets/uploads/{clean_filename}",
        "message": "File uploaded and stored locally.",
    }


# ---------------------------------------------------------------------------
# Public APIs
# ---------------------------------------------------------------------------
@app.get("/api/brands")
async def list_brands(response: Response):
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"

    if memory_cache.brands is not None:
        return {"brands": memory_cache.brands}

    def query_brands():
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT id, name, summary, website_url, logo_url, display_order
                FROM catalog_brand
                WHERE is_published = 1
                ORDER BY name COLLATE NOCASE ASC
                """
            )
            return [dict(row) for row in cursor.fetchall()]

    brands = await run_in_threadpool(query_brands)
    memory_cache.brands = brands
    return {"brands": brands}


@app.get("/api/certificates")
async def list_certificates(response: Response):
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"

    if memory_cache.certificates is not None:
        return {"certificates": memory_cache.certificates}

    def query_certificates():
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT id, title, issuer, description, credential_id,
                       issued_on, expires_on, document_url, display_order
                FROM catalog_certificate
                WHERE is_published = 1
                ORDER BY display_order ASC, title ASC
                """
            )
            return [dict(row) for row in cursor.fetchall()]

    certs = await run_in_threadpool(query_certificates)
    memory_cache.certificates = certs
    return {"certificates": certs}


@app.get("/api/products")
async def list_products(
    response: Response,
    search: str = Query(default="", max_length=100),
    category: Optional[str] = None,
    subtype: Optional[str] = None,
):
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"

    clean_search = search.strip().lower()
    clean_cat = (category or "").strip().lower()
    clean_sub = (subtype or "").strip().lower()

    all_products = memory_cache.products
    if all_products is None:
        def fetch_all_published():
            with get_db() as conn:
                cursor = conn.execute(
                    """
                    SELECT p.id, p.name, p.category, p.brand_id, p.description,
                           p.image_url, p.price, p.original_price, p.stock_status,
                           p.badge, p.warranty, p.product_url, p.display_order,
                           p.subtype, b.name AS brand_name
                    FROM catalog_product p
                    LEFT JOIN catalog_brand b ON p.brand_id = b.id
                    WHERE p.is_published = 1
                    ORDER BY p.id DESC
                    """
                )
                items = []
                for row in cursor.fetchall():
                    cat_val = row["category"]
                    sub_val = (row["subtype"] or "").strip()
                    sub_lower = sub_val.lower()
                    price_val = float(row["price"]) if row["price"] is not None else None
                    orig_price_val = float(row["original_price"]) if row["original_price"] is not None else None
                    discount_pct = None
                    savings = None
                    if orig_price_val and price_val and orig_price_val > price_val:
                        discount_pct = round(((orig_price_val - price_val) / orig_price_val) * 100)
                        savings = round(orig_price_val - price_val, 2)
                    items.append({
                        "id": row["id"],
                        "name": row["name"],
                        "category": cat_val,
                        "category_label": CATEGORY_LABELS.get(cat_val, cat_val.capitalize()),
                        "brand": row["brand_name"] or "",
                        "brand_id": row["brand_id"],
                        "description": row["description"] or "",
                        "image_url": row["image_url"] or "",
                        "price": price_val,
                        "original_price": orig_price_val,
                        "discount_pct": discount_pct,
                        "savings": savings,
                        "stock_status": row["stock_status"] or "in_stock",
                        "badge": row["badge"] or "",
                        "warranty": row["warranty"] or "",
                        "product_url": row["product_url"] or "",
                        "display_order": row["display_order"] or 0,
                        "subtype": sub_val,
                        "is_usb": "usb" in sub_lower,
                        "is_wireless": "wireless" in sub_lower,
                        "is_combo": "combo" in sub_lower,
                    })
                return items

        all_products = await run_in_threadpool(fetch_all_published)
        memory_cache.products = all_products

    filtered = all_products
    if clean_cat and clean_cat != "all":
        if clean_cat in ("accessories", "peripherals"):
            filtered = [p for p in filtered if p["category"].lower() in ("accessories", "peripherals")]
        elif clean_cat == "pendrives":
            filtered = [p for p in filtered if p["category"].lower() in ("storage", "pendrives")]
        else:
            filtered = [p for p in filtered if p["category"].lower() == clean_cat]

    if clean_sub and clean_sub != "all":
        filtered = [p for p in filtered if clean_sub in (p.get("subtype") or "").lower()]

    if clean_search:
        filtered = [
            p for p in filtered
            if clean_search in p["name"].lower()
            or clean_search in p["description"].lower()
            or clean_search in p["brand"].lower()
            or clean_search in p["category"].lower()
            or clean_search in (p.get("subtype") or "").lower()
        ]

    return {
        "products": filtered,
        "categories": CATEGORY_CHOICES,
    }


@app.get("/api/onorder/products")
async def list_onorder_products(
    response: Response,
    brand: Optional[str] = None,
    category: Optional[str] = None,
    search: str = Query(default="", max_length=100),
):
    response.headers["Cache-Control"] = "public, max-age=60, stale-while-revalidate=300"

    def fetch():
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT id, name, brand, category, specs, eta, image_url, is_featured, display_order
                FROM catalog_ondemand_product
                ORDER BY display_order ASC, id ASC
                """
            )
            return [dict(row) for row in cursor.fetchall()]

    products = await run_in_threadpool(fetch)

    clean_brand = (brand or "").strip().lower()
    clean_cat = (category or "").strip().lower()
    clean_search = search.strip().lower()

    if clean_brand and clean_brand != "all":
        products = [p for p in products if p["brand"].lower() == clean_brand]

    if clean_cat and clean_cat != "all":
        products = [p for p in products if clean_cat in p["category"].lower()]

    if clean_search:
        products = [
            p for p in products
            if clean_search in p["name"].lower()
            or clean_search in p["brand"].lower()
            or clean_search in p["specs"].lower()
            or clean_search in p["category"].lower()
        ]

    all_brands = sorted(list({p["brand"] for p in products if p.get("brand")}))
    all_categories = sorted(list({p["category"] for p in products if p.get("category")}))

    return {
        "products": products,
        "brands": all_brands,
        "categories": all_categories,
    }


@app.post("/api/onorder")
async def create_onorder_request(payload: OnDemandOrderPayload):
    def insert_order():
        with get_db() as conn:
            cursor = conn.execute(
                """
                INSERT INTO catalog_ondemand_order (customer_name, phone, product_title, brand, category, notes)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.customer_name.strip(),
                    payload.phone.strip(),
                    payload.product_title.strip(),
                    (payload.brand or "").strip(),
                    (payload.category or "").strip(),
                    (payload.notes or "").strip(),
                ),
            )
            return cursor.lastrowid

    order_id = await run_in_threadpool(insert_order)

    msg = (
        f"Hello Deep Computers Team! 🛍️\n"
        f"I would like to place an *On-Demand Order*:\n\n"
        f"📌 *Product:* {payload.product_title}\n"
        + (f"🏷️ *Brand:* {payload.brand}\n" if payload.brand else "")
        + (f"📂 *Category:* {payload.category}\n" if payload.category else "")
        + f"👤 *Customer:* {payload.customer_name}\n"
        + f"📱 *Phone:* {payload.phone}\n"
        + (f"📝 *Details / Custom Specs:* {payload.notes}\n" if payload.notes else "")
        + f"\n_Order Ref: #ORD-{order_id}_\n"
        f"Please confirm availability and share the best price quotation on WhatsApp. Thank you!"
    )
    encoded_msg = urllib.parse.quote(msg)
    wa_url = f"https://wa.me/919927079209?text={encoded_msg}"
    wa_url_alt = f"https://wa.me/918218762210?text={encoded_msg}"
    wa_url_3 = f"https://wa.me/919837022521?text={encoded_msg}"

    return {
        "success": True,
        "order_id": order_id,
        "whatsapp_url": wa_url,
        "whatsapp_url_alt": wa_url_alt,
        "whatsapp_url_3": wa_url_3,
        "message": "Your on-demand order inquiry has been logged. WhatsApp will now open with details.",
    }


# ---------------------------------------------------------------------------
# Admin APIs
# ---------------------------------------------------------------------------
@app.get("/api/admin/me")
async def admin_me(response: Response, admin_user: dict = Depends(get_current_admin)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return {"user": admin_user}


@app.get("/api/admin/onorder")
async def admin_list_onorder(response: Response, admin_user: dict = Depends(get_current_admin)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

    def fetch():
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT id, customer_name, phone, product_title, brand, category, notes, status, created_at
                FROM catalog_ondemand_order
                ORDER BY id DESC
                """
            )
            return [dict(row) for row in cursor.fetchall()]

    orders = await run_in_threadpool(fetch)
    return {"orders": orders}


@app.patch("/api/admin/onorder/{order_id}")
async def admin_update_onorder_status(
    order_id: int,
    payload: OnDemandStatusPayload,
    admin_user: dict = Depends(get_current_admin),
):
    def update():
        with get_db() as conn:
            cursor = conn.execute(
                "UPDATE catalog_ondemand_order SET status = ? WHERE id = ?",
                (payload.status.strip(), order_id),
            )
            return cursor.rowcount > 0

    success = await run_in_threadpool(update)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found.")
    return {"success": True, "message": f"Order #{order_id} status updated to {payload.status}."}


@app.delete("/api/admin/onorder/{order_id}")
async def admin_delete_onorder(
    order_id: int,
    admin_user: dict = Depends(get_current_admin),
):
    """Permanently deletes a customer on-demand inquiry/order."""
    def delete():
        with get_db() as conn:
            cursor = conn.execute("DELETE FROM catalog_ondemand_order WHERE id = ?", (order_id,))
            return cursor.rowcount > 0

    success = await run_in_threadpool(delete)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found.")
    return {"success": True, "message": f"Inquiry #{order_id} deleted successfully."}


@app.get("/api/stats")
async def public_store_stats():
    """Provides public store counters and selling inventory metrics."""
    def fetch():
        with get_db() as conn:
            total = conn.execute("SELECT COUNT(*) FROM catalog_product WHERE is_published = 1").fetchone()[0]
            in_stock = conn.execute("SELECT COUNT(*) FROM catalog_product WHERE is_published = 1 AND (stock_status = 'in_stock' OR stock_status IS NULL OR stock_status = '')").fetchone()[0]
            bestsellers = conn.execute("SELECT COUNT(*) FROM catalog_product WHERE is_published = 1 AND badge = 'bestseller'").fetchone()[0]
            deals = conn.execute("SELECT COUNT(*) FROM catalog_product WHERE is_published = 1 AND original_price IS NOT NULL AND original_price > price").fetchone()[0]
            inquiries = conn.execute("SELECT COUNT(*) FROM catalog_ondemand_order WHERE status = 'Pending'").fetchone()[0]
            return {
                "total_products": total,
                "in_stock": in_stock,
                "bestsellers": bestsellers,
                "deals": deals,
                "inquiries": inquiries,
            }
    return await run_in_threadpool(fetch)


@app.get("/api/admin/stats")
async def admin_stats(admin_user: dict = Depends(get_current_admin)):
    """Provides high-level selling metrics and store counters for the admin dashboard."""
    def fetch():
        with get_db() as conn:
            total = conn.execute("SELECT COUNT(*) FROM catalog_product").fetchone()[0]
            in_stock = conn.execute("SELECT COUNT(*) FROM catalog_product WHERE stock_status = 'in_stock' OR stock_status IS NULL OR stock_status = ''").fetchone()[0]
            bestsellers = conn.execute("SELECT COUNT(*) FROM catalog_product WHERE badge = 'bestseller'").fetchone()[0]
            deals = conn.execute("SELECT COUNT(*) FROM catalog_product WHERE original_price IS NOT NULL AND original_price > price").fetchone()[0]
            inquiries = conn.execute("SELECT COUNT(*) FROM catalog_ondemand_order WHERE status = 'Pending'").fetchone()[0]
            return {
                "total_products": total,
                "in_stock": in_stock,
                "bestsellers": bestsellers,
                "deals": deals,
                "inquiries": inquiries,
            }
    return await run_in_threadpool(fetch)


@app.get("/api/admin/products")
async def admin_list_products(response: Response, admin_user: dict = Depends(get_current_admin)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

    def fetch_all():
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT p.id, p.name, p.category, p.brand_id, p.description,
                       p.image_url, p.price, p.original_price, p.stock_status,
                       p.badge, p.warranty, p.product_url, p.display_order,
                       p.is_published, p.subtype, b.name AS brand_name
                FROM catalog_product p
                LEFT JOIN catalog_brand b ON p.brand_id = b.id
                ORDER BY p.id DESC
                """
            )
            items = []
            for row in cursor.fetchall():
                cat_val = row["category"]
                sub_val = (row["subtype"] or "").strip()
                sub_lower = sub_val.lower()
                price_val = float(row["price"]) if row["price"] is not None else None
                orig_price_val = float(row["original_price"]) if row["original_price"] is not None else None
                discount_pct = None
                savings = None
                if orig_price_val and price_val and orig_price_val > price_val:
                    discount_pct = round(((orig_price_val - price_val) / orig_price_val) * 100)
                    savings = round(orig_price_val - price_val, 2)
                items.append({
                    "id": row["id"],
                    "name": row["name"],
                    "category": cat_val,
                    "category_label": CATEGORY_LABELS.get(cat_val, cat_val.capitalize()),
                    "brand_id": row["brand_id"],
                    "brand": row["brand_name"] or "",
                    "description": row["description"] or "",
                    "image_url": row["image_url"] or "",
                    "price": price_val,
                    "original_price": orig_price_val,
                    "discount_pct": discount_pct,
                    "savings": savings,
                    "stock_status": row["stock_status"] or "in_stock",
                    "badge": row["badge"] or "",
                    "warranty": row["warranty"] or "",
                    "product_url": row["product_url"] or "",
                    "display_order": row["display_order"] or 0,
                    "is_published": bool(row["is_published"]),
                    "subtype": sub_val,
                    "is_usb": "usb" in sub_lower,
                    "is_wireless": "wireless" in sub_lower,
                    "is_combo": "combo" in sub_lower,
                })
            return items

    return {"products": await run_in_threadpool(fetch_all)}


@app.post("/api/products")
async def create_product(payload: ProductPayload, admin_user: dict = Depends(get_current_admin)):
    clean_image = normalize_image_url(payload.image_url)

    def insert():
        with get_db() as conn:
            cursor = conn.execute(
                """
                INSERT INTO catalog_product (
                    name, category, brand_id, description, image_url,
                    price, original_price, stock_status, badge, warranty,
                    product_url, display_order, is_published, subtype
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.name.strip(),
                    payload.category,
                    payload.brand_id,
                    (payload.description or "").strip(),
                    clean_image,
                    payload.price,
                    payload.original_price,
                    (payload.stock_status or "in_stock").strip(),
                    (payload.badge or "").strip(),
                    (payload.warranty or "").strip(),
                    (payload.product_url or "").strip(),
                    payload.display_order or 0,
                    1 if (payload.is_published is None or payload.is_published) else 0,
                    (payload.subtype or "").strip(),
                ),
            )
            return cursor.lastrowid

    prod_id = await run_in_threadpool(insert)
    await invalidate_cache(memory_cache.invalidate_products)
    return {"success": True, "id": prod_id, "message": "Product created successfully."}


@app.put("/api/products/{product_id}")
async def update_product(product_id: int, payload: ProductPayload, admin_user: dict = Depends(get_current_admin)):
    clean_image = normalize_image_url(payload.image_url)

    def update():
        with get_db() as conn:
            cursor = conn.execute(
                """
                UPDATE catalog_product SET
                    name = ?, category = ?, brand_id = ?, description = ?,
                    image_url = ?, price = ?, original_price = ?, stock_status = ?,
                    badge = ?, warranty = ?, product_url = ?, display_order = ?,
                    is_published = ?, subtype = ?
                WHERE id = ?
                """,
                (
                    payload.name.strip(),
                    payload.category,
                    payload.brand_id,
                    (payload.description or "").strip(),
                    clean_image,
                    payload.price,
                    payload.original_price,
                    (payload.stock_status or "in_stock").strip(),
                    (payload.badge or "").strip(),
                    (payload.warranty or "").strip(),
                    (payload.product_url or "").strip(),
                    payload.display_order or 0,
                    1 if (payload.is_published is None or payload.is_published) else 0,
                    (payload.subtype or "").strip(),
                    product_id,
                ),
            )
            return cursor.rowcount > 0

    success = await run_in_threadpool(update)
    if not success:
        raise HTTPException(status_code=404, detail="Product not found.")
    await invalidate_cache(memory_cache.invalidate_products)
    return {"success": True, "id": product_id, "message": "Product updated successfully."}


@app.delete("/api/products/{product_id}")
async def delete_product(product_id: int, admin_user: dict = Depends(get_current_admin)):
    def delete():
        with get_db() as conn:
            cursor = conn.execute("DELETE FROM catalog_product WHERE id = ?", (product_id,))
            return cursor.rowcount > 0

    success = await run_in_threadpool(delete)
    if not success:
        raise HTTPException(status_code=404, detail="Product not found.")
    await invalidate_cache(memory_cache.invalidate_products)
    return {"success": True, "message": "Product deleted successfully."}


@app.patch("/api/products/{product_id}/toggle")
async def toggle_product_published(product_id: int, admin_user: dict = Depends(get_current_admin)):
    def toggle():
        with get_db() as conn:
            cursor = conn.execute("SELECT is_published FROM catalog_product WHERE id = ?", (product_id,))
            row = cursor.fetchone()
            if not row:
                return None
            new_val = 0 if row["is_published"] else 1
            conn.execute("UPDATE catalog_product SET is_published = ? WHERE id = ?", (new_val, product_id))
            return bool(new_val)

    status_val = await run_in_threadpool(toggle)
    if status_val is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    await invalidate_cache(memory_cache.invalidate_products)
    return {"success": True, "is_published": status_val}


@app.patch("/api/products/{product_id}/toggle-stock")
async def toggle_product_stock(product_id: int, admin_user: dict = Depends(get_current_admin)):
    """Quick 1-click toggle for product in-stock vs out-of-stock from admin table."""
    def toggle():
        with get_db() as conn:
            cursor = conn.execute("SELECT stock_status FROM catalog_product WHERE id = ?", (product_id,))
            row = cursor.fetchone()
            if not row:
                return None
            curr = (row["stock_status"] or "in_stock").lower()
            new_val = "out_of_stock" if curr == "in_stock" else "in_stock"
            conn.execute("UPDATE catalog_product SET stock_status = ? WHERE id = ?", (new_val, product_id))
            return new_val

    status_val = await run_in_threadpool(toggle)
    if status_val is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    await invalidate_cache(memory_cache.invalidate_products)
    return {"success": True, "stock_status": status_val}


@app.patch("/api/products/{product_id}/toggle-bestseller")
async def toggle_product_bestseller(product_id: int, admin_user: dict = Depends(get_current_admin)):
    """Quick 1-click toggle for Best Seller selling badge from admin table."""
    def toggle():
        with get_db() as conn:
            cursor = conn.execute("SELECT badge FROM catalog_product WHERE id = ?", (product_id,))
            row = cursor.fetchone()
            if not row:
                return None
            curr = (row["badge"] or "").lower()
            new_val = "" if curr == "bestseller" else "bestseller"
            conn.execute("UPDATE catalog_product SET badge = ? WHERE id = ?", (new_val, product_id))
            return new_val

    badge_val = await run_in_threadpool(toggle)
    if badge_val is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    await invalidate_cache(memory_cache.invalidate_products)
    return {"success": True, "badge": badge_val}


# --- Admin Certificates Management ---
@app.get("/api/admin/certificates")
async def admin_list_certificates(response: Response, admin_user: dict = Depends(get_current_admin)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

    def fetch_all():
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT id, title, issuer, description, credential_id,
                       issued_on, expires_on, document_url, display_order, is_published
                FROM catalog_certificate
                ORDER BY display_order ASC, id DESC
                """
            )
            return [
                {
                    "id": r["id"],
                    "title": r["title"],
                    "issuer": r["issuer"] or "",
                    "description": r["description"] or "",
                    "credential_id": r["credential_id"] or "",
                    "issued_on": r["issued_on"],
                    "expires_on": r["expires_on"],
                    "document_url": r["document_url"] or "",
                    "display_order": r["display_order"] or 0,
                    "is_published": bool(r["is_published"]),
                }
                for r in cursor.fetchall()
            ]

    return {"certificates": await run_in_threadpool(fetch_all)}


@app.post("/api/certificates")
async def create_certificate(payload: CertificatePayload, admin_user: dict = Depends(get_current_admin)):
    clean_doc = normalize_image_url(payload.document_url)

    def insert():
        with get_db() as conn:
            cursor = conn.execute(
                """
                INSERT INTO catalog_certificate (
                    title, issuer, description, credential_id,
                    issued_on, expires_on, document_url, display_order, is_published
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.title.strip(),
                    (payload.issuer or "").strip(),
                    (payload.description or "").strip(),
                    (payload.credential_id or "").strip(),
                    payload.issued_on or None,
                    payload.expires_on or None,
                    clean_doc,
                    payload.display_order or 0,
                    1 if (payload.is_published is None or payload.is_published) else 0,
                ),
            )
            return cursor.lastrowid

    cert_id = await run_in_threadpool(insert)
    await invalidate_cache(memory_cache.invalidate_certificates)
    return {"success": True, "id": cert_id, "message": "Certificate added successfully."}


@app.put("/api/certificates/{cert_id}")
async def update_certificate(cert_id: int, payload: CertificatePayload, admin_user: dict = Depends(get_current_admin)):
    clean_doc = normalize_image_url(payload.document_url)

    def update():
        with get_db() as conn:
            cursor = conn.execute(
                """
                UPDATE catalog_certificate SET
                    title = ?, issuer = ?, description = ?, credential_id = ?,
                    issued_on = ?, expires_on = ?, document_url = ?,
                    display_order = ?, is_published = ?
                WHERE id = ?
                """,
                (
                    payload.title.strip(),
                    (payload.issuer or "").strip(),
                    (payload.description or "").strip(),
                    (payload.credential_id or "").strip(),
                    payload.issued_on or None,
                    payload.expires_on or None,
                    clean_doc,
                    payload.display_order or 0,
                    1 if (payload.is_published is None or payload.is_published) else 0,
                    cert_id,
                )
            )
            return cursor.rowcount > 0

    success = await run_in_threadpool(update)
    if not success:
        raise HTTPException(status_code=404, detail="Certificate not found.")
    await invalidate_cache(memory_cache.invalidate_certificates)
    return {"success": True, "id": cert_id, "message": "Certificate updated successfully."}


@app.delete("/api/certificates/{cert_id}")
async def delete_certificate(cert_id: int, admin_user: dict = Depends(get_current_admin)):
    def delete():
        with get_db() as conn:
            cursor = conn.execute("DELETE FROM catalog_certificate WHERE id = ?", (cert_id,))
            return cursor.rowcount > 0

    success = await run_in_threadpool(delete)
    if not success:
        raise HTTPException(status_code=404, detail="Certificate not found.")
    await invalidate_cache(memory_cache.invalidate_certificates)
    return {"success": True, "message": "Certificate deleted successfully."}


@app.patch("/api/certificates/{cert_id}/toggle")
async def toggle_certificate_published(cert_id: int, admin_user: dict = Depends(get_current_admin)):
    def toggle():
        with get_db() as conn:
            cursor = conn.execute("SELECT is_published FROM catalog_certificate WHERE id = ?", (cert_id,))
            row = cursor.fetchone()
            if not row:
                return None
            new_val = 0 if row["is_published"] else 1
            conn.execute("UPDATE catalog_certificate SET is_published = ? WHERE id = ?", (new_val, cert_id))
            return bool(new_val)

    status_val = await run_in_threadpool(toggle)
    if status_val is None:
        raise HTTPException(status_code=404, detail="Certificate not found.")
    await invalidate_cache(memory_cache.invalidate_certificates)
    return {"success": True, "is_published": status_val}


# --- Admin Brands Management ---
@app.get("/api/admin/brands")
async def admin_list_brands(response: Response, admin_user: dict = Depends(get_current_admin)):
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

    def fetch_all():
        with get_db() as conn:
            cursor = conn.execute(
                """
                SELECT id, name, summary, website_url, logo_url, display_order, is_published
                FROM catalog_brand
                ORDER BY name COLLATE NOCASE ASC
                """
            )
            return [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "summary": r["summary"] or "",
                    "website_url": r["website_url"] or "",
                    "logo_url": r["logo_url"] or "",
                    "display_order": r["display_order"] or 0,
                    "is_published": bool(r["is_published"]),
                }
                for r in cursor.fetchall()
            ]

    return {"brands": await run_in_threadpool(fetch_all)}


@app.post("/api/brands")
async def create_brand(payload: BrandPayload, admin_user: dict = Depends(get_current_admin)):
    clean_logo = normalize_image_url(payload.logo_url)

    def insert():
        with get_db() as conn:
            cursor = conn.execute(
                """
                INSERT INTO catalog_brand (
                    name, summary, website_url, logo_url, display_order, is_published
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    payload.name.strip(),
                    (payload.summary or "").strip(),
                    (payload.website_url or "").strip(),
                    clean_logo,
                    payload.display_order or 0,
                    1 if (payload.is_published is None or payload.is_published) else 0,
                ),
            )
            return cursor.lastrowid

    brand_id = await run_in_threadpool(insert)
    await invalidate_cache(memory_cache.invalidate_brands)
    return {"success": True, "id": brand_id, "message": "Brand added successfully."}


@app.put("/api/brands/{brand_id}")
async def update_brand(brand_id: int, payload: BrandPayload, admin_user: dict = Depends(get_current_admin)):
    clean_logo = normalize_image_url(payload.logo_url)

    def update():
        with get_db() as conn:
            cursor = conn.execute(
                """
                UPDATE catalog_brand SET
                    name = ?, summary = ?, website_url = ?, logo_url = ?,
                    display_order = ?, is_published = ?
                WHERE id = ?
                """,
                (
                    payload.name.strip(),
                    (payload.summary or "").strip(),
                    (payload.website_url or "").strip(),
                    clean_logo,
                    payload.display_order or 0,
                    1 if (payload.is_published is None or payload.is_published) else 0,
                    brand_id,
                )
            )
            return cursor.rowcount > 0

    success = await run_in_threadpool(update)
    if not success:
        raise HTTPException(status_code=404, detail="Brand not found.")
    await invalidate_cache(memory_cache.invalidate_brands)
    return {"success": True, "id": brand_id, "message": "Brand updated successfully."}


@app.delete("/api/brands/{brand_id}")
async def delete_brand(brand_id: int, admin_user: dict = Depends(get_current_admin)):
    def delete():
        with get_db() as conn:
            cursor = conn.execute("DELETE FROM catalog_brand WHERE id = ?", (brand_id,))
            return cursor.rowcount > 0

    success = await run_in_threadpool(delete)
    if not success:
        raise HTTPException(status_code=404, detail="Brand not found.")
    await invalidate_cache(memory_cache.invalidate_brands)
    return {"success": True, "message": "Brand deleted successfully."}


@app.patch("/api/brands/{brand_id}/toggle")
async def toggle_brand_published(brand_id: int, admin_user: dict = Depends(get_current_admin)):
    def toggle():
        with get_db() as conn:
            cursor = conn.execute("SELECT is_published FROM catalog_brand WHERE id = ?", (brand_id,))
            row = cursor.fetchone()
            if not row:
                return None
            new_val = 0 if row["is_published"] else 1
            conn.execute("UPDATE catalog_brand SET is_published = ? WHERE id = ?", (new_val, brand_id))
            return bool(new_val)

    status_val = await run_in_threadpool(toggle)
    if status_val is None:
        raise HTTPException(status_code=404, detail="Brand not found.")
    await invalidate_cache(memory_cache.invalidate_brands)
    return {"success": True, "is_published": status_val}


# ---------------------------------------------------------------------------
# Frontend Page Routes (Direct HTML delivery with HTTP caching)
# ---------------------------------------------------------------------------
HTML_CACHE_HEADERS = {"Cache-Control": "public, max-age=60"}


@app.get("/manifest.json")
async def manifest_file():
    return FileResponse(FRONTEND_DIR / "manifest.json", media_type="application/manifest+json")


@app.get("/logo.ico")
async def favicon_file():
    return FileResponse(FRONTEND_DIR / "logo.ico", media_type="image/x-icon")


@app.get("/admin")
@app.get("/admin/")
@app.get("/admin.html")
async def admin_page():
    return FileResponse(FRONTEND_DIR / "admin.html")


@app.api_route("/catalog", methods=["GET", "HEAD"])
@app.api_route("/catalog/", methods=["GET", "HEAD"])
@app.api_route("/catalog.html", methods=["GET", "HEAD"])
@app.api_route("/products", methods=["GET", "HEAD"])
async def catalog_page():
    return FileResponse(FRONTEND_DIR / "catalog.html", headers=HTML_CACHE_HEADERS)


@app.api_route("/onorder", methods=["GET", "HEAD"])
@app.api_route("/onorder/", methods=["GET", "HEAD"])
@app.api_route("/onorder.html", methods=["GET", "HEAD"])
@app.api_route("/on-demand", methods=["GET", "HEAD"])
@app.api_route("/ondemand", methods=["GET", "HEAD"])
async def onorder_page():
    return FileResponse(FRONTEND_DIR / "onorder.html", headers=HTML_CACHE_HEADERS)


@app.api_route("/services", methods=["GET", "HEAD"])
@app.api_route("/services/", methods=["GET", "HEAD"])
@app.api_route("/services.html", methods=["GET", "HEAD"])
@app.api_route("/repairs", methods=["GET", "HEAD"])
async def services_page():
    return FileResponse(FRONTEND_DIR / "services.html", headers=HTML_CACHE_HEADERS)


@app.api_route("/", methods=["GET", "HEAD"])
@app.api_route("/index.html", methods=["GET", "HEAD"])
@app.api_route("/index", methods=["GET", "HEAD"])
@app.api_route("/home", methods=["GET", "HEAD"])
async def homepage():
    return FileResponse(FRONTEND_DIR / "index.html", headers=HTML_CACHE_HEADERS)


@app.exception_handler(404)
async def custom_404_handler(request: Request, exc: Exception):
    """Fallback handler: Serves HTML files or homepage gracefully."""
    if request.url.path.startswith("/api/"):
        detail = getattr(exc, "detail", "API endpoint not found")
        return JSONResponse({"detail": detail}, status_code=404)
    clean_path = request.url.path.lstrip("/")
    file_path = FRONTEND_DIR / clean_path
    if clean_path and file_path.is_file():
        return FileResponse(file_path, headers=HTML_CACHE_HEADERS)
    return FileResponse(FRONTEND_DIR / "index.html", headers=HTML_CACHE_HEADERS)
