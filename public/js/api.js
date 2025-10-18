// /public/js/api.js
function resolveApiBase() {
  // 1) Meta tag (recomendado en producción):
  // <meta name="api-base" content="https://joyeria-full-stack-production.up.railway.app">
  const meta = document.querySelector('meta[name="api-base"]');
  if (meta?.content) return meta.content.replace(/\/$/, '');

  // 2) Variable global opcional (útil para entornos múltiples):
  // window.__API_BASE__ = 'https://joyeria-full-stack-production.up.railway.app'
  if (window.__API_BASE__) return String(window.__API_BASE__).replace(/\/$/, '');

  // 3) Si el front está en Hostinger, usa el backend en Railway
  if (location.hostname.endsWith('hostingersite.com')) {
    return 'https://joyeria-full-stack-production.up.railway.app'; // <-- TU API REAL
  }

  // 4) Si ya estás sirviendo front y back en el MISMO dominio (por ejemplo detrás de Nginx/Proxy),
  //    usa rutas relativas (API_BASE vacío).
  if (
    location.hostname.endsWith('railway.app') || // si el front también está en Railway
    location.hostname === 'localhost' ||         // dev local
    location.hostname === '127.0.0.1'
  ) {
    return '';
  }

  // 5) Último recurso: asume Railway (evita que quede vacío en otros dominios)
  return 'https://joyeria-full-stack-production.up.railway.app';
}

const API_BASE = resolveApiBase();

// --- Helper con timeout y errores más claros ---
async function jsonFetch(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal, ...options });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

    if (!res.ok) {
      const msg = (data.error || data.message || `HTTP ${res.status} ${res.statusText}`);
      throw new Error(`${msg} (URL: ${typeof url === 'string' ? url : url.href || url.toString()})`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Tiempo de espera agotado (URL: ${typeof url === 'string' ? url : url.href || url.toString()})`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// ===== API =====
export async function getProducts(params = {}) {
  const url = new URL(`${API_BASE}/api/products`, window.location.origin);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.inStock != null) url.searchParams.set('inStock', String(params.inStock));
  if (params.categoria_id) url.searchParams.set('categoria_id', String(params.categoria_id));
  return jsonFetch(url);
}

export async function validateCoupon(code, subtotal) {
  if (!code) {
    return { valid: false, ok: false, message: 'Ingresa un cupón', tipo: null, valor: 0, descuento: 0 };
  }
  const url = new URL(`${API_BASE}/api/coupons/validate`, window.location.origin);
  url.searchParams.set('codigo', code);
  url.searchParams.set('subtotal', String(subtotal ?? 0));

  const data = await jsonFetch(url).catch(() => ({}));
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

// (Opcional) Prueba rápida desde la consola del navegador:
// import { getProducts } from '/js/api.js'; getProducts().then(console.log).catch(console.error);
