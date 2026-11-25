import sqlite3

conn = sqlite3.connect('database/db.sqlite3')
cur = conn.cursor()

# 1. Add G&G brand if not present
cur.execute("SELECT id FROM catalog_brand WHERE lower(name) = 'g&g'")
row = cur.fetchone()
if not row:
    cur.execute('''
        INSERT INTO catalog_brand (name, summary, website_url, logo_url, display_order, is_published)
        VALUES ('G&G', 'High-quality compatible laser toner cartridges and imaging consumables', 'https://www.ggimage.com/', '', 0, 1)
    ''')
    gng_id = cur.lastrowid
    print('Added G&G brand with ID:', gng_id)
else:
    gng_id = row[0]

# Brand IDs
brand_map = {
    'gng': gng_id,
    'lapcare': 9,
    'zebronics': 28,
    'prodot': 46,
    'geonix': 41,
    'hp': 2,
    'dell': 1,
    'lenovo': 3,
}

products_update = [
    {
        'id': 191,
        'name': 'G&G 88A (CC388A) Compatible Laser Toner Cartridge',
        'category': 'ink',
        'brand_id': brand_map['gng'],
        'price': 600,
        'original_price': 999,
        'image_url': '/assets/uploads/products/gng_88a_toner.jpeg',
        'description': 'G&G 88A (CC388A) High-Yield Black Laser Toner Cartridge. High page yield up to 1,500 pages with dark, crisp laser printing. Compatible with HP LaserJet P1007, P1008, P1106, P1108, M1136, M1213nf, M1216nfh, M1218nfs, and Canon LBP6030/6018 printers.',
        'subtype': 'Laser Toner Cartridge',
        'warranty': '1 Year Replacement Warranty'
    },
    {
        'id': 192,
        'name': 'G&G 12A (Q2612A) Compatible Laser Toner Cartridge',
        'category': 'ink',
        'brand_id': brand_map['gng'],
        'price': 650,
        'original_price': 999,
        'image_url': '/assets/uploads/products/gng_12a_toner.jpeg',
        'description': 'G&G 12A (Q2612A) High-Quality Black Laser Toner Cartridge. Delivers sharp, smudge-free text and rich monochrome graphics. Standard page yield up to 2,000 pages at 5% coverage. 100% compatible with HP LaserJet 1010, 1012, 1015, 1018, 1020, 1020 Plus, 1022, 3015, 3020, 3030, 3050, M1005 MFP, M1319f MFP, and Canon LBP2900B / 3000.',
        'subtype': 'Laser Toner Cartridge',
        'warranty': '1 Year Replacement Warranty'
    },
    {
        'id': 193,
        'name': 'Lapcare L-50 Optical USB Wired Mouse',
        'category': 'accessories',
        'brand_id': brand_map['lapcare'],
        'price': 150,
        'original_price': 269,
        'image_url': '/assets/uploads/products/lapcare_l50_mouse.jpeg',
        'description': 'Lapcare L-50 USB Optical Wired Mouse. Features 1000 DPI high-precision optical tracking sensor, ergonomic ambidextrous design, durable click buttons rated for 3+ million clicks, and smooth plug-and-play USB connectivity for laptops and desktop PCs.',
        'subtype': 'Mouse',
        'warranty': '1 Year Official Brand Warranty'
    },
    {
        'id': 194,
        'name': 'Zebronics Comfort+ 1200 DPI Optical USB Wired Mouse',
        'category': 'accessories',
        'brand_id': brand_map['zebronics'],
        'price': 150,
        'original_price': 299,
        'image_url': '/assets/uploads/products/zebronics_comfort_mouse.jpeg',
        'description': 'Zebronics Comfort+ USB Optical Mouse. Equipped with a 1200 DPI precision optical tracking sensor for smooth and responsive cursor control. Ergonomic compact shape suitable for both left and right hands with instant plug-and-play USB connection.',
        'subtype': 'Mouse',
        'warranty': '1 Year Official Brand Warranty'
    },
    {
        'id': 195,
        'name': 'Prodot Pro-253 Optical USB Wired Mouse',
        'category': 'accessories',
        'brand_id': brand_map['prodot'],
        'price': 150,
        'original_price': 260,
        'image_url': '/assets/uploads/products/prodot_253_mouse.jpeg',
        'description': 'Prodot Pro-253 (P-253) High-Precision Optical USB Wired Mouse. Designed for daily office, home, and commercial computing with 1000 DPI accurate optical tracking, comfortable contoured grip, and long-life micro switches with 5 million click durability.',
        'subtype': 'Mouse',
        'warranty': '1 Year Replacement Warranty'
    },
    {
        'id': 196,
        'name': 'Geonix GXBM-01 High-Precision USB Wired Mouse',
        'category': 'accessories',
        'brand_id': brand_map['geonix'],
        'price': 150,
        'original_price': 299,
        'image_url': '/assets/uploads/products/geonix_gxbm01_mouse.jpeg',
        'description': 'Geonix GXBM-01 Optical USB Wired Mouse. Features 1000 DPI optical sensor, comfortable ergonomic grip for all-day productivity, durable non-slip scroll wheel, and tangle-free flexible USB cable with plug-and-play compatibility on Windows, Mac, and Linux.',
        'subtype': 'Mouse',
        'warranty': '1 Year Official Brand Warranty'
    },
    {
        'id': 197,
        'name': 'HP M10 G2 Optical USB Wired Mouse',
        'category': 'accessories',
        'brand_id': brand_map['hp'],
        'price': 249,
        'original_price': 499,
        'image_url': '/assets/uploads/products/hp_m10_g2_mouse.jpeg',
        'description': 'HP M10 G2 Optical Wired USB Mouse. Features 1000 DPI optical tracking sensor for precise cursor movement, comfortable contoured shape designed for either hand, smooth scrolling wheel, and plug-and-play USB connectivity for reliable daily performance.',
        'subtype': 'Mouse',
        'warranty': '1 Year Official Brand Warranty'
    },
    {
        'id': 198,
        'name': 'Dell WM118 Wireless Optical Mouse',
        'category': 'accessories',
        'brand_id': brand_map['dell'],
        'price': 599,
        'original_price': 1300,
        'image_url': '/assets/uploads/products/dell_wm118_mouse.jpeg',
        'description': 'Dell WM118 Wireless Optical Mouse with 2.4GHz plug-and-play USB nano receiver. Features 1000 DPI optical LED tracking, long battery life up to 12 months on a single AA battery, and comfortable curved contoured design for seamless everyday computing.',
        'subtype': 'Wireless Mouse',
        'warranty': '1 Year Official Brand Warranty'
    },
    {
        'id': 199,
        'name': 'Lenovo 210 Wireless Optical Mouse',
        'category': 'accessories',
        'brand_id': brand_map['lenovo'],
        'price': 549,
        'original_price': 999,
        'image_url': '/assets/uploads/products/lenovo_210_mouse.jpeg',
        'description': 'Lenovo 210 Wireless Optical Mouse (Model: GX30L66303). Features reliable 2.4GHz wireless connection with micro USB receiver, 1200 DPI precise optical sensor, up to 12 months battery life, and ambidextrous compact design for comfortable desktop and travel use.',
        'subtype': 'Wireless Mouse',
        'warranty': '1 Year Official Brand Warranty'
    },
]

for p in products_update:
    cur.execute('''
        UPDATE catalog_product
        SET name = :name,
            category = :category,
            brand_id = :brand_id,
            price = :price,
            original_price = :original_price,
            image_url = :image_url,
            description = :description,
            subtype = :subtype,
            warranty = :warranty
        WHERE id = :id
    ''', p)
    print(f"Updated product {p['id']}: {p['name']}")

conn.commit()
print('All 9 products updated successfully!')
