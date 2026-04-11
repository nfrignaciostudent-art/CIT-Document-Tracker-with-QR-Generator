/* ══════════════════════════════════════════════════════════════════════
   routes/documentRoutes.js
   CIT Document Tracker · Group 6
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
router.get('/track/:documentId',    trackDocument);
router.get('/download/:documentId', downloadDocument);
router.post('/:documentId/scan-log', logScan);        // QR scan log — public

/* ── Admin-only routes ───────────────────────────────────────────── */
router.get('/scan-logs',            protect, adminOnly, getAllScanLogs);  // all scan logs

/* ── Protected routes (JWT required) ────────────────────────────── */
router.post('/register',            protect, upload.single('file'),                          registerDocument);
router.get('/',                     protect,                                                  getAllDocuments);
router.get('/:documentId/original-file',  protect, getOriginalFile);
router.patch('/:documentId/status', protect, adminOnly, upload.single('processedFile'),      updateDocumentStatus);
router.delete('/:documentId',       protect, adminOnly,                                      deleteDocument);

module.exports = router;