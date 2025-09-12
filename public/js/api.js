// /public/js/api.js
const API_BASE = ''; // vacío si frontend y backend están en el mismo host/puerto

export async function getProducts() {
  const res = await fetch(`${API_BASE}/api/products`);
  if (!res.ok) throw new Error('No se pudieron cargar productos');
  return res.json();
}

export async function validateCoupon(code, subtotal) {
  if (!code) return { valid: false, ok: false, message: 'Ingresa un cupón', tipo: null, valor: 0, descuento: 0 };

  const url = new URL(`${API_BASE}/api/coupons/validate`, window.location.origin);
  url.searchParams.set('codigo', code);
  url.searchParams.set('subtotal', String(subtotal));

  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));

  // Normaliza algunos campos por si el backend usa nombres distintos
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
  const res = await fetch(`${API_BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // ⬇️ Mostrar el mensaje real que envió el backend
    throw new Error(data.error || data.message || 'Error creando pedido');
  }

  return data; // { ok: true, id: ... }
}
