// routes/products.js
import { Router } from 'express';
import { pool } from '../db.js';
import { verifyToken, requireAdmin } from './auth.js';

import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

/* ========= Configuración Multer (subidas a /public/uploads) ========= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '..', 'public', 'uploads');

// crea carpeta si no existe
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    // nombre único: timestamp + nombre “sanitizado”
    const safe = file.originalname
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9.\-_]/g, '');
    cb(null, `${Date.now()}-${safe}`);
  }
});

const fileFilter = (_, file, cb) => {
  // solo imágenes
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) {
    return cb(new Error('Tipo de archivo no permitido'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

/* ==================== END Multer ==================== */


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

/**
 * Crear producto (solo admin)
 * POST /api/products
 */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      Codigo, Nombre, Precio, Categoria,
      ImagenUrl, Material, Stock = 0, Activo = 1
    } = req.body || {};

    const [rp] = await pool.query(
      `INSERT INTO producto
       (Codigo, Nombre, Precio, Categoria, ImagenUrl, Material, Stock, Activo)
       VALUES (?,?,?,?,?,?,?,?)`,
      [Codigo ?? null, Nombre ?? null, Number(Precio ?? 0), Categoria ?? null,
       ImagenUrl ?? null, Material ?? null, Number(Stock ?? 0), Number(Activo ?? 1)]
    );
    res.json({ ok: true, id: rp.insertId });
  } catch (e) {
    res.status(400).json({ error: e.sqlMessage || e.message });
  }
});

/**
 * Actualizar producto (solo admin)
 * PUT /api/products/:id
 */
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      Codigo, Nombre, Precio, Categoria,
      ImagenUrl, Material, Stock, Activo
    } = req.body || {};

    const [r] = await pool.query(
      `UPDATE producto SET
        Codigo = ?, Nombre = ?, Precio = ?, Categoria = ?,
        ImagenUrl = ?, Material = ?, Stock = ?, Activo = ?
       WHERE Id = ?`,
      [Codigo ?? null, Nombre ?? null, Number(Precio ?? 0), Categoria ?? null,
       ImagenUrl ?? null, Material ?? null, Number(Stock ?? 0), Number(Activo ?? 1), id]
    );
    res.json({ ok: true, changed: r.affectedRows });
  } catch (e) {
    res.status(400).json({ error: e.sqlMessage || e.message });
  }
});

/**
 * Eliminar producto (solo admin)
 * DELETE /api/products/:id
 */
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query(`DELETE FROM producto WHERE Id = ?`, [id]);
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (e) {
    res.status(400).json({ error: e.sqlMessage || e.message });
  }
});

/**
 * Subir/actualizar imagen del producto (solo admin)
 * POST /api/products/:id/image
 * body: form-data con campo "file"
 * retorno: { ok:true, url:"/uploads/archivo.jpg" }
 */
router.post('/:id/image', verifyToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const url = `/uploads/${req.file.filename}`;

    // opcional: borrar imagen anterior si se desea, primero consulta
    // const [rows] = await pool.query('SELECT ImagenUrl FROM producto WHERE Id = ?', [id]);
    // if (rows.length && rows[0].ImagenUrl) {
    //   const prev = rows[0].ImagenUrl;
    //   const prevPath = path.join(__dirname, '..', 'public', prev.replace(/^\/+/, ''));
    //   fs.existsSync(prevPath) && fs.unlinkSync(prevPath);
    // }

    await pool.query('UPDATE producto SET ImagenUrl = ? WHERE Id = ?', [url, id]);
    res.json({ ok: true, url });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error subiendo imagen' });
  }
});

export default router;
