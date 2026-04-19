/* ══════════════════════════════════════════════════════════════════════
   routes/eventRoutes.js
   CIT Document Tracker - Group 6

   ROUTE MAP:
     Public (no auth):
       GET  /api/events/public/:eventId     — student event view after QR scan
       POST /api/events/lookup-student      — student ID lookup
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

/* ── Role guard ─────────────────────────────────────────────────── */
const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin')
    return res.status(403).json({ message: 'Admin access required.' });
  next();
};

/* ══════════════════════════════════════════════════════════════════
   PUBLIC ROUTES (no auth) — must come BEFORE /:eventId routes
══════════════════════════════════════════════════════════════════ */
router.get ('/public/:eventId',      getEventPublic);
router.post('/lookup-student',       lookupStudent);
router.post('/attend',               submitAttendance);

/* ══════════════════════════════════════════════════════════════════
   ADMIN ROUTES
══════════════════════════════════════════════════════════════════ */
router.post  ('/create',                       protect, adminOnly, createEvent);
router.get   ('/',                             protect, adminOnly, getAllEvents);
router.patch ('/:eventId/toggle',              protect, adminOnly, toggleEventStatus);
router.delete('/:eventId',                     protect, adminOnly, deleteEvent);
router.get   ('/:eventId/attendance',          protect, adminOnly, getEventAttendance);

module.exports = router;
