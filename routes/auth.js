// routes/auth.js
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = Router();

const REQUIRED_ADMIN_NAME = 'admin'; // cambia si en tu tabla rol el nombre es distinto

/* =========================
   Helpers JWT / Middlewares
========================= */
function signToken(user) {
  // user = { usuario_id, nombre, email, rol_id, roleName }
  return jwt.sign(
    {
      id: user.usuario_id,
      roleId: user.rol_id,
      roleName: user.roleName,
      name: user.nombre,
      email: user.email
    },
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
    req.user = payload; // { id, roleId, roleName, name, email }
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Requiere rol admin (por nombre en el token)
export function requireAdmin(req, res, next) {
  if ((req.user?.roleName || '').toLowerCase() !== REQUIRED_ADMIN_NAME) {
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
    body('Rol').optional().isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { Nombre, Email, Password, Rol = 'cliente' } = req.body;

    try {
      // ¿ya existe?
      const [rows] = await pool.query('SELECT usuario_id FROM usuario WHERE email = ?', [Email]);
      if (rows.length) return res.status(409).json({ error: 'Email ya registrado' });

      // buscar rol_id por nombre (rol.nombre)
      let rolId = null;
      let roleName = String(Rol).toLowerCase().trim();
      if (roleName) {
        const [rrol] = await pool.query('SELECT rol_id, nombre FROM rol WHERE LOWER(nombre) = LOWER(?) LIMIT 1', [roleName]);
        if (rrol.length) {
          rolId = rrol[0].rol_id;
          roleName = rrol[0].nombre; // nombre exacto en tabla
        }
      }
      if (!rolId) {
        // fallback a 'cliente'
        const [rcli] = await pool.query('SELECT rol_id, nombre FROM rol WHERE LOWER(nombre) = LOWER(?) LIMIT 1', ['cliente']);
        if (!rcli.length) return res.status(500).json({ error: 'No existe rol por defecto (cliente)' });
        rolId = rcli[0].rol_id;
        roleName = rcli[0].nombre;
      }

      const hash = await bcrypt.hash(Password, 10);
      const [ins] = await pool.query(
        'INSERT INTO usuario (nombre, email, password_hash, rol_id, estado) VALUES (?,?,?,?,1)',
        [Nombre, Email, hash, rolId]
      );

      // auto-login
      const user = {
        usuario_id: ins.insertId,
        nombre: Nombre,
        email: Email,
        rol_id: rolId,
        roleName
      };
      const token = signToken(user);

      res.json({
        ok: true,
        id: ins.insertId,
        token,
        user: { id: ins.insertId, nombre: Nombre, email: Email, roleId: rolId, roleName }
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
      // Trae usuario + nombre del rol
      const [rows] = await pool.query(
        `SELECT u.usuario_id, u.nombre, u.email, u.password_hash, u.rol_id, r.nombre AS roleName
           FROM usuario u
           JOIN rol r ON r.rol_id = u.rol_id
          WHERE u.email = ?
          LIMIT 1`,
        [Email]
      );
      if (!rows.length) return res.status(401).json({ error: 'Credenciales inválidas' });

      const user = rows[0];
      const ok = await bcrypt.compare(Password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

      const token = signToken(user);

      res.json({
        ok: true,
        token,
        user: {
          id: user.usuario_id,
          nombre: user.nombre,
          email: user.email,
          roleId: user.rol_id,
          roleName: user.roleName
        },
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
  // req.user = { id, roleId, roleName, name, email, iat, exp }
  res.json({ ok: true, user: req.user });
});

export default router;
