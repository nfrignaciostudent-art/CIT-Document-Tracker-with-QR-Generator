const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cit_doctracker';
    const conn = await mongoose.connect(MONGO_URI, {
      useNewUrlParser:    true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Drop stale legacy indexes that cause E11000 on null values
    try {
      const docsCollection = conn.connection.collection('documents');
      const indexes = await docsCollection.indexes();
      const staleNames = ['docId_1', 'documentId_1'];
      for (const name of staleNames) {
        if (indexes.some(idx => idx.name === name)) {
          await docsCollection.dropIndex(name);
          console.log(`Dropped stale index: ${name}`);
        }
      }
    } catch (idxErr) {
      if (!idxErr.message.includes('index not found')) {
        console.warn('Could not clean up indexes:', idxErr.message);
      }
    }

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
