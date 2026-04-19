/* ══════════════════════════════════════════════════════════════════════
   controllers/documentController.js  — APP_BASE_URL production fix
   CIT Document Tracker - Group 6

   CHANGE: APP_BASE_URL now checks RENDER_EXTERNAL_URL (auto-set by
   Render.com) before falling back to localhost, so QR codes always
   contain the correct production URL when deployed.

   All other logic is IDENTICAL to the original file.
   Only the APP_BASE_URL constant is changed (line below).
══════════════════════════════════════════════════════════════════════ */

const path           = require('path');
const QRCode         = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const Document       = require('../models/Document');
const ScanLog        = require('../models/ScanLog');
const Notification   = require('../models/Notification');
const User           = require('../models/User');

/* ── FIX: Use RENDER_EXTERNAL_URL when APP_BASE_URL is not explicitly set ── */
const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  'http://localhost:3000';

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
    const parts   = last.displayId.split('-');
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
══════════════════════════════════════════════════════════════════════ */
const WORKFLOW_TRANSITIONS = {

  staff: {
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
    forward: {
      from:         ['Under Initial Review', 'Revision Requested'],
      to:           'Under Evaluation',
      toRole:       'faculty',
      noteRequired: false,
      notifyRole:   'faculty',
      ownerMsg: (doc, caller) =>
        `Your document "<strong>${doc.name}</strong>" has been forwarded to faculty for evaluation by staff.`,
      roleMsg: (doc, caller, note) =>
        `A document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
        `has been forwarded to faculty for evaluation by staff <strong>${caller}</strong>.` +
        (note ? ` Note: ${note}` : ''),
    },
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
    return_to_requester: {
      from:         ['Under Initial Review'],
      to:           'Returned to Requester',
      toRole:       'completed',
      noteRequired: true,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>returned</strong> ` +
        `and the workflow has been closed. Reason: <em>${note}</em>`,
    },
  },

  faculty: {
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
    request_revision: {
      from:         ['Under Evaluation', 'Sent Back for Reevaluation'],
      to:           'Action Required: Resubmission',
      toRole:       'user',
      noteRequired: true,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `<strong>Action Required:</strong> Faculty <strong>${caller}</strong> has requested ` +
        `a revision on your document "<strong>${doc.name}</strong>". ` +
        `Faculty note: <em>${note}</em>`,
    },
  },

  admin: {
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

function getDocumentAllowedActions(doc, callerRole) {
  const roleTransitions = WORKFLOW_TRANSITIONS[callerRole];
  if (!roleTransitions) return [];

  const ACTION_LABELS = {
    start_review:         'Start Initial Review',
    forward:              'Forward to Faculty',
    request_resubmission: 'Request Resubmission',
    return_to_requester:  'Return to Requester',
    approve:              'Approve',
    reject:               'Reject',
    request_revision:     'Request Revision',
    release:              'Approve & Release',
    send_back:            'Send Back to Faculty',
  };

  const actions = Object.entries(roleTransitions)
    .filter(([, transition]) => transition.from.includes(doc.status))
    .map(([action, transition]) => ({
      action,
      to:           transition.to,
      toRole:       transition.toRole,
      noteRequired: transition.noteRequired || false,
      label:        ACTION_LABELS[action] || action,
    }));

  if (callerRole === 'admin' && doc.current_role === 'admin') {
    const hasSendBack = actions.some(a => a.action === 'send_back');
    if (!hasSendBack) {
      actions.push({
        action:       'send_back',
        to:           'Sent Back for Reevaluation',
        toRole:       'faculty',
        noteRequired: true,
        label:        ACTION_LABELS['send_back'],
      });
    }
  }

  return actions;
}

function toLegacyStage(role) {
  const map = { staff: 'staff', faculty: 'faculty', admin: 'admin', user: 'staff', completed: 'completed' };
  return map[role] || 'staff';
}

async function _notifyRole(roleName, msg, documentId) {
  try {
    const users = await User.find({ role: roleName }).select('userId _id').lean();
    if (!users.length) return;
    await Notification.insertMany(
      users.map(u => ({ userId: u.userId || String(u._id), msg, documentId, read: false }))
    );
  } catch (err) {
    console.warn(`[_notifyRole] Failed to notify ${roleName}:`, err.message);
  }
}

async function _notifyUser(userId, msg, documentId) {
  try {
    await Notification.create({ userId, msg, documentId, read: false });
  } catch (err) {
    console.warn('[_notifyUser] Failed:', err.message);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Shared document creation logic
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
        status:        'Submitted',
        current_role:  'staff',
        current_stage: 'staff',
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
        date:      nowManila,
        dateFiled: nowManila,
      });

      /* Notifications sent by caller (registerDocument) — see below. */
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
   POST /api/documents/register  (protected — legacy endpoint)
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

    /* ── Send notifications conditionally based on caller role ──
       Admin-created documents bypass the workflow, so staff should NOT
       get a "new document awaiting review" notification.             */
    const callerIsAdmin = req.user && req.user.role === 'admin';
    const ownerName = body.ownerName || body.by || '';
    const ownerId   = body.ownerId   || '';

    if (!callerIsAdmin) {
      /* Notify staff — document awaits initial review */
      const staffMsg =
        `New document "<strong>${doc.name}</strong>" submitted by ${ownerName || ownerId} ` +
        `(${doc.fullDisplayId}) — awaiting initial review.`;
      await _notifyRole('staff', staffMsg, doc.internalId);

      /* Notify admins — informational */
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
        console.warn('[registerDocument] Admin notification failed:', e.message);
      }
    }

    /* ADMIN BYPASS: admin documents skip staff/faculty review entirely */
    if (callerIsAdmin) {
      const nowManila = manilaTimestamp();
      await Document.findByIdAndUpdate(doc._id, {
        status:        'Approved and Released',
        current_role:  'completed',
        current_stage: 'completed',
        processedBy:   req.user.name || req.user.username || 'Admin',
        processedAt:   nowManila,
        $push: {
          history: {
            action:   'Status Update',
            status:   'Approved and Released',
            date:     nowManila,
            note:     'Document registered and approved directly by admin.',
            by:       req.user.name || req.user.username || 'Admin',
            location: '',
            handler:  req.user.name || req.user.username || 'Admin',
          },
        },
      });
      doc.status        = 'Approved and Released';
      doc.current_role  = 'completed';
      doc.current_stage = 'completed';
    }

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
      message:         req.user && req.user.role === 'admin'
        ? 'Document registered and approved directly by admin.'
        : 'Document submitted successfully.',
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
  /* Allow both regular users and admins to create documents.
     Admin-created documents are immediately approved via the bypass
     in registerDocument — they never enter the staff/faculty queue. */
  if (!req.user || !['user', 'admin'].includes(req.user.role)) {
    return res.status(403).json({
      message: 'Staff and faculty cannot create documents here. ' +
               'Use the workflow endpoints to manage existing documents.',
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
      requiresUserAction: d.current_role === 'user',
      allowedActions: d.current_role === 'user' && d.status === 'Action Required: Resubmission'
        ? [{ action: 'resubmit', to: 'Submitted', toRole: 'staff', noteRequired: false, label: 'Submit Correction' }]
        : [],
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getMyDocuments]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/resubmit  (user role only)
══════════════════════════════════════════════════════════════════════ */
const resubmitDocument = async (req, res) => {
  try {
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
    if (!documentId) return res.status(400).json({ message: 'documentId is required.' });
    if (!req.file) {
      return res.status(400).json({
        message: 'A corrected file upload is required for resubmission.',
      });
    }

    const doc = await Document.findOne({
      $or: [{ internalId: documentId }, { displayId: documentId }, { fullDisplayId: documentId }],
    });
    if (!doc) return res.status(404).json({ message: `Document "${documentId}" not found.` });

    const callerId = req.user.userId || String(req.user._id);
    if (doc.ownerId !== callerId && doc.ownerId !== String(req.user._id)) {
      return res.status(403).json({ message: 'You do not own this document.' });
    }
    if (doc.status !== 'Action Required: Resubmission' || doc.current_role !== 'user') {
      return res.status(400).json({
        message: `Cannot resubmit: document must be in "Action Required: Resubmission" status. Current: "${doc.status}".`,
      });
    }

    const nowManila   = manilaTimestamp();
    const callerName  = req.user.name || req.user.username || 'User';
    const newFileData = req.file.buffer.toString('utf8');
    const newFileExt  = body.fileExt || '';

    doc.originalFile    = newFileData;
    doc.originalFileExt = newFileExt;
    doc.filePath        = newFileData;
    doc.fileExt         = newFileExt;
    doc.hasOriginalFile = true;
    doc.resubmissionCount = (doc.resubmissionCount || 0) + 1;
    doc.lastResubmittedAt = nowManila;

    const previousStatus = doc.status;
    doc.status        = 'Submitted';
    doc.current_role  = 'staff';
    doc.current_stage = 'staff';

    doc.history.push({
      action:   'Resubmission',
      status:   'Submitted',
      date:     nowManila,
      note:     note
        ? `Document resubmitted by ${callerName} with correction: ${note}`
        : `Document resubmitted by ${callerName} (resubmission #${doc.resubmissionCount}).`,
      by:       callerName,
      location: '',
      handler:  callerName,
    });

    await doc.save();

    const staffMsg =
      `Document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
      `has been resubmitted by ${callerName} with corrections — awaiting initial review ` +
      `(resubmission #${doc.resubmissionCount}).` +
      (note ? ` User note: <em>${note}</em>` : '');
    await _notifyRole('staff', staffMsg, doc.internalId);

    return res.json({
      message:           'Document resubmitted successfully.',
      internalId:        doc.internalId,
      displayId:         doc.displayId,
      fullDisplayId:     doc.fullDisplayId,
      previousStatus,
      status:            doc.status,
      current_role:      doc.current_role,
      resubmissionCount: doc.resubmissionCount,
    });
  } catch (err) {
    console.error('[resubmitDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   POST /api/documents/update-status  (staff | faculty | admin)
══════════════════════════════════════════════════════════════════════ */
const updateDocumentStatusByRole = async (req, res) => {
  try {
    const { documentId, action, note, location } = req.body;
    if (!documentId || !action) {
      return res.status(400).json({ message: 'documentId and action are required.' });
    }

    const callerRole = req.user.role;
    const callerName = req.user.name || req.user.username || callerRole;

    const allowedRoles = ['staff', 'faculty', 'admin'];
    if (!allowedRoles.includes(callerRole)) {
      return res.status(403).json({ message: `Role "${callerRole}" cannot perform workflow actions.` });
    }

    const roleTransitions = WORKFLOW_TRANSITIONS[callerRole];
    if (!roleTransitions || !roleTransitions[action]) {
      const allowed = Object.keys(WORKFLOW_TRANSITIONS[callerRole] || {});
      return res.status(403).json({
        message: `Action "${action}" is not permitted for ${callerRole}. Allowed: ${allowed.join(', ')}.`,
      });
    }

    const transition = roleTransitions[action];

    const doc = await Document.findOne({
      $or: [{ internalId: documentId }, { displayId: documentId }, { fullDisplayId: documentId }],
    });
    if (!doc) return res.status(404).json({ message: `Document "${documentId}" not found.` });

    if (!transition.from.includes(doc.status)) {
      return res.status(400).json({
        message:
          `Cannot perform "${action}": document must be in ` +
          `[${transition.from.map(s => `"${s}"`).join(', ')}]. ` +
          `Current: "${doc.status}".`,
        currentStatus: doc.status,
        currentRole:   doc.current_role,
        allowedFrom:   transition.from,
      });
    }

    const trimmedNote = (note || '').trim();
    if (transition.noteRequired && !trimmedNote) {
      return res.status(400).json({ message: `A note is required for the "${action}" action.` });
    }

    const previousStatus = doc.status;
    const previousRole   = doc.current_role;
    const nowManila      = manilaTimestamp();

    doc.status        = transition.to;
    doc.current_role  = transition.toRole;
    doc.current_stage = toLegacyStage(transition.toRole);

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

    if (transition.ownerMsg) {
      await _notifyUser(doc.ownerId, transition.ownerMsg(doc, callerName, trimmedNote), doc.internalId);
    }
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
      allowedActions: getDocumentAllowedActions(doc, callerRole),
    });

  } catch (err) {
    console.error('[updateDocumentStatusByRole]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════════
   GET /api/documents  (Auth required — unchanged logic)
══════════════════════════════════════════════════════════════════════ */
const getAllDocuments = async (req, res) => {
  try {
    const callerRole = req.user.role;
    let filter = {};

    if (callerRole === 'admin') {
      /* WORKFLOW FIX: Admin sees ONLY documents that are in the admin stage
         or have been finalized (completed). Admin must NOT see documents still
         being processed by staff or faculty — this preserves workflow integrity.
         Admin-relevant statuses: 'Pending Final Approval' (current_role:'admin')
         and all terminal states (current_role:'completed'). */
      filter = { current_role: { $in: ['admin', 'completed'] } };
    } else if (callerRole === 'staff') {
      filter = { current_role: 'staff' };
    } else if (callerRole === 'faculty') {
      filter = { current_role: 'faculty' };
    } else {
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
      allowedActions:     getDocumentAllowedActions(d, callerRole),
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getAllDocuments]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ── Remaining handlers (trackDocument, downloadDocument, etc.) ──────
   All unchanged from the original — only APP_BASE_URL is different.
─────────────────────────────────────────────────────────────────── */

const trackDocument = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }, { fullDisplayId: query }],
    }).select('-filePath -originalFile -processedFile -fileData');
    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });
    res.json({
      internalId: doc.internalId, displayId: doc.displayId,
      verifyCode: doc.verifyCode, fullDisplayId: doc.fullDisplayId,
      enc: doc.enc, encPurpose: doc.encPurpose,
      type: doc.type, by: doc.by, status: doc.status,
      current_role: doc.current_role, current_stage: doc.current_stage,
      ownerId: doc.ownerId, ownerName: doc.ownerName, qrCode: doc.qrCode,
      hasOriginalFile: !!(doc.hasOriginalFile), hasProcessedFile: !!(doc.hasProcessedFile),
      fileExt: doc.fileExt, processedFileExt: doc.processedFileExt,
      processedBy: doc.processedBy, processedAt: doc.processedAt,
      resubmissionCount: doc.resubmissionCount || 0,
      history: doc.history, date: doc.date,
    });
  } catch (err) {
    console.error('[trackDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

const getDocumentForOwner = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({
      $or: [{ internalId: query }, { displayId: query }, { fullDisplayId: query }],
    }).select('-filePath -originalFile -processedFile -fileData');
    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    const requesterId = req.user.userId || String(req.user._id);
    const isAdmin     = req.user.role === 'admin';
    const isOwner     = isAdmin || doc.ownerId === requesterId || doc.ownerId === String(req.user._id);

    const publicFields = {
      internalId: doc.internalId, displayId: doc.displayId,
      verifyCode: doc.verifyCode, fullDisplayId: doc.fullDisplayId,
      enc: doc.enc, encPurpose: doc.encPurpose || '',
      type: doc.type, by: doc.by, status: doc.status,
      current_role: doc.current_role, current_stage: doc.current_stage,
      ownerId: doc.ownerId, ownerName: doc.ownerName, qrCode: doc.qrCode,
      hasOriginalFile: !!(doc.hasOriginalFile), hasProcessedFile: !!(doc.hasProcessedFile),
      fileExt: doc.fileExt, processedFileExt: doc.processedFileExt,
      processedBy: doc.processedBy, processedAt: doc.processedAt,
      resubmissionCount: doc.resubmissionCount || 0,
      requiresUserAction: doc.current_role === 'user',
      history: doc.history, date: doc.date,
    };

    if (isOwner) return res.json({ ...publicFields, name: doc.name, purpose: doc.purpose, isOwner: true });
    return res.json({ ...publicFields, name: null, purpose: null, isOwner: false });
  } catch (err) {
    console.error('[getDocumentForOwner]', err);
    res.status(500).json({ message: err.message });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({ $or: [{ internalId: query }, { displayId: query }] });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isReleasable = doc.status === 'Approved and Released' || doc.status === 'Released';
    if (!isReleasable) {
      return res.status(403).json({ message: `Download not allowed. Status: "${doc.status}".` });
    }

    const isProcessed = !!(doc.processedFile);
    const fileData    = isProcessed ? doc.processedFile : (doc.originalFile || doc.filePath);
    const fileExt     = isProcessed ? (doc.processedFileExt || null) : (doc.fileExt || null);
    if (!fileData) return res.status(404).json({ message: 'No file attached to this document.' });

    const baseName = isProcessed ? doc.name + '_processed' : doc.name;
    if (fileData.startsWith('data:') || fileData.startsWith('{'))
      return res.json({ fileData, fileExt, name: baseName });

    const absPath = path.join(__dirname, '..', fileData);
    res.download(absPath, baseName + (fileExt || ''));
  } catch (err) {
    console.error('[downloadDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

const updateDocumentStatus = async (req, res) => {
  try {
    const query = req.params.documentId;
    let body;
    if (req.file) {
      try { body = JSON.parse(req.body.data); }
      catch (e) { return res.status(400).json({ message: 'Invalid update data JSON in FormData.' }); }
    } else { body = req.body; }

    const { status, note, location, handler, by, processedFileExt } = body;
    const resolvedProcessedFile    = req.file ? req.file.buffer.toString('utf8') : (body.processedFile || null);
    const resolvedProcessedFileExt = req.file ? (processedFileExt || '') : (body.processedFileExt || null);

    const doc = await Document.findOne({ $or: [{ internalId: query }, { displayId: query }] });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isRelease = status === 'Approved and Released' || status === 'Released';
    if (isRelease && !resolvedProcessedFile && !doc.processedFile) {
      return res.status(400).json({ message: 'Cannot release without uploading a processed/final file.' });
    }

    const nowManila = manilaTimestamp();
    doc.status = status;

    const isAdminCaller = req.user && req.user.role === 'admin';
    if (!isAdminCaller) {
      const statusToRole = {
        'Submitted': { role: 'staff', stage: 'staff' },
        'Under Initial Review': { role: 'staff', stage: 'staff' },
        'Action Required: Resubmission': { role: 'user', stage: 'staff' },
        'Returned to Requester': { role: 'completed', stage: 'completed' },
        'Under Evaluation': { role: 'faculty', stage: 'faculty' },
        'Revision Requested': { role: 'staff', stage: 'staff' },
        'Pending Final Approval': { role: 'admin', stage: 'admin' },
        'Sent Back for Reevaluation': { role: 'faculty', stage: 'faculty' },
        'Approved and Released': { role: 'completed', stage: 'completed' },
        'Rejected': { role: 'completed', stage: 'completed' },
        'Released': { role: 'completed', stage: 'completed' },
        'Processing': { role: 'faculty', stage: 'faculty' },
        'On Hold': { role: 'staff', stage: 'staff' },
        'Received': { role: 'staff', stage: 'staff' },
      };
      const mapping = statusToRole[status];
      if (mapping) { doc.current_role = mapping.role; doc.current_stage = mapping.stage; }
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

    try {
      const adminName = req.user ? (req.user.name || req.user.username || 'Admin') : 'Admin';
      await _notifyUser(
        doc.ownerId,
        `Your document "<strong>${doc.name}</strong>" status changed to <strong>${status}</strong>` +
        (resolvedProcessedFile ? ' — Final file attached' : '') +
        (location ? ` at ${location}` : '') +
        (note ? ` — ${note}` : '') +
        ` (by ${adminName})`,
        doc.internalId
      );
    } catch (notifErr) {
      console.warn('[updateDocumentStatus] Notification failed:', notifErr.message);
    }

    res.json({
      message: `Status updated to "${status}"`,
      internalId: doc.internalId, displayId: doc.displayId,
      fullDisplayId: doc.fullDisplayId, status,
      current_role: doc.current_role, current_stage: doc.current_stage,
      hasProcessedFile: !!doc.processedFile,
    });
  } catch (err) {
    console.error('[updateDocumentStatus]', err);
    res.status(500).json({ message: err.message });
  }
};

const getOriginalFile = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({ $or: [{ internalId: query }, { displayId: query }] })
      .select('internalId ownerId name fileExt originalFileExt originalFile filePath current_role');
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isAdmin       = req.user && req.user.role === 'admin';
    const isOwner       = req.user && (String(req.user._id) === doc.ownerId || req.user.userId === doc.ownerId);
    const callerRole    = req.user && req.user.role;
    const isQueueHandler =
      (callerRole === 'staff'   && doc.current_role === 'staff') ||
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

const deleteDocument = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOneAndDelete({ $or: [{ internalId: query }, { displayId: query }] });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    await ScanLog.deleteMany({ documentId: doc.internalId });
    res.json({ message: `Document "${doc.name}" deleted.`, internalId: doc.internalId });
  } catch (err) {
    console.error('[deleteDocument]', err);
    res.status(500).json({ message: err.message });
  }
};

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
      documentId: doc.internalId, displayId: doc.fullDisplayId || doc.displayId,
      documentName: doc.name, handledBy, location, note,
      docStatus: doc.status, timestamp: nowISO, displayDate: nowManila,
    });

    res.json({ message: 'Scan logged.', internalId: doc.internalId, status: doc.status });
  } catch (err) {
    console.error('[logScan]', err);
    res.status(500).json({ message: err.message });
  }
};

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

const getAllScanLogs = async (req, res) => {
  try {
    const { search, docId } = req.query;
    let filter = {};
    if (docId)  filter.documentId = docId;
    if (search) {
      const re   = new RegExp(search, 'i');
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
            documentId: doc.internalId, displayId: doc.fullDisplayId || doc.displayId,
            documentName: doc.name, handledBy: h.by || h.handler || '-',
            location: h.location || '-', action: 'Movement',
            note: h.note || '', timestamp: h.date, displayDate: h.date,
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
  registerDocument, createDocument, getMyDocuments, resubmitDocument,
  updateDocumentStatusByRole, trackDocument, downloadDocument, getOriginalFile,
  updateDocumentStatus, getAllDocuments, deleteDocument, logScan,
  addMovementLog, getAllScanLogs, getAllMovementLogs, getDocumentForOwner,
};