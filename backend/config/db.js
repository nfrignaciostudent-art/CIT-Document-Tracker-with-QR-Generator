/* ══════════════════════════════════════════════════════════════════════
   config/db.js — MongoDB Connection
   CIT Document Tracker · Group 6
══════════════════════════════════════════════════════════════════════ */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cit_doctracker';
    const conn = await mongoose.connect(MONGO_URI, {
      useNewUrlParser:    true,
      useUnifiedTopology: true,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    /* ── Drop stale legacy indexes that cause E11000 on null values ──
       The old schema had a unique index on `documentId` (alias docId_1)
       which breaks when multiple docs have documentId: null.
       We drop it once here; Mongoose will not recreate it since the
       field no longer has { unique: true } in the schema.             */
    try {
      const docsCollection = conn.connection.collection('documents');
      const indexes = await docsCollection.indexes();
      const staleNames = ['docId_1', 'documentId_1'];
      for (const name of staleNames) {
        if (indexes.some(idx => idx.name === name)) {
          await docsCollection.dropIndex(name);
          console.log(`🗑️  Dropped stale index: ${name}`);
        }
      }
    } catch (idxErr) {
      /* Non-fatal — index may have already been dropped */
      if (!idxErr.message.includes('index not found')) {
        console.warn('⚠️  Could not clean up indexes:', idxErr.message);
      }
    }

  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;