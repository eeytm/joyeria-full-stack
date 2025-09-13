// db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const {
  DB_HOST,
  DB_PORT = 3306,
  DB_USER,
  DB_PASS,
  DB_NAME,
  DB_CONNECTION_LIMIT = 10,
} = process.env;

export const pool = mysql.createPool({
  host: DB_HOST,
  port: Number(DB_PORT),
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(DB_CONNECTION_LIMIT),
  queueLimit: 0,
  ssl: { rejectUnauthorized: false }, // Hostinger suele requerir SSL
});

// Prueba de conexión al iniciar
(async () => {
  try {
    const [rows] = await pool.query('SELECT 1 AS ok');
    console.log('✅ DB OK', rows[0]);
  } catch (err) {
    console.error('❌ DB ERROR', err.message);
  }
})();
