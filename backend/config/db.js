/* ══════════════════════════════════════════════════════════════════════
   config/db.js - MongoDB Connection
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cit_doctracker';
    const conn = await mongoose.connect(MONGO_URI, {
      useNewUrlParser:    true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    /* ── Drop stale legacy indexes on 'documents' collection ──────── */
    try {
      const docsCollection = conn.connection.collection('documents');
      const staleDocNames  = ['docId_1', 'documentId_1'];
      for (const name of staleDocNames) {
        await docsCollection.dropIndex(name).catch(() => {});
        console.log(`Cleaned up documents index: ${name}`);
      }
    } catch (idxErr) {
      console.warn('Could not clean up documents indexes:', idxErr.message);
    }

    /* ── Drop stale legacy indexes on 'users' collection ─────────────
       FIX: employee_id_1 and studentId_1 were created without
       sparse:true, causing E11000 when multiple users have null values.
       We drop them unconditionally — Mongoose recreates them as sparse. */
    try {
      const usersCollection = conn.connection.collection('users');
      const staleUserNames  = ['employee_id_1', 'studentId_1'];
      for (const name of staleUserNames) {
        await usersCollection.dropIndex(name).catch(() => {});
        console.log(`Cleaned up users index: ${name}`);
      }
    } catch (idxErr) {
      console.warn('Could not clean up users indexes:', idxErr.message);
    }

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;