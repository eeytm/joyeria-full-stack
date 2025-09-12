// app.js
import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import products from './routes/products.js';
import orders from './routes/orders.js';
import coupons from './routes/coupons.js';
import authRoutes from './routes/auth.js';
import './db.js'; // inicializa pool y prueba conexión

dotenv.config();

const app = express();

// ------- CORS -------
const FRONT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'https://white-mink-746772.hostingersite.com', // <-- tu frontend en Hostinger
];

app.use(
  cors({
    origin(origin, callback) {
      // Permite herramientas locales (sin origin) y orígenes permitidos
      if (!origin || FRONT_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error('Origen no permitido por CORS: ' + origin), false);
    },
  })
);

app.use(morgan('dev'));
app.use(express.json());

// ------- Rutas API -------
app.use('/api/auth', authRoutes);
app.use('/api/products', products);
app.use('/api/orders', orders);
app.use('/api/coupons', coupons);

// Healthcheck para Railway
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ------- Servir frontend local (útil en desarrollo) -------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// ------- Arranque -------
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
