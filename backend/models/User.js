/* ══════════════════════════════════════════════════════════════════════
   models/User.js — User Schema
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({

  /* ── Identity ──────────────────────────────────────────────── */
  userId:      { type: String, unique: true, required: true },
  username:    { type: String, unique: true, required: true, trim: true, lowercase: true },
  name:        { type: String, required: true, trim: true },
  password:    { type: String, required: true },
  role:        { type: String, enum: ['admin', 'user', 'staff', 'faculty'], default: 'user' },
  color:       { type: String, default: '#4ade80' },

  /* FIX: default must be undefined (not null) so MongoDB does NOT
     store the field for regular users. Sparse unique indexes only
     skip documents where the field is ABSENT — they still index null,
     which causes E11000 when two regular users both have null. */
  employee_id: { type: String, trim: true },   // no default → undefined → field absent
  studentId:   { type: String, trim: true },   // no default → undefined → field absent
  section:     { type: String, trim: true },

  /* ── Session tracking ──────────────────────────────────────── */
  lastLogin: { type: Date, default: null },
  lastSeen:  { type: Date, default: null },

  /* ── Zero-Knowledge Vault ──────────────────────────────────── */
  encryptedIdeaKey: { type: String, default: null },
  passwordSalt:     { type: String, default: null },

}, { timestamps: true });

/* ── Sparse unique indexes (skip absent/undefined fields) ── */
UserSchema.index({ employee_id: 1 }, { unique: true, sparse: true });
UserSchema.index({ studentId: 1 },   { unique: true, sparse: true });

/* ── Hash password before save ── */
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt    = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/* ── Compare plain password with stored hash ── */
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);