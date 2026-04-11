/* ══════════════════════════════════════════════════════════════════════
   routes/documentRoutes.js
   CIT Document Tracker · Group 6

   CHANGES (v2):
     • Added POST /:documentId/movement (protect + adminOnly)
       → addMovementLog — admin manually logs a movement entry.
       → Separate from the public /scan-log endpoint so backend
         enforces role-based access for manual log creation.
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
} = require('../controllers/documentController');
const protect = require('../middleware/authMiddleware');

/* ── Admin-only guard — must come after protect() ── */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }
  next();
};

/* ── Multer: keep uploaded files in memory (no disk writes needed) ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }   // 20 MB max
});

/* ── Public routes (no login needed) ─────────────────────────────── */
router.get('/track/:documentId',     trackDocument);
router.get('/download/:documentId',  downloadDocument);

/* Auto QR scan log — PUBLIC (system-generated, no user input required).
   handledBy / location are optional; the controller sets safe defaults. */
router.post('/:documentId/scan-log', logScan);

/* ── Admin-only routes ───────────────────────────────────────────── */
router.get('/scan-logs',             protect, adminOnly, getAllScanLogs);

/* Manual movement log — ADMIN ONLY (backend-enforced).
   Called from within the app by admins (qr.js confirmScanLog).
   Requires JWT + admin role. Users cannot reach this endpoint. */
router.post('/:documentId/movement', protect, adminOnly, addMovementLog);

/* ── Protected routes (JWT required) ────────────────────────────── */
router.post('/register',             protect, upload.single('file'),                         registerDocument);
router.get('/',                      protect,                                                 getAllDocuments);
router.get('/:documentId/original-file', protect, getOriginalFile);
router.patch('/:documentId/status',  protect, adminOnly, upload.single('processedFile'),     updateDocumentStatus);
router.delete('/:documentId',        protect, adminOnly,                                     deleteDocument);

module.exports = router;