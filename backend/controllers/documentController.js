const path     = require('path');
const QRCode   = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const Document = require('../models/Document');
const ScanLog  = require('../models/ScanLog');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

// ID system:
//   internalId    — ULID (primary key, used in QR, not predictable)
//   displayId     — DOC-YYYYMMDD-XXXX (user-facing, incremental per day)
//   verifyCode    — 4-char FNV-1a hash suffix for tamper detection
//   fullDisplayId — displayId-verifyCode (shown on receipts)
//
// Timestamps: stored as ISO UTC, displayed as Asia/Manila (UTC+8)
//
// Scan vs Movement separation:
//   scan_logs  — separate collection, auto-created on QR scan (public endpoint)
//   movement   — entries in doc.history with action='Movement', admin only
//   doc.history — contains only Status Updates and admin Movement entries

// Returns current time formatted for Asia/Manila (UTC+8)
function manilaTimestamp() {
  return new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });
}

// Crockford Base32 alphabet used for ULID and verify codes
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateULID() {
  const t = Date.now();
  let timeStr = '';
  let tmp = t;
  for (let i = 9; i >= 0; i--) {
    timeStr = CROCKFORD[tmp % 32] + timeStr;
    tmp = Math.floor(tmp / 32);
  }
  let randStr = '';
  for (let i = 0; i < 16; i++) {
    randStr += CROCKFORD[Math.floor(Math.random() * 32)];
  }
  return timeStr + randStr;
}

// Generates a daily sequential display ID: DOC-YYYYMMDD-XXXX
async function genDisplayId() {
  const manilaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const yyyy    = manilaNow.getFullYear();
  const mm      = String(manilaNow.getMonth() + 1).padStart(2, '0');
  const dd      = String(manilaNow.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const prefix  = `DOC-${dateStr}-`;

  const last = await Document.findOne(
    { displayId: { $regex: `^${prefix}` } },
    { displayId: 1 },
    { sort: { displayId: -1 } }
  ).lean();

  let nextSeq = 1;
  if (last && last.displayId) {
    const parts = last.displayId.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return prefix + String(nextSeq).padStart(4, '0');
}

// Deterministic 4-char verification code using FNV-1a on displayId + internalId
function genVerifyCode(displayId, internalId) {
  const str = displayId + ':' + internalId;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CROCKFORD[hash % 32];
    hash = Math.floor(hash / 32);
  }
  return code;
}

const trackUrl = (internalId) => `${APP_BASE_URL}?track=${internalId}`;

// POST /api/documents/register
const registerDocument = async (req, res) => {
  let body;
  if (req.file) {
    try { body = JSON.parse(req.body.data); }
    catch (e) {
      return res.status(400).json({ message: 'Invalid document data JSON in FormData.' });
    }
  } else {
    body = req.body;
  }

  const {
    name, type, by, purpose,
    priority, due, enc, ownerId, ownerName,
    status, date, history, fileData, fileExt, hasOriginalFile
  } = body;

  if (!name || !type || !by || !purpose || !enc || !ownerId) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  const resolvedFileData = req.file
    ? req.file.buffer.toString('utf8')
    : (fileData || null);

  const resolvedFileExt = req.file ? (fileExt || '') : (fileExt || null);
  const nowManila = manilaTimestamp();

  // Retry loop guards against the rare ULID/displayId collision on the same millisecond
  const MAX_RETRIES = 5;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const internalId    = generateULID();
      const displayId     = await genDisplayId();
      const verifyCode    = genVerifyCode(displayId, internalId);
      const fullDisplayId = `${displayId}-${verifyCode}`;

      const url    = trackUrl(internalId);
      const qrData = await QRCode.toDataURL(url, { width: 200, margin: 1 });

      const doc = await Document.create({
        internalId, displayId, verifyCode, fullDisplayId,
        name, type, by, purpose,
        priority:   priority || 'Normal',
        due:        due || null,
        status:     status || 'Received',
        enc,
        ownerId,
        ownerName,
        qrCode:           qrData,
        filePath:         resolvedFileData || null,
        fileExt:          resolvedFileExt  || null,
        fileURL:          resolvedFileData ? url + '&download=1' : null,
        originalFile:     resolvedFileData || null,
        originalFileExt:  resolvedFileExt  || null,
        hasOriginalFile:  !!(resolvedFileData),
        processedFile:    null,
        processedFileExt: null,
        processedBy:      null,
        processedAt:      null,
        hasProcessedFile: false,
        history: history || [{
          action: 'Status Update', status: 'Received',
          date:   nowManila,
          note:   'Document submitted & encrypted with IDEA-128',
          by:     ownerName || ownerId,
          location: '', handler: ''
        }],
        date: nowManila
      });

      return res.status(201).json({
        internalId:      doc.internalId,
        displayId:       doc.displayId,
        verifyCode:      doc.verifyCode,
        fullDisplayId:   doc.fullDisplayId,
        name:            doc.name,
        status:          doc.status,
        qrCode:          doc.qrCode,
        trackUrl:        url,
        hasOriginalFile: doc.hasOriginalFile,
        message:         'Document registered successfully.'
      });

    } catch (err) {
      if (err.code === 11000 && attempt < MAX_RETRIES) {
        console.warn(`[registerDocument] Duplicate key on attempt ${attempt}, retrying...`);
        await new Promise(r => setTimeout(r, attempt * 20));
        continue;
      }
      console.error('[registerDocument]', err);
      return res.status(500).json({ message: err.message || 'Registration failed.' });
    }
  }

  return res.status(500).json({ message: 'Could not generate a unique document ID after several attempts. Please try again.' });
};

// GET /api/documents/track/:id (public — no auth)
// Accepts internalId, displayId, or fullDisplayId
const trackDocument = async (req, res) => {
  try {
    const query = req.params.documentId;

    const doc = await Document.findOne({
      $or: [
        { internalId:    query },
        { displayId:     query },
        { fullDisplayId: query },
      ]
    }).select('-filePath');

    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    res.json({
      internalId:       doc.internalId,
      displayId:        doc.displayId,
      verifyCode:       doc.verifyCode,
      fullDisplayId:    doc.fullDisplayId,
      name:             doc.name,
      type:             doc.type,
      by:               doc.by,
      purpose:          doc.purpose,
      priority:         doc.priority,
      status:           doc.status,
      enc:              doc.enc,
      ownerId:          doc.ownerId,
      ownerName:        doc.ownerName,
      qrCode:           doc.qrCode,
      hasOriginalFile:  !!(doc.originalFile || doc.filePath),
      hasProcessedFile: !!(doc.processedFile),
      fileExt:          doc.fileExt,
      processedFileExt: doc.processedFileExt,
      processedBy:      doc.processedBy,
      processedAt:      doc.processedAt,
      history:          doc.history,
      date:             doc.date,
      due:              doc.due,
    });
  } catch (err) {
    console.error('[trackDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/documents/download/:id (public — only allowed when status is Released)
const downloadDocument = async (req, res) => {
  try {
    const query = req.params.documentId;

    const doc = await Document.findOne({
      $or: [
        { internalId: query },
        { displayId:  query },
      ]
    });

    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    if (doc.status !== 'Released') {
      return res.status(403).json({
        message: `Download not allowed. Document status is "${doc.status}". Must be Released.`
      });
    }

    // Prefer processedFile; fall back to originalFile for legacy docs
    const fileData = doc.processedFile || doc.originalFile || doc.filePath;
    const fileExt  = doc.processedFile
      ? (doc.processedFileExt || null)
      : (doc.fileExt || null);

    if (!fileData) {
      return res.status(404).json({ message: 'No file attached to this document.' });
    }

    if (fileData.startsWith('data:') || fileData.startsWith('{')) {
      return res.json({ fileData, fileExt, name: doc.name });
    }

    const absPath = path.join(__dirname, '..', fileData);
    res.download(absPath, doc.name + (fileExt || ''));
  } catch (err) {
    console.error('[downloadDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/documents/:id/status (auth + admin required)
// Releasing a document requires a processed file to be present.
const updateDocumentStatus = async (req, res) => {
  try {
    const query = req.params.documentId;

    let body;
    if (req.file) {
      try { body = JSON.parse(req.body.data); }
      catch (e) {
        return res.status(400).json({ message: 'Invalid update data JSON in FormData.' });
      }
    } else {
      body = req.body;
    }

    const { status, note, location, handler, by, processedFileExt } = body;

    const resolvedProcessedFile = req.file
      ? req.file.buffer.toString('utf8')
      : (body.processedFile || null);

    const resolvedProcessedFileExt = req.file
      ? (processedFileExt || '')
      : (body.processedFileExt || null);

    const doc = await Document.findOne({
      $or: [
        { internalId: query },
        { displayId:  query },
      ]
    });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    // Enforce: Released status requires a processed file
    if (status === 'Released' && !resolvedProcessedFile && !doc.processedFile) {
      return res.status(400).json({
        message: 'Cannot set status to "Released" without uploading a processed/final file.'
      });
    }

    const nowManila = manilaTimestamp();
    doc.status = status;

    if (resolvedProcessedFile) {
      doc.processedFile    = resolvedProcessedFile;
      doc.processedFileExt = resolvedProcessedFileExt || null;
      doc.processedBy      = by || 'admin';
      doc.processedAt      = nowManila;
      doc.hasProcessedFile = true;
    }

    doc.history.push({
      action:   'Status Update',
      status,
      date:     nowManila,
      note:     note     || '',
      by:       by       || 'admin',
      location: location || '',
      handler:  handler  || '',
      hasProcessedFile: !!(resolvedProcessedFile || doc.processedFile)
    });

    await doc.save();

    res.json({
      message:          `Status updated to "${status}"`,
      internalId:       doc.internalId,
      displayId:        doc.displayId,
      fullDisplayId:    doc.fullDisplayId,
      status,
      hasProcessedFile: !!doc.processedFile
    });
  } catch (err) {
    console.error('[updateDocumentStatus]', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/documents/:id/original-file (auth required)
// Accessible by the document owner or any admin
const getOriginalFile = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }]
    }).select('internalId ownerId name fileExt originalFileExt originalFile filePath');

    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isAdmin = req.user && req.user.role === 'admin';
    const isOwner = req.user && (
      String(req.user._id) === doc.ownerId ||
      req.user.userId === doc.ownerId
    );
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const fileData = doc.originalFile || doc.filePath;
    if (!fileData) return res.status(404).json({ message: 'No original file attached to this document.' });

    return res.json({
      fileData,
      fileExt: doc.originalFileExt || doc.fileExt || null,
      name: doc.name
    });
  } catch (err) {
    console.error('[getOriginalFile]', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/documents (auth required)
// Admin sees all docs; regular users see only their own
const getAllDocuments = async (req, res) => {
  try {
    const { ownerId, role } = req.query;
    const isAdmin = (role === 'admin') || (req.user && req.user.role === 'admin');

    const effectiveOwnerId = isAdmin ? null : (ownerId || req.user.userId || String(req.user._id));
    const filter = isAdmin ? {} : { ownerId: effectiveOwnerId };

    // File blobs are excluded from list responses — they're fetched on demand
    const docs = await Document.find(filter)
      .select('-filePath -fileData -originalFile -processedFile')
      .sort({ createdAt: -1 })
      .lean();

    const payload = docs.map(d => ({
      ...d,
      internalId:       d.internalId || String(d._id),
      hasOriginalFile:  !!(d.hasOriginalFile),
      hasProcessedFile: !!(d.hasProcessedFile),
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getAllDocuments]', err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/documents/:id (auth + admin required)
// Also cleans up associated scan logs
const deleteDocument = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc = await Document.findOneAndDelete({
      $or: [
        { internalId: query },
        { displayId:  query },
      ]
    });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    await ScanLog.deleteMany({ documentId: doc.internalId });
    res.json({ message: `Document "${doc.name}" deleted.`, internalId: doc.internalId });
  } catch (err) {
    console.error('[deleteDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/documents/:id/scan-log (public — no auth)
// Saves to scan_logs collection only. Does NOT touch doc.history.
const logScan = async (req, res) => {
  try {
    const query = req.params.documentId;

    const handledBy = req.body.handledBy || 'QR Visitor';
    const location  = req.body.location  || 'QR Scan';
    const note      = req.body.note      || 'Auto-logged on QR scan';

    const doc = await Document.findOne({
      $or: [
        { internalId:    query },
        { displayId:     query },
        { fullDisplayId: query },
      ]
    }).select('internalId displayId fullDisplayId name status');

    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    const nowISO    = new Date().toISOString();
    const nowManila = manilaTimestamp();

    await ScanLog.create({
      documentId:   doc.internalId,
      displayId:    doc.fullDisplayId || doc.displayId,
      documentName: doc.name,
      handledBy,
      location,
      note,
      docStatus:    doc.status,
      timestamp:    nowISO,
      displayDate:  nowManila,
    });

    res.json({
      message:    'Scan logged successfully.',
      internalId: doc.internalId,
      status:     doc.status,
    });
  } catch (err) {
    console.error('[logScan]', err);
    res.status(500).json({ message: err.message });
  }
};

// POST /api/documents/:id/movement (auth + admin only)
// Saves to doc.history with action='Movement'.
// Distinct from QR scan logs — this is a manual admin entry.
const addMovementLog = async (req, res) => {
  try {
    const query = req.params.documentId;
    const { handledBy, location, note } = req.body;

    if (!handledBy || !location) {
      return res.status(400).json({ message: 'handledBy and location are required for manual movement log.' });
    }

    const doc = await Document.findOne({
      $or: [
        { internalId:    query },
        { displayId:     query },
        { fullDisplayId: query },
      ]
    });

    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    const adminUsername = req.user ? (req.user.username || req.user.name || 'admin') : 'admin';
    const nowManila = manilaTimestamp();

    doc.history.push({
      action:   'Movement',
      status:   doc.status,
      date:     nowManila,
      note:     note || `Movement logged by admin: ${adminUsername}`,
      by:       handledBy,
      location,
      handler:  handledBy,
    });

    await doc.save();

    res.json({
      message:    'Movement log added successfully.',
      internalId: doc.internalId,
      status:     doc.status,
      addedBy:    adminUsername,
    });
  } catch (err) {
    console.error('[addMovementLog]', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/documents/scan-logs (auth + admin only)
// Returns entries from the scan_logs collection (QR auto-scans only)
const getAllScanLogs = async (req, res) => {
  try {
    const { search, docId } = req.query;
    let filter = {};
    if (docId) filter.documentId = docId;
    if (search) {
      const re = new RegExp(search, 'i');
      filter.$or = [
        { documentId:   re },
        { displayId:    re },
        { documentName: re },
        { handledBy:    re },
        { location:     re },
      ];
    }

    const scanLogs = await ScanLog.find(filter)
      .sort({ timestamp: -1 })
      .lean();

    res.json(scanLogs);
  } catch (err) {
    console.error('[getAllScanLogs]', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/documents/movement-logs (auth + admin only)
// Returns Movement entries from document histories (admin-created, not QR scans)
const getAllMovementLogs = async (req, res) => {
  try {
    const docs = await Document.find(
      { 'history.action': 'Movement' },
      { internalId: 1, displayId: 1, fullDisplayId: 1, name: 1, history: 1 }
    ).lean();

    const movementLogs = [];
    docs.forEach(doc => {
      (doc.history || []).forEach(h => {
        if (h.action === 'Movement') {
          movementLogs.push({
            documentId:   doc.internalId,
            displayId:    doc.fullDisplayId || doc.displayId,
            documentName: doc.name,
            handledBy:    h.by       || h.handler || '-',
            location:     h.location || '-',
            action:       'Movement',
            note:         h.note     || '',
            timestamp:    h.date,
            displayDate:  h.date,
          });
        }
      });
    });

    movementLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(movementLogs);
  } catch (err) {
    console.error('[getAllMovementLogs]', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  registerDocument,
  trackDocument,
  downloadDocument,
  getOriginalFile,
  updateDocumentStatus,
  getAllDocuments,
  deleteDocument,
  logScan,
  addMovementLog,
  getAllScanLogs,
  getAllMovementLogs,
};
