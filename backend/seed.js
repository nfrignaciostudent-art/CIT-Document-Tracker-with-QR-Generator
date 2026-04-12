/* ══════════════════════════════════════════════════════════════════════
   seed.js - One-time Admin Account Seeder
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');

async function seed() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/cit_doctracker';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ username: 'admin' });
  if (existing) {
    await User.deleteOne({ username: 'admin' });
    console.log('Removed old admin record (may have had unhashed password).');
  }

  const admin = new User({
    userId:   'USR-ADMIN',
    username: 'admin',
    name:     'Administrator',
    password: 'admin1234',
    role:     'admin',
    color:    '#4ade80'
  });
  await admin.save();

  console.log('Admin account created:');
  console.log('  Username : admin');
  console.log('  Password : admin1234');
  console.log('  Role     : admin');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});