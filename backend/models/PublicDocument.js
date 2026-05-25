const mongoose = require('mongoose');

const PublicDocumentSchema = new mongoose.Schema({
  internalId:    { type: String, unique: true, required: true },
  title:         { type: String, required: true, trim: true },
  description:   { type: String, trim: true },
  filePath:      { type: String, required: true }, // Disk filepath relative to backend root
  fileExt:       { type: String, default: '.pdf' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdByName: { type: String, required: true },
  views:         { type: Number, default: 0 },
}, { timestamps: true });


module.exports = mongoose.model('PublicDocument', PublicDocumentSchema);
