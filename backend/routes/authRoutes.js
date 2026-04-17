/* ══════════════════════════════════════════════════════════════════════
   routes/authRoutes.js
   CIT Document Tracker - Group 6

   STAFF / FACULTY ADDITION:
     POST /api/auth/users/create  — admin-only endpoint to create
     staff and faculty accounts (plus any role).  Staff and faculty
     cannot self-register via POST /api/auth/register.

   VAULT ADDITION (unchanged):
     PATCH /api/auth/vault-key  — lets the frontend upload
     { encryptedIdeaKey, passwordSalt } for legacy accounts.
══════════════════════════════════════════════════════════════════════ */

const express  = require('express');
const router   = express.Router();
const {
  registerUser, loginUser, getMe, getUsers,
  heartbeat, updateVaultKey,
  createUserByAdmin,
} = require('../controllers/authController');
const protect  = require('../middleware/authMiddleware');

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required.' });
  next();
};

/* ── Public ─────────────────────────────────────────────────────── */
router.post('/register',         registerUser);
router.post('/login',            loginUser);

/* ── Protected ──────────────────────────────────────────────────── */
router.get ('/me',               protect, getMe);
router.post('/heartbeat',        protect, heartbeat);
router.patch('/vault-key',       protect, updateVaultKey);

/* ── Admin only ─────────────────────────────────────────────────── */
router.get ('/users',            protect, adminOnly, getUsers);

/**
 * POST /api/auth/users/create
 * Creates staff, faculty, or any role account.
 * Only admins may call this endpoint.
 * Body: { username, name, password, role, employee_id?, color? }
 */
router.post('/users/create',     protect, adminOnly, createUserByAdmin);

module.exports = router;