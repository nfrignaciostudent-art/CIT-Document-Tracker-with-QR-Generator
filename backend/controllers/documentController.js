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
const MovementLog    = require('../models/MovementLog');
const { decryptCBC, SHARED_KEY_STR, decryptSmart } = require('../config/crypto');

/* Helper to directly decrypt a field using raw IDEA-128-CBC */
function decryptFieldDirectly(val) {
  if (!val) return '';
  const trimmed = String(val).trim();
  if (trimmed.startsWith('{')) {
    const decrypted = decryptCBC(trimmed, SHARED_KEY_STR);
    if (decrypted !== null) return decrypted;
  }
  return trimmed;
}

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
    hour12: false,
  });
}

/* User-agent parser helper */
function parseUserAgent(ua) {
  if (!ua) return { browser: 'Unknown', device: 'Unknown', os: 'Unknown' };
  let browser = 'Other';
  let device = 'Desktop';
  let os = 'Other';

  if (/mobi|android|iphone|ipad|ipod/i.test(ua)) {
    device = 'Mobile';
  } else if (/tablet|ipad|playbook|silk/i.test(ua)) {
    device = 'Tablet';
  }

  if (/windows/i.test(ua)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';

  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/msie|trident/i.test(ua)) browser = 'IE';

  return { browser, device, os };
}

/* Helper to automatically save Movement Log entries */
const logMovementInternal = async (doc, req, actionTaken, prevStatus, prevRole, note) => {
  try {
    const actorName = req && req.user ? (req.user.name || req.user.username || 'System') : 'System';
    const actorRole = req && req.user ? req.user.role : 'visitor';
    const actorDepartment = req && req.user ? (req.user.department || '') : '';
    const nowISO = new Date().toISOString();
    const nowManila = manilaTimestamp();

    // Gather unique usernames/names of handlers from history + current actor
    const historyHandlers = (doc.history || []).map(h => h.by || h.handler).filter(Boolean);
    const uniqueHandlers = Array.from(new Set([...historyHandlers, actorName]));

    await MovementLog.create({
      documentId: doc.internalId,
      displayId: doc.fullDisplayId || doc.displayId,
      documentName: doc.name,
      actionTaken: actionTaken || 'Status Update',
      actorName,
      actorRole,
      actorDepartment,
      previousStatus: prevStatus || '',
      newStatus: doc.status,
      previousRole: prevRole || '',
      newRole: doc.current_role,
      timestamp: nowISO,
      displayDate: nowManila,
      note: note || '',
      ownerId: doc.ownerId,
      handledByNames: uniqueHandlers,
    });
  } catch (err) {
    console.error('[logMovementInternal] Failed to log movement:', err);
  }
};

/* Helper to automatically save Scan Log entries */
const logScanInternal = async (doc, req) => {
  try {
    const ua = req.headers['user-agent'];
    const { browser, device, os } = parseUserAgent(ua);
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'Unknown';
    
    let isAnonymous = true;
    let viewerName = 'Anonymous';
    let viewerRole = 'visitor';

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cit_group6_secret_key_2024');
        const user = await User.findById(decoded.id).select('name username role');
        if (user) {
          isAnonymous = false;
          viewerName = user.name || user.username;
          viewerRole = user.role;
        }
      } catch (err) {
        // Ignore JWT verify error, treat as anonymous
      }
    }

    const nowISO = new Date().toISOString();
    const nowManila = manilaTimestamp();

    await ScanLog.create({
      documentId: doc.internalId,
      displayId: doc.fullDisplayId || doc.displayId,
      documentName: doc.name,
      handledBy: isAnonymous ? 'QR Visitor' : viewerName,
      location: 'QR Scan',
      note: isAnonymous ? 'Anonymous scan via QR Code' : `Scanned by logged in user: ${viewerName} (${viewerRole})`,
      docStatus: doc.status,
      timestamp: nowISO,
      displayDate: nowManila,
      
      // New tracking fields
      browser,
      device,
      os,
      isAnonymous,
      viewerName,
      viewerRole,
      ipAddress,
    });
  } catch (err) {
    console.error('[logScanInternal] Failed to log scan:', err);
  }
};

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
    receive: {
      from:         ['Submitted'],
      to:           'Received',
      toRole:       'staff',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>Received</strong> ` +
        `by our staff team.`,
    },
    process: {
      from:         ['Received'],
      to:           'Processing',
      toRole:       'staff',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller) =>
        `Your document "<strong>${doc.name}</strong>" is now <strong>Processing</strong> ` +
        `by our staff team.`,
    },
    forward_to_faculty: {
      from:         ['Processing'],
      to:           'Under Evaluation',
      toRole:       'faculty',
      noteRequired: false,
      notifyRole:   'faculty',
      ownerMsg: (doc, caller) =>
        `Your document "<strong>${doc.name}</strong>" has been forwarded to faculty for evaluation.`,
      roleMsg: (doc, caller, note) =>
        `A document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
        `has been forwarded to faculty for evaluation by staff <strong>${caller}</strong>.` +
        (note ? ` Note: ${note}` : ''),
    },
    forward_to_dean: {
      from:         ['Processing'],
      to:           'Under Evaluation',
      toRole:       'dean',
      noteRequired: false,
      notifyRole:   'dean',
      ownerMsg: (doc, caller) =>
        `Your document "<strong>${doc.name}</strong>" has been forwarded to Dean for evaluation.`,
      roleMsg: (doc, caller, note) =>
        `A document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
        `has been forwarded to Dean for evaluation by staff <strong>${caller}</strong>.` +
        (note ? ` Note: ${note}` : ''),
    },
    request_resubmission: {
      from:         ['Received', 'Processing'],
      to:           'Action Required: Resubmission',
      toRole:       'user',
      noteRequired: true,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `<strong>Action Required:</strong> Your document "<strong>${doc.name}</strong>" ` +
        `requires correction and resubmission. ` +
        `Reason: <em>${note}</em> — Please upload a corrected copy to continue.`,
    },
    release: {
      from:         ['Approved'],
      to:           'Approved and Released',
      toRole:       'completed',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>Released</strong> ` +
        `by staff.` + (note ? ` Remarks: <em>${note}</em>` : ''),
    },
  },

  faculty: {
    approve: {
      from:         ['Under Evaluation'],
      to:           'Approved',
      toRole:       'staff',
      noteRequired: false,
      notifyRole:   'staff',
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>Approved</strong> by faculty.` +
        (note ? ` Remarks: <em>${note}</em>` : ''),
      roleMsg: (doc, caller, note) =>
        `Document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
        `has been approved by faculty <strong>${caller}</strong> and is ready to be released by staff.` +
        (note ? ` Note: ${note}` : ''),
    },
    reject: {
      from:         ['Under Evaluation'],
      to:           'Rejected',
      toRole:       'completed',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>rejected</strong> ` +
        `by faculty.` + (note ? ` Reason: <em>${note}</em>` : ''),
    },
    request_revision: {
      from:         ['Under Evaluation'],
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

  dean: {
    approve: {
      from:         ['Under Evaluation'],
      to:           'Approved',
      toRole:       'staff',
      noteRequired: false,
      notifyRole:   'staff',
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>Approved</strong> by Dean.` +
        (note ? ` Remarks: <em>${note}</em>` : ''),
      roleMsg: (doc, caller, note) =>
        `Document "<strong>${doc.name}</strong>" (${doc.fullDisplayId || doc.displayId}) ` +
        `has been approved by Dean <strong>${caller}</strong> and is ready to be released by staff.` +
        (note ? ` Note: ${note}` : ''),
    },
    reject: {
      from:         ['Under Evaluation'],
      to:           'Rejected',
      toRole:       'completed',
      noteRequired: false,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `Your document "<strong>${doc.name}</strong>" has been <strong>rejected</strong> ` +
        `by Dean.` + (note ? ` Reason: <em>${note}</em>` : ''),
    },
    request_revision: {
      from:         ['Under Evaluation'],
      to:           'Action Required: Resubmission',
      toRole:       'user',
      noteRequired: true,
      notifyRole:   null,
      ownerMsg: (doc, caller, note) =>
        `<strong>Action Required:</strong> Dean <strong>${caller}</strong> has requested ` +
        `a revision on your document "<strong>${doc.name}</strong>". ` +
        `Dean note: <em>${note}</em>`,
    },
  },

  admin: {},
};

function getDocumentAllowedActions(doc, callerRole) {
  if (callerRole === 'admin') return [];
  if (doc.current_role && doc.current_role !== callerRole) return [];

  const roleTransitions = WORKFLOW_TRANSITIONS[callerRole];
  if (!roleTransitions) return [];

  const ACTION_LABELS = {
    receive:              'Mark as Received',
    process:              'Mark as Processing',
    forward_to_faculty:   'Forward to Faculty',
    forward_to_dean:      'Forward to Dean',
    request_resubmission: 'Request Resubmission',
    approve:              'Approve Document',
    reject:               'Reject Document',
    request_revision:     'Request Revision',
    release:              'Approve & Release',
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

  return actions;
}

function toLegacyStage(role) {
  const map = { staff: 'staff', faculty: 'faculty', dean: 'dean', admin: 'admin', user: 'staff', completed: 'completed' };
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
async function _createDocument(req, body, fileBuffer, fileExt) {
  const {
    name, type, by, purpose,
    enc, encPurpose,
    ownerId, ownerName, department,
    history, fileData, hasOriginalFile,
  } = body;

  if (!name || !type || !by || !purpose || !enc || !ownerId)
    throw Object.assign(new Error('Missing required fields.'), { status: 400 });

  let resolvedFileData = fileData || null;
  if (fileBuffer) {
    const ext = (fileExt || '').toLowerCase();
    let mime = 'application/octet-stream';
    if (ext === '.pdf') mime = 'application/pdf';
    else if (ext === '.png') mime = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
    resolvedFileData = `data:${mime};base64,` + fileBuffer.toString('base64');
  }
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
        name, purpose, department: department || '',
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

      await logMovementInternal(doc, req, 'Submitted', '', '', 'Document submitted successfully.');

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

    const doc = await _createDocument(req, body, fileBuffer, fileExt);

    /* ── Send notifications conditionally based on caller role ──
       Admin-created documents bypass the workflow, so staff should NOT
       get a "new document awaiting review" notification.             */
    const callerIsAdminOrDean = req.user && (req.user.role === 'admin' || req.user.role === 'dean');
    const ownerName = body.ownerName || body.by || '';
    const ownerId   = body.ownerId   || '';

    if (!callerIsAdminOrDean) {
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

    /* ADMIN & DEAN BYPASS: admin/dean documents skip staff/faculty review entirely */
    if (callerIsAdminOrDean) {
      const nowManila = manilaTimestamp();
      const creatorTitle = req.user.role === 'dean' ? 'Dean' : 'Admin';
      const actorName = req.user.name || req.user.username || creatorTitle;

      await Document.findByIdAndUpdate(doc._id, {
        status:        'Approved and Released',
        current_role:  'completed',
        current_stage: 'completed',
        processedBy:   actorName,
        processedAt:   nowManila,
        $push: {
          history: {
            action:   'Status Update',
            status:   'Approved and Released',
            date:     nowManila,
            note:     `Document registered and approved directly by ${creatorTitle.toLowerCase()}.`,
            by:       actorName,
            location: '',
            handler:  actorName,
          },
        },
      });
      doc.status        = 'Approved and Released';
      doc.current_role  = 'completed';
      doc.current_stage = 'completed';
      
      await logMovementInternal(doc, req, 'Released', 'Submitted', 'staff', `Document registered and approved directly by ${creatorTitle.toLowerCase()}.`);
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
      message:         req.user && (req.user.role === 'admin' || req.user.role === 'dean')
        ? `Document registered and approved directly by ${req.user.role === 'dean' ? 'Dean' : 'admin'}.`
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
  if (!req.user || !['user', 'admin', 'dean'].includes(req.user.role)) {
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
      name:             decryptFieldDirectly(d.name) || d.name || '',
      purpose:          decryptFieldDirectly(d.purpose) || decryptFieldDirectly(d.encPurpose) || d.purpose || '',
      ownerName:        decryptFieldDirectly(d.ownerName) || d.ownerName || '',
      by:               decryptFieldDirectly(d.by) || d.by || '',
      department:       decryptFieldDirectly(d.department) || d.department || '',
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
    const newFileExt  = body.fileExt || '';
    const ext = newFileExt.toLowerCase();
    let mime = 'application/octet-stream';
    if (ext === '.pdf') mime = 'application/pdf';
    else if (ext === '.png') mime = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
    const newFileData = `data:${mime};base64,` + req.file.buffer.toString('base64');

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

    await logMovementInternal(
      doc,
      req,
      'Resubmission',
      previousStatus,
      'user',
      note ? `Resubmitted with correction: ${note}` : `Resubmitted (resubmission #${doc.resubmissionCount}).`
    );

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
    let body = req.body;
    const hasFiles = req.files && (req.files['processedFile'] || req.files['signedFile']);
    if (hasFiles) {
      try {
        body = JSON.parse(req.body.data);
      } catch (e) {
        return res.status(400).json({ message: 'Invalid update data JSON in FormData.' });
      }
    }

    const { documentId, action, note, location } = body;
    if (!documentId || !action) {
      return res.status(400).json({ message: 'documentId and action are required.' });
    }

    const callerRole = req.user.role;
    const callerName = req.user.name || req.user.username || callerRole;

    const allowedRoles = ['staff', 'faculty', 'dean', 'admin'];
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

    const mongoose = require('mongoose');
    const ownerUser = await User.findOne({ $or: [{ userId: doc.ownerId }, { _id: mongoose.Types.ObjectId.isValid(doc.ownerId) ? doc.ownerId : null }] }).select('role').lean();
    if (ownerUser && ownerUser.role === 'dean') {
      return res.status(403).json({ message: 'Cannot update the status of a Dean-submitted document.' });
    }

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

    if (action === 'approve' && (callerRole === 'faculty' || callerRole === 'dean')) {
      const fileObj = req.files && req.files['signedFile'] ? req.files['signedFile'][0] : null;
      if (!fileObj && !doc.signedFile) {
        return res.status(400).json({ message: 'Cannot approve without uploading a signed document.' });
      }
      if (fileObj) {
        const fileExt = body.signedFileExt || (fileObj.originalname ? fileObj.originalname.substring(fileObj.originalname.lastIndexOf('.')) : '.pdf');
        const ext = fileExt.toLowerCase();
        let mime = 'application/octet-stream';
        if (ext === '.pdf') mime = 'application/pdf';
        else if (ext === '.png') mime = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
        doc.signedFile = `data:${mime};base64,` + fileObj.buffer.toString('base64');
        doc.signedFileExt = fileExt;
        doc.signedBy = callerName;
        doc.signedAt = nowManila;
        doc.hasSignedFile = true;
      }
    }

    if (action === 'release') {
      const fileObj = req.files && req.files['processedFile'] ? req.files['processedFile'][0] : null;
      if (!fileObj && !doc.processedFile) {
        return res.status(400).json({ message: 'Cannot release without uploading a processed/final file.' });
      }
      if (fileObj) {
        const fileExt = body.processedFileExt || (fileObj.originalname ? fileObj.originalname.substring(fileObj.originalname.lastIndexOf('.')) : '.pdf');
        const ext = fileExt.toLowerCase();
        let mime = 'application/octet-stream';
        if (ext === '.pdf') mime = 'application/pdf';
        else if (ext === '.png') mime = 'image/png';
        else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
        doc.processedFile = `data:${mime};base64,` + fileObj.buffer.toString('base64');
        doc.processedFileExt = fileExt;
        doc.processedBy = callerName;
        doc.processedAt = nowManila;
        doc.hasProcessedFile = true;
      }
    }

    doc.status        = transition.to;
    doc.current_role  = transition.toRole;
    doc.current_stage = toLegacyStage(transition.toRole);

    const historyNote = trimmedNote
      ? `${action.replace(/_/g, ' ')} by ${callerName}: ${trimmedNote}`
      : `${action.replace(/_/g, ' ')} by ${callerName}.`;

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

    let actionTakenMap = 'Forwarded';
    const actLower = action.toLowerCase();
    if (actLower.includes('submit')) actionTakenMap = 'Submitted';
    else if (actLower.includes('receive') || actLower.includes('start')) actionTakenMap = 'Received';
    else if (actLower.includes('process')) actionTakenMap = 'Processing';
    else if (actLower.includes('approve')) actionTakenMap = 'Approved';
    else if (actLower.includes('reject')) actionTakenMap = 'Rejected';
    else if (actLower.includes('release')) actionTakenMap = 'Released';
    else if (actLower.includes('forward')) actionTakenMap = 'Forwarded';
    else if (actLower.includes('resubmit')) actionTakenMap = 'Resubmission';

    await logMovementInternal(
      doc,
      req,
      actionTakenMap,
      previousStatus,
      previousRole,
      trimmedNote || `Status changed via action "${action}".`
    );

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
      /* Admin can view all documents and full audit trails in the system */
      filter = {};
    } else if (callerRole === 'staff') {
      const names = [req.user.name, req.user.username].filter(Boolean);
      filter = {
        $or: [
          { current_role: 'staff' },
          { 'history.by': { $in: names } },
          { 'history.handler': { $in: names } }
        ]
      };
    } else if (callerRole === 'faculty' || callerRole === 'dean') {
      const names = [req.user.name, req.user.username].filter(Boolean);
      const effectiveOwnerId = req.user.userId || String(req.user._id);
      filter = {
        $or: [
          { current_role: callerRole },
          { ownerId: effectiveOwnerId },
          { 'history.by': { $in: names } },
          { 'history.handler': { $in: names } }
        ]
      };
    } else {
      const { ownerId } = req.query;
      const effectiveOwnerId = ownerId || req.user.userId || String(req.user._id);
      filter = { ownerId: effectiveOwnerId };
    }

    const docs = await Document.find(filter)
      .select('-filePath -fileData -originalFile -processedFile -signedFile')
      .sort({ createdAt: -1 })
      .lean();

    // Map owner roles to avoid N+1 query overhead
    const ownerIds = docs.map(d => d.ownerId).filter(Boolean);
    const uniqueOwnerIds = [...new Set(ownerIds)];
    const mongoose = require('mongoose');
    const ownerUsers = await User.find({
      $or: [
        { userId: { $in: uniqueOwnerIds } },
        { _id: { $in: uniqueOwnerIds.filter(id => mongoose.Types.ObjectId.isValid(id)) } }
      ]
    }).select('userId role department').lean();

    const ownerRoleMap = {};
    const ownerDeptMap = {};
    ownerUsers.forEach(u => {
      if (u.userId) {
        ownerRoleMap[u.userId] = u.role;
        ownerDeptMap[u.userId] = u.department || '';
      }
      ownerRoleMap[String(u._id)] = u.role;
      ownerDeptMap[String(u._id)] = u.department || '';
    });

    const payload = docs.map(d => {
      const ownerDept = ownerDeptMap[d.ownerId] || '';
      const resolvedDept = ownerDept || d.department || '';

      return {
        ...d,
        name:             decryptFieldDirectly(d.name) || d.name || '',
        purpose:          decryptFieldDirectly(d.purpose) || decryptFieldDirectly(d.encPurpose) || d.purpose || '',
        ownerName:        decryptFieldDirectly(d.ownerName) || d.ownerName || '',
        by:               decryptFieldDirectly(d.by) || d.by || '',
        department:       decryptFieldDirectly(resolvedDept) || resolvedDept || '',
        internalId:         d.internalId || String(d._id),
        hasOriginalFile:    !!(d.hasOriginalFile),
        hasProcessedFile:   !!(d.hasProcessedFile),
        hasSignedFile:      !!(d.hasSignedFile || d.signedFile),
        signedFileExt:      d.signedFileExt || null,
        signedBy:           d.signedBy || null,
        signedAt:           d.signedAt || null,
        requiresUserAction: d.current_role === 'user',
        allowedActions:     getDocumentAllowedActions(d, callerRole),
        ownerRole:          ownerRoleMap[d.ownerId] || '',
      };
    });

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
    }).select('-filePath -originalFile -processedFile -signedFile -fileData');
    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });
    
    // Automatically record scan log ONLY when source=qr is present in request query params
    if (req.query.source === 'qr') {
      await logScanInternal(doc, req);
    }

    const mongoose = require('mongoose');
    const ownerUser = await User.findOne({ $or: [{ userId: doc.ownerId }, { _id: mongoose.Types.ObjectId.isValid(doc.ownerId) ? doc.ownerId : null }] }).select('role department').lean();
    const ownerRole = ownerUser ? ownerUser.role : '';
    const ownerDept = ownerUser ? ownerUser.department : '';

    const resolvedDept = ownerDept || doc.department || '';

    // Decrypt fields server-side using the shared IDEA key
    const decryptedName = decryptFieldDirectly(doc.name) || doc.name || '';
    const decryptedPurpose = decryptFieldDirectly(doc.purpose) || decryptFieldDirectly(doc.encPurpose) || doc.purpose || '';
    const decryptedOwnerName = decryptFieldDirectly(doc.ownerName) || doc.ownerName || '';
    const decryptedBy = decryptFieldDirectly(doc.by) || doc.by || '';
    const decryptedDept = decryptFieldDirectly(resolvedDept) || resolvedDept || '';

    res.json({
      internalId: doc.internalId, displayId: doc.displayId,
      verifyCode: doc.verifyCode, fullDisplayId: doc.fullDisplayId,
      enc: doc.enc, encPurpose: doc.encPurpose,
      name: decryptedName,
      purpose: decryptedPurpose,
      type: doc.type,
      by: decryptedBy,
      status: doc.status,
      current_role: doc.current_role, current_stage: doc.current_stage,
      ownerId: doc.ownerId,
      ownerName: decryptedOwnerName,
      department: decryptedDept,
      qrCode: doc.qrCode,
      hasOriginalFile: !!(doc.hasOriginalFile), hasProcessedFile: !!(doc.hasProcessedFile),
      hasSignedFile:   !!(doc.hasSignedFile || doc.signedFile),
      fileExt: doc.fileExt, processedFileExt: doc.processedFileExt, signedFileExt: doc.signedFileExt,
      processedBy: doc.processedBy, processedAt: doc.processedAt,
      signedBy: doc.signedBy, signedAt: doc.signedAt,
      resubmissionCount: doc.resubmissionCount || 0,
      history: doc.history, date: doc.date,
      ownerRole,
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
    }).select('-filePath -originalFile -processedFile -signedFile -fileData');
    if (!doc) return res.status(404).json({ message: `Document ${query} not found.` });

    const requesterId = req.user.userId || String(req.user._id);
    const isAdmin     = req.user.role === 'admin';
    const isOwner     = isAdmin || doc.ownerId === requesterId || doc.ownerId === String(req.user._id);

    const mongoose = require('mongoose');
    const ownerUser = await User.findOne({ $or: [{ userId: doc.ownerId }, { _id: mongoose.Types.ObjectId.isValid(doc.ownerId) ? doc.ownerId : null }] }).select('role department').lean();
    const ownerRole = ownerUser ? ownerUser.role : '';
    const ownerDept = ownerUser ? ownerUser.department : '';

    const resolvedDept = ownerDept || doc.department || '';

    // Decrypt fields server-side using the shared IDEA key
    const decryptedName = decryptFieldDirectly(doc.name) || doc.name || '';
    const decryptedPurpose = decryptFieldDirectly(doc.purpose) || decryptFieldDirectly(doc.encPurpose) || doc.purpose || '';
    const decryptedOwnerName = decryptFieldDirectly(doc.ownerName) || doc.ownerName || '';
    const decryptedBy = decryptFieldDirectly(doc.by) || doc.by || '';
    const decryptedDept = decryptFieldDirectly(resolvedDept) || resolvedDept || '';

    const publicFields = {
      internalId: doc.internalId, displayId: doc.displayId,
      verifyCode: doc.verifyCode, fullDisplayId: doc.fullDisplayId,
      enc: doc.enc, encPurpose: doc.encPurpose || '',
      type: doc.type,
      by: decryptedBy,
      status: doc.status,
      current_role: doc.current_role, current_stage: doc.current_stage,
      ownerId: doc.ownerId,
      ownerName: decryptedOwnerName,
      department: decryptedDept,
      qrCode: doc.qrCode,
      hasOriginalFile: !!(doc.hasOriginalFile), hasProcessedFile: !!(doc.hasProcessedFile),
      hasSignedFile:   !!(doc.hasSignedFile || doc.signedFile),
      fileExt: doc.fileExt, processedFileExt: doc.processedFileExt, signedFileExt: doc.signedFileExt,
      processedBy: doc.processedBy, processedAt: doc.processedAt,
      signedBy: doc.signedBy, signedAt: doc.signedAt,
      resubmissionCount: doc.resubmissionCount || 0,
      requiresUserAction: doc.current_role === 'user',
      allowedActions: getDocumentAllowedActions(doc, req.user.role),
      history: doc.history, date: doc.date,
      ownerRole,
    };

    const callerRole    = req.user.role;
    const isQueueHandler =
      (callerRole === 'staff'   && doc.current_role === 'staff') ||
      ((callerRole === 'faculty' || callerRole === 'dean') && (doc.current_role === 'faculty' || doc.current_role === 'admin'));

    if (isOwner || isQueueHandler) {
      return res.json({ ...publicFields, name: decryptedName, purpose: decryptedPurpose, isOwner });
    }
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

    // Optional verification to allow Admin, Staff, Faculty, or Owner to download regardless of status
    let reqUser = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cit_group6_secret_key_2024');
        reqUser = await User.findById(decoded.id).select('-password');
      } catch (err) {
        // Fall back to unauthenticated public status check on verification error
      }
    }

    const isReleasable = doc.status === 'Approved and Released' || doc.status === 'Released';
    const isOwner = reqUser && (String(reqUser._id) === doc.ownerId || reqUser.userId === doc.ownerId);
    const isStaffOrFacultyOrAdmin = reqUser && ['staff', 'faculty', 'admin', 'dean'].includes(reqUser.role);
    const isStudent = reqUser && reqUser.role === 'user';
    const downloadAllowed = isReleasable || isOwner || isStaffOrFacultyOrAdmin || isStudent;

    if (!downloadAllowed) {
      return res.status(403).json({ message: `Download not allowed. Status: "${doc.status}".` });
    }

    let fileData, fileExt;
    if (doc.processedFile) {
      fileData = doc.processedFile;
      fileExt = doc.processedFileExt || null;
    } else if (doc.signedFile) {
      fileData = doc.signedFile;
      fileExt = doc.signedFileExt || null;
    } else {
      fileData = doc.originalFile || doc.filePath;
      fileExt = doc.fileExt || null;
    }
    if (!fileData) return res.status(404).json({ message: 'No file attached to this document.' });

    const decryptedName = decryptSmart(doc.enc) || doc.name || 'document';
    const baseName = doc.processedFile ? decryptedName + '_processed' : (doc.signedFile ? decryptedName + '_signed' : decryptedName);
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
    const resolvedProcessedFileExt = req.file ? (processedFileExt || '') : (body.processedFileExt || null);
    
    let resolvedProcessedFile = body.processedFile || null;
    if (req.file) {
      const ext = resolvedProcessedFileExt.toLowerCase();
      let mime = 'application/octet-stream';
      if (ext === '.pdf') mime = 'application/pdf';
      else if (ext === '.png') mime = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
      resolvedProcessedFile = `data:${mime};base64,` + req.file.buffer.toString('base64');
    }

    const doc = await Document.findOne({ $or: [{ internalId: query }, { displayId: query }] });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const mongoose = require('mongoose');
    const ownerUser = await User.findOne({ $or: [{ userId: doc.ownerId }, { _id: mongoose.Types.ObjectId.isValid(doc.ownerId) ? doc.ownerId : null }] }).select('role').lean();
    if (ownerUser && ownerUser.role === 'dean') {
      return res.status(403).json({ message: 'Cannot override the status of a Dean-submitted document.' });
    }

    const isRelease = status === 'Approved and Released' || status === 'Released';
    if (isRelease && !resolvedProcessedFile && !doc.processedFile) {
      return res.status(400).json({ message: 'Cannot release without uploading a processed/final file.' });
    }

    const previousStatus = doc.status;
    const previousRole   = doc.current_role;

    const nowManila = manilaTimestamp();
    doc.status = status;

    const statusToRole = {
      'Submitted': { role: 'staff', stage: 'staff' },
      'Received': { role: 'staff', stage: 'staff' },
      'Processing': { role: 'staff', stage: 'staff' },
      'Under Evaluation': { role: 'faculty', stage: 'faculty' },
      'Approved': { role: 'staff', stage: 'staff' },
      'Approved and Released': { role: 'completed', stage: 'completed' },
      'Rejected': { role: 'completed', stage: 'completed' },
      'Action Required: Resubmission': { role: 'user', stage: 'staff' },
      // Keep legacy for safety
      'Under Initial Review': { role: 'staff', stage: 'staff' },
      'Returned to Requester': { role: 'completed', stage: 'completed' },
      'Revision Requested': { role: 'staff', stage: 'staff' },
      'Pending Final Approval': { role: 'admin', stage: 'admin' },
      'Sent Back for Reevaluation': { role: 'faculty', stage: 'faculty' },
      'Released': { role: 'completed', stage: 'completed' },
      'On Hold': { role: 'staff', stage: 'staff' },
    };
    const mapping = statusToRole[status];
    if (mapping) {
      doc.current_role = mapping.role;
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

    let actionTakenMap = 'Forwarded';
    const statusLower = status.toLowerCase();
    if (statusLower.includes('submit')) actionTakenMap = 'Submitted';
    else if (statusLower.includes('receive') || statusLower.includes('start')) actionTakenMap = 'Received';
    else if (statusLower.includes('process')) actionTakenMap = 'Processing';
    else if (statusLower.includes('approve')) actionTakenMap = 'Approved';
    else if (statusLower.includes('reject')) actionTakenMap = 'Rejected';
    else if (statusLower.includes('release')) actionTakenMap = 'Released';
    else if (statusLower.includes('forward')) actionTakenMap = 'Forwarded';
    else if (statusLower.includes('resubmit')) actionTakenMap = 'Resubmission';

    await logMovementInternal(
      doc,
      req,
      actionTakenMap,
      previousStatus,
      previousRole,
      note || `Status overridden by admin to "${status}".`
    );

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
    const isQueueHandler = ['staff', 'faculty', 'dean'].includes(callerRole);

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

const getSignedFile = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({ $or: [{ internalId: query }, { displayId: query }] })
      .select('internalId ownerId name signedFileExt signedFile current_role');
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isAdmin       = req.user && req.user.role === 'admin';
    const isOwner       = req.user && (String(req.user._id) === doc.ownerId || req.user.userId === doc.ownerId);
    const callerRole    = req.user && req.user.role;
    const isQueueHandler = ['staff', 'faculty', 'dean'].includes(callerRole);

    if (!isAdmin && !isOwner && !isQueueHandler)
      return res.status(403).json({ message: 'Access denied.' });

    const fileData = doc.signedFile;
    if (!fileData) return res.status(404).json({ message: 'No signed file attached.' });

    return res.json({ fileData, fileExt: doc.signedFileExt || null, name: doc.name + '_signed' });
  } catch (err) {
    console.error('[getSignedFile]', err);
    res.status(500).json({ message: err.message });
  }
};

const editDocumentMetadata = async (req, res) => {
  try {
    const query = req.params.documentId;
    
    let meta = {};
    if (req.body.data) {
      try { meta = JSON.parse(req.body.data); } catch(e) {}
    } else {
      meta = req.body;
    }

    const { name, department, note } = meta;

    const doc = await Document.findOne({ $or: [{ internalId: query }, { displayId: query }] });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isOwner = req.user && (String(req.user._id) === doc.ownerId || req.user.userId === doc.ownerId);
    const isAdmin = req.user && req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'Access denied. You do not own this document.' });
    }

    if (!isAdmin && doc.status !== 'Submitted') {
      return res.status(400).json({ message: 'Cannot edit document details once processing has started.' });
    }

    if (name) doc.name = name;
    if (department) doc.department = department;
    if (note !== undefined) doc.note = note;

    if (req.file) {
      const fileExt = req.file.originalname.substring(req.file.originalname.lastIndexOf('.')).toLowerCase();
      let mime = 'application/octet-stream';
      if (fileExt === '.pdf') mime = 'application/pdf';
      else if (fileExt === '.png') mime = 'image/png';
      else if (fileExt === '.jpg' || fileExt === '.jpeg') mime = 'image/jpeg';
      
      const fileBase64 = req.file.buffer.toString('base64');
      const dataUri = `data:${mime};base64,` + fileBase64;

      doc.originalFile = dataUri;
      doc.originalFileExt = fileExt;
      doc.filePath = dataUri;
      doc.fileExt = fileExt;
      doc.hasOriginalFile = true;
      doc.fileURL = trackUrl(doc.internalId) + '&download=1';
    }

    await doc.save();

    const decryptedDoc = {
      ...doc.toObject(),
      name:             decryptFieldDirectly(doc.name) || doc.name || '',
      purpose:          decryptFieldDirectly(doc.purpose) || decryptFieldDirectly(doc.encPurpose) || doc.purpose || '',
      ownerName:        decryptFieldDirectly(doc.ownerName) || doc.ownerName || '',
      by:               decryptFieldDirectly(doc.by) || doc.by || '',
      department:       decryptFieldDirectly(doc.department) || doc.department || '',
    };

    res.json({ message: 'Document updated successfully.', doc: decryptedDoc });
  } catch (err) {
    console.error('[editDocumentMetadata]', err);
    res.status(500).json({ message: err.message });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const query = req.params.documentId;
    const doc   = await Document.findOne({ $or: [{ internalId: query }, { displayId: query }] });
    if (!doc) return res.status(404).json({ message: 'Document not found.' });

    const isAdmin = req.user && req.user.role === 'admin';
    const isOwner = req.user && (String(req.user._id) === doc.ownerId || req.user.userId === doc.ownerId);

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Access denied. You do not own this document.' });
    }

    if (!isAdmin && doc.status !== 'Submitted') {
      return res.status(400).json({ message: 'Cannot delete document once it has entered processing.' });
    }

    await Document.deleteOne({ _id: doc._id });
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
    const { documentId, docId, search } = req.query;
    const targetDocId = documentId || docId;

    let filter = {};
    if (targetDocId) {
      filter.documentId = targetDocId;
    }

    const role = req.user ? req.user.role : 'visitor';
    const userId = req.user ? (req.user.userId || String(req.user._id)) : '';
    const userName = req.user ? (req.user.name || req.user.username) : '';

    if (role === 'admin' || role === 'dean') {
      // Admin and Dean see all scan logs
    } else if (role === 'staff' || role === 'faculty') {
      // Staff and Faculty see scan logs of documents they handled
      const handledDocs = await Document.find({
        $or: [
          { ownerId: userId },
          { 'history.by': userName },
          { 'history.by': req.user ? req.user.username : '' },
          { 'history.handler': userName },
          { 'history.handler': req.user ? req.user.username : '' }
        ]
      }).select('internalId').lean();
      
      const handledIds = handledDocs.map(d => d.internalId);
      if (targetDocId) {
        if (!handledIds.includes(targetDocId)) {
          return res.status(403).json({ message: 'Access denied. You did not handle this document.' });
        }
      } else {
        filter.documentId = { $in: handledIds };
      }
    } else {
      // Students and visitors are not allowed to see scan logs
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (search) {
      const re = new RegExp(search, 'i');
      const searchFilter = {
        $or: [
          { documentId: re }, { displayId: re }, { documentName: re },
          { handledBy: re }, { location: re }, { browser: re }, { os: re }
        ]
      };
      if (Object.keys(filter).length > 0) {
        filter = { $and: [filter, searchFilter] };
      } else {
        filter = searchFilter;
      }
    }

    // Exclude ipAddress to protect user privacy (RA 10173 / teacher review compliance)
    const scanLogs = await ScanLog.find(filter).select('-ipAddress').sort({ timestamp: -1 }).lean();
    res.json(scanLogs);
  } catch (err) {
    console.error('[getAllScanLogs]', err);
    res.status(500).json({ message: err.message });
  }
};

const getAllMovementLogs = async (req, res) => {
  try {
    const { documentId, docId, search } = req.query;
    const targetDocId = documentId || docId;

    const role = req.user ? req.user.role : 'visitor';
    const userId = req.user ? (req.user.userId || String(req.user._id)) : '';
    const userName = req.user ? (req.user.name || req.user.username || '') : '';

    let filter = {};

    if (role === 'admin') {
      // Admin sees all movement logs — filter only by documentId if provided
      if (targetDocId) filter.documentId = targetDocId;
    } else if (role === 'staff' || role === 'faculty' || role === 'dean') {
      // Sees logs of documents they handled or own
      const roleFilter = {
        $or: [
          { handledByNames: userName },
          { handledByNames: req.user ? req.user.username : '' },
          { ownerId: userId },
        ],
      };
      filter = targetDocId
        ? { $and: [{ documentId: targetDocId }, roleFilter] }
        : roleFilter;
    } else if (role === 'user') {
      // Student sees only their own documents
      filter = targetDocId
        ? { $and: [{ documentId: targetDocId }, { ownerId: userId }] }
        : { ownerId: userId };
    } else {
      return res.status(403).json({ message: 'Access denied.' });
    }

    if (search) {
      const re = new RegExp(search, 'i');
      const searchFilter = {
        $or: [
          { documentId: re }, { displayId: re }, { documentName: re },
          { actorName: re }, { actionTaken: re }, { note: re },
        ],
      };
      filter = Object.keys(filter).length > 0
        ? { $and: [filter, searchFilter] }
        : searchFilter;
    }

    const logs = await MovementLog.find(filter).sort({ timestamp: -1 }).lean();
    res.json(logs);
  } catch (err) {
    console.error('[getAllMovementLogs]', err);
    res.status(500).json({ message: err.message });
  }
};


const getDocumentsByUserForAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const mongoose = require('mongoose');
    
    const targetUser = await User.findOne({ $or: [{ userId }, { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null }] });
    if (!targetUser) return res.status(404).json({ message: 'User not found.' });

    let docs = [];
    if (targetUser.role === 'user') {
      docs = await Document.find({ ownerId: { $in: [targetUser.userId, String(targetUser._id)] } })
        .select('-filePath -fileData -originalFile -processedFile -signedFile')
        .sort({ createdAt: -1 })
        .lean();
    } else if (['staff', 'faculty'].includes(targetUser.role)) {
      const nameKey = targetUser.name;
      const usernameKey = targetUser.username;
      const idKey = targetUser.userId;
      
      docs = await Document.find({
        $or: [
          { 'history.by': { $in: [nameKey, usernameKey, idKey] } },
          { 'history.handler': { $in: [nameKey, usernameKey, idKey] } },
          { 'processedBy': { $in: [nameKey, usernameKey, idKey] } }
        ]
      })
      .select('-filePath -fileData -originalFile -processedFile -signedFile')
      .sort({ createdAt: -1 })
      .lean();
    } else {
      docs = await Document.find({
        $or: [
          { 'history.by': { $in: [targetUser.name, targetUser.username, targetUser.userId] } },
          { 'processedBy': { $in: [targetUser.name, targetUser.username, targetUser.userId] } }
        ]
      })
      .select('-filePath -fileData -originalFile -processedFile -signedFile')
      .sort({ createdAt: -1 })
      .lean();
    }

    const payload = docs.map(d => ({
      internalId:         d.internalId || String(d._id),
      displayId:          d.fullDisplayId || d.displayId,
      name:               decryptFieldDirectly(d.name) || d.name || '',
      type:               d.type,
      status:             d.status,
      date:               d.createdAt || d.date || d.updatedAt,
      ownerName:          decryptFieldDirectly(d.ownerName) || d.ownerName || '',
      history:            d.history
    }));

    res.json(payload);
  } catch (err) {
    console.error('[getDocumentsByUserForAdmin]', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  registerDocument, createDocument, getMyDocuments, resubmitDocument,
  updateDocumentStatusByRole, trackDocument, downloadDocument, getOriginalFile, getSignedFile,
  updateDocumentStatus, getAllDocuments, deleteDocument, editDocumentMetadata, logScan,
  addMovementLog, getAllScanLogs, getAllMovementLogs, getDocumentForOwner,
  getDocumentsByUserForAdmin,
};