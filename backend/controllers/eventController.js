/* ══════════════════════════════════════════════════════════════════════
   controllers/eventController.js
   CIT Document Tracker - Group 6

   ROUTE HANDLERS:
     createEvent        POST /api/events/create          (admin only)
     getAllEvents        GET  /api/events                 (admin only)
     getEventPublic      GET  /api/events/public/:eventId (no auth — student view)
     toggleEventStatus   PATCH /api/events/:eventId/toggle (admin only)
     deleteEvent         DELETE /api/events/:eventId      (admin only)

     lookupStudent       POST /api/events/lookup-student  (no auth)
     submitAttendance    POST /api/events/attend           (no auth)
     getEventAttendance  GET  /api/events/:eventId/attendance (admin only)
══════════════════════════════════════════════════════════════════════ */

const QRCode    = require('qrcode');
const Event     = require('../models/Event');
const Attendance = require('../models/Attendance');
const User      = require('../models/User');

/* ── Helper: format date for PH timezone ─────────────────────────── */
function phDate() {
  return new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  });
}

/* ══════════════════════════════════════════════════════════════════
   POST /api/events/create  (admin only)
   Body: { title, description, date, time, location, organizer }
══════════════════════════════════════════════════════════════════ */
const createEvent = async (req, res) => {
  try {
    const { title, description, date, time, location, organizer } = req.body;

    if (!title || !date)
      return res.status(400).json({ message: 'Title and date are required.' });

    /* Create event first to get the eventId */
    const event = new Event({
      title,
      description: description || '',
      date,
      time:        time || '',
      location:    location || '',
      organizer:   organizer || '',
      createdBy:   req.user.userId || String(req.user._id),
      createdByName: req.user.name || req.user.username,
    });

    await event.save();

    /* Generate QR pointing to the public event page */
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const eventUrl = `${baseUrl}?event=${event.eventId}`;

    const qrBase64 = await QRCode.toDataURL(eventUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });

    event.qrCode = qrBase64;
    await event.save();

    res.status(201).json({
      message: 'Event created successfully.',
      event: {
        eventId:      event.eventId,
        title:        event.title,
        description:  event.description,
        date:         event.date,
        time:         event.time,
        location:     event.location,
        organizer:    event.organizer,
        isActive:     event.isActive,
        qrCode:       event.qrCode,
        createdAt:    event.createdAt,
        eventUrl,
      },
    });
  } catch (err) {
    console.error('[createEvent]', err);
    res.status(500).json({ message: err.message || 'Failed to create event.' });
  }
};

/* ══════════════════════════════════════════════════════════════════
   GET /api/events  (admin only)
   Returns all events with attendance counts.
══════════════════════════════════════════════════════════════════ */
const getAllEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ createdAt: -1 }).lean();

    /* Attach attendance counts */
    const result = await Promise.all(events.map(async (evt) => {
      const attendCount     = await Attendance.countDocuments({ eventId: evt.eventId, response: 'attend' });
      const cantAttendCount = await Attendance.countDocuments({ eventId: evt.eventId, response: 'cant_attend' });
      return { ...evt, attendCount, cantAttendCount, totalResponses: attendCount + cantAttendCount };
    }));

    res.json(result);
  } catch (err) {
    console.error('[getAllEvents]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════
   GET /api/events/public/:eventId  (NO AUTH — student view)
   Returns event info without sensitive admin data.
   Used when student scans the QR code.
══════════════════════════════════════════════════════════════════ */
const getEventPublic = async (req, res) => {
  try {
    const event = await Event.findOne({ eventId: req.params.eventId }).lean();
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    const attendCount     = await Attendance.countDocuments({ eventId: event.eventId, response: 'attend' });
    const cantAttendCount = await Attendance.countDocuments({ eventId: event.eventId, response: 'cant_attend' });

    res.json({
      eventId:       event.eventId,
      title:         event.title,
      description:   event.description,
      date:          event.date,
      time:          event.time,
      location:      event.location,
      organizer:     event.organizer,
      isActive:      event.isActive,
      attendCount,
      cantAttendCount,
      totalResponses: attendCount + cantAttendCount,
    });
  } catch (err) {
    console.error('[getEventPublic]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════
   PATCH /api/events/:eventId/toggle  (admin only)
   Toggles isActive on/off to open or close attendance.
══════════════════════════════════════════════════════════════════ */
const toggleEventStatus = async (req, res) => {
  try {
    const event = await Event.findOne({ eventId: req.params.eventId });
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    event.isActive = !event.isActive;
    await event.save();

    res.json({ message: `Event is now ${event.isActive ? 'active' : 'closed'}.`, isActive: event.isActive });
  } catch (err) {
    console.error('[toggleEventStatus]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════
   DELETE /api/events/:eventId  (admin only)
══════════════════════════════════════════════════════════════════ */
const deleteEvent = async (req, res) => {
  try {
    const event = await Event.findOneAndDelete({ eventId: req.params.eventId });
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    /* Also remove all attendance records for this event */
    await Attendance.deleteMany({ eventId: req.params.eventId });

    res.json({ message: 'Event and all attendance records deleted.' });
  } catch (err) {
    console.error('[deleteEvent]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════
   POST /api/events/lookup-student  (NO AUTH)
   Body: { studentId }
   Looks up student by studentId field in User collection.
   Returns: { found, studentName, section, userId }
══════════════════════════════════════════════════════════════════ */
const lookupStudent = async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId || !studentId.trim())
      return res.status(400).json({ message: 'Student ID is required.' });

    const user = await User.findOne({
      studentId: studentId.trim(),
      role: 'user',
    }).select('name section studentId userId').lean();

    if (!user) {
      return res.status(404).json({ found: false, message: 'Student ID not found. Please check and try again.' });
    }

    res.json({
      found:       true,
      studentName: user.name,
      section:     user.section || 'N/A',
      studentId:   user.studentId,
      userId:      user.userId || String(user._id),
    });
  } catch (err) {
    console.error('[lookupStudent]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════
   POST /api/events/attend  (NO AUTH — student submits)
   Body: { eventId, studentId, response: 'attend' | 'cant_attend' }
   Prevents duplicate submissions per student per event.
══════════════════════════════════════════════════════════════════ */
const submitAttendance = async (req, res) => {
  try {
    const { eventId, studentId, response } = req.body;

    if (!eventId || !studentId || !response)
      return res.status(400).json({ message: 'eventId, studentId, and response are required.' });

    if (!['attend', 'cant_attend'].includes(response))
      return res.status(400).json({ message: 'Response must be "attend" or "cant_attend".' });

    /* Check event exists and is active */
    const event = await Event.findOne({ eventId }).lean();
    if (!event)      return res.status(404).json({ message: 'Event not found.' });
    if (!event.isActive) return res.status(403).json({ message: 'This event is no longer accepting responses.' });

    /* Lookup student */
    const user = await User.findOne({ studentId: studentId.trim(), role: 'user' })
      .select('name section studentId userId').lean();

    if (!user)
      return res.status(404).json({ message: 'Student ID not found. Please check and try again.' });

    /* Check for duplicate */
    const existing = await Attendance.findOne({ eventId, studentId: studentId.trim() });
    if (existing) {
      return res.status(409).json({
        message: 'You have already submitted your response for this event.',
        alreadySubmitted: true,
        existingResponse: existing.response,
      });
    }

    /* Save attendance */
    const attendance = new Attendance({
      eventId,
      studentId:   user.studentId,
      studentName: user.name,
      section:     user.section || '',
      userId:      user.userId || String(user._id),
      response,
      scannedAt:   new Date().toISOString(),
      displayDate: phDate(),
    });

    await attendance.save();

    res.status(201).json({
      message: response === 'attend'
        ? 'Thank you! You are marked as attending.'
        : 'Response recorded. Thank you for letting us know!',
      studentName: user.name,
      section:     user.section || 'N/A',
      response,
      eventTitle:  event.title,
    });
  } catch (err) {
    console.error('[submitAttendance]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════
   GET /api/events/:eventId/attendance  (admin only)
   Returns full attendance list for an event.
══════════════════════════════════════════════════════════════════ */
const getEventAttendance = async (req, res) => {
  try {
    const event = await Event.findOne({ eventId: req.params.eventId }).lean();
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    const records = await Attendance.find({ eventId: req.params.eventId })
      .sort({ createdAt: 1 })
      .lean();

    const attending    = records.filter(r => r.response === 'attend');
    const cantAttend   = records.filter(r => r.response === 'cant_attend');

    res.json({
      event: {
        eventId:  event.eventId,
        title:    event.title,
        date:     event.date,
        time:     event.time,
        location: event.location,
        isActive: event.isActive,
      },
      summary: {
        total:         records.length,
        attending:     attending.length,
        cantAttend:    cantAttend.length,
      },
      records,
      attending,
      cantAttend,
    });
  } catch (err) {
    console.error('[getEventAttendance]', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createEvent,
  getAllEvents,
  getEventPublic,
  toggleEventStatus,
  deleteEvent,
  lookupStudent,
  submitAttendance,
  getEventAttendance,
};
