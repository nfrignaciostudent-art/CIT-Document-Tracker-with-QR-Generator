/* ══════════════════════════════════════════════════════════════════════
   routes/documentRoutes.js
   CIT Document Tracker - Group 6

   WORKFLOW REFACTOR ADDITIONS:
     POST /resubmit  (user only, file upload required)
       Called when document status = "Action Required: Resubmission".
       User uploads a corrected file; status resets to "Submitted".
       MUST be declared before /:documentId/… param routes.

   ROUTE MAP:
     Public (no auth):
       GET  /track/:documentId
       GET  /download/:documentId
       POST /:documentId/scan-log

     Admin only:
       GET  /scan-logs
       GET  /movement-logs
       POST /:documentId/movement
       PATCH /:documentId/status    (legacy full admin control + file upload)
       DELETE /:documentId

     User only:
       POST /create                 (submit new document)
       GET  /my                     (own documents)
       POST /resubmit               (re-upload after Action Required: Resubmission)

     Staff | Faculty | Admin:
       POST /update-status          (workflow state machine transitions)

     Protected (JWT, any role):
       POST /register               (legacy)
       GET  /                       (role-filtered)
       GET  /:documentId/details
       GET  /:documentId/original-file

   ROUTE ORDER NOTE:
     All static-segment routes MUST appear before /:documentId/… routes
     to prevent Express from interpreting path segments as :documentId.
══════════════════════════════════════════════════════════════════════ */

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const {
  registerDocument,
  createDocument,
  getMyDocuments,
  resubmitDocument,
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

/* ── Role guards ─────────────────────────────────────────────────── */
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
 * staffFacultyAdmin — staff, faculty and admin.
 * Regular users CANNOT change document status.
 * Users who need to resubmit must use POST /resubmit instead.
 */
const staffFacultyAdmin = (req, res, next) => {
  if (!req.user || !['staff', 'faculty', 'admin'].includes(req.user.role))
    return res.status(403).json({ message: 'Staff, faculty, or admin access required.' });
  next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },   // 20 MB
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
   USER ONLY ROUTES
   All declared BEFORE /:documentId/… to avoid param matching.
══════════════════════════════════════════════════════════════════ */

/**
 * POST /api/documents/create  (user role only)
 * Submit a new document. Sets status = 'Submitted', current_role = 'staff'.
 */
/* Allow both users AND admins to create/register documents.
   Admin-created docs bypass the workflow and go straight to
   "Approved and Released" via the admin bypass in registerDocument. */
router.post('/create',
  protect,
  upload.single('file'),
  createDocument,
);

/**
 * GET /api/documents/my  (user role — own documents only)
 * Returns all docs owned by the authenticated user,
 * including those with current_role = 'user' that require action.
 */
router.get('/my',
  protect,
  userOnly,
  getMyDocuments,
);

/**
 * POST /api/documents/resubmit  (user role only)
 * Called when doc.status === 'Action Required: Resubmission'.
 * User must attach a corrected file via FormData.
 * Body: { data: JSON.stringify({ documentId, note? }), file: <blob> }
 * Resets status → 'Submitted', current_role → 'staff'.
 * Increments resubmissionCount on the document.
 */
router.post('/resubmit',
  protect,
  userOnly,
  upload.single('file'),
  resubmitDocument,
);

/* ══════════════════════════════════════════════════════════════════
   WORKFLOW ROUTES  (staff | faculty | admin)
   Declared BEFORE /:documentId/… to avoid param matching.
══════════════════════════════════════════════════════════════════ */

/**
 * POST /api/documents/update-status  (staff | faculty | admin)
 * Deterministic state-machine endpoint.
 * Body: { documentId, action, note?, location? }
 *
 * Staff actions:
 *   start_review         — Submitted → Under Initial Review
 *   forward              — Under Initial Review | Revision Requested → Under Evaluation
 *   request_resubmission — Under Initial Review → Action Required: Resubmission (note req.)
 *   return_to_requester  — Under Initial Review → Returned to Requester (note req.)
 *
 * Faculty actions:
 *   approve              — Under Evaluation | Sent Back → Pending Final Approval
 *   reject               — Under Evaluation | Sent Back → Rejected
 *   request_revision     — Under Evaluation | Sent Back → Revision Requested (note req.)
 *
 * Admin actions:
 *   release              — Pending Final Approval → Approved and Released
 *   reject               — Pending Final Approval → Rejected
 *   send_back            — Pending Final Approval → Sent Back for Reevaluation (note req.)
 */
router.post('/update-status',
  protect,
  staffFacultyAdmin,
  updateDocumentStatusByRole,
);

/* ══════════════════════════════════════════════════════════════════
   PROTECTED ROUTES (JWT required, any role)
══════════════════════════════════════════════════════════════════ */

/**
 * POST /api/documents/register  (legacy — any authenticated user)
 * New integrations should prefer POST /create or POST /resubmit.
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
 *   staff   → current_role = 'staff' (Submitted, Under Initial Review, Revision Requested)
 *   faculty → current_role = 'faculty' (Under Evaluation, Sent Back for Reevaluation)
 *   user    → own documents only (includes Action Required: Resubmission)
 */
router.get('/',
  protect,
  getAllDocuments,
);

/**
 * GET /:documentId/details — ownership-aware track endpoint.
 * Declared BEFORE /:documentId/status to avoid conflict.
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
 * PATCH /:documentId/status  (admin only — legacy full control + file upload)
 * Also syncs current_role and current_stage based on the new status.
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