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

    /* ── Drop stale legacy indexes on 'documents' collection ─────────
       These non-sparse unique indexes cause E11000 on null values.   */
    try {
      const docsCollection = conn.connection.collection('documents');
      const docsIndexes    = await docsCollection.indexes();
      const staleDocNames  = ['docId_1', 'documentId_1'];
      for (const name of staleDocNames) {
        if (docsIndexes.some(idx => idx.name === name)) {
          await docsCollection.dropIndex(name);
          console.log(`Dropped stale documents index: ${name}`);
        }
      }
    } catch (idxErr) {
      if (!idxErr.message.includes('index not found')) {
        console.warn('Could not clean up documents indexes:', idxErr.message);
      }
    }

    /* ── Drop stale legacy indexes on 'users' collection ─────────────
       FIX: employee_id_1 was created without sparse:true, causing
       E11000 duplicate key errors when multiple users have null
       employee_id (i.e. regular user/admin accounts).
       Dropping it here lets Mongoose recreate it as sparse on startup. */
    try {
      const usersCollection = conn.connection.collection('users');
      const usersIndexes    = await usersCollection.indexes();
      const staleUserNames  = ['employee_id_1', 'studentId_1'];
      for (const name of staleUserNames) {
        if (usersIndexes.some(idx => idx.name === name && !idx.sparse)) {
          await usersCollection.dropIndex(name);
          console.log(`Dropped stale users index: ${name}`);
        }
      }
    } catch (idxErr) {
      if (!idxErr.message.includes('index not found')) {
        console.warn('Could not clean up users indexes:', idxErr.message);
      }
    }

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;