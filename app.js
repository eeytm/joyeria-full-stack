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
import './db.js';

dotenv.config();

const app = express();

/* --------- CORS --------- */
const corsEnv = process.env.FRONT_ORIGINS || process.env.FRONTEND_ORIGIN || '';
const ENV_ORIGINS = corsEnv
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const DEFAULT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5500',
  'https://white-mink-746772.hostingersite.com',
];

const ALLOWED = ENV_ORIGINS.length ? ENV_ORIGINS : DEFAULT_ORIGINS;

app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error('CORS: origen no permitido -> ' + origin), false);
  },
}));

app.use(morgan('dev'));
app.use(express.json());

/* --------- API --------- */
app.use('/api/auth', authRoutes);
app.use('/api/products', products);
app.use('/api/orders', orders);
app.use('/api/coupons', coupons);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

/* --------- static (útil para /public) --------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

/* --------- listen --------- */
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT}`));
