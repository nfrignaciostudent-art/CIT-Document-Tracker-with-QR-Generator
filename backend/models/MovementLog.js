/* ══════════════════════════════════════════════════════════════════════
   models/MovementLog.js - Document Movement & Routing Log Schema
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const MovementLogSchema = new mongoose.Schema({
  documentId:       { type: String, required: true, index: true },
  displayId:        { type: String, default: '' },
  documentName:     { type: String, default: '' },
  actionTaken:      { type: String, required: true }, // Submitted, Received, Processing, Forwarded, Approved, Rejected, Released, Resubmission
  
  // Who performed the action
  actorName:        { type: String, required: true },
  actorRole:        { type: String, required: true },
  actorDepartment:  { type: String, default: '' },
  
  // Status transition details
  previousStatus:   { type: String, default: '' },
  newStatus:        { type: String, required: true },
  
  // Role/office transition details
  previousRole:     { type: String, default: '' },
  newRole:          { type: String, required: true },
  
  timestamp:        { type: String, required: true }, // ISO UTC string
  displayDate:      { type: String, default: '' },    // Asia/Manila formatted timestamp
  note:             { type: String, default: '' },

  // Query optimizations for role visibility
  ownerId:          { type: String, required: true, index: true },
  handledByNames:   [{ type: String, index: true }], // Usernames/names of staff/faculty who handled the document
}, { timestamps: true });

MovementLogSchema.index({ timestamp: -1 });
MovementLogSchema.index({ documentId: 1, timestamp: -1 });

module.exports = mongoose.model('MovementLog', MovementLogSchema);
