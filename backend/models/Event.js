/* ══════════════════════════════════════════════════════════════════════
   models/Event.js — Event Schema
   CIT Document Tracker - Group 6

   Events are created by admin.
   Each event gets a unique QR code pointing to /event?id=<eventId>
   Students scan the QR to view event info and mark their attendance.
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const EventSchema = new mongoose.Schema({

  /* ── Identity ──────────────────────────────────────────────── */
  eventId:     { type: String, unique: true, default: () => 'EVT-' + uuidv4().slice(0, 8).toUpperCase() },

  /* ── Event Details ─────────────────────────────────────────── */
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  date:        { type: String, required: true },   // e.g. "2025-08-15"
  time:        { type: String, default: '' },       // e.g. "10:00 AM"
  location:    { type: String, default: '', trim: true },
  organizer:   { type: String, default: '', trim: true },

  /* ── QR & Status ────────────────────────────────────────────── */
  qrCode:      { type: String, default: '' },       // base64 QR image
  isActive:    { type: Boolean, default: true },    // if false, QR no longer accepts responses

  /* ── Who created it ─────────────────────────────────────────── */
  createdBy:   { type: String, required: true },    // admin userId
  createdByName: { type: String, default: '' },

}, { timestamps: true });

EventSchema.index({ eventId: 1 });
EventSchema.index({ isActive: 1 });
EventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Event', EventSchema);
