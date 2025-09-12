// /public/js/api.js
function resolveApiBase() {
  // 1) Meta tag <meta name="api-base" content="https://...">
  const meta = document.querySelector('meta[name="api-base"]');
  if (meta?.content) return meta.content.replace(/\/$/, '');

  // 2) Variable global opcional
  if (window.__API_BASE__) return String(window.__API_BASE__).replace(/\/$/, '');

  // 3) Si estás en Hostinger (frontend), usa tu API de Railway (cambia el placeholder 1 sola vez)
  if (location.hostname.endsWith('hostingersite.com')) {
    return 'https://TU-API-RAILWAY.up.railway.app'; // <-- REEMPLAZA esto cuando tengas la URL de Railway
  }

  // 4) Por defecto (desarrollo local, mismo host)
  return '';
}

const API_BASE = resolveApiBase();

// Helpers
async function jsonFetch(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Error HTTP ${res.status}`);
  }
  return data;
}

// ===== API =====
export async function getProducts() {
  return jsonFetch(`${API_BASE}/api/products`);
}

export async function validateCoupon(code, subtotal) {
  if (!code) {
    return { valid: false, ok: false, message: 'Ingresa un cupón', tipo: null, valor: 0, descuento: 0 };
  }
  const url = new URL(`${API_BASE}/api/coupons/validate`, window.location.origin);
  url.searchParams.set('codigo', code);
  url.searchParams.set('subtotal', String(subtotal));

  const data = await jsonFetch(url);
  return {
    valid: !!(data.valid ?? data.ok),
    ok: !!(data.ok ?? data.valid),
    codigo: data.codigo ?? code,
    tipo: data.tipo ?? null,
    valor: Number(data.valor ?? 0),
    descuento: Number(data.descuento ?? 0),
    message: data.message || data.error || ''
  };
}

export async function createOrder(payload) {
  return jsonFetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
