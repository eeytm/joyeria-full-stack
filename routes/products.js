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
 * Lista productos (opcionalmente con stock > 0)
 * ?q=texto  (búsqueda por nombre/descripcion)
 * ?inStock=true
 * ?categoria_id=2
 */
router.get('/', async (req, res) => {
  try {
    const { q = '', inStock, categoria_id } = req.query;
    const terms = `%${q.trim()}%`;

    let sql = `
      SELECT
        p.producto_id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.categoria_id,
        c.nombre AS categoria_nombre,
        (
          SELECT ip.url
          FROM imagenes_producto ip
          WHERE ip.producto_id = p.producto_id
          ORDER BY ip.imagen_id DESC
          LIMIT 1
        ) AS imagen_url
      FROM producto p
      LEFT JOIN categoria c ON c.categoria_id = p.categoria_id
      WHERE 1=1
        AND (? = '' OR p.nombre LIKE ? OR p.descripcion LIKE ?)
    `;
    const params = [q.trim(), terms, terms];

    if (categoria_id) {
      sql += ' AND p.categoria_id = ?';
      params.push(Number(categoria_id));
    }
    if (String(inStock).toLowerCase() === 'true') {
      sql += ' AND p.stock > 0';
    }

    sql += ' ORDER BY p.nombre ASC';
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
      `
      SELECT
        p.producto_id,
        p.nombre,
        p.descripcion,
        p.precio,
        p.stock,
        p.categoria_id,
        c.nombre AS categoria_nombre,
        (
          SELECT ip.url
          FROM imagenes_producto ip
          WHERE ip.producto_id = p.producto_id
          ORDER BY ip.imagen_id DESC
          LIMIT 1
        ) AS imagen_url
      FROM producto p
      LEFT JOIN categoria c ON c.categoria_id = p.categoria_id
      WHERE p.producto_id = ?
      `,
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
 * body: { nombre, descripcion, precio, stock, categoria_id }
 */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      nombre,
      descripcion = null,
      precio = 0,
      stock = 0,
      categoria_id = null
    } = req.body || {};

    const [rp] = await pool.query(
      `INSERT INTO producto
       (nombre, descripcion, precio, stock, categoria_id)
       VALUES (?,?,?,?,?)`,
      [nombre ?? null, descripcion, Number(precio ?? 0), Number(stock ?? 0), categoria_id ?? null]
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
      nombre,
      descripcion,
      precio,
      stock,
      categoria_id
    } = req.body || {};

    const [r] = await pool.query(
      `UPDATE producto SET
         nombre = ?,
         descripcion = ?,
         precio = ?,
         stock = ?,
         categoria_id = ?
       WHERE producto_id = ?`,
      [
        nombre ?? null,
        (descripcion === undefined ? null : descripcion),
        Number(precio ?? 0),
        Number(stock ?? 0),
        categoria_id ?? null,
        id
      ]
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
    const [r] = await pool.query(`DELETE FROM producto WHERE producto_id = ?`, [id]);
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (e) {
    res.status(400).json({ error: e.sqlMessage || e.message });
  }
});

/**
 * Subir/registrar imagen del producto (solo admin)
 * POST /api/products/:id/image
 * body: form-data con campo "file"
 * retorno: { ok:true, url:"/uploads/archivo.jpg" }
 *
 * 👉 Se guarda en la tabla imagenes_producto (no existe columna de imagen en producto).
 */
router.post('/:id/image', verifyToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

    const url = `/uploads/${req.file.filename}`;

    // Inserta como nueva imagen asociada al producto
    await pool.query(
      'INSERT INTO imagenes_producto (producto_id, url) VALUES (?, ?)',
      [id, url]
    );

    res.json({ ok: true, url });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error subiendo imagen' });
  }
});

export default router;
