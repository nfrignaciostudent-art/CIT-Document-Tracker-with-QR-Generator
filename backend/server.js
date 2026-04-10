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

/* ── API Routes ─────────────────────────────────────────────────── */
app.use('/api/auth',      authRoutes);
app.use('/api/documents', documentRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CIT DocTracker API running', group: 'Group 6' });
});

/* ── Serve Frontend Static Files ────────────────────────────────── */
// All your frontend files (index.html, style.css, script.js, etc.)
// must be placed inside a folder called "public" at the project root.
app.use(express.static(path.join(__dirname, 'public')));

// Catch-all: return index.html for any non-API route
// This must come AFTER all API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Error Handlers ─────────────────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log('CIT DocTracker API running on port ' + PORT);
  console.log('Group 6 · IDEA Encryption · MongoDB');
});

module.exports = app;