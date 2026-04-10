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

/* TEMP: Seed admin user */
app.get('/seed-admin', async (req, res) => {
  const User = require('./models/User');
  const existing = await User.findOne({ username: 'admin' });
  if (existing) return res.json({ message: 'Admin already exists' });
  await User.create({
    userId: 'USR-ADMIN',
    username: 'admin',
    name: 'Administrator',
    password: 'admin1234',
    role: 'admin',
    color: '#4ade80'
  });
  res.json({ message: 'Admin created!' });
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