/* ══════════════════════════════════════════════════════════════════════
   controllers/authController.js
   CIT Document Tracker - Group 6

   STAFF / FACULTY ADDITIONS:
     registerUser    — blocks self-registration for 'staff' and 'faculty'.
                       These roles can only be created by an admin via
                       createUserByAdmin().

     loginUser       — now accepts employee_id as well as username.
                       The frontend can send { login: 'empId or username',
                       password } and the backend checks both fields.
                       Backward-compatible: { username, password } still works.

     createUserByAdmin (NEW)
                     — POST /api/auth/users/create  (admin only).
                       Creates staff or faculty accounts with a required
                       employee_id.  Also accepts admin/user creation for
                       convenience (e.g. seeding).  Passwords are hashed
                       automatically via the User pre-save hook.
                       Returns the same shape as registerUser so the
                       frontend can reuse the same handling code.

   VAULT CHANGES (unchanged from original):
     registerUser — accepts { encryptedIdeaKey, passwordSalt }.
     loginUser    — returns { encryptedIdeaKey, passwordSalt }.
     getMe        — returns vault fields for session restore.
══════════════════════════════════════════════════════════════════════ */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET  = process.env.JWT_SECRET  || 'cit_group6_secret_key_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

const generateToken = (id) =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

/* ── Helper: safe public user shape ──────────────────────────────── */
function _publicUser(user, token) {
  return {
    _id:              user._id,
    userId:           user.userId,
    username:         user.username,
    name:             user.name,
    role:             user.role,
    color:            user.color,
    employee_id:      user.employee_id || null,
    encryptedIdeaKey: user.encryptedIdeaKey || null,
    passwordSalt:     user.passwordSalt     || null,
    token:            token || null,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   POST /api/auth/register  (self-registration — user role only)
══════════════════════════════════════════════════════════════════════ */
const registerUser = async (req, res) => {
  try {
    const {
      userId, username, name, password, role, color,
      encryptedIdeaKey, passwordSalt,
    } = req.body;

    /* ── Basic validation ── */
    if (!username || !name || !password)
      return res.status(400).json({ message: 'Username, name and password are required.' });

    if (!/^[a-z0-9_]+$/.test(username))
      return res.status(400).json({ message: 'Username: letters, numbers, underscores only.' });

    if (password.length < 4)
      return res.status(400).json({ message: 'Password must be at least 4 characters.' });

    /* ── SECURITY: block self-registration for privileged roles ──
       Staff and faculty accounts must be created by an admin via
       POST /api/auth/users/create.  Admin self-registration is also
       blocked here — admins are seeded directly (see seed.js).    */
    const requestedRole = (role || 'user').toLowerCase();
    if (['admin', 'staff', 'faculty'].includes(requestedRole)) {
      return res.status(403).json({
        message: `Self-registration is not allowed for the "${requestedRole}" role. ` +
                 'Please contact an administrator.',
      });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Username already taken.' });

    /* ── Vault field validation ── */
    if (encryptedIdeaKey && encryptedIdeaKey.length !== 32)
      console.warn('[registerUser] encryptedIdeaKey has unexpected length:', encryptedIdeaKey.length);
    if (passwordSalt && passwordSalt.length !== 32)
      console.warn('[registerUser] passwordSalt has unexpected length:', passwordSalt.length);

    const user = new User({
      userId:   userId || ('USR-' + Date.now().toString(36).toUpperCase()),
      username, name, password,
      role:     'user',   // always 'user' for self-registration
      color:    color || '#4ade80',
      encryptedIdeaKey: encryptedIdeaKey || null,
      passwordSalt:     passwordSalt     || null,
    });
    await user.save();

    const token = generateToken(user._id);
    res.status(201).json(_publicUser(user, token));
  } catch (err) {
    console.error('[registerUser]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/auth/login
   Accepts { username, password }  OR  { login, password }
   where `login` is matched against BOTH username and employee_id.
   This lets staff/faculty use their employee_id to sign in.
══════════════════════════════════════════════════════════════════════ */
const loginUser = async (req, res) => {
  try {
    const { username, login, password } = req.body;

    /* Support both { username, password } (legacy) and { login, password } (new) */
    const loginField = (login || username || '').toLowerCase().trim();

    if (!loginField || !password)
      return res.status(400).json({ message: 'Username/Employee ID and password are required.' });

    /* Search by username first, then by employee_id */
    let user = await User.findOne({ username: loginField });
    if (!user) {
      user = await User.findOne({ employee_id: loginField });
    }

    if (!user) {
      console.warn('[loginUser] user not found:', loginField);
      return res.status(401).json({ message: 'Incorrect username/employee ID or password.' });
    }

    const passwordMatch = await user.matchPassword(password);
    if (!passwordMatch) {
      console.warn('[loginUser] password mismatch:', loginField);
      return res.status(401).json({ message: 'Incorrect username/employee ID or password.' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);
    res.json(_publicUser(user, token));
  } catch (err) {
    console.error('[loginUser]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/auth/me  (protected)
══════════════════════════════════════════════════════════════════════ */
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });

    res.json({
      _id:              user._id,
      userId:           user.userId,
      username:         user.username,
      name:             user.name,
      role:             user.role,
      color:            user.color,
      employee_id:      user.employee_id || null,
      createdAt:        user.createdAt,
      lastLogin:        user.lastLogin,
      lastSeen:         user.lastSeen,
      encryptedIdeaKey: user.encryptedIdeaKey || null,
      passwordSalt:     user.passwordSalt     || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/auth/users/create  (admin only)

   Creates staff, faculty, or any role account on behalf of the admin.
   Rules enforced here:
     - employee_id is required when role is 'staff' or 'faculty'
     - employee_id must be unique
     - Passwords are hashed automatically by the User pre-save hook
     - Passwords are NEVER returned in responses
══════════════════════════════════════════════════════════════════════ */
const createUserByAdmin = async (req, res) => {
  try {
    const {
      username, name, password, role, color,
      employee_id,
      /* Vault fields — optional, admin accounts may supply them */
      encryptedIdeaKey, passwordSalt,
    } = req.body;

    /* ── Validation ── */
    if (!username || !name || !password || !role)
      return res.status(400).json({ message: 'username, name, password and role are required.' });

    if (!/^[a-z0-9_]+$/.test(username))
      return res.status(400).json({ message: 'Username: lowercase letters, numbers, underscores only.' });

    if (password.length < 4)
      return res.status(400).json({ message: 'Password must be at least 4 characters.' });

    const allowedRoles = ['admin', 'user', 'staff', 'faculty'];
    if (!allowedRoles.includes(role))
      return res.status(400).json({ message: `Invalid role. Allowed: ${allowedRoles.join(', ')}.` });

    /* employee_id required for staff / faculty */
    if (['staff', 'faculty'].includes(role)) {
      if (!employee_id || !employee_id.trim())
        return res.status(400).json({ message: `employee_id is required for the "${role}" role.` });

      /* Check employee_id uniqueness */
      const empExists = await User.findOne({ employee_id: employee_id.trim() });
      if (empExists)
        return res.status(409).json({ message: 'employee_id is already in use.' });
    }

    /* Check username uniqueness */
    const usernameExists = await User.findOne({ username: username.toLowerCase().trim() });
    if (usernameExists)
      return res.status(409).json({ message: 'Username already taken.' });

    const user = new User({
      userId:      'USR-' + Date.now().toString(36).toUpperCase(),
      username:    username.toLowerCase().trim(),
      name:        name.trim(),
      password,            // hashed by pre-save hook
      role,
      color:       color || _defaultColorForRole(role),
      employee_id: (['staff', 'faculty'].includes(role)) ? employee_id.trim() : null,
      encryptedIdeaKey: encryptedIdeaKey || null,
      passwordSalt:     passwordSalt     || null,
    });
    await user.save();

    const token = generateToken(user._id);

    res.status(201).json({
      message:     `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully.`,
      user:        _publicUser(user, token),
    });
  } catch (err) {
    console.error('[createUserByAdmin]', err);
    /* Friendly duplicate key error */
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(409).json({ message: `Duplicate value for ${field}.` });
    }
    res.status(500).json({ message: err.message });
  }
};

/* Role → default avatar colour */
function _defaultColorForRole(role) {
  const map = { admin: '#4ade80', user: '#60a5fa', staff: '#f59e0b', faculty: '#a78bfa' };
  return map[role] || '#64748b';
}

/* ══════════════════════════════════════════════════════════════════════
   GET /api/auth/users  (admin only)
   Returns all non-admin users with their document counts.
   Now includes staff and faculty in the list.
══════════════════════════════════════════════════════════════════════ */
const getUsers = async (req, res) => {
  try {
    /* Return all non-password user fields; exclude vault secrets from list */
    const users = await User.find({})
      .select('-password -encryptedIdeaKey -passwordSalt')
      .sort({ createdAt: -1 })
      .lean();

    const Document = require('../models/Document');
    const docCounts = await Document.aggregate([
      { $group: { _id: '$ownerId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    docCounts.forEach(r => { countMap[r._id] = r.count; });

    const payload = users.map(u => ({
      _id:         u._id,
      userId:      u.userId,
      username:    u.username,
      name:        u.name,
      role:        u.role,
      color:       u.color,
      employee_id: u.employee_id || null,
      createdAt:   u.createdAt,
      lastLogin:   u.lastLogin || null,
      lastSeen:    u.lastSeen  || null,
      docCount:    countMap[u.userId] || countMap[String(u._id)] || 0,
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getUsers]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/auth/heartbeat  (protected)
══════════════════════════════════════════════════════════════════════ */
const heartbeat = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { lastSeen: new Date() });
    res.json({ ok: true, lastSeen: new Date() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PATCH /api/auth/vault-key  (protected)
══════════════════════════════════════════════════════════════════════ */
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

module.exports = {
  registerUser, loginUser, getMe, getUsers,
  heartbeat, updateVaultKey,
  createUserByAdmin,   // NEW
};