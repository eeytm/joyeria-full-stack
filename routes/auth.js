// routes/auth.js
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();

/* =========================
   Helpers JWT / Middlewares
========================= */
function signToken(user) {
  return jwt.sign(
    { id: user.Id, role: user.Rol, name: user.Nombre, email: user.Email },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: process.env.JWT_EXPIRES || '1d' }
  );
}

// Verifica token en Authorization: Bearer <token>
export function verifyToken(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: 'Sin token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = payload; // { id, role, name, email }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Requiere rol admin
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores' });
  }
  next();
}

/* =============
   POST /register
=============== */
router.post(
  '/register',
  [
    body('Nombre').trim().notEmpty().withMessage('Nombre requerido'),
    body('Email').isEmail().withMessage('Email inválido'),
    body('Password').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
    body('Rol').optional().isIn(['cliente', 'admin']).withMessage('Rol inválido'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { Nombre, Email, Password, Rol = 'cliente' } = req.body;
    try {
      // ¿ya existe?
      const [rows] = await pool.query('SELECT Id FROM usuario WHERE Email = ?', [Email]);
      if (rows.length) return res.status(409).json({ error: 'Email ya registrado' });

      const hash = await bcrypt.hash(Password, 10);
      const [ins] = await pool.query(
        'INSERT INTO usuario (Nombre, Email, PasswordHash, Rol) VALUES (?,?,?,?)',
        [Nombre, Email, hash, Rol]
      );

      // opcional: auto-login al registrar
      const user = { Id: ins.insertId, Nombre, Email, Rol };
      const token = signToken(user);

      res.json({
        ok: true,
        id: ins.insertId,
        token,
        user: { id: ins.insertId, nombre: Nombre, email: Email, role: Rol },
      });
    } catch (e) {
      res.status(500).json({ error: e.sqlMessage || e.message });
    }
  }
);

/* ===========
   POST /login
=========== */
router.post(
  '/login',
  [
    body('Email').isEmail().withMessage('Email inválido'),
    body('Password').notEmpty().withMessage('Password requerido'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { Email, Password } = req.body;
    try {
      const [rows] = await pool.query(
        'SELECT Id, Nombre, Email, PasswordHash, Rol FROM usuario WHERE Email = ?',
        [Email]
      );
      if (!rows.length) return res.status(401).json({ error: 'Credenciales inválidas' });

      const user = rows[0];
      const ok = await bcrypt.compare(Password, user.PasswordHash);
      if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

      const token = signToken(user);

      res.json({
        ok: true,
        token,
        user: { id: user.Id, nombre: user.Nombre, email: user.Email, role: user.Rol },
      });
    } catch (e) {
      res.status(500).json({ error: e.sqlMessage || e.message });
    }
  }
);

/* ========
   GET /me
========= */
router.get('/me', verifyToken, (req, res) => {
  // req.user = { id, role, name, email, iat, exp }
  res.json({ ok: true, user: req.user });
});

export default router;
