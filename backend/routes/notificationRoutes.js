/* ══════════════════════════════════════════════════════════════════════
   routes/notificationRoutes.js
   CIT Document Tracker - Group 6

   ROUTE MAP (all protected by JWT):
     GET  /api/notifications            - get current user's notifications
     POST /api/notifications/mark-read  - mark all as read for current user
     DELETE /api/notifications/:id      - delete a single notification
══════════════════════════════════════════════════════════════════════ */

const express      = require('express');
const router       = express.Router();
const protect      = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');

/* ── GET /api/notifications ── */
router.get('/', protect, async (req, res) => {
  try {
    const userId = req.user.userId || String(req.user._id);
    const notifs = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    /* Reshape to match what the frontend expects */
    const payload = notifs.map(n => ({
      id:         String(n._id),
      msg:        n.msg,
      date:       new Date(n.createdAt).toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true
      }),
      read:       n.read,
      documentId: n.documentId || null,
    }));

    res.json(payload);
  } catch (err) {
    console.error('[GET /api/notifications]', err);
    res.status(500).json({ message: err.message });
  }
});

/* ── POST /api/notifications/mark-read ── */
router.post('/mark-read', protect, async (req, res) => {
  try {
    const userId = req.user.userId || String(req.user._id);
    await Notification.updateMany({ userId, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/notifications/mark-read]', err);
    res.status(500).json({ message: err.message });
  }
});

/* ── DELETE /api/notifications/:id ── */
router.delete('/:id', protect, async (req, res) => {
  try {
    const userId = req.user.userId || String(req.user._id);
    await Notification.deleteOne({ _id: req.params.id, userId });
    res.json({ ok: true });
  } catch (err) {
    console.error('[DELETE /api/notifications/:id]', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
