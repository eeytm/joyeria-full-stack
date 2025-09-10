// routes/products.js
import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

/**
 * GET /api/products
 * Lista productos activos (y opcionalmente con stock > 0)
 * ?q=texto  (búsqueda por nombre/categoría/material)
 * ?inStock=true
 */
router.get('/', async (req, res) => {
  try {
    const { q = '', inStock } = req.query;
    const terms = `%${q.trim()}%`;

    let sql = `
      SELECT Id, Codigo, Nombre, Precio, Categoria, ImagenUrl, Material, Stock, Activo
      FROM producto
      WHERE Activo = 1
        AND (Nombre LIKE ? OR Categoria LIKE ? OR Material LIKE ?)
    `;
    const params = [terms, terms, terms];

    if (String(inStock).toLowerCase() === 'true') {
      sql += ' AND Stock > 0';
    }

    sql += ' ORDER BY Nombre ASC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.sqlMessage || e.message });
  }
});

/**
 * GET /api/products/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `SELECT Id, Codigo, Nombre, Precio, Categoria, ImagenUrl, Material, Stock, Activo
       FROM producto WHERE Id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.sqlMessage || e.message });
  }
});

export default router;
