/* ══════════════════════════════════════════════════════════════════════
   models/Document.js - Document Schema
   CIT Document Tracker - Group 6

   Dual-ID Standard:
     internalId    - ULID, primary key in DB, used in QR codes (not user-facing)
     displayId     - DOC-YYYYMMDD-XXXX, user-facing on receipts
     verifyCode    - 4-char alphanumeric anti-tamper suffix
     fullDisplayId - displayId + '-' + verifyCode (shown on receipts/UI)

   History action types:
     'Status Update' - admin changes document status
     'Movement'      - admin manually logs a movement event
   (QR scans are now stored in the separate ScanLog collection)
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
  internalId:    { type: String, unique: true, required: true },
  displayId:     { type: String, unique: true, required: true },
  verifyCode:    { type: String, default: '' },
  fullDisplayId: { type: String, default: '' },
  documentId:    { type: String, default: null },

  name:       { type: String, required: true, trim: true },
  type:       { type: String, required: true, enum: ['Academic', 'Laboratory', 'Administrative', 'Financial', 'Medical', 'Other'] },
  by:         { type: String, required: true, trim: true },
  purpose:    { type: String, required: true, trim: true },
  priority:   { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
  due:        { type: String, default: null },

  status: {
    type: String,
    enum: ['Received', 'Pending', 'Processing', 'For Approval', 'Signed', 'Approved', 'Released', 'Rejected'],
    default: 'Received'
  },

  enc: { type: String, required: true },

  ownerId:   { type: String, required: true },
  ownerName: { type: String, required: true },

  qrCode:    { type: String, default: '' },

  filePath:        { type: String, default: null },
  fileExt:         { type: String, default: null },
  fileURL:         { type: String, default: null },
  originalFile:    { type: String, default: null },
  originalFileExt: { type: String, default: null },

  processedFile:    { type: String, default: null },
  processedFileExt: { type: String, default: null },
  processedBy:      { type: String, default: null },
  processedAt:      { type: String, default: null },

  hasOriginalFile:  { type: Boolean, default: false },
  hasProcessedFile: { type: Boolean, default: false },

  history: { type: [HistoryEntrySchema], default: [] },

  date: { type: String },
}, { timestamps: true });

DocumentSchema.index({ internalId: 1 });
DocumentSchema.index({ displayId: 1 });

module.exports = mongoose.model('Document', DocumentSchema);