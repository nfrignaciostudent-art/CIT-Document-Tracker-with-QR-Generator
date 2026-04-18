/* ══════════════════════════════════════════════════════════════════════
   controllers/documentController.js
   CIT Document Tracker - Group 6

   WORKFLOW REFACTOR — Production-Level Deterministic State Machine

   NEW FUNCTIONS:
     resubmitDocument  — POST /api/documents/resubmit  (user role)
       User action when status = 'Action Required: Resubmission'.
       Requires a new file upload. Resets status to 'Submitted'.

   REWRITTEN:
     updateDocumentStatusByRole — Now a strict state-machine enforcer.
       All allowed transitions are declared in WORKFLOW_TRANSITIONS.
       Any undefined transition is rejected with HTTP 403.

   UPDATED:
     _createDocument   — New docs start with status 'Submitted',
                         current_role 'staff', current_stage 'staff'.
     getAllDocuments    — Filters by current_role for staff/faculty.
                         Users see own docs (includes user-action-required).

   TRANSITION TABLE:
   ┌──────────┬──────────────────────────────────┬────────────────────────────────────────────┐
   │ Role     │ From status                      │ Action → To status / current_role          │
   ├──────────┼──────────────────────────────────┼────────────────────────────────────────────┤
   │ staff    │ Submitted                        │ start_review      → Under Initial Review   │
   │          │ Under Initial Review             │ forward           → Under Evaluation        │
   │          │                                  │ request_resubmit  → Action Required: …     │
   │          │                                  │ return_to_user    → Returned to Requester  │
   │          │ Revision Requested               │ forward           → Under Evaluation        │
   ├──────────┼──────────────────────────────────┼────────────────────────────────────────────┤
   │ faculty  │ Under Evaluation                 │ approve           → Pending Final Approval  │
   │          │ Sent Back for Reevaluation        │ reject            → Rejected               │
   │          │                                  │ request_revision  → Action Required: Resubmission (user) │
   ├──────────┼──────────────────────────────────┼────────────────────────────────────────────┤
   │ admin    │ Pending Final Approval            │ release           → Approved and Released   │
   │          │                                  │ reject            → Rejected               │
   │          │                                  │ send_back         → Sent Back for …        │
   ├──────────┼──────────────────────────────────┼────────────────────────────────────────────┤
   │ user     │ Action Required: Resubmission     │ resubmit (file!)  → Submitted              │
   └──────────┴──────────────────────────────────┴────────────────────────────────────────────┘

   All other handlers (registerDocument, trackDocument, downloadDocument,
   getOriginalFile, deleteDocument, logScan, addMovementLog,
   getAllScanLogs, getAllMovementLogs, getDocumentForOwner,
   updateDocumentStatus [legacy admin PATCH]) are UNCHANGED.
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

/* ══════════════════════════════════════════════════════════════════════
   WORKFLOW STATE MACHINE
   ──────────────────────────────────────────────────────────────────────
   WORKFLOW_TRANSITIONS defines ALL valid state transitions.
   Any transition NOT listed here is REJECTED (403).

   Structure per action:
     from        : array of valid source statuses
     to          : resulting status
     toRole      : resulting current_role
     noteRequired: whether a note is REQUIRED (400 if missing)
     fileRequired: whether a new file upload is REQUIRED
     notifyRole  : which role(s) to send group notifications to
     ownerMsg    : function(doc, callerName, note) → owner notification string
     roleMsg     : function(doc, callerName, note) → role notification string
══════════════════════════════════════════════════════════════════════ */
const WORKFLOW_TRANSITIONS = {

  /* ── STAFF ACTIONS ────────────────────────────────────────────── */
  staff: {

    /**
     * start_review — Staff picks up a submitted document.
     * Submitted → Under Initial Review (still with staff)
     */
    start_review: {
      from:         ['Submitted'],
      to:           'Under Initial Review',
      toRole:       'staff',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller) =>
        `Your document "<strong>${doc.name}</strong>" is now <strong>Under Initial Review</strong> ` +
        `by our staff team.`,
    },

    /**
     * forward — Staff forwards document to faculty after completing initial review.
     * Under Initial Review | Revision Requested → Under Evaluation (faculty stage)
     */
    forward: {
      from:         ['Under Initial Review', 'Revision Requested'],
      to:           'Under Evaluation',
      toRole:       'faculty',
      noteRequired: false,
      notifyRole:   'faculty',
      ownerMsg: (doc, caller) =>
        `Your document "<strong>${doc.name}</strong>" has been forwarded to faculty ` +
        `for evaluation by staff.`,
      roleMsg: (doc, caller, note) =>
        `A document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
        `has been forwarded to faculty for evaluation by staff <strong>${caller}</strong>.` +
        (note ? ` Note: ${note}` : ''),
    },

    /**
     * request_resubmission — Staff requires user to correct and re-upload.
     * Under Initial Review → Action Required: Resubmission (user stage)
     * NOTE REQUIRED: must include reason for resubmission.
     */
    request_resubmission: {
      from:         ['Under Initial Review'],
      to:           'Action Required: Resubmission',
      toRole:       'user',
      noteRequired: true,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `<strong>Action Required:</strong> Your document "<strong>${doc.name}</strong>" ` +
        `requires correction and resubmission. ` +
        `Reason: <em>${note}</em> — Please upload a corrected copy to continue.`,
    },

    /**
     * return_to_requester — Staff terminates workflow and returns document.
     * Under Initial Review → Returned to Requester (completed)
     * NOTE REQUIRED: must include reason for return.
     */
    return_to_requester: {
      from:         ['Under Initial Review'],
      to:           'Returned to Requester',
      toRole:       'completed',
      noteRequired: true,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>returned</strong> ` +
        `and the workflow has been closed. Reason: <em>${note}</em> — ` +
        `Please contact staff if you need to submit a new request.`,
    },
  },

  /* ── FACULTY ACTIONS ──────────────────────────────────────────── */
  faculty: {

    /**
     * approve — Faculty approves and forwards to admin for final release.
     * Under Evaluation | Sent Back for Reevaluation → Pending Final Approval (admin stage)
     */
    approve: {
      from:         ['Under Evaluation', 'Sent Back for Reevaluation'],
      to:           'Pending Final Approval',
      toRole:       'admin',
      noteRequired: false,
      notifyRole:   'admin',
      ownerMsg: (doc, caller) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>approved by faculty</strong> ` +
        `and is now awaiting final admin approval.`,
      roleMsg: (doc, caller, note) =>
        `Document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
        `has been approved by faculty <strong>${caller}</strong> and requires your final decision.` +
        (note ? ` Note: ${note}` : ''),
    },

    /**
     * reject — Faculty rejects document. Terminal state.
     * Under Evaluation | Sent Back for Reevaluation → Rejected (completed)
     */
    reject: {
      from:         ['Under Evaluation', 'Sent Back for Reevaluation'],
      to:           'Rejected',
      toRole:       'completed',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>rejected</strong> ` +
        `by faculty.` + (note ? ` Reason: <em>${note}</em>` : ''),
    },

    /**
     * request_revision — Faculty returns document directly to the owner (user)
     * for correction and re-upload.
     * Under Evaluation | Sent Back for Reevaluation → Action Required: Resubmission (user stage)
     * NOTE REQUIRED: must describe what the user needs to correct.
     *
     * The user must then upload a corrected file via POST /api/documents/resubmit,
     * which resets the document to Submitted → current_role: staff, re-entering
     * the workflow from the beginning (staff initial review).
     * Staff are NOT notified here — they receive notification only after the
     * user resubmits via resubmitDocument().
     */
    request_revision: {
      from:         ['Under Evaluation', 'Sent Back for Reevaluation'],
      to:           'Action Required: Resubmission',
      toRole:       'user',
      noteRequired: true,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `<strong>Action Required:</strong> Faculty <strong>${caller}</strong> has requested ` +
        `a revision on your document "<strong>${doc.name}</strong>". ` +
        `Please correct and resubmit your file to continue. ` +
        `Faculty note: <em>${note}</em>`,
    },
  },

  /* ── ADMIN ACTIONS ────────────────────────────────────────────── */
  admin: {

    /**
     * release — Admin releases document. Terminal state.
     * Pending Final Approval → Approved and Released (completed)
     */
    release: {
      from:         ['Pending Final Approval'],
      to:           'Approved and Released',
      toRole:       'completed',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been ` +
        `<strong>Approved and Released</strong>! ` +
        (doc.hasProcessedFile ? 'The final file is now available for download.' : '') +
        (note ? ` Note: <em>${note}</em>` : ''),
    },

    /**
     * reject — Admin rejects document. Terminal state.
     * Pending Final Approval → Rejected (completed)
     */
    reject: {
      from:         ['Pending Final Approval'],
      to:           'Rejected',
      toRole:       'completed',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>rejected</strong> ` +
        `by admin.` + (note ? ` Reason: <em>${note}</em>` : ''),
    },

    /**
     * send_back — Admin sends document back to faculty for reevaluation.
     * Pending Final Approval → Sent Back for Reevaluation (faculty stage)
     * NOTE REQUIRED: must include reason for sending back.
     */
    send_back: {
      from:         ['Pending Final Approval'],
      to:           'Sent Back for Reevaluation',
      toRole:       'faculty',
      noteRequired: true,
      notifyRole:   'faculty',
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been sent back to faculty ` +
        `for reevaluation by admin.` + (note ? ` Reason: <em>${note}</em>` : ''),
      roleMsg: (doc, caller, note) =>
        `Admin <strong>${caller}</strong> has sent document ` +
        `"<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
        `back to faculty for reevaluation. Reason: <em>${note}</em>`,
    },
  },
};

/* ── Map current_role → legacy current_stage (for backward compat) ── */
function toLegacyStage(role) {
  const map = { staff: 'staff', faculty: 'faculty', admin: 'admin', user: 'staff', completed: 'completed' };
  return map[role] || 'staff';
}

/* ── Send grouped notifications ────────────────────────────────── */
async function _notifyRole(roleName, msg, documentId) {
  try {
    const users = await User.find({ role: roleName }).select('userId _id').lean();
    if (!users.length) return;
    await Notification.insertMany(
      users.map(u => ({
        userId:     u.userId || String(u._id),
        msg,
        documentId,
        read:       false,
      }))
    );
  } catch (err) {
    console.warn(`[_notifyRole] Failed to notify ${roleName}:`, err.message);
  }
}

/* ── Send notification to a single user ── */
async function _notifyUser(userId, msg, documentId) {
  try {
    await Notification.create({ userId, msg, documentId, read: false });
  } catch (err) {
    console.warn('[_notifyUser] Failed:', err.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Shared document creation logic (used by registerDocument + createDocument)
══════════════════════════════════════════════════════════════════════ */
async function _createDocument(body, fileBuffer, fileExt) {
  const {
    name, type, by, purpose,
    enc, encPurpose,
    ownerId, ownerName,
    history, fileData, hasOriginalFile,
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
        status:        'Submitted',      // ← new canonical initial status
        current_role:  'staff',          // ← new canonical role field
        current_stage: 'staff',          // ← kept in sync for legacy code
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
        resubmissionCount: 0,
        history: history || [
          {
            action: 'Status Update', status: 'Submitted', date: nowManila,
            note: 'Document submitted successfully',
            by: ownerName || ownerId, location: '', handler: '',
          },
        ],
        date: nowManila,
      });

      /* ── Notify all staff that a new document is waiting ── */
      const staffMsg =
        `New document "<strong>${doc.name}</strong>" submitted by ${ownerName || ownerId} ` +
        `(${doc.fullDisplayId}) — awaiting initial review.`;
      await _notifyRole('staff', staffMsg, doc.internalId);

      /* ── Also notify admins ── */
      try {
        const admins = await User.find({ role: 'admin' }).select('userId _id').lean();
        if (admins.length) {
          await Notification.insertMany(
            admins.map(a => ({
              userId:     a.userId || String(a._id),
              msg:        `New document registered: "<strong>${doc.name}</strong>" by ` +
                          `${ownerName || ownerId} — ${doc.fullDisplayId}`,
              documentId: doc.internalId,
              read:       false,
            }))
          );
        }
      } catch (e) {
        console.warn('[_createDocument] Admin notification failed:', e.message);
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
   POST /api/documents/register  (protected — legacy endpoint, unchanged)
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
      current_role:    doc.current_role,
      current_stage:   doc.current_stage,
      qrCode:          doc.qrCode,
      trackUrl:        url,
      hasOriginalFile: doc.hasOriginalFile,
      message:         'Document submitted successfully.',
    });
  } catch (err) {
    console.error('[registerDocument]', err);
    return res.status(err.status || 500).json({ message: err.message || 'Registration failed.' });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/create  (user role only — strict alias)
══════════════════════════════════════════════════════════════════════ */
const createDocument = async (req, res) => {
  if (!req.user || req.user.role !== 'user') {
    return res.status(403).json({
      message: 'Only users can submit documents. ' +
               'Staff, faculty and admins manage documents through workflow endpoints.',
    });
  }
  return registerDocument(req, res);
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/my  (user role — own documents only)
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
      /* Expose whether this doc needs user action */
      requiresUserAction: d.current_role === 'user',
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getMyDocuments]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/resubmit  (user role only)

   Called when status = 'Action Required: Resubmission'.
   User must upload a new corrected file.
   Resets status to 'Submitted' and current_role to 'staff'.
   Body (FormData): data=JSON, file=encrypted_file
   JSON: { documentId }
══════════════════════════════════════════════════════════════════════ */
const resubmitDocument = async (req, res) => {
  try {
    /* Role guard */
    if (!req.user || req.user.role !== 'user') {
      return res.status(403).json({ message: 'Only users can resubmit documents.' });
    }

    let body;
    if (req.file) {
      try { body = JSON.parse(req.body.data); }
      catch (e) { return res.status(400).json({ message: 'Invalid resubmission data JSON in FormData.' }); }
    } else {
      body = req.body;
    }

    const { documentId, note } = body;
    if (!documentId) {
      return res.status(400).json({ message: 'documentId is required.' });
    }

    /* File is required for resubmission */
    if (!req.file) {
      return res.status(400).json({
        message: 'A corrected file upload is required for resubmission. ' +
                 'Please attach the revised document.',
      });
    }

    const doc = await Document.findOne({
      $or: [
        { internalId:    documentId },
        { displayId:     documentId },
        { fullDisplayId: documentId },
      ],
    });

    if (!doc) {
      return res.status(404).json({ message: `Document "${documentId}" not found.` });
    }

    /* Verify caller owns this document */
    const callerId = req.user.userId || String(req.user._id);
    if (doc.ownerId !== callerId && doc.ownerId !== String(req.user._id)) {
      return res.status(403).json({ message: 'You do not own this document.' });
    }

    /* Verify document is in the correct state for resubmission */
    if (doc.status !== 'Action Required: Resubmission' || doc.current_role !== 'user') {
      return res.status(400).json({
        message: `Cannot resubmit: document must be in "Action Required: Resubmission" status. ` +
                 `Current status: "${doc.status}".`,
      });
    }

    const nowManila    = manilaTimestamp();
    const callerName   = req.user.name || req.user.username || 'User';
    const newFileData  = req.file.buffer.toString('utf8');
    const newFileExt   = body.fileExt || '';

    /* Replace the original file with the corrected submission */
    doc.originalFile    = newFileData;
    doc.originalFileExt = newFileExt;
    doc.filePath        = newFileData;
    doc.fileExt         = newFileExt;
    doc.hasOriginalFile = true;
    doc.resubmissionCount = (doc.resubmissionCount || 0) + 1;
    doc.lastResubmittedAt = nowManila;

    /* Transition: Action Required: Resubmission → Submitted */
    const previousStatus = doc.status;
    doc.status        = 'Submitted';
    doc.current_role  = 'staff';
    doc.current_stage = 'staff';   // keep in sync

    doc.history.push({
      action:   'Resubmission',
      status:   'Submitted',
      date:     nowManila,
      note:     note
        ? `Document resubmitted by ${callerName} with correction: ${note}`
        : `Document resubmitted by ${callerName} with corrected file (resubmission #${doc.resubmissionCount}).`,
      by:       callerName,
      location: '',
      handler:  callerName,
    });

    await doc.save();

    /* Notify all staff that the document has been resubmitted */
    const staffMsg =
      `Document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
      `has been resubmitted by ${callerName} with corrections — awaiting initial review ` +
      `(resubmission #${doc.resubmissionCount}).` +
      (note ? ` User note: <em>${note}</em>` : '');
    await _notifyRole('staff', staffMsg, doc.internalId);

    return res.json({
      message:          'Document resubmitted successfully. Staff will review your corrected submission.',
      internalId:       doc.internalId,
      displayId:        doc.displayId,
      fullDisplayId:    doc.fullDisplayId,
      previousStatus,
      status:           doc.status,
      current_role:     doc.current_role,
      resubmissionCount: doc.resubmissionCount,
    });
  } catch (err) {
    console.error('[resubmitDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/update-status  (staff | faculty | admin)

   Deterministic state machine enforcer.
   Looks up the action in WORKFLOW_TRANSITIONS[callerRole][action].
   Validates: allowed role, valid source status, note requirement.
   Applies transition, appends history, fires notifications.
══════════════════════════════════════════════════════════════════════ */
const updateDocumentStatusByRole = async (req, res) => {
  try {
    const { documentId, action, note, location } = req.body;

    if (!documentId || !action) {
      return res.status(400).json({ message: 'documentId and action are required.' });
    }

    const callerRole = req.user.role;
    const callerName = req.user.name || req.user.username || callerRole;

    /* ── Role gate ── */
    const allowedRoles = ['staff', 'faculty', 'admin'];
    if (!allowedRoles.includes(callerRole)) {
      return res.status(403).json({
        message: `Role "${callerRole}" cannot perform workflow actions via this endpoint. ` +
                 `Users must use POST /api/documents/resubmit for document resubmission.`,
      });
    }

    /* ── Load the transition definition ── */
    const roleTransitions = WORKFLOW_TRANSITIONS[callerRole];
    if (!roleTransitions || !roleTransitions[action]) {
      const allowed = Object.keys(WORKFLOW_TRANSITIONS[callerRole] || {});
      return res.status(403).json({
        message: `Action "${action}" is not permitted for ${callerRole}. ` +
                 `Allowed actions: ${allowed.join(', ')}.`,
      });
    }

    const transition = roleTransitions[action];

    /* ── Load document ── */
    const doc = await Document.findOne({
      $or: [
        { internalId:    documentId },
        { displayId:     documentId },
        { fullDisplayId: documentId },
      ],
    });

    if (!doc) {
      return res.status(404).json({ message: `Document "${documentId}" not found.` });
    }

    /* ── Validate source status ── */
    if (!transition.from.includes(doc.status)) {
      return res.status(400).json({
        message:
          `Cannot perform "${action}": document must be in one of ` +
          `[${transition.from.map(s => `"${s}"`).join(', ')}]. ` +
          `Current status: "${doc.status}" (stage: ${doc.current_role}).`,
        currentStatus: doc.status,
        currentRole:   doc.current_role,
        allowedFrom:   transition.from,
      });
    }

    /* ── Validate note requirement ── */
    const trimmedNote = (note || '').trim();
    if (transition.noteRequired && !trimmedNote) {
      return res.status(400).json({
        message: `A note is required for the "${action}" action. ` +
                 `Please provide a reason.`,
      });
    }

    /* ── Apply transition ── */
    const previousStatus = doc.status;
    const previousRole   = doc.current_role;
    const nowManila      = manilaTimestamp();

    doc.status        = transition.to;
    doc.current_role  = transition.toRole;
    doc.current_stage = toLegacyStage(transition.toRole);

    /* Build history note */
    const historyNote = trimmedNote
      ? `${action.replace(/_/g, ' ')} by ${callerRole} ${callerName}: ${trimmedNote}`
      : `${action.replace(/_/g, ' ')} by ${callerRole} ${callerName}.`;

    doc.history.push({
      action:   'Status Update',
      status:   transition.to,
      date:     nowManila,
      note:     historyNote,
      by:       callerName,
      location: location || '',
      handler:  callerName,
    });

    await doc.save();

    /* ── Notify document owner ── */
    if (transition.ownerMsg) {
      await _notifyUser(
        doc.ownerId,
        transition.ownerMsg(doc, callerName, trimmedNote),
        doc.internalId
      );
    }

    /* ── Notify next responsible role (for group transitions) ── */
    if (transition.notifyRole && transition.roleMsg) {
      await _notifyRole(
        transition.notifyRole,
        transition.roleMsg(doc, callerName, trimmedNote),
        doc.internalId
      );
    }

    return res.json({
      message:        `Action "${action}" completed successfully.`,
      internalId:     doc.internalId,
      displayId:      doc.displayId,
      fullDisplayId:  doc.fullDisplayId,
      previousStatus,
      previousRole,
      status:         doc.status,
      current_role:   doc.current_role,
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
   GET /api/documents  (Auth required)
   UPDATED: filters by current_role for staff/faculty.
   Admin sees all. Users see own docs (includes user-action-required).
══════════════════════════════════════════════════════════════════════ */
const getAllDocuments = async (req, res) => {
  try {
    const callerRole = req.user.role;
    let filter = {};

    if (callerRole === 'admin') {
      filter = {};
    } else if (callerRole === 'staff') {
      /* Staff sees documents in the staff role:
         Submitted, Under Initial Review, Revision Requested */
      filter = { current_role: 'staff' };
    } else if (callerRole === 'faculty') {
      /* Faculty sees documents in the faculty role:
         Under Evaluation, Sent Back for Reevaluation */
      filter = { current_role: 'faculty' };
    } else {
      /* Regular user — own documents only.
         Includes docs awaiting user action (current_role: 'user')
         as well as all their other docs. */
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
      internalId:         d.internalId || String(d._id),
      hasOriginalFile:    !!(d.hasOriginalFile),
      hasProcessedFile:   !!(d.hasProcessedFile),
      requiresUserAction: d.current_role === 'user',
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getAllDocuments]', err);
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
      status:   doc.status,
      current_role:  doc.current_role,
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
      resubmissionCount: doc.resubmissionCount || 0,
      history: doc.history,
      date:    doc.date,
    });
  } catch (err) {
    console.error('[trackDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/:id/details  (PROTECTED — JWT, ownership-aware)
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
      status:        doc.status,
      current_role:  doc.current_role,
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
      resubmissionCount: doc.resubmissionCount || 0,
      requiresUserAction: doc.current_role === 'user',
      history:          doc.history,
      date:             doc.date,
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
   GET /api/documents/download/:id  (PUBLIC — only if Approved and Released)
══════════════════════════════════════════════════════════════════════ */
const downloadDocument = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }],
    });

    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    /* Support both old 'Released' and new 'Approved and Released' */
    const isReleasable = doc.status === 'Approved and Released' || doc.status === 'Released';
    if (!isReleasable) {
      return res.status(403).json({
        message: `Download not allowed. Document status is "${doc.status}". ` +
                 `Must be "Approved and Released".`,
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
   PATCH /api/documents/:id/status  (Admin only — legacy full control)
   Preserved for backward compatibility with admin direct status edits.
   Also accepts new canonical status values.
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

    /* Require processed file when releasing */
    const isRelease = status === 'Approved and Released' || status === 'Released';
    if (isRelease && !resolvedProcessedFile && !doc.processedFile) {
      return res.status(400).json({
        message: 'Cannot release without uploading a processed/final file.',
      });
    }

    const nowManila = manilaTimestamp();
    doc.status = status;

    /* Sync current_role and current_stage based on new status */
    const statusToRole = {
      'Submitted':                       { role: 'staff',     stage: 'staff' },
      'Under Initial Review':            { role: 'staff',     stage: 'staff' },
      'Action Required: Resubmission':   { role: 'user',      stage: 'staff' },
      'Returned to Requester':           { role: 'completed', stage: 'completed' },
      'Under Evaluation':                { role: 'faculty',   stage: 'faculty' },
      'Revision Requested':              { role: 'staff',     stage: 'staff' },
      'Pending Final Approval':          { role: 'admin',     stage: 'admin' },
      'Sent Back for Reevaluation':      { role: 'faculty',   stage: 'faculty' },
      'Approved and Released':           { role: 'completed', stage: 'completed' },
      'Rejected':                        { role: 'completed', stage: 'completed' },
      /* Legacy mappings */
      'Released':                        { role: 'completed', stage: 'completed' },
      'Processing':                      { role: 'faculty',   stage: 'faculty' },
      'On Hold':                         { role: 'staff',     stage: 'staff' },
      'Received':                        { role: 'staff',     stage: 'staff' },
    };
    const mapping = statusToRole[status];
    if (mapping) {
      doc.current_role  = mapping.role;
      doc.current_stage = mapping.stage;
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

    await doc.save();

    /* Notify document owner */
    try {
      const adminName = req.user ? (req.user.name || req.user.username || 'Admin') : 'Admin';
      await _notifyUser(
        doc.ownerId,
        `Your document "<strong>${doc.name}</strong>" status changed to ` +
        `<strong>${status}</strong>` +
        (resolvedProcessedFile ? ' — Final file attached' : '') +
        (location ? ` at ${location}` : '') +
        (note     ? ` — ${note}`      : '') +
        ` (by ${adminName})`,
        doc.internalId
      );
    } catch (notifErr) {
      console.warn('[updateDocumentStatus] Notification failed:', notifErr.message);
    }

    res.json({
      message:          `Status updated to "${status}"`,
      internalId:       doc.internalId,
      displayId:        doc.displayId,
      fullDisplayId:    doc.fullDisplayId,
      status,
      current_role:     doc.current_role,
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
    }).select('internalId ownerId name fileExt originalFileExt originalFile filePath current_role');

    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isAdmin = req.user && req.user.role === 'admin';
    const isOwner = req.user && (
      String(req.user._id) === doc.ownerId || req.user.userId === doc.ownerId
    );
    /* Staff and faculty need to read the original file to review documents
       assigned to their role queue.  Allow access when the doc's current_role
       matches the caller's role (staff sees staff-queue docs, faculty sees
       faculty-queue docs).  Admin and owner always have access. */
    const callerRole = req.user && req.user.role;
    const isQueueHandler =
      (callerRole === 'staff'   && (doc.current_role === 'staff'))   ||
      (callerRole === 'faculty' && (doc.current_role === 'faculty' || doc.current_role === 'admin'));

    if (!isAdmin && !isOwner && !isQueueHandler)
      return res.status(403).json({ message: 'Access denied.' });

    const fileData = doc.originalFile || doc.filePath;
    if (!fileData) return res.status(404).json({ message: 'No original file attached.' });

    return res.json({ fileData, fileExt: doc.originalFileExt || doc.fileExt || null, name: doc.name });
  } catch (err) {
    console.error('[getOriginalFile]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   DELETE /api/documents/:id  (Admin only, unchanged)
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

    res.json({ message: 'Scan logged.', internalId: doc.internalId, status: doc.status });
  } catch (err) {
    console.error('[logScan]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/:id/movement  (Admin only, unchanged)
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

    res.json({ message: 'Movement log added.', internalId: doc.internalId, status: doc.status });
  } catch (err) {
    console.error('[addMovementLog]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents/scan-logs  (Admin only, unchanged)
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
   GET /api/documents/movement-logs  (Admin only, unchanged)
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
  createDocument,
  getMyDocuments,
  resubmitDocument,              // NEW
  updateDocumentStatusByRole,
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