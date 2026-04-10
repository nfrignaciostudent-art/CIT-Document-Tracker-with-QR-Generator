require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI); // ✅ fixed variable name
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ username: 'admin' });
  if (existing) {
    console.log('Admin already exists');
    process.exit();
  }

  await User.create({
    userId: 'USR-ADMIN',
    username: 'admin',
    name: 'Administrator',
    password: 'admin1234',
    role: 'admin',
    color: '#4ade80'
  });

  console.log('✅ Admin created: admin / admin1234');
  process.exit();
}

seed().catch(err => { console.error(err); process.exit(1); });