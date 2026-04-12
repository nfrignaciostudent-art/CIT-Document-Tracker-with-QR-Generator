/* ══════════════════════════════════════════════════════════════════════
   controllers/authController.js
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET  = process.env.JWT_SECRET  || 'cit_group6_secret_key_2024';
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

    const user = new User({
      userId:   userId || ('USR-' + Date.now().toString(36).toUpperCase()),
      username, name, password,
      role:     role  || 'user',
      color:    color || '#4ade80'
    });
    await user.save();

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

    const user = await User.findOne({ username: username.toLowerCase().trim() });

    if (!user) {
      console.warn('[loginUser] User not found:', username);
      return res.status(401).json({ message: 'Incorrect username or password.' });
    }

    const passwordMatch = await user.matchPassword(password);
    if (!passwordMatch) {
      console.warn('[loginUser] Password mismatch for:', username);
      return res.status(401).json({ message: 'Incorrect username or password.' });
    }

    /* ── stamp last login time ── */
    user.lastLogin = new Date();
    await user.save();

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

/* ── GET /api/auth/me ── (protected) */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── GET /api/auth/users ── (admin only) */
const getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    const Document = require('../models/Document');
    const docCounts = await Document.aggregate([
      { $group: { _id: '$ownerId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    docCounts.forEach(r => { countMap[r._id] = r.count; });

    const payload = users.map(u => ({
      _id:       u._id,
      userId:    u.userId,
      username:  u.username,
      name:      u.name,
      role:      u.role,
      color:     u.color,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin || null,
      docCount:  countMap[u.userId] || countMap[String(u._id)] || 0,
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getUsers]', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = { registerUser, loginUser, getMe, getUsers };