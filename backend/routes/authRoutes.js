/* ══════════════════════════════════════════════════════════════════════
   routes/authRoutes.js
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

const express  = require('express');
const router   = express.Router();
const { registerUser, loginUser, getMe, getUsers } = require('../controllers/authController');
const protect  = require('../middleware/authMiddleware');

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

router.post('/register', registerUser);
router.post('/login',    loginUser);
router.get('/me',        protect, getMe);
router.get('/users',     protect, adminOnly, getUsers);

module.exports = router;