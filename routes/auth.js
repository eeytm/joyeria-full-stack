import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();

function signToken(user) {
  // user: { Id, Rol, Nombre, Email }
  return jwt.sign(
    { id: user.Id, role: user.Rol, name: user.Nombre, email: user.Email },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: process.env.JWT_EXPIRES || '1d' }
  );
}

export function verifyToken(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const [, token] = auth.split(' ');
    if (!token) return res.status(401).json({ error: 'Sin token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Solo administradores' });
  }
  next();
}

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
      const [[exists]] = await pool.query(
        'SELECT usuario_id FROM usuario WHERE email = ?',
        [Email]
      );
      if (exists) return res.status(409).json({ error: 'Email ya registrado' });

      const [[rol]] = await pool.query('SELECT rol_id FROM rol WHERE nombre = ?', [Rol]);
      if (!rol) return res.status(400).json({ error: `Rol inexistente: ${Rol}` });

      const hash = await bcrypt.hash(Password, 10);
      const [ins] = await pool.query(
        'INSERT INTO usuario (nombre, email, password_hash, rol_id, estado) VALUES (?,?,?,?,1)',
        [Nombre, Email, hash, rol.rol_id]
      );

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
        `SELECT u.usuario_id AS Id, u.nombre AS Nombre, u.email AS Email,
                u.password_hash AS PasswordHash, r.nombre AS Rol
         FROM usuario u
         JOIN rol r ON r.rol_id = u.rol_id
         WHERE u.email = ?
         LIMIT 1`,
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

router.get('/me', verifyToken, (req, res) => res.json({ ok: true, user: req.user }));

export default router;
