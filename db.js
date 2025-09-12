// db.js
import 'dotenv/config';
import mysql from 'mysql2/promise';

const {
  DB_HOST,
  DB_PORT = 3306,
  DB_USER,
  DB_PASS,
  DB_NAME,
} = process.env;

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT || 3306),
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  // Hostinger suele requerir SSL o al menos no bloquearlo
  ssl: { rejectUnauthorized: false },
});

// Prueba rápida de conexión al arrancar
try {
  await pool.query('SELECT 1');
  console.log('✅ MySQL conectado correctamente');
} catch (err) {
  console.error('❌ Error conectando a MySQL:', err.message);
}

export default pool;
