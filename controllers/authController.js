/* ══════════════════════════════════════════════════════════════════════
   controllers/authController.js
   CIT Document Tracker · Group 6
══════════════════════════════════════════════════════════════════════ */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET  = process.env.JWT_SECRET  || 'cit_group6_secret_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

/* ── POST /api/auth/register ── */
const registerUser = async (req, res) => {
  try {
    const { userId, username, name, password, role, color } = req.body;

    if (!username || !name || !password) {
      return res.status(400).json({ message: 'Username, name and password are required.' });
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      return res.status(400).json({ message: 'Username: letters, numbers, underscores only.' });
    }
    if (password.length < 4) {
      return res.status(400).json({ message: 'Password must be at least 4 characters.' });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Username already taken.' });

    const user = await User.create({
      userId:   userId || ('USR-' + Date.now().toString(36).toUpperCase()),
      username, name, password,
      role:     role || 'user',
      color:    color || '#4ade80'
    });

    res.status(201).json({
      _id:      user._id,
      userId:   user.userId,
      username: user.username,
      name:     user.name,
      role:     user.role,
      color:    user.color,
      token:    generateToken(user._id)
    });
  } catch (err) {
    console.error('[registerUser]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ── POST /api/auth/login ── */
const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Incorrect username or password.' });
    }

    res.json({
      _id:      user._id,
      userId:   user.userId,
      username: user.username,
      name:     user.name,
      role:     user.role,
      color:    user.color,
      token:    generateToken(user._id)
    });
  } catch (err) {
    console.error('[loginUser]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ── GET /api/auth/me ── (protected, for token validation) */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { registerUser, loginUser, getMe };
