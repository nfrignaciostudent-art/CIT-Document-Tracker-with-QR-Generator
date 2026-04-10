/* ══════════════════════════════════════════════════════════════════════
   seed.js — One-time Admin Account Seeder
   CIT Document Tracker · Group 6

   FIX 1: require('dotenv').config() — no custom path needed, .env is
           in the same root folder as this file.
   FIX 2: process.env.MONGO_URI — matches the variable name in .env
           (was wrongly written as MONGODB_URI before).
   FIX 3: Uses `new User().save()` to guarantee the bcrypt pre('save')
           hook runs and hashes the password before storing it.
══════════════════════════════════════════════════════════════════════ */

require('dotenv').config();   // ✅ FIX 1: load .env from current directory
const mongoose = require('mongoose');
const User     = require('./models/User');

async function seed() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/cit_doctracker'; // ✅ FIX 2
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  /* Delete any existing admin that may have a plain-text password */
  const existing = await User.findOne({ username: 'admin' });
  if (existing) {
    await User.deleteOne({ username: 'admin' });
    console.log('⚠️  Removed old admin record (may have had unhashed password).');
  }

  /* ✅ FIX 3: new User + .save() always triggers the bcrypt pre('save') hook */
  const admin = new User({
    userId:   'USR-ADMIN',
    username: 'admin',
    name:     'Administrator',
    password: 'admin1234',   // bcrypt hook in User.js will hash this
    role:     'admin',
    color:    '#4ade80'
  });
  await admin.save();

  console.log('✅ Admin account created:');
  console.log('   Username : admin');
  console.log('   Password : admin1234');
  console.log('   Role     : admin');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});