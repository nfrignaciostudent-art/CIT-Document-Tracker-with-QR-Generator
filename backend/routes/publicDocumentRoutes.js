const express = require('express');
const router = express.Router();
const multer = require('multer');
const protect = require('../middleware/authMiddleware');
const {
  createPublicDocument,
  getPublicDocuments,
  deletePublicDocument,
  getPublicDocumentAnalytics,
  viewPublicDocument
} = require('../controllers/publicDocumentController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

// Dean and Admin only check
const deanOrAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'dean'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Dean or Admin access required.' });
  }
  next();
};

/* ── PUBLIC ROUTES (no auth) ── */
router.get('/view/:id', viewPublicDocument);

/* ── PROTECTED ROUTES (Dean & Admin only) ── */
router.post('/', protect, deanOrAdmin, upload.single('file'), createPublicDocument);
router.get('/', protect, deanOrAdmin, getPublicDocuments);
router.delete('/:id', protect, deanOrAdmin, deletePublicDocument);
router.get('/:id/analytics', protect, deanOrAdmin, getPublicDocumentAnalytics);

module.exports = router;
