/* ══════════════════════════════════════════════════════════════════════
   models/Attendance.js — Attendance Schema
   CIT Document Tracker - Group 6

   One record per student per event.
   A student cannot submit attendance twice for the same event.
   Response is either 'attend' or 'cant_attend'.
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({

  /* ── Which event ───────────────────────────────────────────── */
  eventId:     { type: String, required: true, index: true },

  /* ── Student info (pulled from User record via studentId lookup) ── */
  studentId:   { type: String, required: true },   // student's ID number
  studentName: { type: String, required: true },
  section:     { type: String, default: '' },       // e.g. "3A", "3B"
  userId:      { type: String, default: '' },       // User._id reference (if found)

  /* ── Response ──────────────────────────────────────────────── */
  response:    {
    type: String,
    enum: ['attend', 'cant_attend'],
    required: true,
  },

  /* ── Timestamp ─────────────────────────────────────────────── */
  scannedAt: { type: String, default: () => new Date().toISOString() },
  displayDate: { type: String, default: '' },

}, { timestamps: true });

/* Prevent duplicate — one student, one response per event */
AttendanceSchema.index({ eventId: 1, studentId: 1 }, { unique: true });
AttendanceSchema.index({ eventId: 1, response: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
