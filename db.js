// db.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  namedPlaceholders: true,
  timezone: 'Z'
});

// Test rápido
pool.getConnection()
  .then((c) => { console.log('✅ MySQL_conectado'); c.release(); })
  .catch((e) => console.error('❌ Error MySQL:', e.message));
