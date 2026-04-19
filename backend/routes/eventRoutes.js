/* ══════════════════════════════════════════════════════════════════════
   routes/eventRoutes.js
   CIT Document Tracker - Group 6

   CHANGES:
     POST /api/events/create now accepts multipart/form-data so an
     optional event image can be uploaded alongside the event details.
     Multer uses memoryStorage (consistent with documentRoutes.js).

   ROUTE MAP:
     Public (no auth):
       GET  /api/events/public/:eventId     — student event view after QR scan
       POST /api/events/lookup-student      — student ID lookup (optional)
       POST /api/events/attend              — submit attendance response

     Admin only:
       POST   /api/events/create            — create new event + generate QR
       GET    /api/events                   — list all events with counts
       PATCH  /api/events/:eventId/toggle   — open/close attendance
       DELETE /api/events/:eventId          — delete event + all attendance
       GET    /api/events/:eventId/attendance — full attendance report
══════════════════════════════════════════════════════════════════════ */

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const protect = require('../middleware/authMiddleware');
const {
  createEvent,
  getAllEvents,
  getEventPublic,
  toggleEventStatus,
  deleteEvent,
  lookupStudent,
  submitAttendance,
  getEventAttendance,
} = require('../controllers/eventController');

/* ── Multer for event image uploads (memory storage, 5 MB max) ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
});

/* ── Role guard ─────────────────────────────────────────────────── */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required.' });
  next();
};

/* ══════════════════════════════════════════════════════════════════
   PUBLIC ROUTES (no auth) — must come BEFORE /:eventId routes
══════════════════════════════════════════════════════════════════ */
router.get ('/public/:eventId',  getEventPublic);
router.post('/lookup-student',   lookupStudent);
router.post('/attend',           submitAttendance);

/* ══════════════════════════════════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════════════════════════════════ */
/* createEvent accepts optional image via multipart/form-data.
   Non-image requests (JSON body) still work — multer is transparent
   when no file is included. */
router.post  ('/create',                  protect, adminOnly, upload.single('image'), createEvent);
router.get   ('/',                        protect, adminOnly, getAllEvents);
router.patch ('/:eventId/toggle',         protect, adminOnly, toggleEventStatus);
router.delete('/:eventId',                protect, adminOnly, deleteEvent);
router.get   ('/:eventId/attendance',     protect, adminOnly, getEventAttendance);

module.exports = router;