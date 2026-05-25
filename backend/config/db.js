/* ══════════════════════════════════════════════════════════════════════
   config/db.js - MongoDB Connection
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/cit_doctracker';

    /* autoIndex: false — we manually sync indexes AFTER cleaning up
       stale ones, so Mongoose never recreates a bad non-sparse index */
    const conn = await mongoose.connect(MONGO_URI, {
      useNewUrlParser:    true,
      useUnifiedTopology: true,
      autoIndex:          false,
      dbName:             'cit_doctracker',
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

      /* ── Step 4: Auto-seed default accounts if missing ────────────── */
      const testUsers = [
        {
          userId:      'USR-ADMIN',
          username:    'admin',
          name:        'CIT Administrator',
          password:    'admin1234',
          role:        'admin',
          color:       '#4ade80'
        },
        {
          userId:      'USR-STAFF',
          username:    'staff',
          name:        'CIT Staff Clerk',
          password:    'staff1234',
          role:        'staff',
          color:       '#f59e0b',
          employee_id: 'EMP-STAFF-01',
          department:  'IT Department Office'
        },
        {
          userId:      'USR-FACULTY',
          username:    'faculty',
          name:        'CIT Faculty Evaluator',
          password:    'faculty1234',
          role:        'faculty',
          color:       '#a78bfa',
          employee_id: 'EMP-FACULTY-01',
          department:  'IT Faculty Room'
        },
        {
          userId:      'USR-DEAN',
          username:    'dean',
          name:        'College Dean',
          password:    'dean1234',
          role:        'dean',
          color:       '#ec4899',
          employee_id: 'EMP-DEAN-01',
          department:  'Dean of IT'
        },
        {
          userId:      'USR-STUDENT',
          username:    '2026123456',
          name:        'CIT Test Student',
          password:    'student1234',
          role:        'user',
          color:       '#60a5fa',
          studentId:   '2026123456',
          section:     'BSIT-4A'
        },
        {
          userId:      'USR-STUDENT-TEST',
          username:    '2023000128',
          name:        'CIT Test Student E2E',
          password:    'password123',
          role:        'user',
          color:       '#3b82f6',
          studentId:   '2023000128',
          section:     'BSIT-4B'
        }
      ];

      for (const u of testUsers) {
        const exists = await User.findOne({ username: u.username });
        if (!exists) {
          console.log(`Seeding missing user: ${u.username} (${u.role})`);
          const user = new User(u);
          await user.save();
        } else {
          console.log(`User already exists: ${u.username} (${u.role})`);
        }
      }
      console.log('Auto-seed check completed successfully.');

    } catch (e) { console.warn('syncIndexes or auto-seed failed:', e.message); }

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;