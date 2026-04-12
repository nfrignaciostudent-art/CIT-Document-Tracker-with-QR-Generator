const mongoose = require('mongoose');

// Separate collection for auto-logged QR scan events.
// Populated on every public QR scan — no auth required.
// Admin can view via Scan Logs page. Users cannot create these manually.

const ScanLogSchema = new mongoose.Schema({
  documentId:   { type: String, required: true, index: true },
  displayId:    { type: String, default: '' },
  documentName: { type: String, default: '' },
  handledBy:    { type: String, default: 'QR Visitor' },
  location:     { type: String, default: 'QR Scan' },
  note:         { type: String, default: '' },
  docStatus:    { type: String, default: '' },
  timestamp:    { type: String, required: true },   // ISO UTC string
  displayDate:  { type: String, default: '' },      // Asia/Manila formatted
}, { timestamps: true });

ScanLogSchema.index({ timestamp: -1 });
ScanLogSchema.index({ documentId: 1, timestamp: -1 });

module.exports = mongoose.model('ScanLog', ScanLogSchema);
