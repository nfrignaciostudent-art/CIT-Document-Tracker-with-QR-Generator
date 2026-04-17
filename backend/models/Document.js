/* ══════════════════════════════════════════════════════════════════════
   models/Document.js — Document Schema
   CIT Document Tracker - Group 6

   STAFF / FACULTY WORKFLOW ADDITION:
     current_stage — tracks WHERE in the role-based pipeline a document
                     currently sits.  Drives role-filtered document lists:
                       'staff'     → visible to staff (status: Received)
                       'faculty'   → visible to faculty (status: Processing,
                                     awaiting faculty review)
                       'admin'     → visible to admin for final release
                                     (faculty has approved; status: Processing)
                       'completed' → terminal; document is Released or Rejected

                     Set automatically by the workflow endpoint
                     POST /api/documents/update-status.
                     The existing PATCH /:id/status (admin-only) preserves
                     current_stage so legacy admin actions stay compatible.

   WORKFLOW STATUS SUBSET (strict, enforced in update-status controller):
     New documents → 'Received'   (current_stage: 'staff')
     Staff action  → 'Processing' (current_stage: 'faculty')
     Faculty approve → 'Processing' (current_stage: 'admin')  ← same status, stage advances
     Faculty reject  → 'Rejected'   (current_stage: 'completed')
     Admin release   → 'Released'   (current_stage: 'completed')

   BACKWARD COMPATIBILITY:
     The status enum retains all 8 original values so that existing
     documents stored in MongoDB are not invalidated.  The new workflow
     only emits the 4 required statuses; old values are read-only legacy.

   ZERO-KNOWLEDGE VAULT FIELDS (unchanged — see original comments):
     enc / encPurpose — IDEA-128-CBC encrypted blobs returned to clients.
     name / purpose   — plaintext used server-side only.
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

  /* ── IDEA-128-CBC encrypted fields ─────────────────────────── */
  enc:        { type: String, required: true },
  encPurpose: { type: String, default: '' },

  /* ── Non-sensitive metadata ─────────────────────────────────── */
  type:     { type: String, required: true, enum: ['Academic', 'Laboratory', 'Administrative', 'Financial', 'Medical', 'Other'] },
  by:       { type: String, required: true, trim: true },
  priority: { type: String, enum: ['Low', 'Normal', 'High', 'Urgent'], default: 'Normal' },
  due:      { type: String, default: null },

  status: {
    type: String,
    /* Retains all 8 legacy values + the 4 strict workflow values.
       New documents only receive: Received | Processing | Rejected | Released */
    enum: [
      'Received', 'Pending', 'Processing', 'For Approval',
      'Signed', 'Approved', 'Released', 'Rejected',
    ],
    default: 'Received',
  },

  /**
   * current_stage — drives role-based document visibility.
   * 'staff'     : waiting for staff to process (status = Received)
   * 'faculty'   : waiting for faculty review   (status = Processing)
   * 'admin'     : waiting for admin release    (status = Processing, faculty approved)
   * 'completed' : terminal state               (status = Released | Rejected)
   *
   * Legacy documents inserted before this field was added default to
   * 'staff' so they appear in the staff queue rather than being hidden.
   */
  current_stage: {
    type: String,
    enum: ['staff', 'faculty', 'admin', 'completed'],
    default: 'staff',
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
DocumentSchema.index({ current_stage: 1 });   // supports stage-filtered queries

module.exports = mongoose.model('Document', DocumentSchema);