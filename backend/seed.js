/* ══════════════════════════════════════════════════════════════════════
   seed.js — Run this ONCE to create the admin account in MongoDB
   
   Usage:  node seed.js
══════════════════════════════════════════════════════════════════════ */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

async function seed() {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cit_doctracker';
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✅ Connected to MongoDB');

    /* Load User model */
    const User = require('../models/User');

    /* Check if admin already exists */
    const existing = await User.findOne({ username: 'admin' });
    if (existing) {
      console.log('ℹ️  Admin account already exists. Skipping.');
      console.log('   Username: admin');
      console.log('   To reset, delete the user in MongoDB and run this again.');
      process.exit(0);
    }

    /* Create admin */
    const admin = await User.create({
      userId:   'USR-ADMIN0',
      username: 'admin',
      name:     'System Admin',
      password: 'admin1234',
      role:     'admin',
      color:    '#fb923c'
    });

    console.log('\n✅ Admin account created successfully!');
    console.log('   Username : admin');
    console.log('   Password : admin1234');
    console.log('   Role     : admin');
    console.log('\n👉 You can now run: npm run dev');
    console.log('   Then open: http://localhost:3000');
    console.log('   And log in with admin / admin1234\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
