import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// Initialize Firebase client
const app = initializeApp(firebaseConfig, "admin-app");
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// App State
let currentUser = null;
let currentToken = null;
let currentTab = "products";

let productsList = [];
let certificatesList = [];
let brandsList = [];
let ondemandList = [];

function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// DOM Elements
const authSection = document.getElementById("auth-section");
const dashboardSection = document.getElementById("dashboard-section");
const userPill = document.getElementById("admin-user-pill");
const userEmailSpan = document.getElementById("admin-user-email");
const adminAlert = document.getElementById("admin-alert");

// UI Notification Helper (Toast Notification without jumping/scrolling to top)
let alertTimeout = null;
function showAlert(message, type = "success") {
  if (!adminAlert) return;
  adminAlert.textContent = message;
  adminAlert.className = `admin-alert alert-${type}`;
  adminAlert.hidden = false;
  adminAlert.style.display = "block";
  if (alertTimeout) clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => {
    adminAlert.hidden = true;
    adminAlert.style.display = "none";
  }, 4000);
}

// INR Currency Formatter
function formatINR(val) {
  if (val === null || val === undefined || isNaN(val)) return "—";
  return "₹" + Number(val).toLocaleString("en-IN");
}

// ---------------------------------------------------------------------------
// Robust Modal Open / Close Helpers
// ---------------------------------------------------------------------------
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add("is-open");
  modal.style.display = "flex";
  modal.hidden = false;
  modal.removeAttribute("hidden");
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.style.display = "none";
  modal.hidden = true;
  modal.setAttribute("hidden", "");
}

// ---------------------------------------------------------------------------
// Auth State Listener
// ---------------------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    try {
      currentToken = await user.getIdToken();
    } catch (e) {
      console.error("Token error:", e);
    }
    sessionStorage.removeItem("dc_admin_token");

    authSection.hidden = true;
    authSection.style.display = "none";
    dashboardSection.hidden = false;
    dashboardSection.style.display = "block";
    userPill.hidden = false;
    userPill.style.display = "flex";
    userEmailSpan.textContent = user.email || user.displayName || "Admin";

    // Load dashboard data
    loadAllData();
  } else {
    currentUser = null;
    currentToken = null;
    authSection.hidden = false;
    authSection.style.display = "flex";
    dashboardSection.hidden = true;
    dashboardSection.style.display = "none";
    userPill.hidden = true;
    userPill.style.display = "none";
  }
});

// Helper for authenticated requests (Fast in-memory token, supports JSON and FormData)
async function authFetch(url, options = {}) {
  if (!currentToken && currentUser) {
    try {
      currentToken = await currentUser.getIdToken(false);
    } catch (e) {
      console.warn("Could not get token:", e);
    }
  }

  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(currentToken ? { "Authorization": `Bearer ${currentToken}` } : {}),
    ...(options.headers || {})
  };

  let response = await fetch(url, { ...options, headers });
  if (response.status === 401 && currentUser) {
    try {
      currentToken = await currentUser.getIdToken(true);
      if (currentToken) headers["Authorization"] = `Bearer ${currentToken}`;
      response = await fetch(url, { ...options, headers });
    } catch (e) {
      showAlert("Session expired. Please sign in again.", "danger");
      await signOut(auth);
      throw new Error("Unauthorized");
    }
  }
  return response;
}

// ---------------------------------------------------------------------------
// Login & Logout Handlers
// ---------------------------------------------------------------------------
const btnGoogle = document.getElementById("btn-google-login");
if (btnGoogle) {
  btnGoogle.addEventListener("click", async () => {
    try {
      btnGoogle.disabled = true;
      await signInWithPopup(auth, googleProvider);
      showAlert("Successfully signed in with Google!", "success");
    } catch (err) {
      console.error(err);
      showAlert(err.message || "Google sign-in failed.", "danger");
    } finally {
      btnGoogle.disabled = false;
    }
  });
}

const formEmail = document.getElementById("email-auth-form");
const btnEmailSubmit = document.getElementById("btn-email-submit");
const adminEmailInput = document.getElementById("admin-email");
const adminPasswordInput = document.getElementById("admin-password");

// Ensure credentials are never pre-filled or retained on login screen
if (adminEmailInput) adminEmailInput.value = "";
if (adminPasswordInput) adminPasswordInput.value = "";

if (formEmail) {
  formEmail.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (adminEmailInput?.value || "").trim();
    const password = adminPasswordInput?.value || "";

    btnEmailSubmit.disabled = true;
    btnEmailSubmit.textContent = "Signing in...";

    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (adminPasswordInput) adminPasswordInput.value = "";
      showAlert("Signed in successfully!", "success");
    } catch (err) {
      console.error(err);
      showAlert(err.message || "Email authentication failed.", "danger");
    } finally {
      btnEmailSubmit.disabled = false;
      btnEmailSubmit.textContent = "Sign in to Admin";
    }
  });
}

const btnSignout = document.getElementById("btn-signout");
if (btnSignout) {
  btnSignout.addEventListener("click", async () => {
    sessionStorage.removeItem("dc_admin_token");
    currentToken = null;
    currentUser = null;
    if (adminEmailInput) adminEmailInput.value = "";
    if (adminPasswordInput) adminPasswordInput.value = "";
    try {
      await signOut(auth);
    } catch (e) {}
    authSection.hidden = false;
    authSection.style.display = "flex";
    dashboardSection.hidden = true;
    dashboardSection.style.display = "none";
    userPill.hidden = true;
    userPill.style.display = "none";
    showAlert("Signed out successfully.", "info");
  });
}

// ---------------------------------------------------------------------------
// Tab Navigation
// ---------------------------------------------------------------------------
const tabBtns = document.querySelectorAll(".tab-btn");
tabBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    tabBtns.forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    const content = document.getElementById(`tab-content-${currentTab}`);
    if (content) content.classList.add("active");
  });
});

// ---------------------------------------------------------------------------
// Data Loading & Management
// ---------------------------------------------------------------------------
async function loadAllData() {
  await Promise.allSettled([loadBrands(), loadCertificates(), loadProducts(), loadOnDemand()]);
  updateAdminKPIs();
}

// --- ON-DEMAND INQUIRIES & ORDERS ---
async function loadOnDemand(preserveScroll = true) {
  const scrollY = preserveScroll ? window.scrollY : 0;
  const tbody = document.getElementById("ondemand-tbody");
  try {
    const res = await authFetch("/api/admin/onorder");
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    ondemandList = Array.isArray(data.orders) ? data.orders : [];

    const countElem = document.getElementById("count-ondemand");
    if (countElem) countElem.textContent = ondemandList.length;
    updateAdminKPIs();
    renderOnDemandTable();
    if (preserveScroll && scrollY > 0) {
      window.scrollTo({ top: scrollY, behavior: "instant" });
    }
  } catch (err) {
    console.error("loadOnDemand error:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="text-danger py-4">Error loading inquiries: ${err.message}</td></tr>`;
  }
}

function renderOnDemandTable() {
  const tbody = document.getElementById("ondemand-tbody");
  if (!tbody) return;

  if (ondemandList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">No on-demand inquiries received yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = ondemandList.map(order => {
    const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
    }) : "—";

    const cleanPhone = (order.phone || "").replace(/[^0-9]/g, "");
    const waPhone = cleanPhone.length === 10 ? "91" + cleanPhone : cleanPhone;
    const waText = encodeURIComponent(`Namaste ${order.customer_name}! This is Deep Computers & Telecom regarding your On-Demand Inquiry #ORD-${order.id} for "${order.product_title}". Here is your price quotation:`);
    const waLink = `https://wa.me/${waPhone}?text=${waText}`;

    const statusColors = {
      "Pending WhatsApp": "#d97706",
      "Quoted": "#2563eb",
      "Confirmed": "#16a34a",
      "Delivered": "#059669",
      "Cancelled": "#dc2626"
    };
    const curColor = statusColors[order.status] || "#64748b";

    return `
      <tr>
        <td style="font-weight: 700; color: #0284c7;">#ORD-${order.id}</td>
        <td>
          <div style="font-weight: 600; color: #0f172a;">${escapeHTML(order.product_title || "Custom Demand")}</div>
          <small style="color: #64748b;">${escapeHTML(order.category || "")}</small>
        </td>
        <td><span class="badge-status badge-published" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${escapeHTML(order.brand || "—")}</span></td>
        <td style="font-weight: 600;">${escapeHTML(order.customer_name || "—")}</td>
        <td>
          <a href="tel:${escapeHTML(order.phone || "")}" style="color: #0284c7; text-decoration: none; font-weight: 600;">📞 ${escapeHTML(order.phone || "—")}</a>
        </td>
        <td style="max-width: 220px; font-size: 0.85rem; color: #475569; word-break: break-word;">
          ${escapeHTML(order.notes || "None")}
        </td>
        <td>
          <select onchange="window.adminApp.updateOnDemandStatus(${order.id}, this.value)" style="font-size: 0.8rem; font-weight: 600; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; color: ${curColor}; cursor: pointer; background: #fff;">
            <option value="Pending WhatsApp" ${order.status === "Pending WhatsApp" ? "selected" : ""}>Pending WhatsApp</option>
            <option value="Quoted" ${order.status === "Quoted" ? "selected" : ""}>Quoted</option>
            <option value="Confirmed" ${order.status === "Confirmed" ? "selected" : ""}>Confirmed</option>
            <option value="Delivered" ${order.status === "Delivered" ? "selected" : ""}>Delivered</option>
            <option value="Cancelled" ${order.status === "Cancelled" ? "selected" : ""}>Cancelled</option>
          </select>
        </td>
        <td style="font-size: 0.8rem; color: #64748b; white-space: nowrap;">${dateStr}</td>
        <td>
          <div style="display: flex; gap: 6px; align-items: center; white-space: nowrap;">
            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-action edit" style="display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px; background: #25d366; color: #ffffff; border-color: #25d366; text-decoration: none; font-weight: 700; border-radius: 6px; font-size: 0.8rem;">
              💬 WhatsApp
            </a>
            <button class="btn-action delete" type="button" onclick="window.adminApp.deleteOnDemand(${order.id})" title="Delete inquiry #ORD-${order.id}" style="padding: 6px 10px; font-size: 0.8rem; border-radius: 6px; background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; cursor: pointer;">
              🗑️ Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// --- BRANDS ---
async function loadBrands() {
  const tbody = document.getElementById("brands-tbody");
  try {
    const res = await authFetch("/api/admin/brands");
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    brandsList = Array.isArray(data.brands) ? data.brands : [];

    const countElem = document.getElementById("count-brands");
    if (countElem) countElem.textContent = brandsList.length;
    populateBrandDropdown();
    renderBrandsTable();
  } catch (err) {
    console.error("loadBrands error:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-danger py-4">Error loading brands.</td></tr>`;
  }
}

function populateBrandDropdown() {
  const select = document.getElementById("prod-brand");
  if (select) {
    const currentVal = select.value;
    select.innerHTML = '<option value="">No Brand Selected</option>' +
      brandsList.map(b => `<option value="${b.id}">${b.name}</option>`).join("");
    if (currentVal) select.value = currentVal;
  }

  const filterBrand = document.getElementById("filter-products-brand");
  if (filterBrand) {
    const currentVal = filterBrand.value;
    const brands = Array.from(new Set(brandsList.map(b => b.name))).sort();
    filterBrand.innerHTML = '<option value="All">All Brands</option>' +
      brands.map(name => `<option value="${name}">${name}</option>`).join("");
    if (currentVal) filterBrand.value = currentVal;
  }
}

function renderBrandsTable() {
  const tbody = document.getElementById("brands-tbody");
  if (!tbody) return;

  if (brandsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No brands created yet. Click "+ Add New Brand" to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = brandsList.map(b => `
    <tr>
      <td>
        ${b.logo_url ? `<img src="${b.logo_url}" class="admin-thumb" alt="${b.name}">` : `<div class="admin-thumb-empty">Logo</div>`}
      </td>
      <td><strong>${b.name}</strong></td>
      <td><span class="text-muted-xs">${b.summary || "—"}</span></td>
      <td>
        ${b.website_url ? `<a href="${b.website_url}" target="_blank" rel="noopener noreferrer" class="link-ext">Website ↗</a>` : "—"}
      </td>
      <td>
        <button type="button" class="badge-status ${b.is_published ? "badge-published" : "badge-hidden"}" onclick="window.adminApp.toggleBrand(${b.id})">
          ${b.is_published ? "Published" : "Hidden"}
        </button>
      </td>
      <td>
        <div class="row-actions">
          <button type="button" class="btn-action edit" onclick="window.adminApp.openEditBrand(${b.id})">Edit</button>
          <button type="button" class="btn-action delete" onclick="window.adminApp.deleteBrand(${b.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

// --- CERTIFICATES ---
async function loadCertificates() {
  const tbody = document.getElementById("certificates-tbody");
  try {
    const res = await authFetch("/api/admin/certificates");
    if (!res.ok) throw new Error("Failed to load certificates");
    const data = await res.json();
    certificatesList = data.certificates || [];

    document.getElementById("count-certificates").textContent = certificatesList.length;
    renderCertificatesTable();
  } catch (err) {
    console.error(err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-danger py-4">Error loading certificates.</td></tr>`;
  }
}

function renderCertificatesTable() {
  const tbody = document.getElementById("certificates-tbody");
  if (!tbody) return;

  if (certificatesList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No certificates created yet. Click "+ Add New Certificate" to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = certificatesList.map(c => `
    <tr>
      <td>
        <strong>${c.title}</strong>
        ${c.credential_id ? `<div class="text-muted-xs">ID: ${c.credential_id}</div>` : ""}
        ${c.document_url ? `<div style="margin-top:4px;"><a href="${c.document_url}" target="_blank" rel="noopener noreferrer" style="font-size:11px;font-weight:600;color:var(--primary, #0284c7);">📄 View Document ↗</a></div>` : ""}
      </td>
      <td>${c.issuer || "—"}</td>
      <td><code>${c.credential_id || "—"}</code></td>
      <td>
        <span class="text-muted-xs">
          ${c.issued_on || "—"} ${c.expires_on ? `to ${c.expires_on}` : ""}
        </span>
      </td>
      <td>${c.display_order}</td>
      <td>
        <button type="button" class="badge-status ${c.is_published ? "badge-published" : "badge-hidden"}" onclick="window.adminApp.toggleCertificate(${c.id})">
          ${c.is_published ? "Published" : "Hidden"}
        </button>
      </td>
      <td>
        <div class="row-actions">
          <button type="button" class="btn-action edit" onclick="window.adminApp.openEditCertificate(${c.id})">Edit</button>
          <button type="button" class="btn-action delete" onclick="window.adminApp.deleteCertificate(${c.id})">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

// --- PRODUCTS ---
function updateAdminKPIs() {
  const total = productsList.length;
  const inStock = productsList.filter(p => (p.stock_status || "in_stock").toLowerCase() === "in_stock").length;
  const bestsellers = productsList.filter(p => (p.badge || "").toLowerCase() === "bestseller").length;
  const deals = productsList.filter(p => p.original_price && p.price && Number(p.original_price) > Number(p.price)).length;
  const pendingInquiries = ondemandList.filter(o => (o.status || "").toLowerCase() === "pending" || !o.status).length;
  
  const elTotal = document.getElementById("kpi-total-products");
  const elInStock = document.getElementById("kpi-in-stock");
  const elBestsellers = document.getElementById("kpi-bestsellers");
  const elDeals = document.getElementById("kpi-deals");
  const elInquiries = document.getElementById("kpi-inquiries");
  
  if (elTotal) elTotal.textContent = total;
  if (elInStock) elInStock.textContent = inStock;
  if (elBestsellers) elBestsellers.textContent = bestsellers;
  if (elDeals) elDeals.textContent = deals;
  if (elInquiries) elInquiries.textContent = pendingInquiries;
}

async function fetchInitialStats() {
  try {
    const res = await fetch("/api/stats");
    if (res.ok) {
      const data = await res.json();
      const elTotal = document.getElementById("kpi-total-products");
      const elInStock = document.getElementById("kpi-in-stock");
      const elBestsellers = document.getElementById("kpi-bestsellers");
      const elDeals = document.getElementById("kpi-deals");
      const elInquiries = document.getElementById("kpi-inquiries");
      
      if (elTotal && (!productsList || productsList.length === 0)) elTotal.textContent = data.total_products ?? 0;
      if (elInStock && (!productsList || productsList.length === 0)) elInStock.textContent = data.in_stock ?? 0;
      if (elBestsellers && (!productsList || productsList.length === 0)) elBestsellers.textContent = data.bestsellers ?? 0;
      if (elDeals && (!productsList || productsList.length === 0)) elDeals.textContent = data.deals ?? 0;
      if (elInquiries && (!ondemandList || ondemandList.length === 0)) elInquiries.textContent = data.inquiries ?? 0;
    }
  } catch (e) {
    console.debug("Initial stats fetch error:", e);
  }
}
fetchInitialStats();

function updateDiscountPreview() {
  const priceInput = document.getElementById("prod-price");
  const origPriceInput = document.getElementById("prod-orig-price");
  const preview = document.getElementById("prod-discount-preview");
  if (!priceInput || !origPriceInput || !preview) return;

  const price = parseFloat(priceInput.value);
  const orig = parseFloat(origPriceInput.value);

  if (orig && price && orig > price) {
    const pct = Math.round(((orig - price) / orig) * 100);
    const save = Math.round(orig - price);
    preview.textContent = `✓ Save ₹${save.toLocaleString("en-IN")} (${pct}% OFF)`;
    preview.style.display = "inline";
  } else {
    preview.textContent = "";
    preview.style.display = "none";
  }
}

document.getElementById("prod-price")?.addEventListener("input", updateDiscountPreview);
document.getElementById("prod-orig-price")?.addEventListener("input", updateDiscountPreview);

async function loadProducts(preserveScroll = true) {
  const scrollY = preserveScroll ? window.scrollY : 0;
  const tbody = document.getElementById("products-tbody");
  try {
    const res = await authFetch("/api/admin/products");
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Server returned ${res.status}: ${errText}`);
    }
    const data = await res.json();
    productsList = Array.isArray(data.products) ? data.products : [];

    const countElem = document.getElementById("count-products");
    if (countElem) countElem.textContent = productsList.length;
    updateAdminKPIs();
    renderProductsTable();
    if (preserveScroll && scrollY > 0) {
      window.scrollTo({ top: scrollY, behavior: "instant" });
    }
  } catch (err) {
    console.error("loadProducts error:", err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-danger py-4">Error loading products: ${err.message}. <button type="button" class="btn-action edit" style="margin-left: 10px;" onclick="window.adminApp.loadProducts()">Retry</button></td></tr>`;
    }
  }
}

// Pagination State for Admin Products Table
let adminProductsPage = 1;
const ADMIN_PAGE_SIZE = 25;

function renderProductsTable() {
  const tbody = document.getElementById("products-tbody");
  if (!tbody) return;

  const search = (document.getElementById("search-products-input")?.value || "").toLowerCase().trim();
  const categoryFilter = document.getElementById("filter-products-category")?.value || "All";
  const brandFilter = document.getElementById("filter-products-brand")?.value || "All";
  const stockFilter = document.getElementById("filter-products-stock")?.value || "All";
  const badgeFilter = document.getElementById("filter-products-badge")?.value || "All";

  let filtered = productsList;
  if (categoryFilter !== "All") {
    filtered = filtered.filter(p => p.category === categoryFilter);
  }
  if (brandFilter !== "All") {
    filtered = filtered.filter(p => (p.brand || "").toLowerCase() === brandFilter.toLowerCase());
  }
  if (stockFilter !== "All") {
    filtered = filtered.filter(p => (p.stock_status || "in_stock").toLowerCase() === stockFilter.toLowerCase());
  }
  if (badgeFilter !== "All") {
    filtered = filtered.filter(p => (p.badge || "").toLowerCase() === badgeFilter.toLowerCase());
  }
  if (search) {
    filtered = filtered.filter(p =>
      (p.name || "").toLowerCase().includes(search) ||
      (p.brand || "").toLowerCase().includes(search) ||
      (p.category || "").toLowerCase().includes(search) ||
      (p.description || "").toLowerCase().includes(search) ||
      (p.subtype || "").toLowerCase().includes(search)
    );
  }

  const total = filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  if (adminProductsPage > maxPage) adminProductsPage = maxPage;
  if (adminProductsPage < 1) adminProductsPage = 1;

  const pageInfo = document.getElementById("admin-products-page-info");
  const paginationWrap = document.getElementById("admin-products-pagination");
  const prevBtn = document.getElementById("admin-prod-prev-btn");
  const nextBtn = document.getElementById("admin-prod-next-btn");

  if (total === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No products found matching filters.</td></tr>`;
    if (pageInfo) pageInfo.textContent = "0 products found";
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }

  const startIdx = (adminProductsPage - 1) * ADMIN_PAGE_SIZE;
  const pageItems = filtered.slice(startIdx, startIdx + ADMIN_PAGE_SIZE);

  if (pageInfo) {
    pageInfo.textContent = `Showing ${startIdx + 1} - ${Math.min(startIdx + ADMIN_PAGE_SIZE, total)} of ${total} products (Page ${adminProductsPage} of ${maxPage})`;
  }
  if (prevBtn) prevBtn.disabled = adminProductsPage <= 1;
  if (nextBtn) nextBtn.disabled = adminProductsPage >= maxPage;

  tbody.innerHTML = pageItems.map(p => {
    const isBestseller = (p.badge || "").toLowerCase() === "bestseller";
    const isHotDeal = (p.badge || "").toLowerCase() === "hot_deal";
    const isFeatured = (p.badge || "").toLowerCase() === "featured";
    const isNew = (p.badge || "").toLowerCase() === "new_arrival";
    const stock = (p.stock_status || "in_stock").toLowerCase();
    
    // Selling badge pill text & action
    let badgeText = "☆ Standard";
    let badgeClass = "badge-selling badge-selling-none";
    if (isBestseller) {
      badgeText = "🔥 Best Seller";
      badgeClass = "badge-selling badge-selling-bestseller";
    } else if (isHotDeal) {
      badgeText = "⚡ Hot Deal";
      badgeClass = "badge-selling badge-selling-bestseller";
    } else if (isFeatured) {
      badgeText = "⭐ Featured";
      badgeClass = "badge-selling badge-selling-bestseller";
    } else if (isNew) {
      badgeText = "🆕 New Arrival";
      badgeClass = "badge-selling badge-selling-bestseller";
    }

    // Stock status pill text & action
    let stockText = "✓ In Stock";
    let stockClass = "badge-selling badge-stock-in";
    if (stock === "out_of_stock") {
      stockText = "✕ Out of Stock";
      stockClass = "badge-selling badge-stock-out";
    } else if (stock === "on_order") {
      stockText = "⌛ On Order";
      stockClass = "badge-selling badge-stock-order";
    }

    // Price & Discount display
    const priceStr = formatINR(p.price);
    const origPrice = Number(p.original_price);
    const currPrice = Number(p.price);
    let discountHtml = "";
    if (origPrice && currPrice && origPrice > currPrice) {
      const discountPct = Math.round(((origPrice - currPrice) / origPrice) * 100);
      discountHtml = `<br><span style="text-decoration: line-through; color: #94a3b8; font-size: 11px;">${formatINR(origPrice)}</span> <span style="color: #16a34a; font-weight: 700; font-size: 10px; background: #dcfce7; padding: 1px 4px; border-radius: 3px;">${discountPct}% OFF</span>`;
    }

    return `
    <tr>
      <td>
        <div class="product-cell-flex">
          ${p.image_url ? `<img src="${p.image_url}" class="admin-thumb" alt="${p.name}">` : `<div class="admin-thumb-empty">IMG</div>`}
          <div>
            <strong>${p.name}</strong>
            ${p.warranty ? `<div style="font-size: 10.5px; color: #0284c7; font-weight: 600; margin-top: 2px;">🛡️ ${p.warranty}</div>` : ""}
            ${p.product_url ? `<a href="${p.product_url}" target="_blank" rel="noopener noreferrer" class="link-ext" style="font-size: 10.5px;">Product Link ↗</a>` : ""}
          </div>
        </div>
      </td>
      <td>
        <span class="badge-category">${p.category_label || p.category}</span>
      </td>
      <td><strong>${p.brand || "—"}</strong></td>
      <td>
        <strong>${priceStr}</strong>
        ${discountHtml}
      </td>
      <td>
        <button type="button" class="${stockClass}" title="Click to toggle In Stock ↔ Out of Stock" onclick="window.adminApp.toggleStock(${p.id})">
          ${stockText}
        </button>
      </td>
      <td>
        <button type="button" class="${badgeClass}" title="Click to toggle Best Seller status" onclick="window.adminApp.toggleBestseller(${p.id})">
          ${badgeText}
        </button>
      </td>
      <td>
        <button type="button" class="badge-status ${p.is_published ? "badge-published" : "badge-hidden"}" onclick="window.adminApp.toggleProduct(${p.id})">
          ${p.is_published ? "Published" : "Hidden"}
        </button>
      </td>
      <td>
        <div class="row-actions">
          <button type="button" class="btn-action edit" onclick="window.adminApp.openEditProduct(${p.id})">Edit</button>
          <button type="button" class="btn-action delete" onclick="window.adminApp.deleteProduct(${p.id})">Delete</button>
        </div>
      </td>
    </tr>
    `;
  }).join("");
}

// Utility: Debounce function for inputs
function debounce(fn, ms = 150) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// Product search and filter listeners
document.getElementById("search-products-input")?.addEventListener("input", debounce(() => {
  adminProductsPage = 1;
  renderProductsTable();
}, 150));

document.getElementById("filter-products-category")?.addEventListener("change", () => {
  adminProductsPage = 1;
  renderProductsTable();
});

document.getElementById("filter-products-brand")?.addEventListener("change", () => {
  adminProductsPage = 1;
  renderProductsTable();
});

document.getElementById("filter-products-stock")?.addEventListener("change", () => {
  adminProductsPage = 1;
  renderProductsTable();
});

document.getElementById("filter-products-badge")?.addEventListener("change", () => {
  adminProductsPage = 1;
  renderProductsTable();
});

// Admin Products Table Pagination Listeners
document.getElementById("admin-prod-prev-btn")?.addEventListener("click", () => {
  if (adminProductsPage > 1) {
    adminProductsPage--;
    renderProductsTable();
  }
});

document.getElementById("admin-prod-next-btn")?.addEventListener("click", () => {
  adminProductsPage++;
  renderProductsTable();
});

// ---------------------------------------------------------------------------
// Modals Close Listeners
// ---------------------------------------------------------------------------
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => {
    closeModal(btn.dataset.close);
  });
});

document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeModal(backdrop.id);
  });
});

// ---------------------------------------------------------------------------
// Product Category & Custom Category Helpers
// ---------------------------------------------------------------------------
document.getElementById("prod-category")?.addEventListener("change", (e) => {
  const customInput = document.getElementById("prod-custom-category");
  if (!customInput) return;
  if (e.target.value === "__custom__") {
    customInput.style.display = "block";
    customInput.required = true;
    customInput.focus();
  } else {
    customInput.style.display = "none";
    customInput.required = false;
  }
});

function setSubtypeCheckboxes(str) {
  const hidden = document.getElementById("prod-subtype");
  if (hidden) hidden.value = str || "";
}

function syncSubtypeFromCheckboxes() {
  return document.getElementById("prod-subtype")?.value || "";
}

function updateAccessorySectionHighlight() {}

// ---------------------------------------------------------------------------
// Image Source Helpers (Web Link vs Upload File)
// ---------------------------------------------------------------------------
function extractGoogleDriveFileId(url) {
  if (!url) return null;
  const clean = url.trim();
  const patterns = [
    /\/file(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/i,
    /[?&]id=([a-zA-Z0-9_-]+)/i,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i,
    /drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i,
    /docs\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i
  ];
  for (const p of patterns) {
    const m = clean.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

function normalizeImageUrl(url) {
  if (!url) return "";
  let clean = url.trim();
  if (!clean) return "";

  // Check if it's a Google Drive link
  const fileId = extractGoogleDriveFileId(clean);
  if (fileId) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`;
  }

  // Prepend https:// if protocol is missing and it's not a relative path
  if (!clean.startsWith("http://") && !clean.startsWith("https://") && !clean.startsWith("/")) {
    clean = "https://" + clean;
  }
  return clean;
}

function setProductImageTab(mode) {
  const tabUrl = document.getElementById("tab-btn-prod-img-url");
  const tabFile = document.getElementById("tab-btn-prod-img-file");
  const panelUrl = document.getElementById("panel-prod-img-url");
  const panelFile = document.getElementById("panel-prod-img-file");
  if (!tabUrl || !tabFile || !panelUrl || !panelFile) return;

  if (mode === "file") {
    tabFile.classList.add("is-active");
    tabFile.style.background = "#ffffff";
    tabFile.style.color = "#0284c7";
    tabFile.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";

    tabUrl.classList.remove("is-active");
    tabUrl.style.background = "transparent";
    tabUrl.style.color = "#64748b";
    tabUrl.style.boxShadow = "none";

    panelFile.style.display = "block";
    panelUrl.style.display = "none";
  } else {
    tabUrl.classList.add("is-active");
    tabUrl.style.background = "#ffffff";
    tabUrl.style.color = "#0284c7";
    tabUrl.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";

    tabFile.classList.remove("is-active");
    tabFile.style.background = "transparent";
    tabFile.style.color = "#64748b";
    tabFile.style.boxShadow = "none";

    panelUrl.style.display = "block";
    panelFile.style.display = "none";
  }
}

function updateProductImagePreview(rawUrl) {
  const url = normalizeImageUrl(rawUrl);
  const hiddenInput = document.getElementById("prod-image");
  const previewWrap = document.getElementById("prod-image-preview-wrap");
  const previewImg = document.getElementById("prod-image-preview");
  const badge = document.getElementById("prod-preview-badge");

  if (hiddenInput) hiddenInput.value = url;

  if (!url) {
    if (previewWrap) previewWrap.style.display = "none";
    if (previewImg) previewImg.src = "";
    return;
  }

  if (previewImg && previewWrap) {
    previewImg.onload = () => {
      if (badge) {
        badge.textContent = "✓ Image Ready";
        badge.style.color = "#166534";
        badge.style.background = "#dcfce7";
      }
    };
    previewImg.onerror = () => {
      if (badge) {
        badge.textContent = "⚠️ Check Image Link";
        badge.style.color = "#b45309";
        badge.style.background = "#fef3c7";
      }
    };
    previewImg.src = url;
    previewWrap.style.display = "flex";
  }
}

function resetProductImageUI() {
  const hiddenInput = document.getElementById("prod-image");
  const urlInput = document.getElementById("prod-image-url-input");
  const fileInput = document.getElementById("prod-image-file");
  const statusEl = document.getElementById("prod-upload-status");
  const previewWrap = document.getElementById("prod-image-preview-wrap");
  const previewImg = document.getElementById("prod-image-preview");

  if (hiddenInput) hiddenInput.value = "";
  if (urlInput) urlInput.value = "";
  if (fileInput) fileInput.value = "";
  if (statusEl) {
    statusEl.textContent = "Stored locally on shop laptop";
    statusEl.style.color = "var(--admin-muted)";
  }
  if (previewImg) previewImg.src = "";
  if (previewWrap) previewWrap.style.display = "none";
  setProductImageTab("url");
}

function setProductImageUI(url) {
  const clean = (url || "").trim();
  const hiddenInput = document.getElementById("prod-image");
  const urlInput = document.getElementById("prod-image-url-input");
  const statusEl = document.getElementById("prod-upload-status");

  if (clean) {
    if (clean.startsWith("/assets/uploads/")) {
      if (hiddenInput) hiddenInput.value = clean;
      if (urlInput) urlInput.value = "";
      if (statusEl) {
        statusEl.textContent = `✓ Current file: ${clean.split("/").pop()}`;
        statusEl.style.color = "var(--admin-success)";
      }
      setProductImageTab("file");
    } else {
      const norm = normalizeImageUrl(clean);
      if (hiddenInput) hiddenInput.value = norm;
      if (urlInput) urlInput.value = clean;
      setProductImageTab("url");
    }
    updateProductImagePreview(clean);
  } else {
    resetProductImageUI();
  }
}

function setBrandLogoTab(mode) {
  const tabUrl = document.getElementById("tab-btn-brand-logo-url");
  const tabFile = document.getElementById("tab-btn-brand-logo-file");
  const panelUrl = document.getElementById("panel-brand-logo-url");
  const panelFile = document.getElementById("panel-brand-logo-file");
  if (!tabUrl || !tabFile || !panelUrl || !panelFile) return;

  if (mode === "file") {
    tabFile.classList.add("is-active");
    tabFile.style.background = "#ffffff";
    tabFile.style.color = "#0284c7";
    tabUrl.classList.remove("is-active");
    tabUrl.style.background = "transparent";
    tabUrl.style.color = "#64748b";
    panelFile.style.display = "block";
    panelUrl.style.display = "none";
  } else {
    tabUrl.classList.add("is-active");
    tabUrl.style.background = "#ffffff";
    tabUrl.style.color = "#0284c7";
    tabFile.classList.remove("is-active");
    tabFile.style.background = "transparent";
    tabFile.style.color = "#64748b";
    panelUrl.style.display = "block";
    panelFile.style.display = "none";
  }
}

function updateBrandLogoPreview(rawUrl) {
  const url = normalizeImageUrl(rawUrl);
  const hidden = document.getElementById("brand-logo");
  const wrap = document.getElementById("brand-logo-preview-wrap");
  const img = document.getElementById("brand-logo-preview");
  if (hidden) hidden.value = url;
  if (!url) {
    if (wrap) wrap.style.display = "none";
    if (img) img.src = "";
    return;
  }
  if (wrap && img) {
    img.src = url;
    wrap.style.display = "block";
  }
}

// Bind product image events
document.getElementById("tab-btn-prod-img-url")?.addEventListener("click", () => setProductImageTab("url"));
document.getElementById("tab-btn-prod-img-file")?.addEventListener("click", () => setProductImageTab("file"));

const prodUrlInput = document.getElementById("prod-image-url-input");
if (prodUrlInput) {
  prodUrlInput.addEventListener("input", (e) => updateProductImagePreview(e.target.value));
  prodUrlInput.addEventListener("change", (e) => updateProductImagePreview(e.target.value));
  prodUrlInput.addEventListener("blur", (e) => updateProductImagePreview(e.target.value));
  prodUrlInput.addEventListener("paste", (e) => setTimeout(() => updateProductImagePreview(e.target.value), 20));
}

document.getElementById("btn-preview-prod-url")?.addEventListener("click", () => {
  const val = document.getElementById("prod-image-url-input")?.value || "";
  updateProductImagePreview(val);
});
document.getElementById("btn-remove-prod-image")?.addEventListener("click", () => {
  resetProductImageUI();
});

// Bind brand logo events
document.getElementById("tab-btn-brand-logo-url")?.addEventListener("click", () => setBrandLogoTab("url"));
document.getElementById("tab-btn-brand-logo-file")?.addEventListener("click", () => setBrandLogoTab("file"));

const brandLogoInput = document.getElementById("brand-logo-url-input");
if (brandLogoInput) {
  brandLogoInput.addEventListener("input", (e) => updateBrandLogoPreview(e.target.value));
  brandLogoInput.addEventListener("change", (e) => updateBrandLogoPreview(e.target.value));
  brandLogoInput.addEventListener("blur", (e) => updateBrandLogoPreview(e.target.value));
  brandLogoInput.addEventListener("paste", (e) => setTimeout(() => updateBrandLogoPreview(e.target.value), 20));
}

// ---------------------------------------------------------------------------
// CRUD Actions (Exposed to window for inline onclick triggers)
// ---------------------------------------------------------------------------
window.adminApp = {
  // --- Product Modals & Actions ---
  openAddProduct: () => {
    document.getElementById("modal-product-title").textContent = "Add New Product";
    document.getElementById("form-product").reset();
    document.getElementById("prod-id").value = "";
    document.getElementById("prod-category").value = "laptops";
    const customInput = document.getElementById("prod-custom-category");
    if (customInput) {
      customInput.value = "";
      customInput.style.display = "none";
      customInput.required = false;
    }
    document.getElementById("prod-orig-price").value = "";
    document.getElementById("prod-stock-status").value = "in_stock";
    document.getElementById("prod-badge").value = "";
    document.getElementById("prod-warranty").value = "1 Year Official Brand Warranty";
    const subtypeInput = document.getElementById("prod-subtype-input");
    if (subtypeInput) subtypeInput.value = "";
    updateDiscountPreview();
    document.getElementById("prod-order").value = "0";
    document.getElementById("prod-published").checked = true;
    setSubtypeCheckboxes("");
    resetProductImageUI();
    openModal("modal-product");
  },

  openEditProduct: (id) => {
    const p = productsList.find(x => x.id === id);
    if (!p) return;
    document.getElementById("modal-product-title").textContent = `Edit Product: ${p.name}`;
    document.getElementById("prod-id").value = p.id;
    document.getElementById("prod-name").value = p.name || "";

    // Select category or dynamically add if custom
    const catSelect = document.getElementById("prod-category");
    const customInput = document.getElementById("prod-custom-category");
    const catVal = p.category || "laptops";
    let found = false;
    for (let i = 0; i < catSelect.options.length; i++) {
      if (catSelect.options[i].value === catVal) {
        found = true;
        break;
      }
    }
    if (!found && catVal) {
      const opt = document.createElement("option");
      opt.value = catVal;
      opt.textContent = `📦 ${catVal.charAt(0).toUpperCase() + catVal.slice(1)}`;
      catSelect.insertBefore(opt, catSelect.lastElementChild);
    }
    catSelect.value = catVal;
    if (customInput) {
      customInput.value = "";
      customInput.style.display = "none";
      customInput.required = false;
    }

    document.getElementById("prod-brand").value = p.brand_id || "";
    document.getElementById("prod-price").value = p.price !== null && p.price !== undefined ? p.price : "";
    document.getElementById("prod-orig-price").value = p.original_price !== null && p.original_price !== undefined ? p.original_price : "";
    document.getElementById("prod-stock-status").value = p.stock_status || "in_stock";
    document.getElementById("prod-badge").value = p.badge || "";
    document.getElementById("prod-warranty").value = p.warranty || "";
    const subtypeInput = document.getElementById("prod-subtype-input");
    if (subtypeInput) subtypeInput.value = p.subtype || "";
    updateDiscountPreview();

    document.getElementById("prod-url").value = p.product_url || "";
    document.getElementById("prod-desc").value = p.description || "";
    document.getElementById("prod-order").value = p.display_order || 0;
    document.getElementById("prod-published").checked = Boolean(p.is_published);
    setSubtypeCheckboxes(p.subtype || "");
    setProductImageUI(p.image_url || "");
    openModal("modal-product");
  },

  deleteProduct: async (id) => {
    const p = productsList.find(x => x.id === id);
    if (!confirm(`Are you sure you want to delete product "${p ? p.name : id}"? This action cannot be undone.`)) return;

    try {
      const res = await authFetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showAlert("Product deleted successfully.", "success");
      await loadProducts();
    } catch (err) {
      showAlert(err.message || "Failed to delete product.", "danger");
    }
  },

  toggleProduct: async (id) => {
    try {
      const res = await authFetch(`/api/products/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error("Status update failed");
      const data = await res.json();
      const p = productsList.find(x => x.id === id);
      if (p) p.is_published = data.is_published;
      showAlert(`Product visibility set to ${data.is_published ? "Published" : "Hidden"}.`, "success");
      renderProductsTable();
    } catch (err) {
      showAlert(err.message || "Failed to update product status.", "danger");
    }
  },

  toggleStock: async (id) => {
    try {
      const res = await authFetch(`/api/products/${id}/toggle-stock`, { method: "PATCH" });
      if (!res.ok) throw new Error("Stock update failed");
      const data = await res.json();
      const p = productsList.find(x => x.id === id);
      if (p) p.stock_status = data.stock_status;
      showAlert(`Product stock status updated to: ${data.stock_status === "in_stock" ? "In Stock" : "Out of Stock"}`, "success");
      updateAdminKPIs();
      renderProductsTable();
    } catch (err) {
      showAlert(err.message || "Failed to toggle stock status.", "danger");
    }
  },

  toggleBestseller: async (id) => {
    try {
      const res = await authFetch(`/api/products/${id}/toggle-bestseller`, { method: "PATCH" });
      if (!res.ok) throw new Error("Badge update failed");
      const data = await res.json();
      const p = productsList.find(x => x.id === id);
      if (p) p.badge = data.badge;
      showAlert(`Best Seller badge ${data.badge ? "activated" : "cleared"} for product.`, "success");
      updateAdminKPIs();
      renderProductsTable();
    } catch (err) {
      showAlert(err.message || "Failed to toggle Best Seller status.", "danger");
    }
  },

  // --- Certificate Modals & Actions ---
  openAddCertificate: () => {
    document.getElementById("modal-cert-title").textContent = "Add New Certificate";
    document.getElementById("form-certificate").reset();
    document.getElementById("cert-id").value = "";
    document.getElementById("cert-order").value = "0";
    document.getElementById("cert-published").checked = true;
    openModal("modal-certificate");
  },

  openEditCertificate: (id) => {
    const c = certificatesList.find(x => x.id === id);
    if (!c) return;
    document.getElementById("modal-cert-title").textContent = `Edit Certificate: ${c.title}`;
    document.getElementById("cert-id").value = c.id;
    document.getElementById("cert-name").value = c.title || "";
    document.getElementById("cert-issuer").value = c.issuer || "";
    document.getElementById("cert-cred-id").value = c.credential_id || "";
    document.getElementById("cert-issued").value = c.issued_on || "";
    document.getElementById("cert-expires").value = c.expires_on || "";
    document.getElementById("cert-doc").value = c.document_url || "";
    document.getElementById("cert-desc").value = c.description || "";
    document.getElementById("cert-order").value = c.display_order || 0;
    document.getElementById("cert-published").checked = Boolean(c.is_published);
    openModal("modal-certificate");
  },

  deleteCertificate: async (id) => {
    const c = certificatesList.find(x => x.id === id);
    if (!confirm(`Are you sure you want to delete certificate "${c ? c.title : id}"?`)) return;

    try {
      const res = await authFetch(`/api/certificates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showAlert("Certificate deleted successfully.", "success");
      await loadCertificates();
    } catch (err) {
      showAlert(err.message || "Failed to delete certificate.", "danger");
    }
  },

  toggleCertificate: async (id) => {
    try {
      const res = await authFetch(`/api/certificates/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error("Status update failed");
      await loadCertificates();
    } catch (err) {
      showAlert(err.message || "Failed to update certificate status.", "danger");
    }
  },

  // --- Brand Modals & Actions ---
  openAddBrand: () => {
    document.getElementById("modal-brand-title").textContent = "Add New Brand";
    document.getElementById("form-brand").reset();
    document.getElementById("brand-id").value = "";
    document.getElementById("brand-order").value = "0";
    document.getElementById("brand-published").checked = true;
    updateBrandLogoPreview("");
    if (document.getElementById("brand-logo-url-input")) document.getElementById("brand-logo-url-input").value = "";
    setBrandLogoTab("url");
    openModal("modal-brand");
  },

  openEditBrand: (id) => {
    const b = brandsList.find(x => x.id === id);
    if (!b) return;
    document.getElementById("modal-brand-title").textContent = `Edit Brand: ${b.name}`;
    document.getElementById("brand-id").value = b.id;
    document.getElementById("brand-name").value = b.name || "";
    document.getElementById("brand-summary").value = b.summary || "";
    document.getElementById("brand-logo").value = b.logo_url || "";
    if (document.getElementById("brand-logo-url-input")) document.getElementById("brand-logo-url-input").value = b.logo_url || "";
    updateBrandLogoPreview(b.logo_url || "");
    if ((b.logo_url || "").startsWith("/assets/uploads/")) {
      setBrandLogoTab("file");
    } else {
      setBrandLogoTab("url");
    }
    document.getElementById("brand-website").value = b.website_url || "";
    document.getElementById("brand-order").value = b.display_order || 0;
    document.getElementById("brand-published").checked = Boolean(b.is_published);
    openModal("modal-brand");
  },

  deleteBrand: async (id) => {
    const b = brandsList.find(x => x.id === id);
    if (!confirm(`Are you sure you want to delete brand "${b ? b.name : id}"?`)) return;

    try {
      const res = await authFetch(`/api/brands/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showAlert("Brand deleted successfully.", "success");
      await loadBrands();
    } catch (err) {
      showAlert(err.message || "Failed to delete brand.", "danger");
    }
  },

  toggleBrand: async (id) => {
    try {
      const res = await authFetch(`/api/brands/${id}/toggle`, { method: "PATCH" });
      if (!res.ok) throw new Error("Status update failed");
      await loadBrands();
    } catch (err) {
      showAlert(err.message || "Failed to update brand status.", "danger");
    }
  },

  // Direct Data Refresh Helpers
  loadProducts: loadProducts,
  loadBrands: loadBrands,
  loadCertificates: loadCertificates,
  loadAllData: loadAllData,

  // Shop Customer QR Code Helpers
  openQRModal: () => {
    const canonicalBase = (window.location.hostname.includes("trycloudflare.com") || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "https://deepcomputers.deepcomputers.workers.dev" : window.location.origin;
    const catalogUrl = canonicalBase + "/catalog.html";
    const qrImg = document.getElementById("qr-image");
    const qrLink = document.getElementById("qr-link-text");
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(catalogUrl)}`;
    if (qrLink) qrLink.textContent = catalogUrl;
    openModal("modal-qr");
  },

  printQR: () => {
    const canonicalBase = (window.location.hostname.includes("trycloudflare.com") || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "https://deepcomputers.deepcomputers.workers.dev" : window.location.origin;
    const catalogUrl = canonicalBase + "/catalog.html";
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(catalogUrl)}`;
    const win = window.open("", "_blank");
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Deep Computers & Telecom - Shop QR Code</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px; margin: 0; background: #f8fafc; }
          .card { background: #fff; border: 3px solid #0284c7; border-radius: 24px; padding: 36px; max-width: 440px; margin: 0 auto; box-shadow: 0 10px 25px rgba(0,0,0,0.08); }
          h1 { margin: 0 0 6px; color: #0f172a; font-size: 26px; font-weight: 800; }
          .sub { color: #0284c7; font-weight: 700; margin: 0 0 24px; font-size: 13px; letter-spacing: 1.5px; }
          img { width: 260px; height: 260px; margin: 10px 0; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px; background: #fff; }
          .instructions { font-size: 16px; font-weight: 700; color: #1e293b; margin: 20px 0 4px; }
          .cats { font-size: 13px; color: #64748b; margin: 0 0 16px; font-weight: 500; }
          .link { font-size: 11px; color: #0284c7; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Deep Computers &amp; Telecom</h1>
          <p class="sub">SINCE 1999 • TECHNOLOGY WITH TRUST</p>
          <img src="${qrUrl}" alt="Shop QR Code">
          <p class="instructions">Scan to Browse our Store Catalog</p>
          <p class="cats">Laptops • CCTV Cameras • Accessories • Networking</p>
          <div class="link">${catalogUrl}</div>
        </div>
        <script>window.onload = function() { window.print(); }<\/script>
      </body>
      </html>
    `);
    win.document.close();
  },

  // --- On-Demand Inquiries Actions ---
  loadOnDemand,
  updateOnDemandStatus: async (orderId, newStatus) => {
    try {
      const res = await authFetch(`/api/admin/onorder/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      showAlert(`✓ Inquiry #ORD-${orderId} status set to "${newStatus}"!`, "success");
      loadOnDemand(true);
    } catch (err) {
      console.error("updateOnDemandStatus error:", err);
      showAlert(err.message || "Could not update status.", "danger");
      loadOnDemand(true);
    }
  },
  deleteOnDemand: async (orderId) => {
    const order = ondemandList.find(x => x.id === orderId);
    const label = order ? `#ORD-${order.id} (${order.customer_name || "Customer"} - ${order.product_title || "Item"})` : `#ORD-${orderId}`;
    if (!confirm(`Are you sure you want to permanently delete inquiry ${label}? This cannot be undone.`)) return;

    try {
      const res = await authFetch(`/api/admin/onorder/${orderId}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to delete inquiry.");
      }
      showAlert(`✓ Inquiry #ORD-${orderId} deleted successfully.`, "success");
      loadOnDemand(true);
    } catch (err) {
      console.error("deleteOnDemand error:", err);
      showAlert(err.message || "Failed to delete inquiry.", "danger");
      loadOnDemand(true);
    }
  }
};

// Bind Add Buttons
document.getElementById("btn-add-product")?.addEventListener("click", window.adminApp.openAddProduct);
document.getElementById("btn-add-certificate")?.addEventListener("click", window.adminApp.openAddCertificate);
document.getElementById("btn-add-brand")?.addEventListener("click", window.adminApp.openAddBrand);

// ---------------------------------------------------------------------------
// Form Submission Handlers
// ---------------------------------------------------------------------------
document.getElementById("form-product")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : "Save Product";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
  }

  const id = document.getElementById("prod-id").value;
  const brandVal = document.getElementById("prod-brand").value;
  const priceVal = document.getElementById("prod-price").value;

  // Intelligently resolve the product image from whichever tab or input has value
  let finalImageUrl = document.getElementById("prod-image")?.value.trim() || "";
  const urlInputVal = document.getElementById("prod-image-url-input")?.value.trim() || "";
  const isUrlTabActive = document.getElementById("tab-btn-prod-img-url")?.classList.contains("is-active");

  if (isUrlTabActive && urlInputVal) {
    finalImageUrl = normalizeImageUrl(urlInputVal);
  } else if (!finalImageUrl && urlInputVal) {
    finalImageUrl = normalizeImageUrl(urlInputVal);
  } else if (finalImageUrl) {
    finalImageUrl = normalizeImageUrl(finalImageUrl);
  }

  // Prepend https:// to product_url if needed
  let productUrl = document.getElementById("prod-url")?.value.trim() || "";
  if (productUrl && !productUrl.startsWith("http://") && !productUrl.startsWith("https://")) {
    productUrl = "https://" + productUrl;
  }

  let categoryVal = document.getElementById("prod-category").value;
  if (categoryVal === "__custom__") {
    categoryVal = document.getElementById("prod-custom-category")?.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "accessories";
  }

  const origPriceVal = document.getElementById("prod-orig-price")?.value;
  const stockVal = document.getElementById("prod-stock-status")?.value || "in_stock";
  const badgeVal = document.getElementById("prod-badge")?.value || "";
  const warrantyVal = document.getElementById("prod-warranty")?.value.trim() || "";
  const subtypeInputVal = document.getElementById("prod-subtype-input")?.value.trim() || "";

  const payload = {
    name: document.getElementById("prod-name").value.trim(),
    category: categoryVal,
    brand_id: brandVal ? Number(brandVal) : null,
    price: priceVal !== "" ? parseFloat(priceVal) : null,
    original_price: origPriceVal !== "" && origPriceVal !== undefined ? parseFloat(origPriceVal) : null,
    stock_status: stockVal,
    badge: badgeVal,
    warranty: warrantyVal,
    image_url: finalImageUrl,
    product_url: productUrl,
    description: document.getElementById("prod-desc").value.trim(),
    display_order: parseInt(document.getElementById("prod-order").value, 10) || 0,
    is_published: document.getElementById("prod-published").checked,
    subtype: subtypeInputVal || syncSubtypeFromCheckboxes()
  };

  try {
    const url = id ? `/api/products/${id}` : "/api/products";
    const method = id ? "PUT" : "POST";

    const res = await authFetch(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to save product.");

    closeModal("modal-product");
    document.getElementById("form-product").reset();
    resetProductImageUI();
    showAlert(`✓ Product "${payload.name}" saved successfully!`, "success");
    await loadProducts();
  } catch (err) {
    showAlert(err.message || "Failed to save product.", "danger");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
});

document.getElementById("form-certificate")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : "Save Certificate";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
  }

  const id = document.getElementById("cert-id").value;

  const payload = {
    title: document.getElementById("cert-name").value.trim(),
    issuer: document.getElementById("cert-issuer").value.trim(),
    credential_id: document.getElementById("cert-cred-id").value.trim(),
    issued_on: document.getElementById("cert-issued").value || null,
    expires_on: document.getElementById("cert-expires").value || null,
    document_url: document.getElementById("cert-doc").value.trim(),
    description: document.getElementById("cert-desc").value.trim(),
    display_order: parseInt(document.getElementById("cert-order").value, 10) || 0,
    is_published: document.getElementById("cert-published").checked
  };

  try {
    const url = id ? `/api/certificates/${id}` : "/api/certificates";
    const method = id ? "PUT" : "POST";

    const res = await authFetch(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to save certificate.");

    closeModal("modal-certificate");
    document.getElementById("form-certificate").reset();
    showAlert(`✓ Certificate "${payload.title}" saved successfully!`, "success");
    await loadCertificates();
  } catch (err) {
    showAlert(err.message || "Failed to save certificate.", "danger");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
});

document.getElementById("form-brand")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : "Save Brand";
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";
  }

  const id = document.getElementById("brand-id").value;

  let finalLogoUrl = document.getElementById("brand-logo")?.value.trim() || "";
  const logoUrlInputVal = document.getElementById("brand-logo-url-input")?.value.trim() || "";
  const isLogoUrlTabActive = document.getElementById("tab-btn-brand-logo-url")?.classList.contains("is-active");

  if (isLogoUrlTabActive && logoUrlInputVal) {
    finalLogoUrl = normalizeImageUrl(logoUrlInputVal);
  } else if (!finalLogoUrl && logoUrlInputVal) {
    finalLogoUrl = normalizeImageUrl(logoUrlInputVal);
  } else if (finalLogoUrl) {
    finalLogoUrl = normalizeImageUrl(finalLogoUrl);
  }

  let websiteUrl = document.getElementById("brand-website")?.value.trim() || "";
  if (websiteUrl && !websiteUrl.startsWith("http://") && !websiteUrl.startsWith("https://")) {
    websiteUrl = "https://" + websiteUrl;
  }

  const payload = {
    name: document.getElementById("brand-name").value.trim(),
    summary: document.getElementById("brand-summary").value.trim(),
    logo_url: finalLogoUrl,
    website_url: websiteUrl,
    display_order: parseInt(document.getElementById("brand-order").value, 10) || 0,
    is_published: document.getElementById("brand-published").checked
  };

  try {
    const url = id ? `/api/brands/${id}` : "/api/brands";
    const method = id ? "PUT" : "POST";

    const res = await authFetch(url, { method, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Failed to save brand.");

    closeModal("modal-brand");
    document.getElementById("form-brand").reset();
    showAlert(`✓ Brand "${payload.name}" saved successfully!`, "success");
    await loadBrands();
  } catch (err) {
    showAlert(err.message || "Failed to save brand.", "danger");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
});

// ---------------------------------------------------------------------------
// Local File Upload Handlers (Save directly to shop laptop disk)
// ---------------------------------------------------------------------------
async function uploadToLocalLaptop(fileInput, statusId, inputId, previewWrapId = null, previewImgId = null) {
  const file = fileInput.files[0];
  if (!file) return;

  const statusEl = document.getElementById(statusId);
  const inputEl = document.getElementById(inputId);
  const previewWrap = previewWrapId ? document.getElementById(previewWrapId) : null;
  const previewImg = previewImgId ? document.getElementById(previewImgId) : null;

  // Protect submission while upload is in progress
  const parentForm = fileInput.closest("form");
  const submitBtn = parentForm ? parentForm.querySelector('button[type="submit"]') : null;
  const origBtnText = submitBtn ? submitBtn.textContent : "Save";

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading file...";
  }

  if (statusEl) {
    statusEl.textContent = `Uploading "${file.name}"... Please wait`;
    statusEl.style.color = "var(--admin-primary)";
  }

  const formData = new FormData();
  formData.append("file", file);

  try {
    const res = await authFetch("/api/upload", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Upload failed");

    if (inputEl) inputEl.value = data.url;

    if (statusEl) {
      statusEl.textContent = `✓ Stored on laptop: ${data.filename}`;
      statusEl.style.color = "var(--admin-success)";
    }
    if (previewWrap && previewImg) {
      previewImg.src = data.url;
      previewWrap.style.display = "flex";
      const badge = document.getElementById("prod-preview-badge");
      if (badge && inputId === "prod-image") {
        badge.textContent = "✓ Uploaded from Laptop / Drive";
        badge.style.color = "#166534";
        badge.style.background = "#dcfce7";
      }
    }
    showAlert(`✓ File "${file.name}" uploaded successfully!`, "success");
  } catch (err) {
    console.error("Local upload error:", err);
    if (statusEl) {
      statusEl.textContent = `Upload failed: ${err.message}`;
      statusEl.style.color = "var(--admin-danger)";
    }
    showAlert(err.message || "Failed to upload file.", "danger");
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = origBtnText;
    }
  }
}

// Bind upload inputs
document.getElementById("prod-image-file")?.addEventListener("change", (e) => {
  uploadToLocalLaptop(e.target, "prod-upload-status", "prod-image", "prod-image-preview-wrap", "prod-image-preview");
});

document.getElementById("brand-logo-file")?.addEventListener("change", (e) => {
  uploadToLocalLaptop(e.target, "brand-upload-status", "brand-logo");
});

document.getElementById("cert-doc-file")?.addEventListener("change", (e) => {
  uploadToLocalLaptop(e.target, "cert-upload-status", "cert-doc");
});
