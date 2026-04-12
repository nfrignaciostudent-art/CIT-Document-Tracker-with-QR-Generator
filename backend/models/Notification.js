/* ══════════════════════════════════════════════════════════════════════
   models/Notification.js - User Notification Schema
   CIT Document Tracker - Group 6

   Notifications are created automatically by the backend:
     - When a document is registered → admin(s) are notified
     - When a document status changes → document owner is notified
   Frontend fetches from /api/notifications (JWT protected).
   No localStorage is used for notifications.
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  userId:     { type: String, required: true, index: true },   // recipient's userId or _id string
  msg:        { type: String, required: true },
  documentId: { type: String, default: null },                 // internalId of related doc
  read:       { type: Boolean, default: false },
}, { timestamps: true });

NotificationSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
