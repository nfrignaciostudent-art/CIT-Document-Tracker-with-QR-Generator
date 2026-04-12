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
} = require('../controllers/documentController');
const protect = require('../middleware/authMiddleware');

// Route map:
//   Public (no auth):
//     GET  /track/:documentId         — track document by any ID format
//     GET  /download/:documentId      — download released document
//     POST /:documentId/scan-log      — auto-log QR scan (scan_logs collection only)
//
//   Admin only:
//     GET  /scan-logs                 — all QR scan events from scan_logs collection
//     GET  /movement-logs             — all admin movement entries from doc.history
//     POST /:documentId/movement      — add movement log to doc.history
//
//   Protected (JWT):
//     POST /register
//     GET  /
//     GET  /:documentId/original-file
//     PATCH /:documentId/status       (admin)
//     DELETE /:documentId             (admin)

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

// Public routes
router.get('/track/:documentId',     trackDocument);
router.get('/download/:documentId',  downloadDocument);
router.post('/:documentId/scan-log', logScan);

// Admin-only routes
router.get('/scan-logs',             protect, adminOnly, getAllScanLogs);
router.get('/movement-logs',         protect, adminOnly, getAllMovementLogs);
router.post('/:documentId/movement', protect, adminOnly, addMovementLog);

// Protected routes (JWT required)
router.post('/register',             protect, upload.single('file'),                          registerDocument);
router.get('/',                      protect,                                                  getAllDocuments);
router.get('/:documentId/original-file', protect,                                             getOriginalFile);
router.patch('/:documentId/status',  protect, adminOnly, upload.single('processedFile'),      updateDocumentStatus);
router.delete('/:documentId',        protect, adminOnly,                                      deleteDocument);

module.exports = router;
