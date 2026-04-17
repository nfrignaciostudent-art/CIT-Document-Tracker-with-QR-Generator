/* ══════════════════════════════════════════════════════════════════════
   models/User.js — User Schema
   CIT Document Tracker - Group 6

   STAFF / FACULTY ADDITION:
     role         — extended to include 'staff' and 'faculty'.
                    Only admin can create staff/faculty accounts.
                    Self-registration is blocked for these roles in
                    authController.registerUser().

     employee_id  — unique identifier for staff and faculty accounts.
                    Sparse index: allows multiple null values so that
                    existing admin/user accounts are unaffected.
                    Required at the controller level when role is
                    'staff' or 'faculty'.

   ZERO-KNOWLEDGE VAULT FIELDS (unchanged):
     encryptedIdeaKey / passwordSalt — see original comments below.
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

  /**
   * employee_id — required for staff and faculty accounts.
   * Validated at the controller level (not here) so that legacy
   * admin/user accounts with no employee_id pass mongoose validation.
   * sparse: true lets multiple documents have employee_id = null
   * without triggering the unique constraint.
   */
  employee_id: { type: String, default: null, trim: true },

  /* ── Session tracking ──────────────────────────────────────── */
  lastLogin: { type: Date, default: null },
  lastSeen:  { type: Date, default: null },

  /* ── Zero-Knowledge Vault ──────────────────────────────────── */
  encryptedIdeaKey: { type: String, default: null },
  passwordSalt:     { type: String, default: null },

}, { timestamps: true });

/* ── Sparse unique index for employee_id ── */
UserSchema.index({ employee_id: 1 }, { unique: true, sparse: true });

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