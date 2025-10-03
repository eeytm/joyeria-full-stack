import { Router } from 'express';
import { pool } from '../db.js';
const router = Router();

router.get('/validate', async (req, res) => {
  try {
    const { codigo, code, subtotal } = req.query;
    const cod = String(codigo || code || '').trim().toUpperCase();
    const sub = Number(subtotal || 0);

    if (!cod) return res.status(400).json({ valid: false, message: 'Falta el código' });

    const [rows] = await pool.query(
      `SELECT Codigo, Tipo, Valor, MinSubtotal, ExpiraEn, Activo
       FROM cupon
       WHERE Codigo = ?
         AND Activo = 1
         AND (ExpiraEn IS NULL OR ExpiraEn >= CURDATE())
       LIMIT 1`,
      [cod]
    );

    if (!rows.length) {
      return res.json({ valid: false, message: 'Cupón no válido o expirado' });
    }

    const c = rows[0];

    if (c.MinSubtotal && sub < Number(c.MinSubtotal)) {
      return res.json({
        valid: false,
        message: `Subtotal mínimo para aplicar el cupón: Q${Number(c.MinSubtotal).toFixed(2)}`
      });
    }

    let descuento = 0;
    if (c.Tipo === 'porcentaje') descuento = sub * (Number(c.Valor) / 100);
    else if (c.Tipo === 'monto' || c.Tipo === 'fijo') descuento = Number(c.Valor);

    if (descuento > sub) descuento = sub;
    const total = sub - descuento;

    res.json({
      valid: true,
      codigo: c.Codigo,
      tipo: c.Tipo,
      valor: Number(c.Valor),
      subtotal: sub,
      descuento: Number(descuento.toFixed(2)),
      total: Number(total.toFixed(2)),
      message: 'Cupón válido'
    });
  } catch (err) {
    res.status(500).json({ valid: false, message: err.sqlMessage || err.message });
  }
});

export default router;
