/* ══════════════════════════════════════════════════════════════════════
   models/Document.js — Document Schema
   CIT Document Tracker - Group 6

   ZERO-KNOWLEDGE VAULT — ENCRYPTION FIELDS:
     enc        (existing) — IDEA-128-CBC encrypted documentName.
                             NEW FORMAT: JSON { iv, data } string.
                             LEGACY FORMAT: plain uppercase hex (ECB).
                             decryptSmart() in idea-cbc.js handles both.
     encPurpose (new)      — IDEA-128-CBC encrypted purpose field.
                             Same format as enc.
     name       (existing) — plaintext, used only by the backend for
                             notifications, search, QR generation.
                             NOT returned by trackDocument to public callers.
     purpose    (existing) — plaintext, used only by the backend.
                             NOT returned by trackDocument to public callers.

   This dual-storage approach lets the backend keep working (it needs
   plaintext for notifications/search) while the public API only exposes
   the encrypted blobs — forcing the browser to have the IDEA key in
   order to display the sensitive fields.

   Dual-ID Standard (unchanged):
     internalId    - ULID primary key; used in QR codes
     displayId     - DOC-YYYYMMDD-XXXX; user-facing
     verifyCode    - 4-char FNV anti-tamper suffix
     fullDisplayId - displayId-verifyCode (shown on receipts)
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

  /* ── Dual-ID System ─────────────────────────────────────────── */
  internalId:    { type: String, unique: true, required: true },
  displayId:     { type: String, unique: true, required: true },
  verifyCode:    { type: String, default: '' },
  fullDisplayId: { type: String, default: '' },
  documentId:    { type: String, default: null },

  /* ── Plaintext fields (backend-only; NOT returned by public track API) ── */
  name:    { type: String, required: true, trim: true },
  purpose: { type: String, required: true, trim: true },

  /* ── IDEA-128-CBC encrypted fields (returned to public callers) ─
     Format: JSON string  { "iv": "<16-char hex>", "data": "<HEX>" }
     Legacy:  plain uppercase hex (ECB — handled by decryptSmart)    */
  enc:        { type: String, required: true },   // encrypted documentName
  encPurpose: { type: String, default: '' },      // encrypted purpose (empty for legacy docs)

  /* ── Non-sensitive metadata (returned to all callers) ─────────── */
  type:     { type: String, required: true, enum: ['Academic', 'Laboratory', 'Administrative', 'Financial', 'Medical', 'Other'] },
  by:       { type: String, required: true, trim: true },   // submitter's name
  priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
  due:      { type: String, default: null },

  status: {
    type: String,
    enum: ['Received', 'Pending', 'Processing', 'For Approval', 'Signed', 'Approved', 'Released', 'Rejected'],
    default: 'Received',
  },

  ownerId:   { type: String, required: true },
  ownerName: { type: String, required: true },
  qrCode:    { type: String, default: '' },

  /* ── File storage ────────────────────────────────────────────── */
  filePath:         { type: String, default: null },
  fileExt:          { type: String, default: null },
  fileURL:          { type: String, default: null },
  originalFile:     { type: String, default: null },
  originalFileExt:  { type: String, default: null },

  processedFile:    { type: String, default: null },
  processedFileExt: { type: String, default: null },
  processedBy:      { type: String, default: null },
  processedAt:      { type: String, default: null },

  hasOriginalFile:  { type: Boolean, default: false },
  hasProcessedFile: { type: Boolean, default: false },

  /* ── History ─────────────────────────────────────────────────── */
  history: { type: [HistoryEntrySchema], default: [] },
  date:    { type: String },

}, { timestamps: true });

DocumentSchema.index({ internalId: 1 });
DocumentSchema.index({ displayId: 1 });

module.exports = mongoose.model('Document', DocumentSchema);