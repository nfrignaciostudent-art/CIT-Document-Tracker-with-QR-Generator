const mongoose = require('mongoose');

const PublicDocumentViewSchema = new mongoose.Schema({
  publicDocumentId: { type: String, required: true, index: true },
  browser:          { type: String, default: 'Unknown' },
  device:           { type: String, default: 'Unknown' },
  os:               { type: String, default: 'Unknown' },
  userAgent:        { type: String },
  timestamp:        { type: Date, default: Date.now }
});

module.exports = mongoose.model('PublicDocumentView', PublicDocumentViewSchema);
