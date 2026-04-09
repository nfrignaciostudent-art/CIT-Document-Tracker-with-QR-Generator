/* ══════════════════════════════════════════════════════════════════════
   server.js — Main Server Entry Point
   CIT Document Tracker · Group 6
══════════════════════════════════════════════════════════════════════ */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const connectDB  = require('../config/db');

const authRoutes     = require('../routes/authRoutes');
const documentRoutes = require('../routes/documentRoutes');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Connect to MongoDB ── */
connectDB();

/* ── Middleware ── */
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

/* ── Serve uploaded files statically ── */
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/* ── Serve frontend files (HTML/CSS/JS) ── */
app.use(express.static(__dirname));

/* ── API Routes ── */
app.use('/api/auth',      authRoutes);
app.use('/api/documents', documentRoutes);

/* ── Health check ── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CIT DocTracker API running', group: 'Group 6' });
});

/* ── Serve index.html for all other routes (SPA support) ── */
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) res.status(404).json({ message: 'Frontend not found. Put index.html in the Frontend folder.' });
  });
});

/* ── Global error handler ── */
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ message: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 CIT DocTracker running on http://localhost:${PORT}`);
  console.log(`📁 Serving frontend from: ${__dirname}`);
  console.log(`📄 Group 6 · IDEA Encryption · MongoDB\n`);
});

module.exports = app;
