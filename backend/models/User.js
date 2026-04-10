/* ══════════════════════════════════════════════════════════════════════
   models/User.js — User Schema
   CIT Document Tracker · Group 6
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  userId:    { type: String, unique: true, required: true },
  username:  { type: String, unique: true, required: true, trim: true, lowercase: true },
  name:      { type: String, required: true, trim: true },
  password:  { type: String, required: true },
  role:      { type: String, enum: ['admin', 'user'], default: 'user' },
  color:     { type: String, default: '#4ade80' },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

/* Hash password before save */
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/* Compare plain password with hash */
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
