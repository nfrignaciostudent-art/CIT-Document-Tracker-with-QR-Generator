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
  deleteDocument
} = require('../controllers/documentController');
const protect = require('../middleware/authMiddleware');

/* ── Multer: keep uploaded files in memory (no disk writes needed) ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 }   // 20 MB max
});

/* Public routes (no login needed) */
router.get('/track/:documentId',    trackDocument);      // GET /api/documents/track/:id
router.get('/download/:documentId', downloadDocument);   // GET /api/documents/download/:id

/* Protected routes (JWT required) */
router.post('/register',            protect, upload.single('file'),          registerDocument);   // POST /api/documents/register
router.get('/',                     protect,                                  getAllDocuments);    // GET  /api/documents
router.get('/:documentId/original-file',  protect, getOriginalFile);       // GET /api/documents/:id/original-file
router.patch('/:documentId/status', protect, upload.single('processedFile'), updateDocumentStatus); // PATCH /api/documents/:id/status
router.delete('/:documentId',       protect,                                  deleteDocument);    // DELETE /api/documents/:id

module.exports = router;