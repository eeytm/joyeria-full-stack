// app.js
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import products from './routes/products.js';
import orders from './routes/orders.js';
import coupons from './routes/coupons.js';
import './db.js'; // inicializa pool y test
import authRoutes from './routes/auth.js';



dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());


app.use('/api/auth', authRoutes);
// Rutas API
app.use('/api/products', products);
app.use('/api/orders', orders);
app.use('/api/coupons', coupons);

// Servir frontend estático desde /public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));



const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`🚀 Servidor en http://localhost:${PORT}`));
