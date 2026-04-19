/* ══════════════════════════════════════════════════════════════════════
   config/db.js - MongoDB Connection
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cit_doctracker';

    /* autoIndex: false — we manually sync indexes AFTER cleaning up
       stale ones, so Mongoose never recreates a bad non-sparse index */
    const conn = await mongoose.connect(MONGO_URI, {
      useNewUrlParser:    true,
      useUnifiedTopology: true,
      autoIndex:          false,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    /* ── Step 1: Drop stale indexes on 'documents' ──────────────── */
    try {
      const col = conn.connection.collection('documents');
      for (const name of ['docId_1', 'documentId_1']) {
        await col.dropIndex(name).catch(() => {});
        console.log(`Cleaned documents index: ${name}`);
      }
    } catch (e) { console.warn('documents index cleanup:', e.message); }

    /* ── Step 2: Drop stale NON-SPARSE indexes on 'users' ───────────
       employee_id_1 / studentId_1 were originally created without
       sparse:true, causing E11000 for every null value (regular users).
       We drop them first, then let syncIndexes() recreate them as sparse. */
    try {
      const col     = conn.connection.collection('users');
      const indexes = await col.indexes();
      for (const name of ['employee_id_1', 'studentId_1']) {
        const idx = indexes.find(i => i.name === name);
        if (idx) {
          await col.dropIndex(name).catch(() => {});
          console.log(`Dropped stale users index: ${name} (sparse was: ${!!idx.sparse})`);
        }
      }
    } catch (e) { console.warn('users index cleanup:', e.message); }

    /* ── Step 3: Rebuild all indexes correctly via Mongoose ─────────
       Now that stale indexes are gone, syncIndexes() recreates them
       exactly as defined in each Schema — employee_id with sparse:true. */
    try {
      const User         = require('../models/User');
      const Document     = require('../models/Document');
      const Notification = require('../models/Notification');
      const ScanLog      = require('../models/ScanLog');
      const Event        = require('../models/Event');
      const Attendance   = require('../models/Attendance');

      await Promise.all([
        User.syncIndexes(),
        Document.syncIndexes(),
        Notification.syncIndexes(),
        ScanLog.syncIndexes(),
        Event.syncIndexes(),
        Attendance.syncIndexes(),
      ]);
      console.log('All indexes synced successfully.');
    } catch (e) { console.warn('syncIndexes failed:', e.message); }

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;