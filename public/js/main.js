// /public/js/main.js

/* ================================
   Utils y estado
===================================*/
const LS_KEY = "cart";
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const moneyFmt = new Intl.NumberFormat("es-GT", {
  style: "currency",
  currency: "GTQ",
  minimumFractionDigits: 2
});

let cart = safeReadCart();

/* API helpers (desde api.js) */
import { getProducts } from './api.js';

/* ================================
   Init
===================================*/
document.addEventListener("DOMContentLoaded", async () => {
  // 0) Si hay un contenedor de productos, cargamos desde la API
  if ($('#productsGrid')) {
    try {
      const products = await getProducts();
      renderProducts(products);
    } catch (e) {
      console.error(e);
      $('#productsGrid').innerHTML = `<div class="col-12"><div class="alert alert-danger">No se pudieron cargar los productos.</div></div>`;
    }
  }

  // 1) Carrito: delegación de eventos (soporta elementos nuevos)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".add-to-cart");
    if (!btn) return;

    const info = getProductInfoFromButton(btn);
    addToCart(info);
    updateCartCount();
    toast(`Añadido: ${info.name} – ${moneyFmt.format(info.price)}`);

    // Evento de medición (si existe dataLayer/gtag)
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: "add_to_cart",
        item_id: info.id,
        item_name: info.name,
        value: info.price,
        currency: "GTQ",
        quantity: 1
      });
    } catch (_) {}
  });

  // 2) Tabs por categoría
  const filterButtons = $$("#categoryFilters button");
  const products = $$(".product");

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const category = button.getAttribute("data-filter");

      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      products.forEach((product) => {
        const productCategory = product.getAttribute("data-category");
        const visible = category === "all" || productCategory === category;
        product.style.display = visible ? "" : "none";
      });

      applyGlobalFilters();
    });
  });

  // 3) Filtros globales (buscador/material/precio)
  ["input", "change"].forEach((ev) => {
    $("#search")?.addEventListener(ev, debounce(applyGlobalFilters, 150));
    $("#filterMaterial")?.addEventListener(ev, applyGlobalFilters);
    $("#filterPrice")?.addEventListener(ev, () => {
      const v = Number($("#filterPrice").value || 0);
      $("#filterPriceValue") && ($("#filterPriceValue").textContent = v ? `≤ Q${v}` : "Todos");
      applyGlobalFilters();
    });
  });

  updateCartCount();
  window.addEventListener("storage", (ev) => {
    if (ev.key === LS_KEY) {
      cart = safeReadCart();
      updateCartCount();
    }
  });
});

/* Render dinámico de cards */
function renderProducts(list) {
  const grid = $('#productsGrid');
  if (!grid) return;
  grid.innerHTML = list.map(p => {
    return `
      <div class="col-md-4 mb-4 product"
           data-category="${p.Categoria}"
           data-material="${p.Material || ''}"
           data-price="${Number(p.Precio)}"
           data-id="${p.Id}">
        <div class="card h-100">
          <img src="${p.ImagenUrl}" class="card-img-top" alt="${p.Nombre}">
          <div class="card-body text-center d-flex flex-column">
            <h5 class="card-title product-title">${p.Nombre}</h5>
            <p class="card-text mb-2">${moneyFmt.format(p.Precio)}</p>
            <button class="btn btn-outline-dark mt-auto add-to-cart"
                    data-id="${p.Id}"
                    data-name="${p.Nombre}"
                    data-price="${p.Precio}">
              <i class="fa fa-shopping-cart"></i> Agregar
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* ================================
   Carrito
===================================*/
function addToCart({ id, name, price }) {
  if (!id) return;
  const existing = cart.find((p) => p.id === id);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id, name, price: Number(price), quantity: 1 });
  }
  localStorage.setItem(LS_KEY, JSON.stringify(cart));
}

function updateCartCount() {
  const cartCountElements = $$(".cart-count");
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCountElements.forEach((el) => (el.textContent = totalItems));
}

/* ================================
   Filtros globales
===================================*/
function applyGlobalFilters() {
  const query = ($("#search")?.value || "").toLowerCase().trim();
  const material = $("#filterMaterial")?.value || "";
  const maxPrice = Number($("#filterPrice")?.value || 0) || null;

  const activeTab = $("#categoryFilters .active")?.getAttribute("data-filter") || "all";

  $$(".product").forEach((p) => {
    const title = $(".product-title", p)?.textContent.toLowerCase() || "";
    const cat = p.getAttribute("data-category") || "";
    const mat = p.getAttribute("data-material") || "";
    const price = Number(p.getAttribute("data-price") || "0");

    const matchQuery = !query || title.includes(query);
    const matchMat = !material || mat === material;
    const matchPrice = !maxPrice || price <= maxPrice;
    const matchTab = activeTab === "all" || cat === activeTab;

    const visible = matchQuery && matchMat && matchPrice && matchTab;
    p.style.display = visible ? "" : "none";
  });
}

/* ================================
   Helpers
===================================*/
function getProductInfoFromButton(button) {
  let id = button.getAttribute("data-id");
  let name = button.getAttribute("data-name");
  let price = parseFloat(button.getAttribute("data-price"));

  if (!id || !name || isNaN(price)) {
    const card = button.closest(".product");
    id = id || card?.getAttribute("data-id") || cryptoId();
    name = name || $(".product-title", card)?.textContent?.trim() || "Producto";
    price = !isNaN(price) ? price : Number(card?.getAttribute("data-price") || 0);
  }
  return { id, name, price };
}

function cryptoId() {
  return "p_" + Math.random().toString(36).slice(2, 10);
}

function safeReadCart() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch {
    return [];
  }
}

// Toast
function toast(msg = "", ms = 1600) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    Object.assign(el.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      background: "#111",
      color: "#fff",
      padding: "10px 14px",
      borderRadius: "10px",
      fontSize: ".95rem",
      zIndex: 9999,
      boxShadow: "0 8px 20px rgba(0,0,0,.25)"
    });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = "0"), ms);
}

function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}
