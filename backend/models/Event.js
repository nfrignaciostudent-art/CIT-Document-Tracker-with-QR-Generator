/* ══════════════════════════════════════════════════════════════════════
   models/Event.js — Event Schema
   CIT Document Tracker - Group 6

   CHANGES:
     imageData  — base64-encoded event image (stored inline, same pattern
                  as document files).  Optional.
     imageExt   — file extension of the image (e.g. 'jpg', 'png').
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const EventSchema = new mongoose.Schema({

  /* ── Identity ──────────────────────────────────────────────── */
  eventId: {
    type: String,
    unique: true,
    default: () => 'EVT-' + uuidv4().slice(0, 8).toUpperCase(),
  },

  /* ── Event Details ─────────────────────────────────────────── */
  title:       { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  date:        { type: String, required: true },   // e.g. "2025-08-15"
  time:        { type: String, default: '' },       // e.g. "10:00 AM"
  location:    { type: String, default: '', trim: true },
  organizer:   { type: String, default: '', trim: true },

  /* ── Event Image (optional) ─────────────────────────────────── */
  imageData: { type: String, default: null },   // base64 data URL or raw base64
  imageExt:  { type: String, default: null },   // e.g. 'jpg', 'png', 'webp'

  /* ── Attendance Time Window (optional) ─────────────────────── */
  /* If both are set, backend enforces that attendance submissions are
     only accepted between attendanceStartTime and attendanceEndTime.
     Format: 'HH:MM' in 24-hour time (e.g. '08:00', '17:30').
     Validated against the event's date field in Asia/Manila timezone. */
  attendanceStartTime: { type: String, default: null },  // e.g. '08:00'
  attendanceEndTime:   { type: String, default: null },  // e.g. '17:00'

  /* ── QR & Status ────────────────────────────────────────────── */
  qrCode:   { type: String, default: '' },       // base64 QR image
  isActive: { type: Boolean, default: true },    // if false, QR no longer accepts responses

  /* ── Who created it ─────────────────────────────────────────── */
  createdBy:     { type: String, required: true },   // admin userId
  createdByName: { type: String, default: '' },

}, { timestamps: true });

EventSchema.index({ eventId: 1 });
EventSchema.index({ isActive: 1 });
EventSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Event', EventSchema);