/* ══════════════════════════════════════════════════════════════════════
   middleware/authMiddleware.js - JWT Authentication Guard
   CIT Document Tracker - Group 6

   FIX: The fallback JWT secret MUST match the one used in authController.js.
        authController.js uses: 'cit_group6_secret_key_2024'
        This file previously used: 'cit_group6_secret_2024'  ← WRONG (missing _key)
        Mismatch caused every token verification to fail → user always "logged out".
══════════════════════════════════════════════════════════════════════ */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized. No token provided.' });
  }

  try {
    /* ── CRITICAL FIX: secret must match the one in authController.js ──
       authController.js signs with: process.env.JWT_SECRET || 'cit_group6_secret_key_2024'
       This middleware must verify with the EXACT same secret.
       Always set JWT_SECRET in .env for production to avoid relying on the fallback. */
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cit_group6_secret_key_2024');
    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User not found.' });
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized. Token invalid or expired.' });
  }
};

module.exports = protect;