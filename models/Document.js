/* ══════════════════════════════════════════════════════════════════════
   models/Document.js — Document Schema
   CIT Document Tracker · Group 6

   Dual-ID Standard:
     internalId  — ULID, primary key in DB, used in QR codes (not user-facing)
     displayId   — DOC-YYYYMMDD-XXXX, user-facing on receipts
     verifyCode  — 4-char alphanumeric anti-tamper suffix
     fullDisplayId — displayId + '-' + verifyCode (shown on receipts/UI)
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const HistoryEntrySchema = new mongoose.Schema({
  action:   { type: String, default: 'Status Update' },
  status:   { type: String },
  date:     { type: String },
  note:     { type: String, default: '' },
  by:       { type: String, default: '' },
  location: { type: String, default: '' },
  handler:  { type: String, default: '' },
}, { _id: false });

const DocumentSchema = new mongoose.Schema({
  /* ── Dual-ID System ── */
  internalId:    { type: String, unique: true, required: true },  // ULID — QR & DB primary key
  displayId:     { type: String, unique: true, required: true },  // DOC-YYYYMMDD-XXXX
  verifyCode:    { type: String, default: '' },                   // 4-char CHK
  fullDisplayId: { type: String, default: '' },                   // displayId + '-' + verifyCode
  /* Legacy field kept for compatibility */
  /* Legacy field kept for compatibility — no index, nullable */
  documentId:    { type: String, default: null },

  name:       { type: String, required: true, trim: true },
  type:       { type: String, required: true, enum: ['Academic', 'Laboratory', 'Administrative', 'Financial', 'Medical', 'Other'] },
  by:         { type: String, required: true, trim: true },
  purpose:    { type: String, required: true, trim: true },
  priority:   { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
  due:        { type: String, default: null },

  /* Status */
  status: {
    type: String,
    enum: ['Received', 'Pending', 'Processing', 'For Approval', 'Signed', 'Approved', 'Released', 'Rejected'],
    default: 'Received'
  },

  /* IDEA encryption — file encryption only, NOT used for IDs */
  enc: { type: String, required: true },    // IDEA-encrypted document name (HEX)

  /* Ownership */
  ownerId:   { type: String, required: true },
  ownerName: { type: String, required: true },

  /* QR Code — permanent static tracking URL using internalId */
  qrCode:    { type: String, default: '' },  // Stored as data URI

  /* Original file — uploaded by user during registration (IDEA-encrypted at rest) */
  filePath:        { type: String, default: null }, // Legacy field (kept for compatibility)
  fileExt:         { type: String, default: null },
  fileURL:         { type: String, default: null },
  originalFile:    { type: String, default: null }, // IDEA-encrypted base64 data URI
  originalFileExt: { type: String, default: null },

  /* Processed/Final file — uploaded by admin when approving/releasing */
  processedFile:    { type: String, default: null }, // IDEA-encrypted base64 data URI
  processedFileExt: { type: String, default: null },
  processedBy:      { type: String, default: null }, // Admin username who uploaded it
  processedAt:      { type: String, default: null }, // Date/time of upload

  /* Audit trail */
  history: { type: [HistoryEntrySchema], default: [] },

  date: { type: String },
}, { timestamps: true });

/* Index for fast lookup by display ID and internal ID */
DocumentSchema.index({ internalId: 1 });
DocumentSchema.index({ displayId: 1 });

module.exports = mongoose.model('Document', DocumentSchema);