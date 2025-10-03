import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

/**
 * POST /api/orders
 * body:
 * {
 *   Nombre, Email, Direccion, MetodoPago, Referencia,
 *   Subtotal, Envio, Descuento, Total, CupomCodigo,
 *   Detalles|items: [{ producto_id|id, price|PrecioUnitario, quantity|Cantidad }]
 * }
 */
router.post('/', async (req, res) => {
  const {
    Nombre, Email, Direccion,
    MetodoPago, Referencia,
    Subtotal, Envio, Descuento, Total, CupomCodigo
  } = req.body || {};

  let detalles = [];
  if (Array.isArray(req.body?.Detalles)) detalles = req.body.Detalles;
  else if (Array.isArray(req.body?.items)) detalles = req.body.items;

  const lineas = (detalles || [])
    .map(d => ({
      producto_id: Number(d.producto_id ?? d.ProductoId ?? d.id),
      precio: Number(d.precio ?? d.PrecioUnitario ?? d.price ?? 0),
      cantidad: Number(d.cantidad ?? d.Cantidad ?? d.quantity ?? 0)
    }))
    .filter(l => l.producto_id && l.cantidad > 0);

  if (!lineas.length) {
    return res.status(400).json({ error: 'El pedido no tiene items válidos' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Asegura/crea cliente por email si viene
    let cliente_id = null;
    if (Email) {
      const [[c]] = await conn.query(`SELECT cliente_id FROM cliente WHERE email=?`, [Email]);
      if (c) cliente_id = c.cliente_id;
      else {
        const [insC] = await conn.query(
          `INSERT INTO cliente (nombre,email,telefono) VALUES (?,?,NULL)`,
          [Nombre ?? Email, Email]
        );
        cliente_id = insC.insertId;
        if (Direccion) {
          await conn.query(
            `INSERT INTO direccion_cliente (cliente_id,tipo,direccion) VALUES (?,?,?)`,
            [cliente_id, 'envio', Direccion]
          );
        }
      }
    }

    const totalCalc = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
    const totalFinal = Number(Total ?? totalCalc);

    const [ro] = await conn.query(
      `INSERT INTO orden (cliente_id, estado, total) VALUES (?,?,?)`,
      [cliente_id, 'pendiente', totalFinal]
    );
    const orden_id = ro.insertId;

    for (const l of lineas) {
      await conn.query(
        `INSERT INTO orden_detalle (orden_id, producto_id, cantidad, precio_unitario)
         VALUES (?,?,?,?)`,
        [orden_id, l.producto_id, l.cantidad, l.precio]
      );
      await conn.query(
        `UPDATE producto SET stock = stock - ? WHERE producto_id = ?`,
        [l.cantidad, l.producto_id]
      );
    }

    await conn.query(
      `INSERT INTO pago (orden_id, monto, estado) VALUES (?,?,?)`,
      [orden_id, totalFinal, 'pendiente']
    );

    await conn.commit();
    res.json({ ok: true, id: orden_id, total: totalFinal });
  } catch (err) {
    await conn.rollback();
    console.error('❌ /api/orders', err);
    res.status(400).json({ error: err.sqlMessage || err.message || 'Error creando pedido' });
  } finally {
    conn.release();
  }
});

export default router;
