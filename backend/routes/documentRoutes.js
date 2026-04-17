/* ══════════════════════════════════════════════════════════════════════
   routes/documentRoutes.js
   CIT Document Tracker - Group 6

   STAFF / FACULTY ADDITIONS (new routes marked NEW):
     POST /create           (user only)         — submit a new document
     GET  /my               (user only)         — get own documents
     POST /update-status    (staff|faculty|admin)— role-based workflow action

   EXISTING ROUTES (unchanged):
     Public:
       GET  /track/:documentId
       GET  /download/:documentId
       POST /:documentId/scan-log

     Admin only:
       GET  /scan-logs
       GET  /movement-logs
       POST /:documentId/movement
       PATCH /:documentId/status          (full admin control + file upload)
       DELETE /:documentId

     Protected (JWT):
       POST /register                     (legacy — all authenticated users)
       GET  /                             (role-filtered per caller's role)
       GET  /:documentId/details
       GET  /:documentId/original-file

   ROUTE ORDER NOTE:
     Static segment routes (/create, /my, /update-status, /scan-logs,
     /movement-logs, /register) MUST appear before parameterised routes
     (/:documentId/…) to prevent Express from treating those path
     segments as the :documentId parameter.
══════════════════════════════════════════════════════════════════════ */

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const {
  registerDocument,
  createDocument,
  getMyDocuments,
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
} = require('../controllers/documentController');
const protect = require('../middleware/authMiddleware');

/* ── Role guards ────────────────────────────────────────────────── */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required.' });
  next();
};

const userOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'user')
    return res.status(403).json({ message: 'Only users can access this endpoint.' });
  next();
};

/**
 * staffFacultyAdmin — allows staff, faculty and admin.
 * Used for the /update-status workflow endpoint.
 * Regular users cannot change document status.
 */
const staffFacultyAdmin = (req, res, next) => {
  if (!req.user || !['staff', 'faculty', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: 'Staff, faculty or admin access required.' });
  next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
});

/* ══════════════════════════════════════════════════════════════════
   PUBLIC ROUTES (no auth)
══════════════════════════════════════════════════════════════════ */
router.get ('/track/:documentId',     trackDocument);
router.get ('/download/:documentId',  downloadDocument);
router.post('/:documentId/scan-log',  logScan);

/* ══════════════════════════════════════════════════════════════════
   ADMIN ONLY ROUTES
══════════════════════════════════════════════════════════════════ */
router.get ('/scan-logs',              protect, adminOnly, getAllScanLogs);
router.get ('/movement-logs',          protect, adminOnly, getAllMovementLogs);
router.post('/:documentId/movement',   protect, adminOnly, addMovementLog);

/* ══════════════════════════════════════════════════════════════════
   NEW WORKFLOW ROUTES
   Declared BEFORE /:documentId/… to avoid param matching conflicts.
══════════════════════════════════════════════════════════════════ */

/**
 * POST /api/documents/create  (user role only)
 * Enforces 'user' role at controller level.
 * Supports optional file upload via FormData (same as /register).
 */
router.post('/create',
  protect,
  userOnly,
  upload.single('file'),
  createDocument,
);

/**
 * GET /api/documents/my  (user role — own documents)
 */
router.get('/my',
  protect,
  userOnly,
  getMyDocuments,
);

/**
 * POST /api/documents/update-status  (staff | faculty | admin)
 * No file upload here — admin file uploads use PATCH /:id/status.
 * Body: { documentId, action, note?, location? }
 */
router.post('/update-status',
  protect,
  staffFacultyAdmin,
  updateDocumentStatusByRole,
);

/* ══════════════════════════════════════════════════════════════════
   PROTECTED ROUTES (JWT required)
══════════════════════════════════════════════════════════════════ */

/**
 * POST /api/documents/register  (legacy — preserved for backward compat)
 * Any authenticated user may register a document via this route.
 * New integrations should prefer POST /api/documents/create.
 */
router.post('/register',
  protect,
  upload.single('file'),
  registerDocument,
);

/**
 * GET /api/documents
 * Role-filtered:
 *   admin   → all documents
 *   staff   → current_stage = 'staff'
 *   faculty → current_stage = 'faculty'
 *   user    → own documents (filtered by ownerId query param or JWT identity)
 */
router.get('/',
  protect,
  getAllDocuments,
);

/*
 * GET /:documentId/details — ownership-aware track endpoint.
 * Must be declared BEFORE /:documentId/status to avoid Express
 * matching 'details' as the :documentId parameter value.
 */
router.get('/:documentId/details',
  protect,
  getDocumentForOwner,
);

router.get('/:documentId/original-file',
  protect,
  getOriginalFile,
);

/**
 * PATCH /:documentId/status  (admin only — full control + file upload)
 * Preserved unchanged for admin backward compatibility.
 * Also auto-advances current_stage when status changes.
 */
router.patch('/:documentId/status',
  protect,
  adminOnly,
  upload.single('processedFile'),
  updateDocumentStatus,
);

router.delete('/:documentId',
  protect,
  adminOnly,
  deleteDocument,
);

module.exports = router;