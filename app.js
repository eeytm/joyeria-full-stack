import express from 'express';
import cors from 'cors';
import { createPool } from 'mysql2/promise';

// ====== DB pool (ajusta tus ENV en Railway) ======
export const pool = createPool({
  host: process.env.DB_HOST,     // NO uses 127.0.0.1 si tu MySQL es externo
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  ssl: process.env.DB_SSL === '1' ? { rejectUnauthorized: true } : undefined
});

const app = express();

app.use(cors());
app.use(express.json());

// ===== RUTAS MÍNIMAS PARA DIAGNÓSTICO =====
app.get('/__ping', (_req, res) => res.json({ ok: true, when: new Date().toISOString() }));

app.get('/__db', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT DATABASE() db, USER() user');
    res.json({ ok: true, ...rows[0] });
  } catch (e) {
    console.error('DB test error:', e);
    res.status(500).json({ ok: false, error: e.sqlMessage || e.message });
  }
});

// ===== /api/products SOLO LISTAR (para probar) =====
app.get('/api/products', async (_req, res) => {
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
    console.error('❌ GET /api/products error:', e);
    res.status(500).json({ error: e.sqlMessage || e.message });
  }
});

// ===== 404 y manejador de errores =====
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.originalUrl }));
app.use((err, req, res, _next) => {
  console.error('🔥 Error middleware:', err);
  res.status(500).json({ error: err?.sqlMessage || err?.message || 'Server error' });
});

// ===== Arranque en PORT de Railway =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
  try {
    const [r] = await pool.query('SELECT 1 ok');
    console.log('✅ DB OK:', r[0]);
  } catch (e) {
    console.error('❌ DB FAIL boot:', e.sqlMessage || e.message);
  }
});

// Evita que un error no manejado tumbe el proceso
process.on('unhandledRejection', (r) => console.error('unhandledRejection', r));
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
