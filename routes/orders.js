// routes/orders.js
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

/**
 * POST /api/orders
 * body:
 * {
 *   Nombre, Email, Direccion, MetodoPago, Referencia,
 *   Subtotal, Envio, Descuento, Total,
 *   CupomCodigo (opcional),
 *   Detalles: [{ ProductoId, ProductoNombre, PrecioUnitario, Cantidad, TotalLinea }]  // o "items"
 * }
 */
router.post('/', async (req, res) => {
  const {
    Nombre, Email, Direccion,
    MetodoPago, Referencia,
    Subtotal, Envio, Descuento, Total,
    CupomCodigo
  } = req.body || {};

  // Acepta "Detalles" o "items" (por compatibilidad)
  let detalles = [];
  if (Array.isArray(req.body?.Detalles)) detalles = req.body.Detalles;
  else if (Array.isArray(req.body?.items)) detalles = req.body.items;

  if (!Array.isArray(detalles) || detalles.length === 0) {
    return res.status(400).json({ message: 'El pedido no tiene items' });
  }

  // Normaliza cada línea (a números)
  const lineas = detalles.map(d => ({
    ProductoId: Number(d.ProductoId),
    ProductoNombre: String(d.ProductoNombre || d.name || ''),
    PrecioUnitario: Number(d.PrecioUnitario ?? d.price ?? 0),
    Cantidad: Number(d.Cantidad ?? d.quantity ?? 0),
    TotalLinea: Number(d.TotalLinea ?? (d.price * d.quantity) ?? 0)
  })).filter(l => l.Cantidad > 0 && l.PrecioUnitario >= 0);

  if (lineas.length === 0) {
    return res.status(400).json({ message: 'El pedido no tiene items válidos' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Inserta el pedido
    const [rp] = await conn.query(
      `INSERT INTO pedido (Nombre, Email, Direccion, MetodoPago, Referencia, Subtotal, Envio, Descuento, Total)
       VALUES (?,?,?,?,?,?,?,?,?)`,
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
      ]
    );
    const pedidoId = rp.insertId;

    // 2) Si hay cupón, opcionalmente registra su uso (si tienes tabla de usos, etc.)
    if (CupomCodigo) {
      // ejemplo: podrías guardar en una tabla usos_cupon
      // await conn.query(`INSERT INTO usos_cupon (PedidoId, Codigo) VALUES (?,?)`, [pedidoId, CupomCodigo]);
    }

    // 3) Inserta líneas
    const values = lineas.map(l => [
      pedidoId, l.ProductoId || null, l.ProductoNombre,
      l.PrecioUnitario, l.Cantidad, l.TotalLinea
    ]);

    await conn.query(
      `INSERT INTO pedido_detalle
        (PedidoId, ProductoId, ProductoNombre, PrecioUnitario, Cantidad, TotalLinea)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.json({ id: pedidoId, ok: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ message: err.sqlMessage || err.message });
  } finally {
    conn.release();
  }
});

export default router;
