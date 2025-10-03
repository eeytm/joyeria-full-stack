import { Router } from 'express';
import { pool } from '../db.js';
import { verifyToken, requireAdmin } from './auth.js';

import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();

/* ===== Multer (uploads) ===== */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safe = file.originalname.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9.\-_]/g,'');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const fileFilter = (_, file, cb) => {
  if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) return cb(new Error('Tipo no permitido'), false);
  cb(null, true);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/* ===== GET /api/products ===== */
router.get('/', async (req, res) => {
  try {
    const { q = '', inStock } = req.query;
    const terms = `%${String(q).trim()}%`;

    let sql = `
      SELECT  p.producto_id AS Id,
              NULL AS Codigo,
              p.nombre AS Nombre,
              p.precio AS Precio,
              p.stock  AS Stock,
              COALESCE(c.nombre,'') AS Categoria,
              (SELECT ip.url FROM imagenes_producto ip WHERE ip.producto_id = p.producto_id LIMIT 1) AS ImagenUrl,
              TRIM(BOTH ',' FROM (
                SELECT GROUP_CONCAT(m.nombre ORDER BY m.nombre SEPARATOR ',')
                FROM producto_material pm JOIN material m ON m.material_id = pm.material_id
                WHERE pm.producto_id = p.producto_id
              )) AS Material,
              1 AS Activo
      FROM producto p
      LEFT JOIN categoria c ON c.categoria_id = p.categoria_id
      WHERE (p.nombre LIKE ? OR c.nombre LIKE ?)
    `;
    const params = [terms, terms];

    if (String(inStock).toLowerCase() === 'true') {
      sql += ' AND p.stock > 0';
    }

    sql += ' ORDER BY p.nombre ASC LIMIT 200';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.sqlMessage || e.message });
  }
});

/* ===== GET /api/products/:id ===== */
router.get('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[prod]] = await pool.query(
      `SELECT  p.producto_id AS Id,
              p.nombre AS Nombre,
              p.descripcion AS Descripcion,
              p.precio AS Precio,
              p.stock  AS Stock,
              c.nombre AS Categoria
       FROM producto p
       LEFT JOIN categoria c ON c.categoria_id = p.categoria_id
       WHERE p.producto_id = ?`, [id]
    );
    if (!prod) return res.status(404).json({ message: 'Producto no encontrado' });

    const [imgs] = await pool.query(`SELECT url AS ImagenUrl FROM imagenes_producto WHERE producto_id = ?`, [id]);
    const [mats] = await pool.query(
      `SELECT m.nombre AS Material, pm.porcentaje
       FROM producto_material pm JOIN material m ON m.material_id = pm.material_id
       WHERE pm.producto_id = ?`, [id]
    );
    prod.ImagenUrl = imgs[0]?.ImagenUrl || null;
    prod.Materiales = mats;

    res.json(prod);
  } catch (e) {
    res.status(500).json({ error: e.sqlMessage || e.message });
  }
});

/* ===== POST /api/products (admin) ===== */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const {
      Codigo, Nombre, Precio, Categoria,
      ImagenUrl, Material, Stock = 0, Descripcion = null
    } = req.body || {};

    await conn.beginTransaction();

    let categoria_id = null;
    if (Categoria) {
      const [[cat]] = await conn.query(`SELECT categoria_id FROM categoria WHERE nombre = ?`, [Categoria]);
      if (cat) categoria_id = cat.categoria_id;
      else {
        const [insC] = await conn.query(`INSERT INTO categoria (nombre) VALUES (?)`, [Categoria]);
        categoria_id = insC.insertId;
      }
    }

    const [rp] = await conn.query(
      `INSERT INTO producto (nombre, descripcion, precio, stock, categoria_id)
       VALUES (?,?,?,?,?)`,
      [Nombre ?? null, Descripcion, Number(Precio ?? 0), Number(Stock ?? 0), categoria_id]
    );
    const prodId = rp.insertId;

    if (ImagenUrl) {
      await conn.query(`INSERT INTO imagenes_producto (producto_id, url) VALUES (?,?)`, [prodId, ImagenUrl]);
    }

    if (Material) {
      const names = String(Material).split(',').map(s => s.trim()).filter(Boolean);
      for (const n of names) {
        let [[m]] = await conn.query(`SELECT material_id FROM material WHERE nombre = ?`, [n]);
        if (!m) {
          const [insM] = await conn.query(`INSERT INTO material (nombre) VALUES (?)`, [n]);
          m = { material_id: insM.insertId };
        }
        await conn.query(
          `INSERT INTO producto_material (producto_id, material_id, porcentaje) VALUES (?,?,NULL)`,
          [prodId, m.material_id]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true, id: prodId });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.sqlMessage || e.message });
  } finally {
    conn.release();
  }
});

/* ===== PUT /api/products/:id (admin) ===== */
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const id = Number(req.params.id);
    const {
      Nombre, Precio, Categoria, ImagenUrl,
      Material, Stock, Descripcion = null
    } = req.body || {};

    await conn.beginTransaction();

    let categoria_id = null;
    if (Categoria) {
      const [[cat]] = await conn.query(`SELECT categoria_id FROM categoria WHERE nombre = ?`, [Categoria]);
      if (cat) categoria_id = cat.categoria_id;
      else {
        const [insC] = await conn.query(`INSERT INTO categoria (nombre) VALUES (?)`, [Categoria]);
        categoria_id = insC.insertId;
      }
    }

    const [r] = await conn.query(
      `UPDATE producto SET nombre=?, descripcion=?, precio=?, stock=?, categoria_id=?
       WHERE producto_id=?`,
      [Nombre ?? null, Descripcion, Number(Precio ?? 0), Number(Stock ?? 0), categoria_id, id]
    );

    if (ImagenUrl) {
      const [[exists]] = await conn.query(`SELECT 1 FROM imagenes_producto WHERE producto_id=? LIMIT 1`, [id]);
      if (exists) await conn.query(`UPDATE imagenes_producto SET url=? WHERE producto_id=?`, [ImagenUrl, id]);
      else await conn.query(`INSERT INTO imagenes_producto (producto_id, url) VALUES (?,?)`, [id, ImagenUrl]);
    }

    if (typeof Material === 'string') {
      await conn.query(`DELETE FROM producto_material WHERE producto_id=?`, [id]);
      const names = Material.split(',').map(s => s.trim()).filter(Boolean);
      for (const n of names) {
        let [[m]] = await conn.query(`SELECT material_id FROM material WHERE nombre = ?`, [n]);
        if (!m) {
          const [insM] = await conn.query(`INSERT INTO material (nombre) VALUES (?)`, [n]);
          m = { material_id: insM.insertId };
        }
        await conn.query(
          `INSERT INTO producto_material (producto_id, material_id, porcentaje) VALUES (?,?,NULL)`,
          [id, m.material_id]
        );
      }
    }

    await conn.commit();
    res.json({ ok: true, changed: r.affectedRows });
  } catch (e) {
    await conn.rollback();
    res.status(400).json({ error: e.sqlMessage || e.message });
  } finally {
    conn.release();
  }
});

/* ===== DELETE /api/products/:id (admin) ===== */
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [r] = await pool.query(`DELETE FROM producto WHERE producto_id = ?`, [id]);
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (e) {
    res.status(400).json({ error: e.sqlMessage || e.message });
  }
});

/* ===== POST /api/products/:id/image ===== */
router.post('/:id/image', verifyToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const url = `/uploads/${req.file.filename}`;

    const [[exists]] = await pool.query(`SELECT 1 FROM imagenes_producto WHERE producto_id=? LIMIT 1`, [id]);
    if (exists) await pool.query(`UPDATE imagenes_producto SET url=? WHERE producto_id=?`, [url, id]);
    else await pool.query(`INSERT INTO imagenes_producto (producto_id, url) VALUES (?,?)`, [id, url]);

    res.json({ ok: true, url });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Error subiendo imagen' });
  }
});

export default router;
