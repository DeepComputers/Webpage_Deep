import sqlite3
import logging
from contextlib import contextmanager
from backend.config import DB_PATH

logger = logging.getLogger("deep_computers.database")


@contextmanager
def get_db():
    """Provides a thread-safe SQLite connection in WAL mode with Row factory."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Initializes tables, indexes, and performance PRAGMAs."""
    with get_db() as conn:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA cache_size=-64000;")  # 64MB cache

        # Brand Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS catalog_brand (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(120) UNIQUE NOT NULL,
                summary VARCHAR(240) DEFAULT '',
                website_url VARCHAR(200) DEFAULT '',
                logo_url VARCHAR(200) DEFAULT '',
                display_order INTEGER DEFAULT 0,
                is_published BOOLEAN DEFAULT 1
            );
        """)

        # Product Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS catalog_product (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(160) NOT NULL,
                category VARCHAR(20) NOT NULL,
                brand_id INTEGER NULL,
                description TEXT DEFAULT '',
                image_url VARCHAR(200) DEFAULT '',
                price DECIMAL(10, 2) NULL,
                product_url VARCHAR(200) DEFAULT '',
                display_order INTEGER DEFAULT 0,
                is_published BOOLEAN DEFAULT 1,
                subtype VARCHAR(100) DEFAULT '',
                FOREIGN KEY (brand_id) REFERENCES catalog_brand(id) ON DELETE SET NULL
            );
        """)

        # Certificate Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS catalog_certificate (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title VARCHAR(160) NOT NULL,
                issuer VARCHAR(120) DEFAULT '',
                description TEXT DEFAULT '',
                credential_id VARCHAR(120) DEFAULT '',
                issued_on DATE NULL,
                expires_on DATE NULL,
                document_url VARCHAR(200) DEFAULT '',
                display_order INTEGER DEFAULT 0,
                is_published BOOLEAN DEFAULT 1
            );
        """)

        # On-Demand / On-Order Product Catalog Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS catalog_ondemand_product (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(200) NOT NULL,
                brand VARCHAR(60) NOT NULL,
                category VARCHAR(60) NOT NULL,
                specs TEXT NOT NULL,
                eta VARCHAR(60) NOT NULL DEFAULT '24-48 Hours',
                image_url VARCHAR(500) NOT NULL,
                is_featured BOOLEAN NOT NULL DEFAULT 0,
                display_order INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Customer On-Demand Orders Inquiry Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS catalog_ondemand_order (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_name VARCHAR(120) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                product_title VARCHAR(200) NOT NULL,
                brand VARCHAR(60) DEFAULT '',
                category VARCHAR(60) DEFAULT '',
                notes TEXT DEFAULT '',
                status VARCHAR(30) DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Admin Access Request Audit Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS catalog_firebaseadminaccessrequest (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email VARCHAR(254) NOT NULL,
                requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(20) DEFAULT 'pending'
            );
        """)

        # Indexes for Sub-Millisecond Filtering
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prod_pub_cat ON catalog_product(is_published, category);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_brand_pub ON catalog_brand(is_published);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_cert_pub ON catalog_certificate(is_published);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ondemand_disp ON catalog_ondemand_product(display_order);")

        # Column Migration Guard for new selling features
        columns = [row[1] for row in conn.execute("PRAGMA table_info(catalog_product);").fetchall()]
        if "subtype" not in columns:
            conn.execute("ALTER TABLE catalog_product ADD COLUMN subtype VARCHAR(100) DEFAULT '';")
        if "original_price" not in columns:
            conn.execute("ALTER TABLE catalog_product ADD COLUMN original_price DECIMAL(10, 2) NULL;")
        if "stock_status" not in columns:
            conn.execute("ALTER TABLE catalog_product ADD COLUMN stock_status VARCHAR(30) DEFAULT 'in_stock';")
        if "badge" not in columns:
            conn.execute("ALTER TABLE catalog_product ADD COLUMN badge VARCHAR(40) DEFAULT '';")
        if "warranty" not in columns:
            conn.execute("ALTER TABLE catalog_product ADD COLUMN warranty VARCHAR(80) DEFAULT '';")

        # Starter Brands Seed if Empty
        count = conn.execute("SELECT COUNT(*) FROM catalog_brand;").fetchone()[0]
        if count == 0:
            starter_brands = [
                ("Dell", "Laptops and business computing", "https://www.dell.com/", 1),
                ("HP", "Laptops, desktops and printing solutions", "https://www.hp.com/", 2),
                ("Lenovo", "Business laptops and PC hardware", "https://www.lenovo.com/", 3),
                ("ASUS", "Laptops, motherboards and accessories", "https://www.asus.com/", 4),
                ("Acer", "Desktops, laptops and monitors", "https://www.acer.com/", 5),
                ("CP Plus", "CCTV and security cameras", "https://www.cpplusworld.com/", 6),
                ("Hikvision", "Security and surveillance technology", "https://www.hikvision.com/", 7),
                ("Dahua", "Smart surveillance solutions", "https://www.dahuasecurity.com/", 8),
                ("D-Link", "Networking routers and enterprise switches", "https://www.dlink.com/", 9),
                ("TP-Link", "Wi-Fi networking devices", "https://www.tp-link.com/", 10),
                ("Logitech", "Peripherals and accessories", "https://www.logitech.com/", 11),
                ("Lapcare", "Laptop batteries, adapters and parts", "https://www.lapcare.com/", 12),
            ]
            conn.executemany(
                "INSERT OR IGNORE INTO catalog_brand (name, summary, website_url, display_order, is_published) VALUES (?, ?, ?, ?, 1);",
                starter_brands,
            )
