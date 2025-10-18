import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const sql = `
      SELECT producto_id, nombre, descripcion, precio, stock, categoria_id
      FROM producto
      ORDER BY nombre ASC
    `;
    console.log('[SQL] /api/products ->', sql.trim());
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (e) {
    console.error('❌ GET /api/products error:', e); // verá e.sqlMessage si es MySQL
    res.status(500).json({ error: e.sqlMessage || e.message });
  }
});

export default router;
