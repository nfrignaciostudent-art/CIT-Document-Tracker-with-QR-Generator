/* ══════════════════════════════════════════════════════════════════════
   controllers/authController.js
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET  = process.env.JWT_SECRET  || 'cit_group6_secret_key_2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

const generateToken = (id) =>
  jwt.sign({ id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

async function generateStudentId() {
  const year = new Date().getFullYear().toString();
  for (let attempt = 0; attempt < 20; attempt++) {
    const count = await User.countDocuments({ role: 'user' });
    const unique = String(count + 1 + attempt).padStart(6, '0');
    const studentId = year + unique;
    const exists = await User.findOne({ studentId });
    if (!exists) return studentId;
  }
  return year + String(Date.now()).slice(-6);
}

function _publicUser(user, token) {
  return {
    _id:              user._id,
    userId:           user.userId,
    username:         user.username,
    name:             user.name,
    role:             user.role,
    color:            user.color,
    employee_id:      user.employee_id || null,
    studentId:        user.studentId   || null,
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

    if (!username || !name || !password)
      return res.status(400).json({ message: 'Username, name and password are required.' });

    if (!/^[a-z0-9_]+$/.test(username))
      return res.status(400).json({ message: 'Username: letters, numbers, underscores only.' });

    if (password.length < 4)
      return res.status(400).json({ message: 'Password must be at least 4 characters.' });

    const requestedRole = (role || 'user').toLowerCase();
    if (['admin', 'staff', 'faculty'].includes(requestedRole)) {
      return res.status(403).json({
        message: `Self-registration is not allowed for the "${requestedRole}" role. ` +
                 'Please contact an administrator.',
      });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ message: 'Username already taken.' });

    const user = new User({
      userId:   userId || ('USR-' + Date.now().toString(36).toUpperCase()),
      username, name, password,
      role:     'user',
      color:    color || '#4ade80',
      studentId: await generateStudentId(),
      /* FIX: employee_id intentionally omitted (undefined) so the
         sparse index does not store/index this document.
         Do NOT set employee_id: null — null is indexed and causes E11000. */
      encryptedIdeaKey: encryptedIdeaKey || null,
      passwordSalt:     passwordSalt     || null,
    });
    await user.save();

    const token = generateToken(user._id);
    res.status(201).json(_publicUser(user, token));
  } catch (err) {
    console.error('[registerUser]', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(409).json({ message: `${field} is already taken.` });
    }
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/auth/login
══════════════════════════════════════════════════════════════════════ */
const loginUser = async (req, res) => {
  try {
    const { username, login, password } = req.body;
    const loginField = (login || username || '').toLowerCase().trim();

    if (!loginField || !password)
      return res.status(400).json({ message: 'Username/Employee ID and password are required.' });

    let user = await User.findOne({ username: loginField });
    if (!user) user = await User.findOne({ employee_id: loginField });

    if (!user) {
      console.warn('[loginUser] user not found:', loginField);
      return res.status(401).json({ message: 'Incorrect username/employee ID or password.' });
    }

    const passwordMatch = await user.matchPassword(password);
    if (!passwordMatch) {
      console.warn('[loginUser] password mismatch:', loginField);
      return res.status(401).json({ message: 'Incorrect username/employee ID or password.' });
    }

    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

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
      studentId:        user.studentId   || null,
      section:          user.section     || null,
      createdAt:        user.createdAt,
      lastLogin:        user.lastLogin,
      lastSeen:         user.lastSeen,
      encryptedIdeaKey: user.encryptedIdeaKey || null,
      passwordSalt:     user.passwordSalt     || null,
    });
  } catch (err) {
    console.error('[getMe]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/auth/users/create  (admin only)
══════════════════════════════════════════════════════════════════════ */
const createUserByAdmin = async (req, res) => {
  try {
    const {
      username, name, password, role,
      employee_id, color,
      encryptedIdeaKey, passwordSalt,
    } = req.body;

    if (!username || !name || !password || !role)
      return res.status(400).json({ message: 'username, name, password and role are required.' });

    if (!/^[a-z0-9_]+$/.test(username))
      return res.status(400).json({ message: 'Username: lowercase letters, numbers, underscores only.' });

    if (password.length < 4)
      return res.status(400).json({ message: 'Password must be at least 4 characters.' });

    const allowedRoles = ['admin', 'user', 'staff', 'faculty'];
    if (!allowedRoles.includes(role))
      return res.status(400).json({ message: `Invalid role. Allowed: ${allowedRoles.join(', ')}.` });

    if (['staff', 'faculty'].includes(role)) {
      if (!employee_id || !employee_id.trim())
        return res.status(400).json({ message: `employee_id is required for the "${role}" role.` });
      const empExists = await User.findOne({ employee_id: employee_id.trim() });
      if (empExists)
        return res.status(409).json({ message: 'employee_id is already in use.' });
    }

    const usernameExists = await User.findOne({ username: username.toLowerCase().trim() });
    if (usernameExists)
      return res.status(409).json({ message: 'Username already taken.' });

    /* FIX: use undefined (not null) for absent optional fields so
       sparse indexes skip these documents entirely.                */
    const userData = {
      userId:      'USR-' + Date.now().toString(36).toUpperCase(),
      username:    username.toLowerCase().trim(),
      name:        name.trim(),
      password,
      role,
      color:       color || _defaultColorForRole(role),
      encryptedIdeaKey: encryptedIdeaKey || null,
      passwordSalt:     passwordSalt     || null,
    };

    if (['staff', 'faculty'].includes(role)) {
      userData.employee_id = employee_id.trim();   // set only for staff/faculty
    }
    // employee_id left undefined for admin/user → sparse index skips it

    if (role === 'user') {
      userData.studentId = await generateStudentId();  // set only for users
    }
    // studentId left undefined for admin/staff/faculty → sparse index skips it

    const user = new User(userData);
    await user.save();

    const token = generateToken(user._id);
    res.status(201).json({
      message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully.`,
      user:    _publicUser(user, token),
    });
  } catch (err) {
    console.error('[createUserByAdmin]', err);
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(409).json({ message: `Duplicate value for ${field}.` });
    }
    res.status(500).json({ message: err.message });
  }
};

function _defaultColorForRole(role) {
  const map = { admin: '#4ade80', user: '#60a5fa', staff: '#f59e0b', faculty: '#a78bfa' };
  return map[role] || '#64748b';
}

/* ══════════════════════════════════════════════════════════════════════
   GET /api/auth/users  (admin only)
══════════════════════════════════════════════════════════════════════ */
const getUsers = async (req, res) => {
  try {
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
      studentId:   u.studentId   || null,
      section:     u.section     || null,
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

/* ══════════════════════════════════════════════════════════════════════
   PATCH /api/auth/users/:userId/student-id  (admin only)
══════════════════════════════════════════════════════════════════════ */
const updateUserStudentId = async (req, res) => {
  try {
    const { userId } = req.params;
    const { studentId } = req.body;

    if (!studentId || !String(studentId).trim())
      return res.status(400).json({ message: 'studentId is required and cannot be blank.' });

    const trimmedId = String(studentId).trim();

    const existing = await User.findOne({ studentId: trimmedId });
    if (existing && String(existing._id) !== userId && existing.userId !== userId)
      return res.status(409).json({ message: `Student ID "${trimmedId}" is already assigned to another user.` });

    const user = await User.findOneAndUpdate(
      { $or: [{ _id: userId }, { userId }] },
      { studentId: trimmedId },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found.' });

    res.json({
      message:   `Student ID updated to "${trimmedId}" for ${user.name}.`,
      userId:    user.userId,
      studentId: user.studentId,
      name:      user.name,
      username:  user.username,
    });
  } catch (err) {
    console.error('[updateUserStudentId]', err);
    if (err.code === 11000)
      return res.status(409).json({ message: 'That Student ID is already in use.' });
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  registerUser, loginUser, getMe, getUsers,
  heartbeat, updateVaultKey,
  createUserByAdmin,
  updateUserStudentId,
};