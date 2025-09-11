// /public/js/api.js
const API_BASE = '';

export async function getProducts() {
  const res = await fetch(`${API_BASE}/api/products`);
  if (!res.ok) throw new Error('No se pudieron cargar productos');
  return res.json();
}

export async function validateCoupon(code, subtotal) {
  if (!code) return { ok: false, message: 'Ingresa un cupón', tipo: null, valor: 0 };
  const url = new URL(`${API_BASE}/api/coupons/validate`, window.location.origin);
  url.searchParams.set('codigo', code);
  url.searchParams.set('subtotal', String(subtotal));
  const res = await fetch(url);
  return res.json();
}

// public/js/api.js
export async function createOrder(payload) {
  const res = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Error creando pedido');
  }
  return res.json(); // { id: 123, ... }
}
