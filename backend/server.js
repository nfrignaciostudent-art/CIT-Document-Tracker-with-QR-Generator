/* ══════════════════════════════════════════════════════════════════════
   server.js — Main Server Entry Point
   CIT Document Tracker · Group 6
══════════════════════════════════════════════════════════════════════ */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const connectDB  = require('./config/db');

const authRoutes     = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth',      authRoutes);
app.use('/api/documents', documentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CIT DocTracker API running', group: 'Group 6' });
});

/* ══════════════════════════════════════════════════════════════════════
   /seed-admin — One-time admin seeder route
   FIX: Uses `new User().save()` instead of `User.create()` to ensure
   the bcrypt pre('save') hook fires and the password gets HASHED.
   Using User.create() with a plain password stores it as plain text,
   causing bcrypt.compare() to always return false → 401 on login.
   IMPORTANT: Remove this route after confirming login works!
══════════════════════════════════════════════════════════════════════ */
app.get('/seed-admin', async (req, res) => {
  try {
    const User = require('./models/User');

    /* Delete any existing broken admin (plain-text password) first */
    await User.deleteOne({ username: 'admin' });

    /* Create fresh admin — new + save() ALWAYS triggers pre('save') bcrypt hook */
    const admin = new User({
      userId:   'USR-ADMIN',
      username: 'admin',
      name:     'Administrator',
      password: 'admin1234',   // will be hashed by pre('save') hook in User.js
      role:     'admin',
      color:    '#4ade80'
    });
    await admin.save();

    res.json({
      message:  '✅ Admin created successfully with hashed password!',
      username: 'admin',
      password: 'admin1234',
      note:     'Remove this /seed-admin route after confirming login works.'
    });
  } catch (err) {
    console.error('[seed-admin]', err);
    res.status(500).json({ message: err.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('CIT DocTracker API running on port ' + PORT);
  console.log('Group 6 · IDEA Encryption · MongoDB');
});

module.exports = app;