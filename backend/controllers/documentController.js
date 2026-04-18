/* ══════════════════════════════════════════════════════════════════════
   controllers/documentController.js
   CIT Document Tracker - Group 6

   STAFF / FACULTY WORKFLOW ADDITIONS:

   createDocument (NEW)
     POST /api/documents/create  (user role only)
     Alias for registerDocument that enforces the 'user' role restriction.
     Sets current_stage = 'staff' and status = 'Received'.
     Reuses all existing registration logic (ULID, QR, IDEA vault, etc.).

   getMyDocuments (NEW)
     GET /api/documents/my  (user role — own documents only)
     Returns the authenticated user's documents sorted newest-first.
     Does NOT expose file blobs (same exclusions as getAllDocuments).

   updateDocumentStatusByRole (ENHANCED)
     POST /api/documents/update-status  (staff | faculty | admin)
     Enforces strict role-based status transition rules:
       Staff   : Received/staff  → process        → Processing / faculty
               : Received/staff  → hold           → On Hold    / staff
               : staff stage     → return (note!) → Returned   / completed
               : On Hold/staff   → unhold         → Received   / staff
               : Processing/staff → process       → Processing / faculty  (after revision)
       Faculty : Processing/faculty → approve         → Processing / admin
               :                  → reject            → Rejected  / completed
               :                  → request_revision  → Processing / staff  (note required)
       Admin   : Processing/admin  → release (file!) → Released   / completed
               :                  → reject            → Rejected  / completed
               :                  → send_back         → Processing / faculty
     Any other transition is rejected with HTTP 403.
     All transitions append a history entry and fire notifications (owner +
     role-targeted notifications for revision/send_back).

   getAllDocuments (UPDATED)
     GET /api/documents
     Extended to support staff and faculty roles:
       admin   : all documents (unchanged)
       staff   : documents with current_stage = 'staff'
       faculty : documents with current_stage = 'faculty'
       user    : own documents only (unchanged)

   All other handlers (registerDocument, trackDocument, downloadDocument,
   getOriginalFile, deleteDocument, logScan, addMovementLog,
   getAllScanLogs, getAllMovementLogs, getDocumentForOwner) are
   UNCHANGED so existing admin + user functionality is unaffected.
══════════════════════════════════════════════════════════════════════ */

const path           = require('path');
const QRCode         = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const Document       = require('../models/Document');
const ScanLog        = require('../models/ScanLog');
const Notification   = require('../models/Notification');
const User           = require('../models/User');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:3000';

/* ── Manila timezone helper (UTC+8) ── */
function manilaTimestamp() {
  return new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  });
}

/* ── ULID Generator ── */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateULID() {
  const t = Date.now();
  let timeStr = '', tmp = t;
  for (let i = 9; i >= 0; i--) { timeStr = CROCKFORD[tmp % 32] + timeStr; tmp = Math.floor(tmp / 32); }
  let randStr = '';
  for (let i = 0; i < 16; i++) randStr += CROCKFORD[Math.floor(Math.random() * 32)];
  return timeStr + randStr;
}

/* ── Daily sequential Display ID: DOC-YYYYMMDD-XXXX ── */
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
    { sort: { displayId: -1 } },
  ).lean();

  let nextSeq = 1;
  if (last && last.displayId) {
    const parts = last.displayId.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }
  return prefix + String(nextSeq).padStart(4, '0');
}

/* ── Deterministic 4-char verification code (FNV-1a) ── */
function genVerifyCode(displayId, internalId) {
  const str = displayId + ':' + internalId;
  let hash  = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash  = Math.imul(hash, 16777619) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 4; i++) { code += CROCKFORD[hash % 32]; hash = Math.floor(hash / 32); }
  return code;
}

const trackUrl = (internalId) => `${APP_BASE_URL}?track=${internalId}`;

/* ── Shared document creation logic (used by registerDocument + createDocument) ── */
async function _createDocument(body, fileBuffer, fileExt) {
  const {
    name, type, by, purpose,
    priority, due,
    enc, encPurpose,
    ownerId, ownerName,
    status, date, history, fileData, hasOriginalFile,
  } = body;

  if (!name || !type || !by || !purpose || !enc || !ownerId)
    throw Object.assign(new Error('Missing required fields.'), { status: 400 });

  const resolvedFileData = fileBuffer ? fileBuffer.toString('utf8') : (fileData || null);
  const resolvedFileExt  = fileBuffer ? (fileExt || '') : (fileExt || null);
  const nowManila        = manilaTimestamp();
  const MAX_RETRIES      = 5;

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
        name, purpose,
        enc:        enc        || '',
        encPurpose: encPurpose || '',
        type, by,
        priority:    priority || 'Normal',
        due:         due || null,
        status:      'Received',       // always Received for new documents
        current_stage: 'staff',        // always starts at staff stage
        ownerId, ownerName,
        qrCode:          qrData,
        filePath:        resolvedFileData || null,
        fileExt:         resolvedFileExt  || null,
        fileURL:         resolvedFileData ? url + '&download=1' : null,
        originalFile:    resolvedFileData || null,
        originalFileExt: resolvedFileExt  || null,
        hasOriginalFile: !!(resolvedFileData),
        processedFile:    null, processedFileExt: null,
        processedBy:      null, processedAt:      null,
        hasProcessedFile: false,
        history: history || [
          {
            action: 'Status Update', status: 'Received', date: nowManila,
            note: 'Document submitted & encrypted with IDEA-128-CBC',
            by: ownerName || ownerId, location: '', handler: '',
          },
          {
            action: 'Movement', status: 'Received', date: nowManila,
            note: 'Document submitted at registration',
            by: ownerName || ownerId, location: 'Submission Point',
            handler: ownerName || ownerId,
          },
        ],
        date: nowManila,
      });

      /* ── Auto-notify all admins ── */
      try {
        const admins = await User.find({ role: 'admin' }).select('userId _id').lean();
        if (admins.length) {
          const notifDocs = admins.map(admin => ({
            userId:     admin.userId || String(admin._id),
            msg:        `New document registered: "<strong>${doc.name}</strong>" by ${ownerName || ownerId} — ${doc.fullDisplayId}`,
            documentId: doc.internalId,
            read:       false,
          }));
          await Notification.insertMany(notifDocs);
        }
      } catch (notifErr) {
        console.warn('[_createDocument] Could not create admin notifications:', notifErr.message);
      }

      return doc;
    } catch (err) {
      if (err.code === 11000 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, attempt * 20));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Could not generate a unique document ID. Please try again.');
}

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/register  (protected — existing endpoint, unchanged)
══════════════════════════════════════════════════════════════════════ */
const registerDocument = async (req, res) => {
  try {
    let body;
    if (req.file) {
      try { body = JSON.parse(req.body.data); }
      catch (e) { return res.status(400).json({ message: 'Invalid document data JSON in FormData.' }); }
    } else {
      body = req.body;
    }

    const fileBuffer = req.file ? req.file.buffer : null;
    const fileExt    = req.file ? (body.fileExt || '') : (body.fileExt || null);

    const doc = await _createDocument(body, fileBuffer, fileExt);
    const url = trackUrl(doc.internalId);

    return res.status(201).json({
      internalId:      doc.internalId,
      displayId:       doc.displayId,
      verifyCode:      doc.verifyCode,
      fullDisplayId:   doc.fullDisplayId,
      name:            doc.name,
      status:          doc.status,
      current_stage:   doc.current_stage,
      qrCode:          doc.qrCode,
      trackUrl:        url,
      hasOriginalFile: doc.hasOriginalFile,
      message:         'Document registered successfully.',
    });
  } catch (err) {
    console.error('[registerDocument]', err);
    const httpStatus = err.status || 500;
    return res.status(httpStatus).json({ message: err.message || 'Registration failed.' });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/create  (NEW — user role only)

   Strict alias for registerDocument.  Enforces that only 'user' role
   accounts may call this endpoint.  Returns the same shape.
══════════════════════════════════════════════════════════════════════ */
const createDocument = async (req, res) => {
  /* Role guard — only users may submit documents via this endpoint */
  if (!req.user || req.user.role !== 'user') {
    return res.status(403).json({
      message: 'Only users can submit documents. ' +
               'Staff, faculty and admins manage documents through the workflow endpoints.',
    });
  }

  /* Delegate to the shared registration logic */
  return registerDocument(req, res);
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/my  (NEW — user role, own documents only)
══════════════════════════════════════════════════════════════════════ */
const getMyDocuments = async (req, res) => {
  try {
    const userId = req.user.userId || String(req.user._id);

    const docs = await Document.find({ ownerId: userId })
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
    console.error('[getMyDocuments]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/track/:id  (PUBLIC — no auth, unchanged)
══════════════════════════════════════════════════════════════════════ */
const trackDocument = async (req, res) => {
  try {
    const query = req.params.documentId;

    const doc = await Document.findOne({
      $or: [
        { internalId:    query },
        { displayId:     query },
        { fullDisplayId: query },
      ],
    }).select('-filePath -originalFile -processedFile -fileData');

    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    res.json({
      internalId:    doc.internalId,
      displayId:     doc.displayId,
      verifyCode:    doc.verifyCode,
      fullDisplayId: doc.fullDisplayId,
      enc:        doc.enc,
      encPurpose: doc.encPurpose,
      type:     doc.type,
      by:       doc.by,
      priority: doc.priority,
      status:   doc.status,
      current_stage: doc.current_stage,
      ownerId:  doc.ownerId,
      ownerName: doc.ownerName,
      qrCode:   doc.qrCode,
      hasOriginalFile:  !!(doc.hasOriginalFile),
      hasProcessedFile: !!(doc.hasProcessedFile),
      fileExt:          doc.fileExt,
      processedFileExt: doc.processedFileExt,
      processedBy:      doc.processedBy,
      processedAt:      doc.processedAt,
      history: doc.history,
      date:    doc.date,
      due:     doc.due,
    });
  } catch (err) {
    console.error('[trackDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/:id/details  (PROTECTED — JWT, ownership-aware, unchanged)
══════════════════════════════════════════════════════════════════════ */
const getDocumentForOwner = async (req, res) => {
  try {
    const query = req.params.documentId;

    const doc = await Document.findOne({
      $or: [
        { internalId:    query },
        { displayId:     query },
        { fullDisplayId: query },
      ],
    }).select('-filePath -originalFile -processedFile -fileData');

    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    const requesterId = req.user.userId || String(req.user._id);
    const isAdmin     = req.user.role === 'admin';
    const isOwner     = isAdmin ||
                        doc.ownerId === requesterId ||
                        doc.ownerId === String(req.user._id);

    const publicFields = {
      internalId:    doc.internalId,
      displayId:     doc.displayId,
      verifyCode:    doc.verifyCode,
      fullDisplayId: doc.fullDisplayId,
      enc:           doc.enc,
      encPurpose:    doc.encPurpose || '',
      type:          doc.type,
      by:            doc.by,
      priority:      doc.priority,
      status:        doc.status,
      current_stage: doc.current_stage,
      ownerId:       doc.ownerId,
      ownerName:     doc.ownerName,
      qrCode:        doc.qrCode,
      hasOriginalFile:  !!(doc.hasOriginalFile),
      hasProcessedFile: !!(doc.hasProcessedFile),
      fileExt:          doc.fileExt,
      processedFileExt: doc.processedFileExt,
      processedBy:      doc.processedBy,
      processedAt:      doc.processedAt,
      history:          doc.history,
      date:             doc.date,
      due:              doc.due,
    };

    if (isOwner) {
      return res.json({ ...publicFields, name: doc.name, purpose: doc.purpose, isOwner: true });
    }
    return res.json({ ...publicFields, name: null, purpose: null, isOwner: false });

  } catch (err) {
    console.error('[getDocumentForOwner]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents  (Auth required)
   UPDATED: staff sees current_stage='staff' docs;
            faculty sees current_stage='faculty' docs.
══════════════════════════════════════════════════════════════════════ */
const getAllDocuments = async (req, res) => {
  try {
    const callerRole = req.user.role;

    let filter = {};

    if (callerRole === 'admin') {
      /* Admin sees everything */
      filter = {};
    } else if (callerRole === 'staff') {
      /* Staff sees documents waiting for their action */
      filter = { current_stage: 'staff' };
    } else if (callerRole === 'faculty') {
      /* Faculty sees documents forwarded from staff */
      filter = { current_stage: 'faculty' };
    } else {
      /* Regular user: own documents only */
      const { ownerId } = req.query;
      const effectiveOwnerId = ownerId || req.user.userId || String(req.user._id);
      filter = { ownerId: effectiveOwnerId };
    }

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

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/update-status  (staff | faculty | admin)

   Enhanced role-based workflow transition table:

   ┌─────────────────┬──────────────────────────┬──────────────────────────────────────────┐
   │ Caller role     │ Required document state   │ Action → Result                          │
   ├─────────────────┼──────────────────────────┼──────────────────────────────────────────┤
   │ staff           │ stage=staff,              │ process        → Processing / faculty    │
   │                 │ status=Received           │ hold           → On Hold    / staff      │
   │                 │     OR Processing         │ return         → Returned   / completed  │
   │                 │ stage=staff, any status   │   (note req.)                            │
   │                 │ stage=staff, On Hold      │ unhold         → Received   / staff      │
   ├─────────────────┼──────────────────────────┼──────────────────────────────────────────┤
   │ faculty         │ Processing / faculty      │ approve        → Processing / admin      │
   │                 │                           │ reject         → Rejected   / completed  │
   │                 │                           │ request_revision → Processing / staff    │
   │                 │                           │   (note req.)                            │
   ├─────────────────┼──────────────────────────┼──────────────────────────────────────────┤
   │ admin           │ Processing / admin        │ release (file req.) → Released/completed │
   │                 │ (any for reject)          │ reject              → Rejected/completed │
   │                 │ Processing / admin        │ send_back      → Processing / faculty    │
   └─────────────────┴──────────────────────────┴──────────────────────────────────────────┘

   Body: { documentId, action, note?, location? }
   Staff  actions : 'process' | 'hold' | 'unhold' | 'return'
   Faculty actions: 'approve' | 'reject' | 'request_revision'
   Admin  actions : 'release' | 'reject' | 'send_back'
══════════════════════════════════════════════════════════════════════ */
const updateDocumentStatusByRole = async (req, res) => {
  try {
    const { documentId, action, note, location } = req.body;

    if (!documentId || !action)
      return res.status(400).json({ message: 'documentId and action are required.' });

    const callerRole = req.user.role;
    const callerName = req.user.name || req.user.username || callerRole;

    /* ── Load document ── */
    const doc = await Document.findOne({
      $or: [
        { internalId:    documentId },
        { displayId:     documentId },
        { fullDisplayId: documentId },
      ],
    });
    if (!doc) return res.status(404).json({ message: `Document "${documentId}" not found.` });

    const nowManila = manilaTimestamp();
    let newStatus        = doc.status;
    let newStage         = doc.current_stage;
    let historyNote      = note || '';
    let notificationMsg  = '';
    /* Extra notifications for staff when faculty sends back */
    let staffNotificationMsg = '';

    /* ══════════════════════════════════════════════════════════════
       STAFF transitions
       Allowed actions: process | hold | unhold | return
    ══════════════════════════════════════════════════════════════ */
    if (callerRole === 'staff') {
      const staffActions = ['process', 'hold', 'unhold', 'return'];
      if (!staffActions.includes(action)) {
        return res.status(403).json({
          message: `Staff allowed actions: ${staffActions.join(', ')}.`,
        });
      }

      /* ── process: forward to faculty ── */
      if (action === 'process') {
        /* Allow from Received/staff (initial) OR Processing/staff (after revision request) */
        if (doc.current_stage !== 'staff') {
          return res.status(400).json({
            message: `Cannot process: document must be in staff stage. ` +
                     `Current: ${doc.status} / ${doc.current_stage}.`,
          });
        }
        if (!['Received', 'Processing'].includes(doc.status)) {
          return res.status(400).json({
            message: `Cannot process: document must be Received or Processing. ` +
                     `Current status: ${doc.status}.`,
          });
        }
        newStatus   = 'Processing';
        newStage    = 'faculty';
        historyNote = note || `Processed by staff: ${callerName}. Forwarded to faculty.`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" has been processed by staff ` +
                          `and forwarded to faculty review.`;
      }

      /* ── hold: pause document pending requirements ── */
      else if (action === 'hold') {
        if (doc.current_stage !== 'staff' || doc.status !== 'Received') {
          return res.status(400).json({
            message: `Cannot hold: document must be in Received / staff stage. ` +
                     `Current: ${doc.status} / ${doc.current_stage}.`,
          });
        }
        newStatus   = 'On Hold';
        newStage    = 'staff';
        historyNote = note || `Placed on hold by staff: ${callerName}.`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" has been placed ` +
                          `<strong>On Hold</strong> by staff.` +
                          (note ? ` Reason: ${note}` : ' Pending additional requirements.');
      }

      /* ── unhold: release from hold back to Received ── */
      else if (action === 'unhold') {
        if (doc.status !== 'On Hold' || doc.current_stage !== 'staff') {
          return res.status(400).json({
            message: `Cannot release from hold: document must be On Hold / staff stage. ` +
                     `Current: ${doc.status} / ${doc.current_stage}.`,
          });
        }
        newStatus   = 'Received';
        newStage    = 'staff';
        historyNote = note || `Released from hold by staff: ${callerName}.`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" has been released from hold. ` +
                          `It is now back in <strong>Received</strong> status.`;
      }

      /* ── return: send document back to user for corrections ── */
      else if (action === 'return') {
        if (doc.current_stage !== 'staff') {
          return res.status(400).json({
            message: `Cannot return: document must be in staff stage. ` +
                     `Current: ${doc.status} / ${doc.current_stage}.`,
          });
        }
        if (!note || !note.trim()) {
          return res.status(400).json({
            message: 'A reason/note is required when returning a document to the user.',
          });
        }
        newStatus   = 'Returned';
        newStage    = 'completed';
        historyNote = `Returned to user by staff: ${callerName}. Reason: ${note}`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" has been ` +
                          `<strong>returned</strong> by staff. Reason: ${note} — ` +
                          `Please submit a new request with the required corrections.`;
      }
    }

    /* ══════════════════════════════════════════════════════════════
       FACULTY transitions
       Allowed actions: approve | reject | request_revision
    ══════════════════════════════════════════════════════════════ */
    else if (callerRole === 'faculty') {
      const facultyActions = ['approve', 'reject', 'request_revision'];
      if (!facultyActions.includes(action)) {
        return res.status(403).json({
          message: `Faculty allowed actions: ${facultyActions.join(', ')}.`,
        });
      }
      if (doc.status !== 'Processing' || doc.current_stage !== 'faculty') {
        return res.status(400).json({
          message: `Cannot ${action}: document must be in Processing / faculty stage. ` +
                   `Current: ${doc.status} / ${doc.current_stage}.`,
        });
      }

      /* ── approve: advance to admin ── */
      if (action === 'approve') {
        newStatus   = 'Processing';
        newStage    = 'admin';
        historyNote = note || `Approved by faculty: ${callerName}. Forwarded to admin for release.`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" has been approved by faculty ` +
                          `and is now awaiting admin release.`;
      }

      /* ── reject: terminal rejection ── */
      else if (action === 'reject') {
        newStatus   = 'Rejected';
        newStage    = 'completed';
        historyNote = note || `Rejected by faculty: ${callerName}.`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" was ` +
                          `<strong>rejected</strong> by faculty` +
                          (note ? `: ${note}` : '.');
      }

      /* ── request_revision: send back to staff for corrections ── */
      else if (action === 'request_revision') {
        if (!note || !note.trim()) {
          return res.status(400).json({
            message: 'A note describing the required revision is required.',
          });
        }
        newStatus   = 'Processing';
        newStage    = 'staff';       // returns to staff queue
        historyNote = `Revision requested by faculty: ${callerName}. Note: ${note}`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" has been sent back ` +
                          `to staff for revision by faculty.` +
                          (note ? ` Note: ${note}` : '');
        /* Also notify all staff members that a revision is needed */
        staffNotificationMsg =
          `Faculty <strong>${callerName}</strong> requested revision on document ` +
          `"<strong>${doc.name}</strong>" — ${doc.fullDisplayId || doc.displayId}. ` +
          (note ? `Note: ${note}` : '');
      }
    }

    /* ══════════════════════════════════════════════════════════════
       ADMIN transitions
       Allowed actions: release | reject | send_back
    ══════════════════════════════════════════════════════════════ */
    else if (callerRole === 'admin') {
      const adminActions = ['release', 'reject', 'send_back'];
      if (!adminActions.includes(action)) {
        return res.status(403).json({
          message: 'Admin workflow actions: "release", "reject", or "send_back". ' +
                   'For full status control use PATCH /api/documents/:id/status.',
        });
      }

      /* ── release: finalize and make available for download ── */
      if (action === 'release') {
        if (doc.current_stage !== 'admin') {
          return res.status(400).json({
            message: `Cannot release: document must be in admin stage. ` +
                     `Current stage: ${doc.current_stage}.`,
          });
        }
        if (!doc.processedFile && !doc.hasProcessedFile) {
          return res.status(400).json({
            message: 'Cannot release: please upload the final processed file first via ' +
                     'PATCH /api/documents/:id/status (which supports file upload).',
          });
        }
        newStatus   = 'Released';
        newStage    = 'completed';
        historyNote = note || `Released by admin: ${callerName}.`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" has been ` +
                          `<strong>Released</strong>.` +
                          (location ? ` (${location})` : '');
      }

      /* ── reject: terminal rejection (allowed at any stage) ── */
      else if (action === 'reject') {
        newStatus   = 'Rejected';
        newStage    = 'completed';
        historyNote = note || `Rejected by admin: ${callerName}.`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" was ` +
                          `<strong>rejected</strong> by admin` +
                          (note ? `: ${note}` : '.');
      }

      /* ── send_back: return to faculty for additional review ── */
      else if (action === 'send_back') {
        if (doc.current_stage !== 'admin') {
          return res.status(400).json({
            message: `Cannot send back: document must be in admin stage. ` +
                     `Current stage: ${doc.current_stage}.`,
          });
        }
        newStatus   = 'Processing';
        newStage    = 'faculty';
        historyNote = note || `Sent back to faculty by admin: ${callerName}.`;
        notificationMsg = `Your document "<strong>${doc.name}</strong>" has been sent back ` +
                          `to faculty for additional review by admin.` +
                          (note ? ` Note: ${note}` : '');
        /* Notify all faculty that a document was returned to them */
        staffNotificationMsg =
          `Admin <strong>${callerName}</strong> returned document ` +
          `"<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) to faculty for review.` +
          (note ? ` Note: ${note}` : '');
      }
    }

    /* ── Unknown role ── */
    else {
      return res.status(403).json({
        message: `Role "${callerRole}" is not permitted to update document status via this endpoint.`,
      });
    }

    /* ── Apply changes ── */
    const previousStatus = doc.status;
    const previousStage  = doc.current_stage;

    doc.status        = newStatus;
    doc.current_stage = newStage;

    doc.history.push({
      action:   'Status Update',
      status:   newStatus,
      date:     nowManila,
      note:     historyNote,
      by:       callerName,
      location: location || '',
      handler:  callerName,
    });

    await doc.save();

    /* ── Notify document owner ── */
    try {
      await Notification.create({
        userId:     doc.ownerId,
        msg:        notificationMsg,
        documentId: doc.internalId,
        read:       false,
      });
    } catch (notifErr) {
      console.warn('[updateDocumentStatusByRole] Notification failed:', notifErr.message);
    }

    /* ── Notify staff (when faculty requests revision) or
          faculty (when admin sends back) ── */
    if (staffNotificationMsg) {
      try {
        const targetRole = (action === 'request_revision' || action === 'send_back' && newStage === 'faculty')
          ? (newStage === 'staff' ? 'staff' : 'faculty')
          : null;
        // Determine recipient role from the new stage
        const recipientRole = newStage === 'staff' ? 'staff' : (newStage === 'faculty' ? 'faculty' : null);
        if (recipientRole) {
          const recipients = await User.find({ role: recipientRole }).select('userId _id').lean();
          if (recipients.length) {
            const notifDocs = recipients.map(u => ({
              userId:     u.userId || String(u._id),
              msg:        staffNotificationMsg,
              documentId: doc.internalId,
              read:       false,
            }));
            await Notification.insertMany(notifDocs);
          }
        }
      } catch (notifErr) {
        console.warn('[updateDocumentStatusByRole] Secondary notification failed:', notifErr.message);
      }
    }

    res.json({
      message:        `Action "${action}" completed successfully.`,
      internalId:     doc.internalId,
      displayId:      doc.displayId,
      fullDisplayId:  doc.fullDisplayId,
      previousStatus,
      previousStage,
      status:         doc.status,
      current_stage:  doc.current_stage,
      actionBy:       callerName,
      actionRole:     callerRole,
      at:             nowManila,
    });
  } catch (err) {
    console.error('[updateDocumentStatusByRole]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/download/:id  (PUBLIC — only if Released, unchanged)
══════════════════════════════════════════════════════════════════════ */
const downloadDocument = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }],
    });

    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    if (doc.status !== 'Released') {
      return res.status(403).json({
        message: `Download not allowed. Document status is "${doc.status}". Must be Released.`,
      });
    }

    const fileData = doc.processedFile || doc.originalFile || doc.filePath;
    const fileExt  = doc.processedFile
      ? (doc.processedFileExt || null)
      : (doc.fileExt || null);

    if (!fileData) return res.status(404).json({ message: 'No file attached to this document.' });

    if (fileData.startsWith('data:') || fileData.startsWith('{'))
      return res.json({ fileData, fileExt, name: doc.name });

    const absPath = path.join(__dirname, '..', fileData);
    res.download(absPath, doc.name + (fileExt || ''));
  } catch (err) {
    console.error('[downloadDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   PATCH /api/documents/:id/status  (Auth + Admin only — unchanged)
   Kept intact for full admin control (including file upload support).
══════════════════════════════════════════════════════════════════════ */
const updateDocumentStatus = async (req, res) => {
  try {
    const query = req.params.documentId;
    let body;
    if (req.file) {
      try { body = JSON.parse(req.body.data); }
      catch (e) { return res.status(400).json({ message: 'Invalid update data JSON in FormData.' }); }
    } else {
      body = req.body;
    }

    const { status, note, location, handler, by, processedFileExt } = body;
    const resolvedProcessedFile    = req.file ? req.file.buffer.toString('utf8') : (body.processedFile || null);
    const resolvedProcessedFileExt = req.file ? (processedFileExt || '') : (body.processedFileExt || null);

    const doc = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }],
    });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    if (status === 'Released' && !resolvedProcessedFile && !doc.processedFile) {
      return res.status(400).json({ message: 'Cannot set status to "Released" without uploading a processed/final file.' });
    }

    const nowManila = manilaTimestamp();
    doc.status = status;

    /* Auto-advance current_stage based on status when admin uses this endpoint */
    if (status === 'Released' || status === 'Rejected') {
      doc.current_stage = 'completed';
    } else if (status === 'Processing' && doc.current_stage === 'staff') {
      doc.current_stage = 'faculty';
    }

    if (resolvedProcessedFile) {
      doc.processedFile    = resolvedProcessedFile;
      doc.processedFileExt = resolvedProcessedFileExt || null;
      doc.processedBy      = by || 'admin';
      doc.processedAt      = nowManila;
      doc.hasProcessedFile = true;
    }

    doc.history.push({
      action: 'Status Update', status, date: nowManila,
      note: note || '', by: by || 'admin', location: location || '', handler: handler || '',
    });
    doc.history.push({
      action: 'Movement', status, date: nowManila,
      note: `Status updated to ${status}` + (note ? ': ' + note : ''),
      by: by || req.user?.username || 'admin',
      location: location || 'Admin Office',
      handler:  handler  || by || req.user?.username || 'admin',
    });

    await doc.save();

    /* Notify document owner */
    try {
      const adminName = req.user ? (req.user.name || req.user.username || 'Admin') : 'Admin';
      await Notification.create({
        userId:     doc.ownerId,
        msg:        `Your document "<strong>${doc.name}</strong>" status changed to <strong>${status}</strong>` +
                    (resolvedProcessedFile ? ' — Final file attached' : '') +
                    (location ? ' at ' + location : '') +
                    (note     ? ' — ' + note      : '') +
                    ` (by ${adminName})`,
        documentId: doc.internalId,
        read:       false,
      });
    } catch (notifErr) {
      console.warn('[updateDocumentStatus] Notification failed:', notifErr.message);
    }

    res.json({
      message:          `Status updated to "${status}"`,
      internalId:       doc.internalId,
      displayId:        doc.displayId,
      fullDisplayId:    doc.fullDisplayId,
      status,
      current_stage:    doc.current_stage,
      hasProcessedFile: !!doc.processedFile,
    });
  } catch (err) {
    console.error('[updateDocumentStatus]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/:id/original-file  (Auth required, unchanged)
══════════════════════════════════════════════════════════════════════ */
const getOriginalFile = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }],
    }).select('internalId ownerId name fileExt originalFileExt originalFile filePath');

    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isAdmin = req.user && req.user.role === 'admin';
    const isOwner = req.user && (
      String(req.user._id) === doc.ownerId || req.user.userId === doc.ownerId
    );
    if (!isAdmin && !isOwner) return res.status(403).json({ message: 'Access denied.' });

    const fileData = doc.originalFile || doc.filePath;
    if (!fileData) return res.status(404).json({ message: 'No original file attached to this document.' });

    return res.json({ fileData, fileExt: doc.originalFileExt || doc.fileExt || null, name: doc.name });
  } catch (err) {
    console.error('[getOriginalFile]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   DELETE /api/documents/:id  (Auth + Admin, unchanged)
══════════════════════════════════════════════════════════════════════ */
const deleteDocument = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOneAndDelete({
      $or: [{ internalId: query }, { displayId: query }],
    });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    await ScanLog.deleteMany({ documentId: doc.internalId });
    res.json({ message: `Document "${doc.name}" deleted.`, internalId: doc.internalId });
  } catch (err) {
    console.error('[deleteDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/:id/scan-log  (PUBLIC — no auth, unchanged)
══════════════════════════════════════════════════════════════════════ */
const logScan = async (req, res) => {
  try {
    const query     = req.params.documentId;
    const handledBy = req.body.handledBy || 'QR Visitor';
    const location  = req.body.location  || 'QR Scan';
    const note      = req.body.note      || 'Auto-logged on QR scan';

    const doc = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }, { fullDisplayId: query }],
    }).select('internalId displayId fullDisplayId name status');

    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    const nowISO    = new Date().toISOString();
    const nowManila = manilaTimestamp();

    await ScanLog.create({
      documentId:   doc.internalId,
      displayId:    doc.fullDisplayId || doc.displayId,
      documentName: doc.name,
      handledBy, location, note,
      docStatus:   doc.status,
      timestamp:   nowISO,
      displayDate: nowManila,
    });

    res.json({ message: 'Scan logged successfully.', internalId: doc.internalId, status: doc.status });
  } catch (err) {
    console.error('[logScan]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/:id/movement  (Auth + Admin only, unchanged)
══════════════════════════════════════════════════════════════════════ */
const addMovementLog = async (req, res) => {
  try {
    const query = req.params.documentId;
    const { handledBy, location, note } = req.body;

    if (!handledBy || !location)
      return res.status(400).json({ message: 'handledBy and location are required.' });

    const doc = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }, { fullDisplayId: query }],
    });
    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    const adminUsername = req.user ? (req.user.username || req.user.name || 'admin') : 'admin';
    const nowManila     = manilaTimestamp();

    doc.history.push({
      action: 'Movement', status: doc.status, date: nowManila,
      note: note || `Movement logged by admin: ${adminUsername}`,
      by: handledBy, location, handler: handledBy,
    });
    await doc.save();

    res.json({ message: 'Movement log added.', internalId: doc.internalId, status: doc.status, addedBy: adminUsername });
  } catch (err) {
    console.error('[addMovementLog]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/scan-logs  (Auth + Admin, unchanged)
══════════════════════════════════════════════════════════════════════ */
const getAllScanLogs = async (req, res) => {
  try {
    const { search, docId } = req.query;
    let filter = {};
    if (docId)  filter.documentId = docId;
    if (search) {
      const re  = new RegExp(search, 'i');
      filter.$or = [
        { documentId: re }, { displayId: re }, { documentName: re },
        { handledBy: re }, { location: re },
      ];
    }
    const scanLogs = await ScanLog.find(filter).sort({ timestamp: -1 }).lean();
    res.json(scanLogs);
  } catch (err) {
    console.error('[getAllScanLogs]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/movement-logs  (Auth + Admin, unchanged)
══════════════════════════════════════════════════════════════════════ */
const getAllMovementLogs = async (req, res) => {
  try {
    const docs = await Document.find(
      { 'history.action': 'Movement' },
      { internalId: 1, displayId: 1, fullDisplayId: 1, name: 1, history: 1 },
    ).lean();

    const movementLogs = [];
    docs.forEach(doc => {
      (doc.history || []).forEach(h => {
        if (h.action === 'Movement') {
          movementLogs.push({
            documentId:   doc.internalId,
            displayId:    doc.fullDisplayId || doc.displayId,
            documentName: doc.name,
            handledBy:    h.by || h.handler || '-',
            location:     h.location || '-',
            action:       'Movement',
            note:         h.note    || '',
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
  createDocument,              // NEW
  getMyDocuments,              // NEW
  updateDocumentStatusByRole,  // NEW
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
  getDocumentForOwner,
};