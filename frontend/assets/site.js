const safeWebUrl = (value) => {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch (err) {
    return "";
  }
};

function showMessage(container, message, isError = false) {
  if (!container) return;
  container.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = isError ? "empty-state error-state" : "empty-state";
  paragraph.textContent = message;
  container.append(paragraph);
}

function renderBrands(brands) {
  const grid = document.querySelector("#brands-grid");
  if (!grid) return;
  grid.replaceChildren();
  if (!brands.length) {
    showMessage(grid, "Our brand partners will be featured here soon.");
    return;
  }

  for (const brand of brands) {
    const websiteUrl = safeWebUrl(brand.website_url);
    const card = document.createElement(websiteUrl ? "a" : "article");
    card.className = "brand-card";
    if (websiteUrl) {
      card.href = websiteUrl;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      card.setAttribute("aria-label", `Visit ${brand.name} website`);
    }

    const mark = document.createElement("div");
    mark.className = "brand-mark";
    mark.setAttribute("aria-hidden", "true");
    const initials = document.createElement("span");
    initials.textContent = brand.name.slice(0, 2).toUpperCase();
    mark.append(initials);

    const logoSources = [];
    const logoUrl = safeWebUrl(brand.logo_url);
    if (logoUrl) logoSources.push(logoUrl);
    if (websiteUrl) {
      const domain = new URL(websiteUrl).hostname;
      logoSources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`);
    }

    if (logoSources.length) {
      const logo = document.createElement("img");
      logo.loading = "lazy";
      let sourceIndex = 0;
      logo.addEventListener("load", () => {
        initials.hidden = true;
      });
      logo.addEventListener("error", () => {
        sourceIndex += 1;
        if (sourceIndex < logoSources.length) {
          logo.src = logoSources[sourceIndex];
        } else {
          logo.remove();
        }
      });
      logo.src = logoSources[sourceIndex];
      mark.append(logo);
    }

    const name = document.createElement("h3");
    name.textContent = brand.name;
    card.append(mark, name);
    grid.append(card);
  }
  initScrollReveal();
}

function renderCertificates(certificates) {
  const grid = document.querySelector("#certificates-grid");
  if (!grid) return;
  grid.replaceChildren();
  if (!certificates.length) {
    showMessage(grid, "Our professional certificates will be shared here soon.");
    return;
  }

  for (const certificate of certificates) {
    const card = document.createElement("article");
    card.className = "certificate-card";
    const icon = document.createElement("div");
    icon.className = "certificate-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✓";
    const content = document.createElement("div");
    content.className = "certificate-content";
    const issuer = document.createElement("p");
    issuer.className = "certificate-issuer";
    issuer.textContent = certificate.issuer || "Professional credential";
    const title = document.createElement("h3");
    title.textContent = certificate.title;
    content.append(issuer, title);
    if (certificate.description) {
      const description = document.createElement("p");
      description.className = "certificate-description";
      description.textContent = certificate.description;
      content.append(description);
    }
    const metadata = [];
    if (certificate.issued_on) metadata.push(`Issued ${certificate.issued_on}`);
    if (certificate.expires_on) metadata.push(`Expires ${certificate.expires_on}`);
    if (certificate.credential_id) metadata.push(`ID ${certificate.credential_id}`);
    if (metadata.length) {
      const details = document.createElement("p");
      details.className = "certificate-meta";
      details.textContent = metadata.join(" · ");
      content.append(details);
    }
    const documentUrl = safeWebUrl(certificate.document_url);
    if (documentUrl) {
      const isImage = /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(documentUrl);
      if (isImage) {
        const thumbLink = document.createElement("a");
        thumbLink.href = documentUrl;
        thumbLink.target = "_blank";
        thumbLink.rel = "noopener noreferrer";
        thumbLink.className = "certificate-thumb-link";
        thumbLink.setAttribute("title", `Click to view official certificate: ${certificate.title}`);

        const img = document.createElement("img");
        img.src = documentUrl;
        img.alt = certificate.title;
        img.className = "certificate-thumb-img";
        img.loading = "lazy";

        const badge = document.createElement("span");
        badge.className = "certificate-thumb-badge";
        badge.textContent = "🔍 Click to View Official Certificate";

        thumbLink.append(img, badge);
        content.append(thumbLink);
      } else {
        const link = document.createElement("a");
        link.href = documentUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "certificate-link";
        link.textContent = "View credential ↗";
        content.append(link);
      }
    }
    card.append(icon, content);
    grid.append(card);
  }
  initScrollReveal();
}

async function loadCollection(endpoint, render, container, itemKey) {
  if (!container) return;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    const payload = await response.json();
    if (!Array.isArray(payload[itemKey])) throw new Error("The server returned an invalid response.");
    render(payload[itemKey]);
  } catch (error) {
    console.error(`Unable to load ${itemKey}:`, error);
    showMessage(container, "We couldn't load this section right now. Please try again later.", true);
  }
}

const yearEl = document.querySelector("#current-year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

loadCollection("/api/brands", renderBrands, document.querySelector("#brands-grid"), "brands");
loadCollection("/api/certificates", renderCertificates, document.querySelector("#certificates-grid"), "certificates");

// Mobile Drawer Controller (With Android Back Gesture Support)
function initMobileDrawer() {
  const toggleBtn = document.querySelector("#mobile-menu-toggle");
  const drawer = document.querySelector("#mobile-drawer");
  const closeBtn = document.querySelector("#drawer-close-btn");
  const backdrop = document.querySelector("#drawer-backdrop");

  if (!drawer || !toggleBtn) return;

  let drawerHistoryPushed = false;

  function openDrawer() {
    drawer.hidden = false;
    document.body.style.overflow = "hidden";
    if (!drawerHistoryPushed) {
      try {
        history.pushState({ mobileDrawerOpen: true }, "");
        drawerHistoryPushed = true;
      } catch (err) {}
    }
  }

  function closeDrawer(skipHistory = false) {
    drawer.hidden = true;
    document.body.style.overflow = "";
    if (drawerHistoryPushed && !skipHistory) {
      drawerHistoryPushed = false;
      if (history.state?.mobileDrawerOpen) {
        history.back();
      }
    }
  }

  toggleBtn.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", () => closeDrawer());
  if (backdrop) backdrop.addEventListener("click", () => closeDrawer());

  drawer.querySelectorAll(".drawer-anchor-link, .drawer-item").forEach(link => {
    link.addEventListener("click", () => {
      if (link.getAttribute("href")?.startsWith("#")) {
        closeDrawer();
      }
    });
  });

  window.addEventListener("popstate", () => {
    if (!drawer.hidden) {
      drawerHistoryPushed = false;
      closeDrawer(true);
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) {
      closeDrawer();
    }
  });
}

// Hero Carousel Controller (Dissolve & Crossfade Transition)
function initHeroCarousel() {
  const slider = document.querySelector("#hero-slider");
  const slides = slider ? slider.querySelectorAll(".hero-slide") : [];
  const dots = document.querySelectorAll(".hero-dot");
  const prevBtn = document.querySelector("#hero-prev-btn");
  const nextBtn = document.querySelector("#hero-next-btn");
  if (!slider || !slides.length) return;

  let currentIndex = 0;
  const totalSlides = slides.length;
  let autoplayTimer = null;

  function goToSlide(index) {
    currentIndex = (index + totalSlides) % totalSlides;
    slides.forEach((slide, idx) => {
      const isActive = idx === currentIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", isActive ? "false" : "true");
    });
    dots.forEach((dot, idx) => {
      dot.classList.toggle("is-active", idx === currentIndex);
      dot.setAttribute("aria-selected", idx === currentIndex ? "true" : "false");
    });
  }

  // Ensure initial active state
  goToSlide(0);

  dots.forEach(dot => {
    dot.addEventListener("click", () => {
      const idx = parseInt(dot.getAttribute("data-index"), 10);
      goToSlide(idx);
      resetAutoplay();
    });
  });

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      goToSlide(currentIndex - 1);
      resetAutoplay();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      goToSlide(currentIndex + 1);
      resetAutoplay();
    });
  }

  function startAutoplay() {
    autoplayTimer = setInterval(() => {
      goToSlide(currentIndex + 1);
    }, 5500);
  }

  function resetAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
    startAutoplay();
  }

  // Touch swipe support for Android / Mobile screens
  let startX = 0;
  let endX = 0;
  slider.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  slider.addEventListener("touchend", (e) => {
    endX = e.changedTouches[0].clientX;
    const diff = startX - endX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) {
        goToSlide(currentIndex + 1);
      } else {
        goToSlide(currentIndex - 1);
      }
      resetAutoplay();
    }
  }, { passive: true });

  startAutoplay();
}

// Hot Trending / Bestsellers Interactive Section Controller
let allLoadedProducts = [];

async function initTrendingSection() {
  const container = document.querySelector("#trending-grid");
  const tabs = document.querySelectorAll(".trending-tab-btn");
  if (!container) return;

  try {
    const res = await fetch("/api/products");
    if (!res.ok) throw new Error("Failed to load products");
    const data = await res.json();
    allLoadedProducts = Array.isArray(data.products) ? data.products : [];
    renderTrendingProducts("");
  } catch (err) {
    console.error("Error loading trending products:", err);
    container.innerHTML = `<p class="empty-state">Unable to load featured gadgets right now.</p>`;
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => {
        t.classList.remove("is-active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("is-active");
      tab.setAttribute("aria-selected", "true");
      const cat = tab.getAttribute("data-category") || "";
      renderTrendingProducts(cat);
    });
  });
}

function renderTrendingProducts(categoryFilter) {
  const container = document.querySelector("#trending-grid");
  if (!container) return;
  container.replaceChildren();

  let selected = [];

  if (!categoryFilter) {
    // Curate 2 products from each major category for "All Trending / Bestsellers"
    const departmentGroups = [
      {
        name: "Laptops & Desktops",
        filter: p => (p.category || "").toLowerCase() === "laptops",
      },
      {
        name: "CCTV & Security",
        filter: p => (p.category || "").toLowerCase() === "cctv",
      },
      {
        name: "Audio & Sound",
        filter: p => (p.category || "").toLowerCase() === "speakers",
      },
      {
        name: "Peripherals & Combos",
        filter: p => ["accessories", "peripherals"].includes((p.category || "").toLowerCase()),
      },
      {
        name: "Networking & Wi-Fi",
        filter: p => ["routers", "networking"].includes((p.category || "").toLowerCase()),
      },
      {
        name: "Printers & Inks",
        filter: p => ["printers", "ink"].includes((p.category || "").toLowerCase()),
      },
      {
        name: "Storage",
        filter: p => ["storage", "pendrives"].includes((p.category || "").toLowerCase()),
      },
      {
        name: "RAM",
        filter: p => (p.category || "").toLowerCase() === "ram",
      },
    ];

    departmentGroups.forEach(grp => {
      const inGroup = allLoadedProducts.filter(grp.filter);
      const sorted = [...inGroup].sort((a, b) => {
        const orderA = a.display_order && a.display_order > 0 ? a.display_order : 9999;
        const orderB = b.display_order && b.display_order > 0 ? b.display_order : 9999;
        if (orderA !== orderB) return orderA - orderB;
        const hasImgA = a.image_url ? 1 : 0;
        const hasImgB = b.image_url ? 1 : 0;
        if (hasImgA !== hasImgB) return hasImgB - hasImgA;
        return (b.id || 0) - (a.id || 0);
      });
      selected.push(...sorted.slice(0, 2));
    });
  } else {
    // Single category tab filtered view
    const filtered = allLoadedProducts.filter(p => {
      const cat = (p.category || "").toLowerCase();
      if (categoryFilter === "accessories") {
        return cat === "accessories" || cat === "peripherals" || cat === "daily-use";
      }
      if (categoryFilter === "routers") {
        return cat === "routers" || cat === "networking";
      }
      if (categoryFilter === "printers") {
        return cat === "printers" || cat === "ink";
      }
      if (categoryFilter === "storage" || categoryFilter === "pendrives") {
        return cat === "pendrives" || cat === "storage";
      }
      if (categoryFilter === "ram") {
        return cat === "ram";
      }
      return cat === categoryFilter;
    });

    const sorted = [...filtered].sort((a, b) => {
      const orderA = a.display_order && a.display_order > 0 ? a.display_order : 9999;
      const orderB = b.display_order && b.display_order > 0 ? b.display_order : 9999;
      if (orderA !== orderB) return orderA - orderB;
      const hasImgA = a.image_url ? 1 : 0;
      const hasImgB = b.image_url ? 1 : 0;
      if (hasImgA !== hasImgB) return hasImgB - hasImgA;
      return (b.id || 0) - (a.id || 0);
    });

    selected = sorted.slice(0, 12);
  }

  if (!selected.length) {
    const emptyMsg = document.createElement("p");
    emptyMsg.className = "empty-state";
    emptyMsg.textContent = "No products found in this category right now.";
    container.appendChild(emptyMsg);
    return;
  }

  selected.forEach(prod => {
    const card = document.createElement("article");
    card.className = "trending-card";

    // Whole card is clickable (Amazon-Style trending card)
    card.addEventListener("click", (e) => {
      if (e.target.closest(".trending-btn-wa, .btn-product-quickview")) {
        return;
      }
      openProductDetailsModal(prod);
    });

    // Badge
    const badge = document.createElement("span");
    badge.className = "trending-badge";
    const brandName = (prod.brand || "").toLowerCase();
    if (brandName.includes("finger")) {
      badge.className += " trending-badge-fingers";
      badge.textContent = "⚡ FINGERS TECH";
    } else if (prod.price && prod.price >= 30000) {
      badge.className += " trending-badge-bestseller";
      badge.textContent = "★ 0% EMI READY";
    } else if (prod.display_order && prod.display_order > 0) {
      badge.className += " trending-badge-bestseller";
      badge.textContent = "★ BESTSELLER";
    } else {
      badge.textContent = "GENUINE BRAND";
    }
    card.appendChild(badge);

    // Image Wrap (Clickable Details)
    const imgWrap = document.createElement("div");
    imgWrap.className = "trending-img-wrap";
    imgWrap.style.cursor = "pointer";
    imgWrap.setAttribute("title", `View details & specs for ${prod.name}`);
    imgWrap.addEventListener("click", () => openProductDetailsModal(prod));
    if (prod.image_url) {
      const img = document.createElement("img");
      img.className = "trending-img";
      img.src = prod.image_url;
      img.alt = prod.name;
      img.loading = "lazy";
      img.onerror = () => {
        imgWrap.textContent = "💻";
        imgWrap.style.fontSize = "48px";
      };
      imgWrap.appendChild(img);
    } else {
      imgWrap.textContent = "💻";
      imgWrap.style.fontSize = "48px";
    }
    card.appendChild(imgWrap);

    // Body
    const body = document.createElement("div");
    body.className = "trending-body";

    const meta = document.createElement("div");
    meta.className = "trending-meta";

    const catLabel = document.createElement("span");
    catLabel.className = "trending-category";
    catLabel.textContent = prod.category_label || prod.category || "Gadget";

    const brandLabel = document.createElement("span");
    brandLabel.className = "trending-brand";
    brandLabel.textContent = prod.brand || "Deep Computers";

    meta.appendChild(catLabel);
    meta.appendChild(brandLabel);
    body.appendChild(meta);

    const title = document.createElement("h3");
    title.className = "trending-title";
    title.textContent = prod.name;
    title.style.cursor = "pointer";
    title.setAttribute("title", `View details & specs for ${prod.name}`);
    title.addEventListener("click", () => openProductDetailsModal(prod));
    body.appendChild(title);

    // Price & EMI Wrap
    const priceWrap = document.createElement("div");
    priceWrap.className = "trending-price-wrap";

    const priceText = document.createElement("span");
    priceText.className = "trending-price";
    if (prod.price) {
      priceText.textContent = `₹${Number(prod.price).toLocaleString("en-IN")}`;
      priceWrap.appendChild(priceText);

      if (prod.price >= 3000) {
        const emiTag = document.createElement("span");
        emiTag.className = "trending-emi-tag";
        const emiPerMonth = Math.round(prod.price / 12);
        emiTag.textContent = `EMI ~₹${emiPerMonth.toLocaleString("en-IN")}/mo`;
        priceWrap.appendChild(emiTag);
      }
    } else {
      priceText.textContent = "Price on inquiry";
      priceWrap.appendChild(priceText);
    }
    body.appendChild(priceWrap);

    // Amazon-Style View Details Button
    const detailsBtn = document.createElement("button");
    detailsBtn.type = "button";
    detailsBtn.className = "btn-product-quickview";
    detailsBtn.innerHTML = `<span>🔍</span> View Details &amp; Specs`;
    detailsBtn.setAttribute("aria-label", `View details and specifications for ${prod.name}`);
    detailsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openProductDetailsModal(prod);
    });
    body.appendChild(detailsBtn);

    // WhatsApp Direct Button
    const waBtn = document.createElement("a");
    waBtn.className = "trending-btn-wa";
    const waText = `Hello Deep Computers Team, I am interested in purchasing ${prod.name}${prod.price ? ' (Price: ₹' + Number(prod.price).toLocaleString('en-IN') + ')' : ''}. Is it available at your Ramnagar store?`;
    waBtn.href = `https://wa.me/919927079209?text=${encodeURIComponent(waText)}`;
    waBtn.target = "_blank";
    waBtn.rel = "noopener noreferrer";
    waBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.04 14.69 2 12.04 2ZM12.05 20.15C10.57 20.15 9.12 19.76 7.85 19L7.55 18.82L4.43 19.64L5.26 16.6L5.06 16.29C4.24 14.99 3.8 13.47 3.8 11.91C3.8 7.37 7.5 3.67 12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.05 20.15ZM16.57 14.39C16.32 14.27 15.11 13.67 14.88 13.59C14.66 13.5 14.49 13.46 14.33 13.71C14.16 13.96 13.69 14.51 13.54 14.68C13.4 14.85 13.25 14.87 13 14.75C12.75 14.63 11.95 14.36 11 13.52C10.26 12.86 9.76 12.05 9.61 11.8C9.47 11.55 9.6 11.41 9.72 11.29C9.83 11.18 9.97 11 10.09 10.86C10.22 10.72 10.26 10.62 10.34 10.45C10.43 10.28 10.38 10.14 10.32 10.01C10.26 9.89 9.76 8.67 9.56 8.16C9.36 7.67 9.15 7.73 9 7.73C8.86 7.72 8.69 7.72 8.52 7.72C8.36 7.72 8.08 7.78 7.85 8.03C7.62 8.28 6.97 8.89 6.97 10.13C6.97 11.37 7.87 12.57 8 12.74C8.13 12.91 9.78 15.45 12.3 16.54C12.9 16.8 13.37 16.96 13.73 17.07C14.33 17.26 14.88 17.23 15.31 17.17C15.8 17.1 16.81 16.56 17.02 15.97C17.23 15.38 17.23 14.88 17.17 14.77C17.1 14.66 16.95 14.6 16.7 14.48L16.57 14.39Z" />
      </svg>
      <span>Inquire on WhatsApp</span>
    `;
    body.appendChild(waBtn);

    card.appendChild(body);
    container.appendChild(card);
  });

  initScrollReveal();
}

// FINGERS-style "HI-FIVE" Quick Support Drawer Controller
function initQuickSupportDrawer() {
  const triggerPill = document.querySelector("#quick-support-pill");
  const drawer = document.querySelector("#quick-support-drawer");
  const closeBtn = document.querySelector("#quick-support-close");

  if (!drawer || !triggerPill) return;

  triggerPill.addEventListener("click", (e) => {
    e.preventDefault();
    drawer.hidden = !drawer.hidden;
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      drawer.hidden = true;
    });
  }

  document.addEventListener("click", (e) => {
    if (!drawer.hidden && !drawer.contains(e.target) && !triggerPill.contains(e.target)) {
      drawer.hidden = true;
    }
  });
}

// Scroll-Driven Entrance Animation Observer (IntersectionObserver)
function initScrollReveal() {
  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll(".reveal, .cat-tile, .pillar-card, .trending-card, .fingers-spotlight-card, .bajaj-banner-card, .bridge-card, .brand-card, .certificate-card, .location-card-container").forEach(el => {
      el.classList.add("is-revealed");
    });
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-revealed");
        obs.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.08,
    rootMargin: "0px 0px -30px 0px"
  });

  const targets = document.querySelectorAll(
    ".reveal, .cat-tile, .pillar-card, .trending-card, .fingers-spotlight-card, .bajaj-banner-card, .bridge-card, .brand-card, .certificate-card, .location-card-container"
  );

  targets.forEach((el, index) => {
    if (!el.classList.contains("reveal")) {
      el.classList.add("reveal");
    }
    const staggerIndex = (index % 8) + 1;
    el.classList.add(`stagger-${staggerIndex}`);
    observer.observe(el);
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

      // Indicative M.R.P. markup (~18% - 25% typical retail gap)
      const mrp = Math.round((numericPrice * 1.22) / 50) * 50;
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

window.addEventListener("popstate", () => {
  if (pdetailModal && !pdetailModal.hidden) {
    pdetailHistoryPushed = false;
    closeProductDetailsModal(true);
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pdetailModal && !pdetailModal.hidden) {
    closeProductDetailsModal();
  }
});

initMobileDrawer();
initHeroCarousel();
initTrendingSection();
initQuickSupportDrawer();
initScrollReveal();