const searchForm = document.querySelector("#catalog-search-form");
const searchInput = document.querySelector("#catalog-search-input");
const categoryFilters = document.querySelector("#category-filters");
const categorySelect = document.querySelector("#catalog-category-select");
const subtypeFiltersContainer = document.querySelector("#subtype-filters");
const brandFilterSelect = document.querySelector("#catalog-brand-filter");
const sortSelect = document.querySelector("#catalog-sort-select");
const productsGrid = document.querySelector("#products-grid");
const resultsCount = document.querySelector("#results-count");
const paginationWrap = document.querySelector("#catalog-pagination-wrap");
const showingInfo = document.querySelector("#catalog-showing-info");
const loadMoreBtn = document.querySelector("#btn-load-more");

const urlParams = new URLSearchParams(window.location.search);
let activeCategory = urlParams.get("category") || "";
let activeSubtype = urlParams.get("subtype") || "";
if (activeCategory.toLowerCase() === "pendrives") {
  activeCategory = "storage";
  if (!activeSubtype) activeSubtype = "Pen Drive";
}
let activeBrand = urlParams.get("brand") || "";
let activeSellingFilter = urlParams.get("selling") || "all";
let activePriceRange = "all";
let activeSort = urlParams.get("sort") || "bestseller";
let searchTimer;
let requestController;

const CATEGORY_ICONS = {
  "laptops": "💻",
  "cctv": "📹",
  "storage": "💾",
  "ram": "🧠",
  "pendrives": "💾",
  "routers": "🌐",
  "printers": "🖨️",
  "ink": "🖋️",
  "adapters": "🔌",
  "speakers": "🔊",
  "accessories": "⌨️",
  "cables": "🔗",
  "daily-use": "⚡"
};

// Canonical Category Priority for "Everything" view
const CATEGORY_ORDER = {
  "laptops": 1,
  "cctv": 2,
  "storage": 3,
  "ram": 4,
  "routers": 5,
  "printers": 6,
  "ink": 7,
  "adapters": 8,
  "speakers": 9,
  "accessories": 10,
  "cables": 11,
  "daily-use": 12
};

function getCategoryPriority(cat) {
  const c = (cat || "").toLowerCase();
  return CATEGORY_ORDER[c] !== undefined ? CATEGORY_ORDER[c] : 99;
}

// Pagination state
const PAGE_SIZE = 24;
let currentPage = 1;
let rawProductsList = [];
let rawCategoriesList = [];

// Pre-fill search if 'search' parameter is present
if (searchInput && urlParams.get("search")) {
  searchInput.value = urlParams.get("search");
}

function safeWebUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (err) {
    return "";
  }
}

function showCatalogMessage(message, isError = false) {
  if (!productsGrid) return;
  productsGrid.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = isError ? "empty-state error-state" : "empty-state";
  paragraph.textContent = message;
  productsGrid.append(paragraph);
  if (paginationWrap) paginationWrap.style.display = "none";
}

function renderSubtypeFilters() {
  if (!subtypeFiltersContainer) return;

  const isAccessories = activeCategory === "accessories";
  const isStorage = activeCategory === "storage" || activeCategory === "pendrives";
  const isRam = activeCategory === "ram";
  const showSubtypes = isAccessories || isStorage || isRam || activeSubtype !== "";
  if (!showSubtypes) {
    subtypeFiltersContainer.style.display = "none";
    subtypeFiltersContainer.replaceChildren();
    return;
  }

  subtypeFiltersContainer.style.display = "flex";
  subtypeFiltersContainer.replaceChildren();

  const label = document.createElement("span");
  label.className = "subtype-filter-label";

  let subtypes = [];
  if (isStorage) {
    label.textContent = "Storage Type:";
    subtypes = [
      { value: "", label: "All Storage" },
      { value: "SSD", label: "⚡ High-Speed SSD" },
      { value: "Pen Drive", label: "🗝️ Pen Drives & OTG" },
      { value: "HDD", label: "💾 Hard Drives" },
      { value: "Casing", label: "🧰 Drive Enclosures" },
    ];
  } else if (isRam) {
    label.textContent = "RAM Type:";
    subtypes = [
      { value: "", label: "All RAM" },
      { value: "Desktop", label: "🖥️ Desktop RAM" },
      { value: "Laptop", label: "💻 Laptop RAM" },
    ];
  } else {
    label.textContent = "Accessory Type:";
    subtypes = [
      { value: "", label: "All Types" },
      { value: "USB", label: "🔌 USB (Wired)" },
      { value: "Wireless", label: "📶 Wireless" },
      { value: "Combo", label: "⌨️+🖱️ Combo Set" },
    ];
  }
  subtypeFiltersContainer.append(label);

  for (const st of subtypes) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "subtype-filter-chip";
    if (activeSubtype.toLowerCase() === st.value.toLowerCase()) {
      chip.classList.add("is-active");
    }
    chip.textContent = st.label;
    chip.addEventListener("click", () => {
      activeSubtype = st.value;
      currentPage = 1;
      renderSubtypeFilters();
      applyFiltersAndRender();
    });
    subtypeFiltersContainer.append(chip);
  }
}

function renderVisualCategoryShelf(categories) {
  const shelf = document.getElementById("visual-category-shelf");
  if (!shelf) return;
  shelf.replaceChildren();

  const counts = {};
  for (const p of rawProductsList) {
    const cat = (p.category || "").toLowerCase();
    counts[cat] = (counts[cat] || 0) + 1;
  }

  // All Tech button
  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `visual-category-pill ${!activeCategory ? "is-active" : ""}`;
  allBtn.innerHTML = `<span>🌟 All Tech</span> <span class="pill-count">${rawProductsList.length}</span>`;
  allBtn.addEventListener("click", () => {
    activeCategory = "";
    activeSubtype = "";
    currentPage = 1;
    renderVisualCategoryShelf(categories);
    renderCategoryFilters(categories);
    renderSubtypeFilters();
    applyFiltersAndRender();
  });
  shelf.append(allBtn);

  const validCategories = categories.filter(c => c.value.toLowerCase() !== "peripherals");
  for (const cat of validCategories) {
    const count = counts[cat.value.toLowerCase()] || 0;
    const icon = CATEGORY_ICONS[cat.value.toLowerCase()] || "📦";
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `visual-category-pill ${activeCategory.toLowerCase() === cat.value.toLowerCase() ? "is-active" : ""}`;
    pill.innerHTML = `<span>${icon} ${cat.label}</span> <span class="pill-count">${count}</span>`;
    pill.addEventListener("click", () => {
      activeCategory = cat.value;
      if (activeCategory !== "accessories" && activeCategory !== "storage" && activeCategory !== "ram") {
        activeSubtype = "";
      }
      currentPage = 1;
      renderVisualCategoryShelf(categories);
      renderCategoryFilters(categories);
      renderSubtypeFilters();
      applyFiltersAndRender();
    });
    shelf.append(pill);
  }
}

function updateSellingTabCounts() {
  const total = rawProductsList.length;
  const bestsellers = rawProductsList.filter(p => (p.badge || "").toLowerCase() === "bestseller").length;
  const instock = rawProductsList.filter(p => (p.stock_status || "in_stock").toLowerCase() === "in_stock").length;
  const deals = rawProductsList.filter(p => (p.original_price && p.price && Number(p.original_price) > Number(p.price)) || (p.badge || "").toLowerCase() === "hot_deal").length;
  const newItems = rawProductsList.filter(p => (p.badge || "").toLowerCase() === "new_arrival" || (p.id && p.id > 100)).length;

  const elAll = document.getElementById("count-selling-all");
  const elBest = document.getElementById("count-selling-bestseller");
  const elStock = document.getElementById("count-selling-instock");
  const elDeals = document.getElementById("count-selling-deals");
  const elNew = document.getElementById("count-selling-new");

  if (elAll) elAll.textContent = total;
  if (elBest) elBest.textContent = bestsellers;
  if (elStock) elStock.textContent = instock;
  if (elDeals) elDeals.textContent = deals;
  if (elNew) elNew.textContent = newItems;
}

function renderCategoryFilters(categories) {
  renderVisualCategoryShelf(categories);
  updateSellingTabCounts();

  if (!categoryFilters) return;
  const selectedCategory = activeCategory;
  categoryFilters.replaceChildren();

  // Filter out any deprecated 'peripherals'
  const validCategories = categories.filter(c => c.value.toLowerCase() !== "peripherals");

  // Count items per category
  const counts = {};
  for (const p of rawProductsList) {
    const cat = (p.category || "").toLowerCase();
    counts[cat] = (counts[cat] || 0) + 1;
  }

  const filters = [
    { value: "", label: "Everything", count: rawProductsList.length }
  ].concat(validCategories.map(c => Object.assign({}, c, {
    count: counts[c.value.toLowerCase()] || 0
  })));

  if (categorySelect) {
    categorySelect.innerHTML = filters.map(c =>
      `<option value="${c.value}" ${c.value === selectedCategory ? "selected" : ""}>📁 ${c.label} (${c.count})</option>`
    ).join("");
    categorySelect.value = selectedCategory;
  }

  for (const category of filters) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-filter";
    button.dataset.category = category.value;
    button.textContent = `${category.label} (${category.count})`;
    button.setAttribute("aria-pressed", String(category.value === selectedCategory));
    if (category.value === selectedCategory) button.classList.add("is-active");

    button.addEventListener("click", () => {
      activeCategory = category.value;
      if (activeCategory !== "accessories" && activeCategory !== "storage" && activeCategory !== "ram") {
        activeSubtype = "";
      }
      currentPage = 1;
      renderCategoryFilters(categories);
      renderVisualCategoryShelf(categories);
      renderSubtypeFilters();
      applyFiltersAndRender();
    });
    categoryFilters.append(button);
  }
}

function populateBrandFilter() {
  if (!brandFilterSelect) return;
  const currentVal = activeBrand;
  const brands = Array.from(new Set(rawProductsList.map(p => p.brand).filter(Boolean))).sort();
  brandFilterSelect.innerHTML = '<option value="">🏷️ All Brands</option>' +
    brands.map(b => `<option value="${b}">${b}</option>`).join("");
  brandFilterSelect.value = currentVal;
}

function filterAndSortProducts() {
  let list = rawProductsList.slice();

  // 1. Category Filter
  if (activeCategory && activeCategory !== "all") {
    const catLower = activeCategory.toLowerCase();
    if (catLower === "accessories" || catLower === "peripherals") {
      list = list.filter(p => ["accessories", "peripherals"].includes((p.category || "").toLowerCase()));
    } else {
      list = list.filter(p => (p.category || "").toLowerCase() === catLower);
    }
  }

  // 2. Subtype Filter
  if (activeSubtype) {
    const subLower = activeSubtype.toLowerCase();
    list = list.filter(p => {
      const sub = (p.subtype || "").toLowerCase();
      const pName = (p.name || "").toLowerCase();
      if (subLower === "usb") return sub.includes("usb") || Boolean(p.is_usb);
      if (subLower === "wireless") return sub.includes("wireless") || Boolean(p.is_wireless);
      if (subLower === "combo") return sub.includes("combo") || Boolean(p.is_combo);
      if (subLower === "ssd") return sub.includes("ssd") || pName.includes("ssd");
      if (subLower === "hdd") return sub.includes("hdd") || pName.includes("hdd");
      if (subLower === "pen drive" || subLower === "pendrive") {
        return sub.includes("pen drive") || pName.includes("pen drive") || pName.includes("blade") || pName.includes("otg") || pName.includes("flash") || sub.includes("usb");
      }
      if (subLower === "casing") return sub.includes("casing") || pName.includes("casing") || pName.includes("enclosure");
      if (subLower === "ram") return sub.includes("ram") || pName.includes("ram");
      if (subLower === "desktop") return sub.includes("desktop") || pName.includes("desktop");
      if (subLower === "laptop") return sub.includes("laptop") || sub.includes("sodimm") || pName.includes("laptop") || pName.includes("sodimm");
      return sub.includes(subLower);
    });
  }

  // 3. Selling Status Filter ("What is Selling")
  if (activeSellingFilter === "bestseller") {
    list = list.filter(p => (p.badge || "").toLowerCase() === "bestseller");
  } else if (activeSellingFilter === "instock") {
    list = list.filter(p => (p.stock_status || "in_stock").toLowerCase() === "in_stock");
  } else if (activeSellingFilter === "deals") {
    list = list.filter(p => (p.original_price && p.price && Number(p.original_price) > Number(p.price)) || (p.badge || "").toLowerCase() === "hot_deal");
  } else if (activeSellingFilter === "new") {
    list = list.filter(p => (p.badge || "").toLowerCase() === "new_arrival" || (p.id && p.id > 100));
  }

  // 4. Price Range Filter
  if (activePriceRange === "under1000") {
    list = list.filter(p => p.price && Number(p.price) <= 1000);
  } else if (activePriceRange === "1000-5000") {
    list = list.filter(p => p.price && Number(p.price) > 1000 && Number(p.price) <= 5000);
  } else if (activePriceRange === "5000-25000") {
    list = list.filter(p => p.price && Number(p.price) > 5000 && Number(p.price) <= 25000);
  } else if (activePriceRange === "above25000") {
    list = list.filter(p => p.price && Number(p.price) > 25000);
  }

  // 5. Brand Filter
  if (activeBrand) {
    list = list.filter(p => (p.brand || "").toLowerCase() === activeBrand.toLowerCase());
  }

  // 6. Search Filter
  const search = (searchInput?.value || "").trim().toLowerCase();
  if (search) {
    list = list.filter(p =>
      (p.name || "").toLowerCase().includes(search) ||
      (p.brand || "").toLowerCase().includes(search) ||
      (p.description || "").toLowerCase().includes(search) ||
      (p.subtype || "").toLowerCase().includes(search) ||
      (p.category_label || "").toLowerCase().includes(search)
    );
  }

  // 7. Sorting
  if (activeSort === "bestseller") {
    list.sort((a, b) => {
      const aBest = (a.badge || "").toLowerCase() === "bestseller" ? 1 : 0;
      const bBest = (b.badge || "").toLowerCase() === "bestseller" ? 1 : 0;
      if (aBest !== bBest) return bBest - aBest;
      const aDisc = (a.original_price && a.price && a.original_price > a.price) ? 1 : 0;
      const bDisc = (b.original_price && b.price && b.original_price > b.price) ? 1 : 0;
      if (aDisc !== bDisc) return bDisc - aDisc;
      return (b.id || 0) - (a.id || 0);
    });
  } else if (activeSort === "discount") {
    list.sort((a, b) => {
      const aDisc = (a.original_price && a.price && a.original_price > a.price) ? ((a.original_price - a.price) / a.original_price) : 0;
      const bDisc = (b.original_price && b.price && b.original_price > b.price) ? ((b.original_price - b.price) / b.original_price) : 0;
      return bDisc - aDisc;
    });
  } else if (activeSort === "price-asc") {
    list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (activeSort === "price-desc") {
    list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  } else if (activeSort === "name-asc") {
    list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  } else {
    list.sort((a, b) => {
      if (!activeCategory || activeCategory === "all") {
        const catA = getCategoryPriority(a.category);
        const catB = getCategoryPriority(b.category);
        if (catA !== catB) return catA - catB;
      }
      return (b.id || 0) - (a.id || 0);
    });
  }

  return list;
}

function applyFiltersAndRender() {
  const filtered = filterAndSortProducts();
  renderProductsGrid(filtered);
}

function renderProductsGrid(filteredProducts) {
  if (!productsGrid) return;
  productsGrid.replaceChildren();

  const total = filteredProducts.length;
  if (resultsCount) {
    resultsCount.textContent = `${total} ${total === 1 ? "product" : "products"} available`;
  }

  if (total === 0) {
    showCatalogMessage(searchInput.value.trim()
      ? "No matching products found. Try adjusting your search or filters."
      : "No products available matching the selected criteria.");
    if (paginationWrap) paginationWrap.style.display = "none";
    return;
  }

  // Slice for pagination
  const visibleCount = Math.min(total, currentPage * PAGE_SIZE);
  const visibleProducts = filteredProducts.slice(0, visibleCount);

  for (const product of visibleProducts) {
    const card = document.createElement("article");
    card.className = "product-card";

    // Card click opens detail modal
    card.addEventListener("click", (e) => {
      if (e.target.closest(".product-actions-bar, .btn-product-talk, .btn-product-quickview, .btn-product-call, .btn-product-details")) {
        return;
      }
      openProductDetailsModal(product);
    });

    // Image Wrap
    const imageWrap = document.createElement("div");
    imageWrap.className = "product-image-wrap";
    imageWrap.style.cursor = "pointer";
    imageWrap.setAttribute("title", `View details for ${product.name}`);
    imageWrap.addEventListener("click", () => openProductDetailsModal(product));

    const imageUrl = safeWebUrl(product.image_url);
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "product-image";
      image.src = imageUrl;
      image.alt = product.name;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.remove();
        imageWrap.classList.add("product-image-placeholder");
        imageWrap.textContent = product.category_label || "Deep Computers";
      }, { once: true });
      imageWrap.append(image);
    } else {
      imageWrap.classList.add("product-image-placeholder");
      imageWrap.textContent = product.category_label || "Deep Computers";
    }

    // Content Wrap
    const content = document.createElement("div");
    content.className = "product-content";

    // 1. Badges Line (Selling status, Stock status, Discount)
    const badgesRow = document.createElement("div");
    badgesRow.style.cssText = "display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 8px;";

    const badgeVal = (product.badge || "").toLowerCase();
    const stockVal = (product.stock_status || "in_stock").toLowerCase();

    if (badgeVal === "bestseller") {
      const b = document.createElement("span");
      b.className = "product-badge-bestseller";
      b.innerHTML = `🔥 Best Seller`;
      badgesRow.append(b);
    } else if (badgeVal === "hot_deal") {
      const b = document.createElement("span");
      b.className = "product-badge-hotdeal";
      b.innerHTML = `⚡ Hot Deal`;
      badgesRow.append(b);
    } else if (badgeVal === "new_arrival") {
      const b = document.createElement("span");
      b.className = "product-badge-bestseller";
      b.style.background = "linear-gradient(135deg, #0284c7, #0369a1)";
      b.innerHTML = `🆕 New Arrival`;
      badgesRow.append(b);
    }

    if (stockVal === "in_stock") {
      const s = document.createElement("span");
      s.className = "product-badge-instock";
      s.textContent = "✓ In Stock";
      badgesRow.append(s);
    } else if (stockVal === "on_order") {
      const s = document.createElement("span");
      s.className = "product-badge-onorder";
      s.textContent = "⌛ On Order (24-48h)";
      badgesRow.append(s);
    }

    // Calculate discount % if MRP available
    const numericPrice = Number(product.price);
    const origPrice = Number(product.original_price);
    if (origPrice && numericPrice && origPrice > numericPrice) {
      const discountPct = Math.round(((origPrice - numericPrice) / origPrice) * 100);
      const d = document.createElement("span");
      d.className = "product-badge-discount";
      d.textContent = `${discountPct}% OFF`;
      badgesRow.append(d);
    }

    if (badgesRow.children.length > 0) {
      content.append(badgesRow);
    }

    // Category & Brand Meta Line
    const metaLine = document.createElement("p");
    metaLine.className = "product-category";
    metaLine.style.marginBottom = "4px";
    metaLine.textContent = `${product.brand ? product.brand + " · " : ""}${product.category_label || "Tech"}`;
    content.append(metaLine);

    // Product Title
    const name = document.createElement("h3");
    name.textContent = product.name;
    name.style.cursor = "pointer";
    name.setAttribute("title", `View details for ${product.name}`);
    name.addEventListener("click", () => openProductDetailsModal(product));
    content.append(name);

    // Warranty Tag
    if (product.warranty) {
      const warTag = document.createElement("div");
      warTag.className = "product-warranty-tag";
      warTag.innerHTML = `<span>🛡️</span> <span>${product.warranty}</span>`;
      content.append(warTag);
    }

    // Price Section (Current Price + MRP + Savings + 0% EMI)
    if (product.price !== null && product.price !== "") {
      const priceWrap = document.createElement("div");
      priceWrap.style.cssText = "margin: 6px 0 10px;";

      const priceRow = document.createElement("div");
      priceRow.style.cssText = "display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;";

      const price = document.createElement("span");
      price.className = "product-price";
      price.style.margin = "0";
      price.textContent = Number.isFinite(numericPrice)
        ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(numericPrice)
        : String(product.price);
      priceRow.append(price);

      if (origPrice && origPrice > numericPrice) {
        const mrpEl = document.createElement("span");
        mrpEl.className = "product-price-mrp";
        mrpEl.textContent = `M.R.P. ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(origPrice)}`;
        priceRow.append(mrpEl);
      }

      priceWrap.append(priceRow);

      // EMI Tag if eligible (>= ₹3000)
      if (Number.isFinite(numericPrice) && numericPrice >= 3000) {
        const emiTag = document.createElement("span");
        emiTag.className = "trending-emi-tag";
        emiTag.style.marginTop = "4px";
        emiTag.textContent = `0% Bajaj EMI from ~₹${Math.round(numericPrice / 12).toLocaleString("en-IN")}/mo`;
        priceWrap.append(emiTag);
      }
      content.append(priceWrap);
    }

    // Action Buttons
    const actionsBar = document.createElement("div");
    actionsBar.className = "product-actions-bar";

    const talkBtn = document.createElement("button");
    talkBtn.type = "button";
    talkBtn.className = "btn-product-talk";
    talkBtn.innerHTML = `<span>💬</span> Order on WhatsApp`;
    talkBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openInquiryModal(product);
    });

    const detailsBtn = document.createElement("button");
    detailsBtn.type = "button";
    detailsBtn.className = "btn-product-call";
    detailsBtn.innerHTML = `<span>🔍</span> Specs`;
    detailsBtn.title = "View Full Specifications";
    detailsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openProductDetailsModal(product);
    });

    actionsBar.append(talkBtn, detailsBtn);
    content.append(actionsBar);

    card.append(imageWrap, content);
    productsGrid.append(card);
  }

  // Update Pagination Wrap
  if (paginationWrap && showingInfo) {
    if (total > visibleCount) {
      paginationWrap.style.display = "block";
      showingInfo.textContent = `Showing ${visibleCount} of ${total} products`;
    } else {
      paginationWrap.style.display = "none";
    }
  }
}

// Bind Load More Button
if (loadMoreBtn) {
  loadMoreBtn.addEventListener("click", () => {
    currentPage++;
    applyFiltersAndRender();
  });
}

// Bind Category Dropdown (Preferred Mobile & Fast Android Filter)
if (categorySelect) {
  categorySelect.addEventListener("change", (e) => {
    activeCategory = e.target.value;
    if (activeCategory !== "accessories" && activeCategory !== "storage" && activeCategory !== "ram") {
      activeSubtype = "";
    }
    currentPage = 1;
    renderCategoryFilters(rawCategoriesList);
    renderSubtypeFilters();
    applyFiltersAndRender();
  });
}

// Bind Brand Filter Dropdown
if (brandFilterSelect) {
  brandFilterSelect.addEventListener("change", (e) => {
    activeBrand = e.target.value;
    currentPage = 1;
    applyFiltersAndRender();
  });
}

// Bind Sort Dropdown
if (sortSelect) {
  sortSelect.addEventListener("change", (e) => {
    activeSort = e.target.value;
    currentPage = 1;
    applyFiltersAndRender();
  });
}

// ---------------------------------------------------------------------------
// Amazon-Style Product Details Modal Logic
// ---------------------------------------------------------------------------
let currentDetailProduct = null;
let pdetailHistoryPushed = false;

const pdetailModal = document.querySelector("#product-detail-modal");
const pdetailBackdrop = document.querySelector("#pdetail-backdrop");
const pdetailCloseBtn = document.querySelector("#pdetail-close-btn");
const pdetailCrumbCat = document.querySelector("#pdetail-crumb-cat");
const pdetailCrumbBrand = document.querySelector("#pdetail-crumb-brand");
const pdetailImg = document.querySelector("#pdetail-img");
const pdetailImgPlaceholder = document.querySelector("#pdetail-img-placeholder");
const pdetailBadgeCat = document.querySelector("#pdetail-badge-category");
const pdetailTitle = document.querySelector("#pdetail-title");
const pdetailBrand = document.querySelector("#pdetail-brand");
const pdetailPriceNum = document.querySelector("#pdetail-price-num");
const pdetailMrpRow = document.querySelector("#pdetail-mrp-row");
const pdetailMrpVal = document.querySelector("#pdetail-mrp-val");
const pdetailDiscountTag = document.querySelector("#pdetail-discount-tag");
const pdetailEmiBox = document.querySelector("#pdetail-emi-box");
const pdetailEmiText = document.querySelector("#pdetail-emi-text");
const pdetailBulletList = document.querySelector("#pdetail-bullet-list");
const pdetailFullDesc = document.querySelector("#pdetail-full-desc");
const pdetailTblBrand = document.querySelector("#pdetail-tbl-brand");
const pdetailTblCategory = document.querySelector("#pdetail-tbl-category");
const pdetailTblType = document.querySelector("#pdetail-tbl-type");
const pdetailTblEmi = document.querySelector("#pdetail-tbl-emi");
const pdetailWaBtn = document.querySelector("#pdetail-wa-btn");
const pdetailWaBtn2 = document.querySelector("#pdetail-wa-btn2");
const pdetailCallBtn = document.querySelector("#pdetail-call-btn");
const pdetailShareBtn = document.querySelector("#pdetail-share-btn");
const pdetailExtLink = document.querySelector("#pdetail-ext-link");

function openProductDetailsModal(product) {
  if (!product || !pdetailModal) return;
  currentDetailProduct = product;

  // Breadcrumbs
  if (pdetailCrumbCat) pdetailCrumbCat.textContent = product.category_label || product.category || "Technology";
  if (pdetailCrumbBrand) pdetailCrumbBrand.textContent = product.brand || "Deep Computers";

  // Category Badge & Title
  if (pdetailBadgeCat) pdetailBadgeCat.textContent = product.category_label || product.category || "Verified Tech";
  if (pdetailTitle) pdetailTitle.textContent = product.name || "Product Name";
  if (pdetailBrand) pdetailBrand.textContent = product.brand || "Authorized Partner Brand";

  // Big Product Image
  const safeImg = safeWebUrl(product.image_url);
  if (pdetailImg && pdetailImgPlaceholder) {
    if (safeImg) {
      pdetailImg.src = safeImg;
      pdetailImg.alt = product.name || "Product Photo";
      pdetailImg.hidden = false;
      pdetailImgPlaceholder.hidden = true;
      pdetailImg.onerror = () => {
        pdetailImg.hidden = true;
        pdetailImgPlaceholder.hidden = false;
      };
    } else {
      pdetailImg.hidden = true;
      pdetailImgPlaceholder.hidden = false;
    }
  }

  // Price & Savings (Amazon-Style M.R.P. & Savings Calculation)
  const numericPrice = Number(product.price);
  if (pdetailPriceNum) {
    if (Number.isFinite(numericPrice) && numericPrice > 0) {
      pdetailPriceNum.textContent = numericPrice.toLocaleString("en-IN");

      // Use actual product.original_price if available, otherwise indicative retail gap
      const origPriceVal = Number(product.original_price);
      const mrp = (origPriceVal && origPriceVal > numericPrice)
        ? origPriceVal
        : Math.round((numericPrice * 1.15) / 50) * 50;
      const savings = mrp - numericPrice;
      const discountPct = Math.round((savings / mrp) * 100);

      if (pdetailMrpRow) pdetailMrpRow.hidden = false;
      if (pdetailMrpVal) pdetailMrpVal.textContent = "₹" + mrp.toLocaleString("en-IN");
      if (pdetailDiscountTag) pdetailDiscountTag.textContent = `Save ₹${savings.toLocaleString("en-IN")} (${discountPct}% off)`;

      // 0% EMI Calculation
      if (pdetailEmiBox) {
        if (numericPrice >= 3000) {
          pdetailEmiBox.hidden = false;
          const emi12 = Math.round(numericPrice / 12);
          const emi6 = Math.round(numericPrice / 6);
          if (pdetailEmiText) {
            pdetailEmiText.textContent = `0% interest Spot EMI starting at ~₹${emi12.toLocaleString("en-IN")}/mo (12 mos) or ~₹${emi6.toLocaleString("en-IN")}/mo (6 mos) with Bajaj Finserv. Spot approval in 10 minutes at our Ramnagar shop with Aadhaar & PAN card.`;
          }
        } else {
          pdetailEmiBox.hidden = true;
        }
      }
    } else {
      pdetailPriceNum.textContent = "Best In-Store Price";
      if (pdetailMrpRow) pdetailMrpRow.hidden = true;
      if (pdetailEmiBox) pdetailEmiBox.hidden = true;
    }
  }

  // Feature Bullets ("About this item")
  if (pdetailBulletList) {
    pdetailBulletList.innerHTML = "";
    const bullets = [];

    // Bullet 1: Genuine Warranty
    bullets.push("<strong>100% Genuine Brand Stock:</strong> Brand-new authorized hardware backed by official manufacturer warranty and original GST invoice.");

    // Bullet 2: Brand / Engineering
    if (product.brand) {
      bullets.push(`<strong>Authorized Brand:</strong> Official ${product.brand} equipment tested for enterprise durability and high everyday performance.`);
    }

    // Bullet 3: Subtypes & Connections
    const sub = (product.subtype || "").toLowerCase();
    const isUsb = sub.includes("usb") || Boolean(product.is_usb);
    const isWireless = sub.includes("wireless") || Boolean(product.is_wireless);
    const isCombo = sub.includes("combo") || Boolean(product.is_combo);

    if (product.subtype) {
      bullets.push(`<strong>Specification / Interface:</strong> ${product.subtype}.`);
    }
    if (isWireless) {
      bullets.push("<strong>Wireless Freedom:</strong> Stable, low-latency wireless connectivity for a clutter-free desk setup.");
    }
    if (isUsb) {
      bullets.push("<strong>Universal USB Plug-and-Play:</strong> Instantly compatible with Windows, macOS, Linux, and Smart TV systems without manual drivers.");
    }
    if (isCombo) {
      bullets.push("<strong>Full Combo Kit:</strong> Engineered keyboard and mouse pairing for optimal workflow and comfort.");
    }

    // Bullet 4: Local Store Assurance
    bullets.push("<strong>In-Store Handoff &amp; Testing:</strong> Immediate pickup available at Deep Computers, Ramnagar. Full testing and unboxing done right at our counter.");
    bullets.push("<strong>Expert After-Sales Support:</strong> Over 25 years of local IT repair and maintenance expertise backing every sale.");

    bullets.forEach(html => {
      const li = document.createElement("li");
      li.className = "pdetail-bullet-item";
      li.innerHTML = html;
      pdetailBulletList.appendChild(li);
    });
  }

  // Technical Specifications Table (Amazon Style)
  if (pdetailTblBrand) pdetailTblBrand.textContent = product.brand || "Deep Computers Authorized Partner";
  if (pdetailTblCategory) pdetailTblCategory.textContent = product.category_label || product.category || "Hardware & Technology";
  if (pdetailTblType) {
    const typeParts = [];
    if (product.subtype) typeParts.push(product.subtype);
    if (product.is_wireless) typeParts.push("Wireless Connectivity");
    if (product.is_usb) typeParts.push("USB Interface");
    if (product.is_combo) typeParts.push("Combo Bundle");
    pdetailTblType.textContent = typeParts.length ? typeParts.join(" · ") : "Standard Verified Tech";
  }
  if (pdetailTblEmi) {
    pdetailTblEmi.textContent = Number.isFinite(numericPrice) && numericPrice >= 3000
      ? `0% Spot EMI with Bajaj Finserv (~₹${Math.round(numericPrice / 12).toLocaleString("en-IN")}/mo) · Spot Counter Approval`
      : "Eligible for credit card EMI & Instant UPI at store counter";
  }

  // Full Description
  if (pdetailFullDesc) {
    pdetailFullDesc.textContent = product.description || "Detailed specifications, warranty coverage, and setup instructions are available directly at our shop or through our WhatsApp helpline.";
  }

  // External Link (Manufacturer)
  const productUrl = safeWebUrl(product.product_url);
  if (pdetailExtLink) {
    if (productUrl) {
      pdetailExtLink.href = productUrl;
      pdetailExtLink.hidden = false;
    } else {
      pdetailExtLink.hidden = true;
    }
  }

  // WhatsApp Button Links
  const formattedPrice = Number.isFinite(numericPrice) && numericPrice > 0 ? `₹${numericPrice.toLocaleString("en-IN")}` : "Best in-store price";
  const waMessage = [
    "Hello Deep Computers Team! 👋",
    "",
    "I am viewing this product and would like to order or check stock:",
    `📦 *${product.name}*`,
    product.brand ? `🏷️ Brand: ${product.brand}` : null,
    product.category_label ? `📁 Category: ${product.category_label}` : null,
    `💰 Listed Price: ${formattedPrice}`,
    "",
    "Please let me know current shop availability, EMI options, and delivery/pickup schedule."
  ].filter(Boolean).join("\n");

  const waEncoded = encodeURIComponent(waMessage);
  const pdetailWaBtn3 = document.querySelector("#pdetail-wa-btn3");
  if (pdetailWaBtn) pdetailWaBtn.href = `https://wa.me/919927079209?text=${waEncoded}`;
  if (pdetailWaBtn2) pdetailWaBtn2.href = `https://wa.me/918218762210?text=${waEncoded}`;
  if (pdetailWaBtn3) pdetailWaBtn3.href = `https://wa.me/919837022521?text=${waEncoded}`;
  if (pdetailCallBtn) pdetailCallBtn.href = "tel:+919927079209";

  // Share Product Link
  if (pdetailShareBtn) {
    pdetailShareBtn.onclick = async () => {
      const canonicalBase = (window.location.hostname.includes("trycloudflare.com") || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ? "https://deepcomputers.deepcomputers.workers.dev" : window.location.origin;
      const shareUrl = `${canonicalBase}/catalog.html?product=${product.id}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `${product.name} - Deep Computers`,
            text: `Check out ${product.name} at Deep Computers & Telecom, Ramnagar!`,
            url: shareUrl,
          });
          return;
        } catch (err) {}
      }
      try {
        await navigator.clipboard.writeText(shareUrl);
        const originalText = pdetailShareBtn.innerHTML;
        pdetailShareBtn.innerHTML = `<span>✓</span> Copied!`;
        setTimeout(() => { pdetailShareBtn.innerHTML = originalText; }, 2000);
      } catch (err) {
        alert(`Product Link: ${shareUrl}`);
      }
    };
  }

  // Open modal
  pdetailModal.hidden = false;
  document.body.style.overflow = "hidden";

  // Android Back Button / History state
  if (!pdetailHistoryPushed) {
    try {
      history.pushState({ pdetailOpen: true, productId: product.id }, "");
      pdetailHistoryPushed = true;
    } catch (e) {}
  }
}

function closeProductDetailsModal(skipHistory = false) {
  if (!pdetailModal) return;
  pdetailModal.hidden = true;
  document.body.style.overflow = "";

  if (pdetailHistoryPushed && !skipHistory) {
    pdetailHistoryPushed = false;
    if (history.state?.pdetailOpen) {
      history.back();
    }
  }
}

if (pdetailCloseBtn) pdetailCloseBtn.addEventListener("click", () => closeProductDetailsModal());
if (pdetailBackdrop) pdetailBackdrop.addEventListener("click", () => closeProductDetailsModal());

// ---------------------------------------------------------------------------
// Product Inquiry Modal Helpers
// ---------------------------------------------------------------------------
let currentInquiryProduct = null;
const inquiryModal = document.querySelector("#inquiry-modal");
const inquiryBackdrop = document.querySelector("#inquiry-modal-backdrop");
const inquiryCloseBtn = document.querySelector("#inquiry-modal-close");
const inquiryProductSummary = document.querySelector("#inquiry-product-summary");
const inquiryTextarea = document.querySelector("#inquiry-concern-input");
const inquiryWhatsAppBtn = document.querySelector("#inquiry-whatsapp-btn");
const inquiryWhatsAppBtn2 = document.querySelector("#inquiry-whatsapp-btn-2");
const inquiryChips = document.querySelectorAll(".inquiry-chip");

function formatPriceINR(price) {
  if (price === null || price === "" || price === undefined) return "";
  const num = Number(price);
  return Number.isFinite(num)
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(num)
    : String(price);
}

function updateWhatsAppLink() {
  if (!currentInquiryProduct) return;
  const concern = (inquiryTextarea ? inquiryTextarea.value.trim() : "") || "Please share availability, best price and warranty.";
  const priceStr = formatPriceINR(currentInquiryProduct.price);

  const lines = [
    "Hello Deep Computers Team! 👋",
    "",
    "I would like to inquire about this product:",
    `📦 *Product:* ${currentInquiryProduct.name || "N/A"}`,
    currentInquiryProduct.brand ? `🏷️ *Brand:* ${currentInquiryProduct.brand}` : null,
    currentInquiryProduct.category_label ? `📁 *Category:* ${currentInquiryProduct.category_label}` : null,
    currentInquiryProduct.subtype ? `🔌 *Type:* ${currentInquiryProduct.subtype}` : null,
    priceStr ? `💰 *Price:* ${priceStr}` : null,
    "",
    `*My Concern / Requirement:*`,
    concern
  ].filter(line => line !== null).join("\n");

  const query = encodeURIComponent(lines);
  const inquiryWhatsAppBtn3 = document.getElementById("inquiry-whatsapp-btn-3");
  if (inquiryWhatsAppBtn) {
    inquiryWhatsAppBtn.href = `https://wa.me/919927079209?text=${query}`;
  }
  if (inquiryWhatsAppBtn2) {
    inquiryWhatsAppBtn2.href = `https://wa.me/918218762210?text=${query}`;
  }
  if (inquiryWhatsAppBtn3) {
    inquiryWhatsAppBtn3.href = `https://wa.me/919837022521?text=${query}`;
  }
}

let inquiryHistoryPushed = false;

function openInquiryModal(product) {
  currentInquiryProduct = product;
  if (!inquiryModal) return;

  const priceFormatted = formatPriceINR(product.price);
  const imageUrl = safeWebUrl(product.image_url);

  if (inquiryProductSummary) {
    inquiryProductSummary.innerHTML = `
      ${imageUrl ? `<img src="${imageUrl}" alt="${product.name}" class="inquiry-product-thumb" />` : `<div class="inquiry-product-thumb" style="display:grid;place-items:center;font-weight:bold;color:#889bb5;font-size:10px;">ITEM</div>`}
      <div class="inquiry-product-details">
        <h4 class="inquiry-product-title">${product.name}</h4>
        <p class="inquiry-product-meta">${product.brand ? product.brand + " · " : ""}${product.category_label || "Tech"}${product.subtype ? " (" + product.subtype + ")" : ""}</p>
        ${priceFormatted ? `<p class="inquiry-product-price">${priceFormatted}</p>` : ""}
      </div>
    `;
  }

  if (inquiryTextarea) {
    inquiryTextarea.value = "Is this currently in stock at the shop? What is your best price?";
  }

  if (inquiryChips) {
    inquiryChips.forEach((chip, idx) => {
      chip.classList.toggle("is-active", idx === 0);
    });
  }

  updateWhatsAppLink();
  inquiryModal.hidden = false;
  document.body.style.overflow = "hidden";

  if (!inquiryHistoryPushed) {
    try {
      history.pushState({ inquiryModalOpen: true }, "");
      inquiryHistoryPushed = true;
    } catch (e) {}
  }
}

function closeInquiryModal(skipHistory = false) {
  if (!inquiryModal) return;
  inquiryModal.hidden = true;
  document.body.style.overflow = "";

  if (inquiryHistoryPushed && !skipHistory) {
    inquiryHistoryPushed = false;
    if (history.state?.inquiryModalOpen) {
      history.back();
    }
  }
}

window.addEventListener("popstate", () => {
  if (pdetailModal && !pdetailModal.hidden) {
    pdetailHistoryPushed = false;
    closeProductDetailsModal(true);
  }
  if (inquiryModal && !inquiryModal.hidden) {
    inquiryHistoryPushed = false;
    closeInquiryModal(true);
  }
});

if (inquiryCloseBtn) inquiryCloseBtn.addEventListener("click", closeInquiryModal);
if (inquiryBackdrop) inquiryBackdrop.addEventListener("click", closeInquiryModal);
if (inquiryTextarea) inquiryTextarea.addEventListener("input", updateWhatsAppLink);

if (inquiryChips) {
  inquiryChips.forEach(chip => {
    chip.addEventListener("click", () => {
      inquiryChips.forEach(c => c.classList.remove("is-active"));
      chip.classList.add("is-active");
      if (inquiryTextarea && chip.dataset.text) {
        inquiryTextarea.value = chip.dataset.text;
        updateWhatsAppLink();
      }
    });
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (pdetailModal && !pdetailModal.hidden) {
      closeProductDetailsModal();
    } else if (inquiryModal && !inquiryModal.hidden) {
      closeInquiryModal();
    }
  }
});

// ---------------------------------------------------------------------------
// Data Loading
// ---------------------------------------------------------------------------
async function loadProducts() {
  if (requestController) requestController.abort();
  requestController = new AbortController();

  if (resultsCount) resultsCount.textContent = "Loading live catalog…";
  try {
    let response = await fetch("/api/products", {
      signal: requestController.signal,
    });
    if (!response.ok) {
      // Fallback to static JSON file
      response = await fetch("/assets/data/products.json", {
        signal: requestController.signal,
      });
    }
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const payload = await response.json();
    
    // Handle both {products: [...], categories: [...]} and {products: [...]}
    rawProductsList = Array.isArray(payload.products) ? payload.products : [];
    rawCategoriesList = Array.isArray(payload.categories) ? payload.categories : [
      { value: "laptops", label: "Laptops & Desktops" },
      { value: "cctv", label: "CCTV & Security" },
      { value: "storage", label: "Storage" },
      { value: "ram", label: "RAM" },
      { value: "routers", label: "Routers & Wi-Fi" },
      { value: "printers", label: "Printers" },
      { value: "ink", label: "Ink & Toners" },
      { value: "adapters", label: "Adapters & Chargers" },
      { value: "speakers", label: "Speakers & Audio" },
      { value: "accessories", label: "Accessories" },
      { value: "cables", label: "Cables & Connectors" },
      { value: "daily-use", label: "Daily Tech Essentials" }
    ];

    renderCategoryFilters(rawCategoriesList);
    renderSubtypeFilters();
    populateBrandFilter();
    applyFiltersAndRender();

    // Check for deep-linked product ID (?product=...)
    const targetProductId = urlParams.get("product");
    if (targetProductId) {
      const match = rawProductsList.find(p => String(p.id) === String(targetProductId));
      if (match) {
        setTimeout(() => openProductDetailsModal(match), 100);
      }
    }
  } catch (error) {
    if (error.name === "AbortError") return;
    console.error("Unable to load product catalog:", error);
    if (resultsCount) resultsCount.textContent = "Catalog unavailable";
    showCatalogMessage("Unable to load products right now. Please refresh or try again later.", true);
  }
}

// Bind Selling Status Tabs
document.querySelectorAll(".selling-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".selling-tab-btn").forEach(b => {
      b.classList.remove("is-active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("is-active");
    btn.setAttribute("aria-selected", "true");
    activeSellingFilter = btn.dataset.selling || "all";
    currentPage = 1;
    applyFiltersAndRender();
  });
});

// Bind Price Range Chips
document.querySelectorAll(".price-chip").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".price-chip").forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    activePriceRange = btn.dataset.price || "all";
    currentPage = 1;
    applyFiltersAndRender();
  });
});

// Search form & debounced input
if (searchForm) {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(searchTimer);
    currentPage = 1;
    applyFiltersAndRender();
  });
}

if (searchInput) {
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      applyFiltersAndRender();
    }, 150);
  });
}

// Year footer
const yearEl = document.querySelector("#current-year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Initial load
loadProducts();

// Mobile Drawer Navigation
(function() {
  const toggleBtn = document.querySelector("#mobile-menu-toggle");
  const drawer = document.querySelector("#mobile-drawer");
  const closeBtn = document.querySelector("#drawer-close-btn");
  const backdrop = document.querySelector("#drawer-backdrop");

  if (!drawer || !toggleBtn) return;

  function openDrawer() {
    drawer.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    drawer.hidden = true;
    document.body.style.overflow = "";
  }

  toggleBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (backdrop) backdrop.addEventListener("click", closeDrawer);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) {
      closeDrawer();
    }
  });
})();
