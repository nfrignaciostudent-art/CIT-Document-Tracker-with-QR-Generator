/* ══════════════════════════════════════════════════════════════════════
   routes/documentRoutes.js
   CIT Document Tracker - Group 6

   ROUTE MAP:
     Public (no auth):
       GET  /track/:documentId       - track document (encrypted blobs only)
       GET  /download/:documentId    - download released document
       POST /:documentId/scan-log   - auto-log QR scan (scan_logs collection only)

     Admin only:
       GET  /scan-logs               - all QR scan events (scan_logs collection)
       GET  /movement-logs           - all admin movement entries (doc.history)
       POST /:documentId/movement   - add movement log to doc.history (admin only)

     Protected (JWT) — NEW:
       GET  /:documentId/details     - ownership-aware track endpoint:
                                       owner/admin → plaintext name + purpose
                                       non-owner  → encrypted blobs only (isOwner: false)
                                       Called by the track page when user is logged in.

     Protected (JWT):
       POST /register
       GET  /
       GET  /:documentId/original-file
       PATCH /:documentId/status    (admin)
       DELETE /:documentId          (admin)
══════════════════════════════════════════════════════════════════════ */

const express    = require('express');
const router     = express.Router();
const multer     = require('multer');
const {
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
  getDocumentForOwner,   // NEW
} = require('../controllers/documentController');
const protect = require('../middleware/authMiddleware');

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }
});

/* ── Public ─────────────────────────────────────────────────────── */
router.get('/track/:documentId',     trackDocument);
router.get('/download/:documentId',  downloadDocument);
router.post('/:documentId/scan-log', logScan);

/* ── Admin only ─────────────────────────────────────────────────── */
router.get('/scan-logs',             protect, adminOnly, getAllScanLogs);
router.get('/movement-logs',         protect, adminOnly, getAllMovementLogs);
router.post('/:documentId/movement', protect, adminOnly, addMovementLog);

/* ── Protected (JWT) ────────────────────────────────────────────── */
router.post('/register',             protect, upload.single('file'),             registerDocument);
router.get('/',                      protect,                                     getAllDocuments);

/*
 * GET /:documentId/details — NEW ownership-aware endpoint
 * Must be declared BEFORE /:documentId/status and /:documentId below
 * to avoid Express matching 'details' as the :documentId parameter.
 */
router.get('/:documentId/details',       protect, getDocumentForOwner);
router.get('/:documentId/original-file', protect, getOriginalFile);
router.patch('/:documentId/status',  protect, adminOnly, upload.single('processedFile'), updateDocumentStatus);
router.delete('/:documentId',        protect, adminOnly,                         deleteDocument);

module.exports = router;