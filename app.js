import express from 'express';
import cors from 'cors';
import products from './routes/products.js'; // ajusta la ruta

const app = express();

app.use(cors());
app.use(express.json());

app.get('/__ping', (_req, res) => res.json({ ok: true, when: new Date().toISOString() }));

app.use('/api/products', products);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.originalUrl }));

// error handler
app.use((err, req, res, _next) => {
  console.error('🔥 Error middleware:', err);
  res.status(500).json({ error: err?.sqlMessage || err?.message || 'Server error' });
});

const PORT = process.env.PORT || 3000;   // <— importante para Railway
app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
