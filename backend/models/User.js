/* ══════════════════════════════════════════════════════════════════════
   models/User.js — User Schema
   CIT Document Tracker - Group 6

   ZERO-KNOWLEDGE VAULT FIELDS (added):
     encryptedIdeaKey  — the shared deployment IDEA key XOR-wrapped with
                         the user's PBKDF2-derived master key.
                         Safe to store on server: useless without password.
     passwordSalt      — 16-byte hex salt used by the frontend's PBKDF2
                         derivation.  Not a secret; sent back on login so
                         the frontend can re-derive the master key.

   Neither field gives the server any information about the raw IDEA key.
   The server stores the wrapped blob and the salt; the browser derives
   the master key from password+salt and uses it to unwrap the blob.
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const UserSchema = new mongoose.Schema({

  /* ── Identity ──────────────────────────────────────────────── */
  userId:   { type: String, unique: true, required: true },
  username: { type: String, unique: true, required: true, trim: true, lowercase: true },
  name:     { type: String, required: true, trim: true },
  password: { type: String, required: true },
  role:     { type: String, enum: ['admin', 'user'], default: 'user' },
  color:    { type: String, default: '#4ade80' },

  /* ── Session tracking ──────────────────────────────────────── */
  lastLogin: { type: Date, default: null },
  lastSeen:  { type: Date, default: null },   // updated by heartbeat every 2 min

  /* ── Zero-Knowledge Vault ──────────────────────────────────── */
  /**
   * XOR-wrapped deployment IDEA key (hex string, 32 chars = 16 bytes).
   * wrapped = rawIdeaKey ⊕ PBKDF2(password, passwordSalt)
   * The server stores this; the browser un-wraps it locally.
   * null for legacy accounts created before the vault system.
   */
  encryptedIdeaKey: { type: String, default: null },

  /**
   * PBKDF2 salt (hex string, 32 chars = 16 bytes).
   * Randomly generated at registration.  Not secret — sent back on login
   * so the browser can re-derive the same master key without storing it.
   */
  passwordSalt: { type: String, default: null },

}, { timestamps: true });

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