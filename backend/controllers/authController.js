/* ══════════════════════════════════════════════════════════════════════
   controllers/authController.js
   CIT Document Tracker - Group 6

   VAULT CHANGES:
     registerUser — accepts { encryptedIdeaKey, passwordSalt } in body,
                    persists them on the new User document.
     loginUser    — returns { encryptedIdeaKey, passwordSalt } so the
                    browser can re-derive the master key and unwrap the
                    IDEA key without a round-trip password prompt.
     getMe        — same additions so session-restore works after refresh.
     getUsers     — passthrough; vault fields not exposed in user list.
══════════════════════════════════════════════════════════════════════ */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET  = process.env.JWT_SECRET  || 'cit_group6_secret_key_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

const generateToken = (id) =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

/* ── POST /api/auth/register ──────────────────────────────────────── */
const registerUser = async (req, res) => {
  try {
    const {
      userId, username, name, password, role, color,
      /* Zero-Knowledge Vault fields (optional — missing for legacy clients) */
      encryptedIdeaKey,
      passwordSalt,
    } = req.body;

    /* ── Basic validation ── */
    if (!username || !name || !password)
      return res.status(400).json({ message: 'Username, name and password are required.' });

    if (!/^[a-z0-9_]+$/.test(username))
      return res.status(400).json({ message: 'Username: letters, numbers, underscores only.' });

    if (password.length < 4)
      return res.status(400).json({ message: 'Password must be at least 4 characters.' });

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Username already taken.' });

    /* ── Vault field validation (warn but don't block) ── */
    if (encryptedIdeaKey && encryptedIdeaKey.length !== 32)
      console.warn('[registerUser] encryptedIdeaKey has unexpected length:', encryptedIdeaKey.length);
    if (passwordSalt && passwordSalt.length !== 32)
      console.warn('[registerUser] passwordSalt has unexpected length:', passwordSalt.length);

    /* ── Create user ── */
    const user = new User({
      userId:   userId || ('USR-' + Date.now().toString(36).toUpperCase()),
      username, name, password,
      role:     role  || 'user',
      color:    color || '#4ade80',
      /* Vault fields — null if not provided (legacy / offline fallback) */
      encryptedIdeaKey: encryptedIdeaKey || null,
      passwordSalt:     passwordSalt     || null,
    });
    await user.save();

    res.status(201).json({
      _id:              user._id,
      userId:           user.userId,
      username:         user.username,
      name:             user.name,
      role:             user.role,
      color:            user.color,
      /* Return vault fields so the browser can activate the key immediately */
      encryptedIdeaKey: user.encryptedIdeaKey || null,
      passwordSalt:     user.passwordSalt     || null,
      token:            generateToken(user._id),
    });
  } catch (err) {
    console.error('[registerUser]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ── POST /api/auth/login ─────────────────────────────────────────── */
const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password)
      return res.status(400).json({ message: 'Username and password are required.' });

    const user = await User.findOne({ username: username.toLowerCase().trim() });
    if (!user) {
      console.warn('[loginUser] user not found:', username);
      return res.status(401).json({ message: 'Incorrect username or password.' });
    }

    const passwordMatch = await user.matchPassword(password);
    if (!passwordMatch) {
      console.warn('[loginUser] password mismatch:', username);
      return res.status(401).json({ message: 'Incorrect username or password.' });
    }

    /* Stamp last-login time */
    user.lastLogin = new Date();
    await user.save();

    res.json({
      _id:              user._id,
      userId:           user.userId,
      username:         user.username,
      name:             user.name,
      role:             user.role,
      color:            user.color,
      /*
       * VAULT FIELDS — returned to the browser so it can:
       *   1. Derive master key:  PBKDF2(password, passwordSalt)
       *   2. Unwrap IDEA key:    masterKey ⊕ encryptedIdeaKey
       *
       * Neither value lets the server decrypt anything by itself.
       * passwordSalt is NOT secret (it is a PBKDF2 input, not a password).
       * encryptedIdeaKey is useless without the master key.
       */
      encryptedIdeaKey: user.encryptedIdeaKey || null,
      passwordSalt:     user.passwordSalt     || null,
      token:            generateToken(user._id),
    });
  } catch (err) {
    console.error('[loginUser]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ── GET /api/auth/me  (protected) ───────────────────────────────── */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password');       // never send the bcrypt hash
    if (!user) return res.status(404).json({ message: 'User not found.' });

    res.json({
      _id:              user._id,
      userId:           user.userId,
      username:         user.username,
      name:             user.name,
      role:             user.role,
      color:            user.color,
      createdAt:        user.createdAt,
      lastLogin:        user.lastLogin,
      lastSeen:         user.lastSeen,
      /* Vault fields — needed by tryRestoreSession() on page refresh */
      encryptedIdeaKey: user.encryptedIdeaKey || null,
      passwordSalt:     user.passwordSalt     || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── GET /api/auth/users  (admin only) ───────────────────────────── */
const getUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('-password -encryptedIdeaKey -passwordSalt') // vault fields not for list
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
      lastSeen:  u.lastSeen  || null,
      docCount:  countMap[u.userId] || countMap[String(u._id)] || 0,
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getUsers]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ── POST /api/auth/heartbeat  (protected) ───────────────────────── */
const heartbeat = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { lastSeen: new Date() });
    res.json({ ok: true, lastSeen: new Date() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ── PATCH /api/auth/vault-key  (protected) ──────────────────────
   Allows the frontend to upload vault key fields for legacy accounts
   that were created before the vault system was added.
   Safe to call again; updating a wrapped key with a new password
   requires a client-side re-wrap and a call to this endpoint.      */
const updateVaultKey = async (req, res) => {
  try {
    const { encryptedIdeaKey, passwordSalt } = req.body;
    if (!encryptedIdeaKey || !passwordSalt)
      return res.status(400).json({ message: 'encryptedIdeaKey and passwordSalt are required.' });
    if (encryptedIdeaKey.length !== 32 || passwordSalt.length !== 32)
      return res.status(400).json({ message: 'Each field must be exactly 32 hex characters (16 bytes).' });

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { encryptedIdeaKey, passwordSalt },
      { new: true },
    ).select('-password');

    res.json({
      ok:               true,
      encryptedIdeaKey: user.encryptedIdeaKey,
      passwordSalt:     user.passwordSalt,
    });
  } catch (err) {
    console.error('[updateVaultKey]', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = { registerUser, loginUser, getMe, getUsers, heartbeat, updateVaultKey };