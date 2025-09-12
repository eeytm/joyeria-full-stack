// routes/orders.js
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

/**
 * POST /api/orders
 * body:
 * {
 *   Nombre, Email, Direccion, MetodoPago, Referencia,
 *   Subtotal, Envio, Descuento, Total, CupomCodigo (opcional),
 *   Detalles: [{ ProductoId, ProductoNombre, PrecioUnitario, Cantidad, TotalLinea }]
 * }
 */
router.post('/', async (req, res) => {
  const {
    Nombre, Email, Direccion,
    MetodoPago, Referencia,
    Subtotal, Envio, Descuento, Total,
    CupomCodigo
  } = req.body || {};

  // Acepta Detalles o items
  let detalles = [];
  if (Array.isArray(req.body?.Detalles)) detalles = req.body.Detalles;
  else if (Array.isArray(req.body?.items)) detalles = req.body.items;

  if (!Array.isArray(detalles) || !detalles.length) {
    return res.status(400).json({ error: 'El pedido no tiene items' });
  }

  // Normaliza líneas
  const lineas = detalles
    .map(d => ({
      ProductoId: Number(d.ProductoId ?? d.id),
      ProductoNombre: String(d.ProductoNombre ?? d.name ?? ''),
      PrecioUnitario: Number(d.PrecioUnitario ?? d.price ?? 0),
      Cantidad: Number(d.Cantidad ?? d.quantity ?? 0),
      TotalLinea: Number(d.TotalLinea ?? ((d.price ?? 0) * (d.quantity ?? 0)))
    }))
    .filter(l => l.ProductoId && l.Cantidad > 0 && l.PrecioUnitario >= 0);

  if (!lineas.length) {
    return res.status(400).json({ error: 'El pedido no tiene items válidos' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Bloquea stock de los productos que vienen en el pedido
    const ids = [...new Set(lineas.map(l => l.ProductoId))];
    const [rowsProd] = await conn.query(
      `SELECT Id, Stock FROM producto WHERE Id IN (?) FOR UPDATE`,
      [ids]
    );
    const stockMap = new Map(rowsProd.map(r => [Number(r.Id), Number(r.Stock ?? 0)]));

    // Productos inexistentes
    const faltan = ids.filter(id => !stockMap.has(id));
    if (faltan.length) {
      await conn.rollback();
      return res.status(409).json({ error: `Producto(s) no encontrado(s): ${faltan.join(', ')}` });
    }

    // Stock insuficiente
    const insuf = [];
    for (const l of lineas) {
      const disp = stockMap.get(l.ProductoId);
      if (disp < l.Cantidad) {
        insuf.push({ id: l.ProductoId, disponible: disp, requerido: l.Cantidad });
      }
    }
    if (insuf.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Stock insuficiente', items: insuf });
    }

    // 2) Inserta encabezado de pedido
    const [rp] = await conn.query(
      `INSERT INTO pedido
        (Nombre, Email, Direccion, MetodoPago, Referencia,
         Subtotal, Envio, Descuento, Total, CupomCodigo, Fecha)
       VALUES (?,?,?,?,?,?,?,?,?,?, NOW())`,
      [
        Nombre ?? null,
        Email ?? null,
        Direccion ?? null,
        MetodoPago ?? null,
        Referencia ?? null,
        Number(Subtotal ?? 0),
        Number(Envio ?? 0),
        Number(Descuento ?? 0),
        Number(Total ?? 0),
        CupomCodigo ?? null
      ]
    );
    const pedidoId = rp.insertId;

    // 3) Inserta líneas del pedido
    const values = lineas.map(l => [
      pedidoId, l.ProductoId, l.ProductoNombre, l.PrecioUnitario, l.Cantidad, l.TotalLinea
    ]);
    await conn.query(
      `INSERT INTO pedido_detalle
        (PedidoId, ProductoId, ProductoNombre, PrecioUnitario, Cantidad, TotalLinea)
       VALUES ?`,
      [values]
    );

    // 4) Descuenta stock (seguro y simple)
    for (const l of lineas) {
      const [upd] = await conn.query(
        `UPDATE producto
           SET Stock = Stock - ?
         WHERE Id = ?`,
        [l.Cantidad, l.ProductoId]
      );
      if (upd.affectedRows !== 1) {
        // algo raro: no afectó fila
        throw new Error(`No se pudo actualizar el stock del producto ${l.ProductoId}`);
      }
    }

    await conn.commit();
    return res.json({ ok: true, id: pedidoId });
  } catch (err) {
    await conn.rollback();
    console.error('❌ /api/orders', err);
    return res.status(400).json({ error: err.sqlMessage || err.message || 'Error creando pedido' });
  } finally {
    conn.release();
  }
});

export default router;
