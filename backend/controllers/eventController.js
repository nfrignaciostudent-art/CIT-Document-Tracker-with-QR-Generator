/* ══════════════════════════════════════════════════════════════════════
   controllers/eventController.js
   CIT Document Tracker - Group 6

   CHANGES:
     createEvent     — now accepts an optional uploaded image (req.file).
                       Stores it as base64 in event.imageData / event.imageExt.
                       Also handles JSON body OR multipart/form-data body.

     getEventPublic  — now returns imageData and imageExt so the student
                       QR-scan page can display the event image.

     lookupStudent   — studentId is now OPTIONAL.  If omitted the route
                       returns { found: false, optional: true } so the
                       frontend can fall back to manual name/section entry.

     submitAttendance — studentId is now OPTIONAL.  If not provided the
                        caller must supply studentName and section directly.
                        A unique attendance record is still enforced:
                        • With studentId   → unique on (eventId, studentId)
                        • Without studentId → unique on (eventId, studentName)

     QR URL          — Uses process.env.APP_BASE_URL first, then
                       process.env.RENDER_EXTERNAL_URL (auto-set by Render),
                       then falls back to localhost for local dev only.

   ROUTE HANDLERS (unchanged signatures):
     createEvent        POST /api/events/create          (admin only)
     getAllEvents        GET  /api/events                 (admin only)
     getEventPublic      GET  /api/events/public/:eventId (no auth)
     toggleEventStatus   PATCH /api/events/:eventId/toggle (admin only)
     deleteEvent         DELETE /api/events/:eventId      (admin only)
     lookupStudent       POST /api/events/lookup-student  (no auth)
     submitAttendance    POST /api/events/attend           (no auth)
     getEventAttendance  GET  /api/events/:eventId/attendance (admin only)
══════════════════════════════════════════════════════════════════════ */

const QRCode     = require('qrcode');
const Event      = require('../models/Event');
const Attendance = require('../models/Attendance');
const User       = require('../models/User');

/* ── Resolve production base URL ─────────────────────────────────── */
const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  'http://localhost:3000';

/* ── Helper: format date for PH timezone ─────────────────────────── */
function phDate() {
  return new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  });
}

/* ── Helper: parse body from either JSON or FormData ─────────────── */
function parseBody(req) {
  if (req.file) {
    /* multipart/form-data — fields arrive as req.body strings */
    return req.body;
  }
  return req.body;
}

/* ══════════════════════════════════════════════════════════════════
   POST /api/events/create  (admin only)
   Accepts application/json OR multipart/form-data (when image attached).
   Body/fields: { title, description, date, time, location, organizer }
   File field : image  (optional — any image MIME type)
══════════════════════════════════════════════════════════════════ */
const createEvent = async (req, res) => {
  try {
    const body = parseBody(req);
    const { title, description, date, time, location, organizer } = body;

    if (!title || !date)
      return res.status(400).json({ message: 'Title and date are required.' });

    /* ── Handle optional image upload ── */
    let imageData = null;
    let imageExt  = null;

    if (req.file) {
      const mimeToExt = {
        'image/jpeg': 'jpg',
        'image/jpg':  'jpg',
        'image/png':  'png',
        'image/gif':  'gif',
        'image/webp': 'webp',
      };
      imageExt  = mimeToExt[req.file.mimetype] || 'jpg';
      imageData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    /* Create event first to get the eventId */
    const event = new Event({
      title,
      description:   description || '',
      date,
      time:          time        || '',
      location:      location    || '',
      organizer:     organizer   || '',
      imageData,
      imageExt,
      createdBy:     req.user.userId || String(req.user._id),
      createdByName: req.user.name   || req.user.username,
    });

    await event.save();

    /* Generate QR pointing to the public event page */
    const eventUrl = `${APP_BASE_URL}?event=${event.eventId}`;

    const qrBase64 = await QRCode.toDataURL(eventUrl, {
      width:  300,
      margin: 2,
      color:  { dark: '#000000', light: '#ffffff' },
    });

    event.qrCode = qrBase64;
    await event.save();

    res.status(201).json({
      message: 'Event created successfully.',
      event: {
        eventId:     event.eventId,
        title:       event.title,
        description: event.description,
        date:        event.date,
        time:        event.time,
        location:    event.location,
        organizer:   event.organizer,
        isActive:    event.isActive,
        qrCode:      event.qrCode,
        hasImage:    !!(event.imageData),
        createdAt:   event.createdAt,
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
    /* Exclude imageData from list view (large payload) */
    const events = await Event.find()
      .select('-imageData')
      .sort({ createdAt: -1 })
      .lean();

    const result = await Promise.all(events.map(async (evt) => {
      const attendCount     = await Attendance.countDocuments({ eventId: evt.eventId, response: 'attend' });
      const cantAttendCount = await Attendance.countDocuments({ eventId: evt.eventId, response: 'cant_attend' });
      return {
        ...evt,
        attendCount,
        cantAttendCount,
        totalResponses: attendCount + cantAttendCount,
      };
    }));

    res.json(result);
  } catch (err) {
    console.error('[getAllEvents]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════
   GET /api/events/public/:eventId  (NO AUTH — student view)
   Returns event info including imageData for display on the scan page.
══════════════════════════════════════════════════════════════════ */
const getEventPublic = async (req, res) => {
  try {
    const event = await Event.findOne({ eventId: req.params.eventId }).lean();
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    const attendCount     = await Attendance.countDocuments({ eventId: event.eventId, response: 'attend' });
    const cantAttendCount = await Attendance.countDocuments({ eventId: event.eventId, response: 'cant_attend' });

    res.json({
      eventId:        event.eventId,
      title:          event.title,
      description:    event.description,
      date:           event.date,
      time:           event.time,
      location:       event.location,
      organizer:      event.organizer,
      isActive:       event.isActive,
      imageData:      event.imageData || null,
      imageExt:       event.imageExt  || null,
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
══════════════════════════════════════════════════════════════════ */
const toggleEventStatus = async (req, res) => {
  try {
    const event = await Event.findOne({ eventId: req.params.eventId });
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    event.isActive = !event.isActive;
    await event.save();

    res.json({
      message:  `Event is now ${event.isActive ? 'active' : 'closed'}.`,
      isActive: event.isActive,
    });
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
   studentId is now OPTIONAL.  If omitted, returns { found: false,
   optional: true } so the frontend can offer manual name entry.
══════════════════════════════════════════════════════════════════ */
const lookupStudent = async (req, res) => {
  try {
    const { studentId } = req.body;

    /* If no studentId provided, signal the frontend to use manual entry */
    if (!studentId || !studentId.trim()) {
      return res.status(200).json({
        found:    false,
        optional: true,
        message:  'No Student ID provided. Please enter your name and section manually.',
      });
    }

    const user = await User.findOne({
      studentId: studentId.trim(),
      role: 'user',
    }).select('name section studentId userId').lean();

    if (!user) {
      return res.status(404).json({
        found:   false,
        message: 'Student ID not found. Please check and try again, or skip to enter manually.',
      });
    }

    res.json({
      found:       true,
      studentName: user.name,
      section:     user.section || '',
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

   CHANGES:
     studentId is now OPTIONAL.
     If studentId is provided:  system looks up student and uses DB name/section.
     If studentId is omitted:   studentName and section must be provided in body.
     Duplicate prevention:
       • With studentId   → unique on (eventId, studentId)   [DB index]
       • Without studentId → checks existing (eventId, studentName) manually
   Body: {
     eventId,
     response:    'attend' | 'cant_attend',
     studentId?:  string,
     studentName?: string,   (required when studentId omitted)
     section?:    string,
   }
══════════════════════════════════════════════════════════════════ */
const submitAttendance = async (req, res) => {
  try {
    const { eventId, studentId, studentName: manualName, section: manualSection, response } = req.body;

    if (!eventId || !response)
      return res.status(400).json({ message: 'eventId and response are required.' });

    if (!['attend', 'cant_attend'].includes(response))
      return res.status(400).json({ message: 'Response must be "attend" or "cant_attend".' });

    /* Check event exists and is active */
    const event = await Event.findOne({ eventId }).lean();
    if (!event)       return res.status(404).json({ message: 'Event not found.' });
    if (!event.isActive) return res.status(403).json({ message: 'This event is no longer accepting responses.' });

    const hasStudentId = studentId && studentId.trim();

    /* ── Branch A: studentId provided — look up in DB ── */
    if (hasStudentId) {
      const user = await User.findOne({ studentId: studentId.trim(), role: 'user' })
        .select('name section studentId userId').lean();

      if (!user)
        return res.status(404).json({ message: 'Student ID not found. Please check and try again.' });

      /* Check for duplicate by studentId (DB unique index also enforces this) */
      const existing = await Attendance.findOne({ eventId, studentId: studentId.trim() });
      if (existing) {
        return res.status(409).json({
          message:          'You have already submitted your response for this event.',
          alreadySubmitted: true,
          existingResponse: existing.response,
        });
      }

      const attendance = new Attendance({
        eventId,
        studentId:   user.studentId,
        studentName: user.name,
        section:     manualSection || user.section || '',
        userId:      user.userId || String(user._id),
        response,
        scannedAt:   new Date().toISOString(),
        displayDate: phDate(),
      });

      await attendance.save();

      return res.status(201).json({
        message:     response === 'attend'
          ? 'Thank you! You are marked as attending.'
          : 'Response recorded. Thank you for letting us know!',
        studentName: user.name,
        section:     manualSection || user.section || '',
        response,
        eventTitle:  event.title,
      });
    }

    /* ── Branch B: no studentId — manual name/section entry ── */
    const resolvedName = (manualName || '').trim();
    if (!resolvedName)
      return res.status(400).json({
        message: 'Please provide either a Student ID or your full name.',
      });

    const resolvedSection = (manualSection || '').trim();

    /* Duplicate check by name (case-insensitive) */
    const existingManual = await Attendance.findOne({
      eventId,
      studentName: { $regex: new RegExp(`^${resolvedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existingManual) {
      return res.status(409).json({
        message:          'You have already submitted your response for this event.',
        alreadySubmitted: true,
        existingResponse: existingManual.response,
      });
    }

    const attendance = new Attendance({
      eventId,
      studentId:   '',            // no student ID
      studentName: resolvedName,
      section:     resolvedSection,
      userId:      '',
      response,
      scannedAt:   new Date().toISOString(),
      displayDate: phDate(),
    });

    await attendance.save();

    return res.status(201).json({
      message:     response === 'attend'
        ? 'Thank you! You are marked as attending.'
        : 'Response recorded. Thank you for letting us know!',
      studentName: resolvedName,
      section:     resolvedSection,
      response,
      eventTitle:  event.title,
    });

  } catch (err) {
    /* Mongo duplicate key on (eventId, studentId) unique index */
    if (err.code === 11000) {
      return res.status(409).json({
        message:          'You have already submitted your response for this event.',
        alreadySubmitted: true,
      });
    }
    console.error('[submitAttendance]', err);
    res.status(500).json({ message: err.message });
  }
};

/* ══════════════════════════════════════════════════════════════════
   GET /api/events/:eventId/attendance  (admin only)
══════════════════════════════════════════════════════════════════ */
const getEventAttendance = async (req, res) => {
  try {
    const event = await Event.findOne({ eventId: req.params.eventId })
      .select('-imageData')
      .lean();
    if (!event) return res.status(404).json({ message: 'Event not found.' });

    const records    = await Attendance.find({ eventId: req.params.eventId })
      .sort({ createdAt: 1 })
      .lean();

    const attending  = records.filter(r => r.response === 'attend');
    const cantAttend = records.filter(r => r.response === 'cant_attend');

    res.json({
      event: {
        eventId:  event.eventId,
        title:    event.title,
        date:     event.date,
        time:     event.time,
        location: event.location,
        isActive: event.isActive,
        hasImage: !!(event.imageData),
      },
      summary: {
        total:      records.length,
        attending:  attending.length,
        cantAttend: cantAttend.length,
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