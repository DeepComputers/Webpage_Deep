// ============================================================================
// Deep Computers - On-Demand & Special Orders Logic
// ============================================================================

const API_ENDPOINT = '/api/onorder/products';
const SUBMIT_ENDPOINT = '/api/onorder';
const DEFAULT_WHATSAPP = '919927079209';

let allProducts = [];
let activeBrand = 'all';
let activeCategory = 'all';
let currentSearch = '';
let selectedProduct = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  initDrawer();
  fetchProducts();
  setupEventListeners();
});

// Mobile Drawer Handler
function initDrawer() {
  const toggleBtn = document.getElementById('mobile-menu-toggle');
  const drawer = document.getElementById('mobile-drawer');
  const closeBtn = document.getElementById('drawer-close-btn');
  const backdrop = document.getElementById('drawer-backdrop');

  if (!toggleBtn || !drawer) return;

  const openDrawer = () => { drawer.removeAttribute('hidden'); };
  const closeDrawer = () => { drawer.setAttribute('hidden', ''); };

  toggleBtn.addEventListener('click', openDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);
}

// Fetch On-Demand Products from API (with automatic static data fallback)
async function fetchProducts() {
  const grid = document.getElementById('onorder-grid');
  try {
    let res = await fetch(API_ENDPOINT).catch(() => null);
    if (!res || !res.ok) {
      res = await fetch('/assets/data/onorder_products.json');
    }
    const data = await res.json();
    allProducts = data.products || [];

    renderFilterChips(data.brands || [], data.categories || []);
    renderProducts(allProducts);
  } catch (err) {
    console.error('Error fetching on-demand products:', err);
    if (grid) {
      grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px; background: #fff; border-radius: 16px;">
          <p style="color: #ef4444; font-weight: 700;">Could not load products. Please check connection.</p>
          <a href="https://wa.me/${DEFAULT_WHATSAPP}?text=Hello%20Deep%20Computers%2C%20I%20want%20to%20order%20a%20product%20on%20demand" target="_blank" class="btn-order-wa" style="display:inline-flex; width:auto; margin-top:12px;">💬 Inquire on WhatsApp directly</a>
        </div>
      `;
    }
  }
}

// Render Brand & Category Chips
function renderFilterChips(brands, categories) {
  const brandContainer = document.getElementById('brand-chips');
  const catContainer = document.getElementById('category-chips');

  if (brandContainer && brands.length) {
    brandContainer.innerHTML = `
      <button class="onorder-chip active" data-brand="all">All Brands (${allProducts.length})</button>
      ${brands.map(b => `<button class="onorder-chip" data-brand="${b}">${b}</button>`).join('')}
    `;

    brandContainer.querySelectorAll('.onorder-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        brandContainer.querySelectorAll('.onorder-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        activeBrand = btn.dataset.brand;
        applyFilters();
      });
    });
  }

  if (catContainer && categories.length) {
    catContainer.innerHTML = `
      <button class="onorder-chip active" data-cat="all">All Categories</button>
      ${categories.map(c => `<button class="onorder-chip" data-cat="${c}">${c}</button>`).join('')}
    `;

    catContainer.querySelectorAll('.onorder-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        catContainer.querySelectorAll('.onorder-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        activeCategory = btn.dataset.cat;
        applyFilters();
      });
    });
  }
}

// Apply Filters & Search
function applyFilters() {
  let filtered = allProducts;

  if (activeBrand !== 'all') {
    filtered = filtered.filter(p => p.brand.toLowerCase() === activeBrand.toLowerCase());
  }

  if (activeCategory !== 'all') {
    filtered = filtered.filter(p => p.category.toLowerCase().includes(activeCategory.toLowerCase()));
  }

  if (currentSearch) {
    const s = currentSearch.toLowerCase();
    filtered = filtered.filter(p =>
      p.name.toLowerCase().includes(s) ||
      p.brand.toLowerCase().includes(s) ||
      p.specs.toLowerCase().includes(s) ||
      p.category.toLowerCase().includes(s)
    );
  }

  renderProducts(filtered);
}

// Render Products Grid
function renderProducts(products) {
  const grid = document.getElementById('onorder-grid');
  const countBadge = document.getElementById('product-count');
  if (countBadge) countBadge.textContent = `${products.length} Products`;

  if (!grid) return;

  if (!products.length) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px; background: #fff; border-radius: 16px; border: 1px dashed #cbd5e1;">
        <span style="font-size: 36px; display: block; margin-bottom: 8px;">🔍</span>
        <h3 style="margin: 0 0 8px; color: #0f172a;">No exact matching product found</h3>
        <p style="color: #64748b; margin: 0 0 16px; font-size: 14px;">We can source any custom model or specification on demand directly from our distributor network!</p>
        <button type="button" class="btn-custom-request" onclick="openOrderModal(null)">⚡ Request Custom Model on WhatsApp</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(p => `
    <article class="onorder-card" data-id="${p.id}">
      <div class="onorder-card-media">
        <img src="${p.image_url}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src=getFallbackSVG('${p.brand}', '${p.category}');">
        <div class="onorder-badge-row">
          <span class="onorder-brand-tag">${p.brand} Authorized</span>
          <span class="onorder-eta-tag">⏱️ ${p.eta || '24–48h on Demand'}</span>
        </div>
      </div>
      <div class="onorder-card-body">
        <span class="onorder-cat-tag">${p.category}</span>
        <h3 class="onorder-card-title">${p.name}</h3>
        <div class="onorder-specs-list">${formatSpecs(p.specs)}</div>
        <div class="onorder-price-box">
          <span class="onorder-price-label">
            <span>💬 Price:</span> Quoted via WhatsApp
          </span>
          <span class="onorder-price-badge">Best Distributor Quote</span>
        </div>
        <button type="button" class="btn-order-wa" onclick="openOrderModal(${p.id})">
          <span>💬</span> Inquire &amp; Order on WhatsApp
        </button>
      </div>
    </article>
  `).join('');
}

// Fallback high-res SVG generator for offline or error states
function getFallbackSVG(brand, category) {
  const iconMap = {
    'Laptops': '💻',
    'Desktops & Displays': '🖥️',
    'CCTV & Security': '📹',
    'Printers & Imaging': '🖨️',
    'Storage': '💾',
    'RAM': '🧠',
    'Storage & RAM': '💾',
    'Networking & WiFi': '🌐',
    'Peripherals & Audio': '⌨️'
  };
  const icon = iconMap[category] || '⚡';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240"><rect width="100%" height="100%" fill="#f8fafc"/><rect x="16" y="16" width="368" height="208" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/><text x="50%" y="40%" dominant-baseline="middle" text-anchor="middle" font-size="48">${icon}</text><text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="16" font-weight="800" fill="#0f172a">${brand}</text><text x="50%" y="78%" dominant-baseline="middle" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif" font-size="11" font-weight="700" fill="#0284c7" letter-spacing="1">AUTHENTIC ON-DEMAND</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Helper: Format bullet specs cleanly
function formatSpecs(specs) {
  if (!specs) return '';
  return specs.split('·').map(s => s.trim()).filter(Boolean).map(s => `<div>• ${s}</div>`).join('');
}

// Setup Event Listeners
function setupEventListeners() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.trim();
      applyFilters();
    });
  }

  // Modal close handlers
  const modalBackdrop = document.getElementById('order-modal');
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn && modalBackdrop) {
    closeBtn.addEventListener('click', () => modalBackdrop.setAttribute('hidden', ''));
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) modalBackdrop.setAttribute('hidden', '');
    });
  }

  // Live WhatsApp preview updates
  ['cust-name', 'cust-phone', 'cust-notes', 'cust-prod-name', 'cust-brand'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateWhatsAppPreview);
  });

  // Modal Form Submission
  const orderForm = document.getElementById('onorder-form');
  if (orderForm) {
    orderForm.addEventListener('submit', handleOrderSubmit);
  }
}

// Open Order Modal (Pre-fills if product passed, or blank for custom demand)
window.openOrderModal = function(productId) {
  const modal = document.getElementById('order-modal');
  if (!modal) return;

  const prodSummary = document.getElementById('modal-prod-summary');
  const prodTitleInput = document.getElementById('cust-prod-name');
  const brandInput = document.getElementById('cust-brand');

  if (productId) {
    selectedProduct = allProducts.find(p => p.id === productId);
  } else {
    selectedProduct = null;
  }

  if (selectedProduct) {
    prodSummary.removeAttribute('hidden');
    document.getElementById('modal-prod-title').textContent = selectedProduct.name;
    document.getElementById('modal-prod-brand').textContent = `Brand: ${selectedProduct.brand}`;
    document.getElementById('modal-prod-eta').textContent = `ETA: ${selectedProduct.eta}`;

    if (prodTitleInput) prodTitleInput.value = selectedProduct.name;
    if (brandInput) brandInput.value = selectedProduct.brand;
  } else {
    prodSummary.setAttribute('hidden', '');
    if (prodTitleInput) prodTitleInput.value = '';
    if (brandInput) brandInput.value = '';
  }

  updateWhatsAppPreview();
  modal.removeAttribute('hidden');
};

// Live WhatsApp Preview Generator
function updateWhatsAppPreview() {
  const name = (document.getElementById('cust-name')?.value || '').trim() || '[Your Name]';
  const phone = (document.getElementById('cust-phone')?.value || '').trim() || '[Your Mobile]';
  const prod = (document.getElementById('cust-prod-name')?.value || '').trim() || (selectedProduct ? selectedProduct.name : '[Product Model / Name]');
  const brand = (document.getElementById('cust-brand')?.value || '').trim() || (selectedProduct ? selectedProduct.brand : '');
  const notes = (document.getElementById('cust-notes')?.value || '').trim();

  let previewText = `Hello Deep Computers Team! 🛍️\nI would like to place an *On-Demand Order*:\n\n` +
    `📌 *Product:* ${prod}\n` +
    (brand ? `🏷️ *Brand:* ${brand}\n` : '') +
    `👤 *Customer:* ${name}\n` +
    `📱 *Phone:* ${phone}\n` +
    (notes ? `📝 *Custom Specs:* ${notes}\n` : '') +
    `\nPlease share the best price quotation and estimated arrival time on WhatsApp. Thank you!`;

  const previewBox = document.getElementById('wa-preview-text');
  if (previewBox) {
    previewBox.textContent = previewText;
  }
}

// Handle Order Form Submission
async function handleOrderSubmit(e) {
  e.preventDefault();
  const submitBtn = document.getElementById('btn-submit-order');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> Preparing WhatsApp...';
  }

  const name = document.getElementById('cust-name').value.trim();
  const phone = document.getElementById('cust-phone').value.trim();
  const productTitle = document.getElementById('cust-prod-name').value.trim();
  const brand = document.getElementById('cust-brand').value.trim() || (selectedProduct ? selectedProduct.brand : '');
  const notes = document.getElementById('cust-notes').value.trim();

  const payload = {
    customer_name: name,
    phone: phone,
    product_title: productTitle,
    brand: brand,
    category: selectedProduct ? selectedProduct.category : 'Custom On-Demand',
    notes: notes,
  };

  try {
    const res = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.success && data.whatsapp_url) {
      // Open WhatsApp directly in new tab or app
      window.open(data.whatsapp_url, '_blank');
      const modal = document.getElementById('order-modal');
      if (modal) modal.setAttribute('hidden', '');
      alert('Thank you! WhatsApp has been opened with your inquiry. Deep Computers will reply promptly with your price quote.');
    } else {
      fallbackWhatsApp(payload);
    }
  } catch (err) {
    console.warn('API error, falling back to direct WhatsApp launch:', err);
    fallbackWhatsApp(payload);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>💬</span> Confirm &amp; Send on WhatsApp';
    }
  }
}

// Fallback WhatsApp direct launcher if offline
function fallbackWhatsApp(payload) {
  const msg = `Hello Deep Computers Team! 🛍️\nI would like to place an *On-Demand Order*:\n\n` +
    `📌 *Product:* ${payload.product_title}\n` +
    (payload.brand ? `🏷️ *Brand:* ${payload.brand}\n` : '') +
    `👤 *Customer:* ${payload.customer_name}\n` +
    `📱 *Phone:* ${payload.phone}\n` +
    (payload.notes ? `📝 *Details:* ${payload.notes}\n` : '') +
    `\nPlease share the best price quotation and estimated arrival time on WhatsApp. Thank you!`;

  const url = `https://wa.me/${DEFAULT_WHATSAPP}?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
  const modal = document.getElementById('order-modal');
  if (modal) modal.setAttribute('hidden', '');
}
