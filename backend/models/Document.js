/* ══════════════════════════════════════════════════════════════════════
   models/Document.js — Document Schema
   CIT Document Tracker - Group 6

   WORKFLOW REFACTOR — Production-Level State Machine:

   STATUS VALUES (strict, 10 canonical + legacy for existing docs):
     Intake:
       'Submitted'                      → current_role: 'staff'
     Staff Stage:
       'Under Initial Review'           → current_role: 'staff'
       'Action Required: Resubmission'  → current_role: 'user'
       'Returned to Requester'          → current_role: 'completed'
     Faculty Stage:
       'Under Evaluation'               → current_role: 'faculty'
       'Revision Requested'             → current_role: 'staff'
     Admin Stage:
       'Pending Final Approval'         → current_role: 'admin'
       'Sent Back for Reevaluation'     → current_role: 'faculty'
     Terminal:
       'Approved and Released'          → current_role: 'completed'
       'Rejected'                       → current_role: 'completed'

   current_role — drives role-based document visibility:
     'staff'     → document awaits staff action
     'faculty'   → document awaits faculty action
     'admin'     → document awaits admin action
     'user'      → document awaits user re-submission
     'completed' → terminal state (no further action required)

   BACKWARD COMPAT:
     Legacy status values are retained in the enum so existing
     documents stored in MongoDB are not invalidated.
     current_stage is preserved and kept in sync with current_role
     for any code still referencing it.
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
    enum: [
      /* ── Canonical workflow statuses (new system) ── */
      'Submitted',
      'Under Initial Review',
      'Action Required: Resubmission',
      'Returned to Requester',
      'Under Evaluation',
      'Revision Requested',
      'Pending Final Approval',
      'Sent Back for Reevaluation',
      'Approved and Released',
      'Rejected',
      /* ── Legacy statuses (read-only; preserved for existing docs) ── */
      'Received', 'Pending', 'Processing', 'For Approval',
      'Signed', 'Approved', 'Released',
      'Returned', 'On Hold',
    ],
    default: 'Submitted',
  },

  /**
   * current_role — canonical field driving role-based visibility.
   * 'staff'     : awaiting staff action
   * 'faculty'   : awaiting faculty action
   * 'admin'     : awaiting admin action
   * 'user'      : awaiting user re-submission
   * 'completed' : terminal — no further workflow action
   *
   * Every workflow transition MUST set both current_role and
   * current_stage to keep legacy code compatible.
   */
  current_role: {
    type: String,
    enum: ['staff', 'faculty', 'admin', 'user', 'completed'],
    default: 'staff',
  },

  /**
   * current_stage — legacy field kept in sync with current_role.
   * Maps: staff→staff, faculty→faculty, admin→admin,
   *       user→staff (closest legacy equivalent), completed→completed.
   * New code should read current_role; this field is for backward compat only.
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

  /* ── Resubmission tracking ────────────────────────────────────── */
  resubmissionCount: { type: Number, default: 0 },
  lastResubmittedAt: { type: String, default: null },

  /* ── History ─────────────────────────────────────────────────── */
  history: { type: [HistoryEntrySchema], default: [] },
  date:    { type: String },

}, { timestamps: true });

DocumentSchema.index({ internalId: 1 });
DocumentSchema.index({ displayId: 1 });
DocumentSchema.index({ current_role: 1 });
DocumentSchema.index({ current_stage: 1 });
DocumentSchema.index({ ownerId: 1 });
DocumentSchema.index({ current_role: 1, ownerId: 1 });

module.exports = mongoose.model('Document', DocumentSchema);