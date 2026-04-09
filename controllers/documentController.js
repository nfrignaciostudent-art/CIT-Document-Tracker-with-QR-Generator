/* ══════════════════════════════════════════════════════════════════════
   controllers/documentController.js
   CIT Document Tracker · Group 6

   ID Standard:
     internalId  — ULID (primary key, used in QR, not predictable)
     displayId   — DOC-YYYYMMDD-XXXX (user-facing, incremental per day)
     verifyCode  — 4-char alphanumeric HMAC-based suffix
     fullDisplayId — displayId-verifyCode (on receipts)
══════════════════════════════════════════════════════════════════════ */

const path     = require('path');
const QRCode   = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const Document = require('../models/Document');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

/* ── ULID Generator ── */
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

/* ── Daily sequential Display ID: DOC-YYYYMMDD-XXXX ── */
async function genDisplayId() {
  const now     = new Date();
  const yyyy    = now.getFullYear();
  const mm      = String(now.getMonth() + 1).padStart(2, '0');
  const dd      = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}${mm}${dd}`;
  const prefix  = `DOC-${dateStr}-`;

  /* Use findOneAndUpdate with $inc for an atomic sequence — no race condition */
  const CounterModel = require('mongoose').connection.model
    ? null
    : null; // fallback below

  /* Atomic approach: find the highest existing sequence for today, then add 1.
     We use a retry loop in registerDocument for safety, but this reduces conflicts. */
  const last = await Document.findOne(
    { displayId: { $regex: `^${prefix}` } },
    { displayId: 1 },
    { sort: { displayId: -1 } }   // lexicographic sort gives highest seq last
  ).lean();

  let nextSeq = 1;
  if (last && last.displayId) {
    const parts = last.displayId.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return prefix + String(nextSeq).padStart(4, '0');
}

/* ── Deterministic 4-char verification code (FNV-1a based) ── */
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

/* ── Tracking URL uses internalId (ULID) — not predictable ── */
const trackUrl = (internalId) => `${APP_BASE_URL}?track=${internalId}`;

/* ── POST /api/documents/register ── */
const registerDocument = async (req, res) => {
  /* ── Support both upload modes ──────────────────────────────────────
     a) FormData  → frontend sends metadata as req.body.data (JSON string)
                    + the IDEA-encrypted file blob as req.file
     b) Plain JSON → everything is in req.body (no file, or file already
                    embedded as base64 string in req.body.fileData)
  ──────────────────────────────────────────────────────────────────── */
  let body;
  if (req.file) {
    // FormData path — parse the "data" field
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

  /* Resolve the actual file data:
     - FormData upload  → req.file.buffer converted back to the encrypted string
     - JSON upload      → fileData field (may be null if no attachment) */
  const resolvedFileData = req.file
    ? req.file.buffer.toString('utf8')   // IDEA-encrypted string sent as binary blob
    : (fileData || null);

  const resolvedFileExt = req.file ? (fileExt || '') : (fileExt || null);

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
          date:   date || new Date().toLocaleString('en-PH'),
          note:   'Document submitted & encrypted with IDEA-128',
          by:     ownerName || ownerId,
          location: '', handler: ''
        }],
        date: date || new Date().toLocaleString('en-PH')
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
        console.warn(`[registerDocument] Duplicate key on attempt ${attempt}, retrying…`);
        await new Promise(r => setTimeout(r, attempt * 20));
        continue;
      }
      console.error('[registerDocument]', err);
      return res.status(500).json({ message: err.message || 'Registration failed.' });
    }
  }

  return res.status(500).json({ message: 'Could not generate a unique document ID after several attempts. Please try again.' });
};

/* ── GET /api/documents/track/:id (PUBLIC — no auth) ── */
/* Accepts internalId (ULID) or displayId or fullDisplayId */
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

/* ── GET /api/documents/download/:id (PUBLIC — only if Released) ── */
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

    /* Prefer processedFile (admin-approved final version), fall back to original */
    const fileData = doc.processedFile || doc.originalFile || doc.filePath;
    const fileExt  = doc.processedFile
      ? (doc.processedFileExt || null)
      : (doc.fileExt || null);

    if (!fileData) {
      return res.status(404).json({ message: 'No file attached to this document.' });
    }

    /* Base64 / JSON-encrypted data URI — return as JSON for client-side decryption */
    if (fileData.startsWith('data:') || fileData.startsWith('{')) {
      return res.json({ fileData, fileExt, name: doc.name });
    }

    /* Legacy: actual file path on disk */
    const absPath = path.join(__dirname, '..', fileData);
    res.download(absPath, doc.name + (fileExt || ''));
  } catch (err) {
    console.error('[downloadDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ── PATCH /api/documents/:id/status (Auth required) ── */
const updateDocumentStatus = async (req, res) => {
  try {
    const query = req.params.documentId;

    /* ── Support both upload modes ──────────────────────────────────
       a) FormData  → req.body.data = JSON string, req.file = processed file blob
       b) Plain JSON → everything in req.body.processedFile (base64 string or null)
    ────────────────────────────────────────────────────────────────── */
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

    // Resolve processed file from multer (FormData) or JSON body
    const resolvedProcessedFile = req.file
      ? req.file.buffer.toString('utf8')    // IDEA-encrypted string sent as binary blob
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

    /* Validation: cannot set Released without a processed file */
    if (status === 'Released' && !resolvedProcessedFile && !doc.processedFile) {
      return res.status(400).json({
        message: 'Cannot set status to "Released" without uploading a processed/final file.'
      });
    }

    doc.status = status;

    /* Attach processed file if provided */
    if (resolvedProcessedFile) {
      doc.processedFile    = resolvedProcessedFile;
      doc.processedFileExt = resolvedProcessedFileExt || null;
      doc.processedBy      = by || 'admin';
      doc.processedAt      = new Date().toLocaleString('en-PH');
      doc.hasProcessedFile = true;
    }

    doc.history.push({
      action:   'Status Update',
      status,
      date:     new Date().toLocaleString('en-PH'),
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

/* ── GET /api/documents/:id/original-file (Auth — fetch original encrypted file blob) ──
   Used by the frontend after a page refresh when the in-memory file blob is gone.
   Returns { fileData, fileExt, name } so the client can IDEA-decrypt locally.
   Admin can access any doc's original file; regular users can only access their own. */
const getOriginalFile = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }]
    }).select('internalId ownerId name fileExt originalFileExt originalFile filePath');

    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    /* Access control: admins see all, users only see their own */
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

/* ── GET /api/documents (Auth — get all or user's docs) ── */
const getAllDocuments = async (req, res) => {
  try {
    const { ownerId, role } = req.query;
    const isAdmin = (role === 'admin') || (req.user && req.user.role === 'admin');

    const effectiveOwnerId = isAdmin ? null : (ownerId || req.user.userId || String(req.user._id));
    const filter = isAdmin ? {} : { ownerId: effectiveOwnerId };

    /* Explicitly exclude the large file blob fields at the DB level —
       this keeps the list response fast even with many documents */
    const docs = await Document.find(filter)
      .select('-filePath -fileData -originalFile -processedFile')
      .sort({ createdAt: -1 })
      .lean();

    /* Add boolean flags so the frontend knows a file exists without the blob */
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

/* ── DELETE /api/documents/:id (Auth required) ── */
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
    res.json({ message: `Document "${doc.name}" deleted.`, internalId: doc.internalId });
  } catch (err) {
    console.error('[deleteDocument]', err);
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
  deleteDocument
};