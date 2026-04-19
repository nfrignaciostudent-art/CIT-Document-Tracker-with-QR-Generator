/* ══════════════════════════════════════════════════════════════════════
   public/js/event.js — Public Event Page + Attendance
   CIT Document Tracker - Group 6

   CHANGES:
     - All emojis removed and replaced with SVG icons or clean text
     - Event image displayed at the top of the event page when available
     - Student ID is now OPTIONAL:
         If entered → lookup proceeds as before
         If left blank → student enters name + section manually
     - Section is always manually editable (pre-filled from DB lookup,
       but overridable in the confirm step)
     - Backend now accepts { studentName, section } directly when no
       studentId is provided (Branch B in eventController.js)

   FLOW (updated):
     1. Page loads → reads ?event= param → fetches event info
     2. Shows event image (if any) + event details
     3. Student enters their Student ID (OPTIONAL) → clicks Search
        OR clicks "Skip / Enter name manually"
     4a. (ID provided) System looks up student → shows name + editable section
     4b. (ID skipped) Student types their full name + section
     5. Student clicks "I will Attend" or "I can't Attend"
     6. Response saved → success screen shown
══════════════════════════════════════════════════════════════════════ */

/* ── SVG icon helpers ────────────────────────────────────────────── */
function _evtIcon(path, size) {
  return '<svg width="' + (size||16) + '" height="' + (size||16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
}
var _svgCalendar = _evtIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',15);
var _svgPin      = _evtIcon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',15);
var _svgUser     = _evtIcon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',15);
var _svgCheck    = _evtIcon('<polyline points="20 6 9 17 4 12"/>',15);
var _svgX        = _evtIcon('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',15);
var _svgLock     = _evtIcon('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',15);
var _svgSearch   = _evtIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',15);
var _svgAlert    = _evtIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',24);

/* ── Init: called on page load if ?event= param is detected ─────── */
async function initEventPage() {
  var params  = new URLSearchParams(window.location.search);
  var eventId = params.get('event');
  if (!eventId) return;

  var appEl   = document.getElementById('app');
  var eventEl = document.getElementById('event-page');
  if (appEl)   appEl.style.display   = 'none';
  if (eventEl) eventEl.style.display = 'flex';

  await loadEventPage(eventId);
}

/* ── Load and render the event page ─────────────────────────────── */
async function loadEventPage(eventId) {
  var container = document.getElementById('event-content');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.5)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div><p>Loading event...</p></div>';

  try {
    var res  = await fetch('/api/events/public/' + encodeURIComponent(eventId));
    var data = await res.json();

    if (!res.ok) {
      container.innerHTML = renderEventError(data.message || 'Event not found.');
      return;
    }

    renderEventDetails(container, data);
  } catch (err) {
    container.innerHTML = renderEventError('Could not connect to server. Please try again.');
  }
}

/* ── Render the event details + attendance form ──────────────────── */
function renderEventDetails(container, evt) {
  var isActive    = evt.isActive;
  var statusBadge = isActive
    ? '<span style="background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3);padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700">Open</span>'
    : '<span style="background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700">Closed</span>';

  /* ── Event image (when available) ── */
  var imageSection = '';
  if (evt.imageData) {
    imageSection =
      '<div style="width:100%;max-width:480px;margin:0 auto 24px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08)">' +
        '<img src="' + escapeHtml(evt.imageData) + '" alt="' + escapeHtml(evt.title) + '" ' +
          'style="width:100%;display:block;object-fit:cover;max-height:260px">' +
      '</div>';
  }

  container.innerHTML =
    imageSection +

    /* Event Header */
    '<div style="text-align:center;margin-bottom:32px">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.35);margin-bottom:12px;text-transform:uppercase">CIT Event</div>' +
      '<h1 style="font-size:26px;font-weight:800;color:#fff;margin:0 0 12px;line-height:1.3">' + escapeHtml(evt.title) + '</h1>' +
      statusBadge +
    '</div>' +

    /* Event Info Card */
    '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px;margin-bottom:24px">' +
      (evt.description ? '<p style="font-size:14px;color:rgba(255,255,255,.65);line-height:1.7;margin:0 0 20px;padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,.07)">' + escapeHtml(evt.description) + '</p>' : '') +

      '<div style="display:grid;gap:14px">' +

        (evt.date ?
        '<div style="display:flex;align-items:center;gap:14px">' +
          '<div style="width:36px;height:36px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:10px;display:grid;place-items:center;flex-shrink:0;color:#818cf8">' + _svgCalendar + '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,.35);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Date</div>' +
            '<div style="font-size:14px;color:rgba(255,255,255,.85);font-weight:600">' + escapeHtml(evt.date) + (evt.time ? ' · ' + escapeHtml(evt.time) : '') + '</div>' +
          '</div>' +
        '</div>' : '') +

        (evt.location ?
        '<div style="display:flex;align-items:center;gap:14px">' +
          '<div style="width:36px;height:36px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:10px;display:grid;place-items:center;flex-shrink:0;color:#818cf8">' + _svgPin + '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,.35);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Location</div>' +
            '<div style="font-size:14px;color:rgba(255,255,255,.85);font-weight:600">' + escapeHtml(evt.location) + '</div>' +
          '</div>' +
        '</div>' : '') +

        (evt.organizer ?
        '<div style="display:flex;align-items:center;gap:14px">' +
          '<div style="width:36px;height:36px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:10px;display:grid;place-items:center;flex-shrink:0;color:#818cf8">' + _svgUser + '</div>' +
          '<div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,.35);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Organizer</div>' +
            '<div style="font-size:14px;color:rgba(255,255,255,.85);font-weight:600">' + escapeHtml(evt.organizer) + '</div>' +
          '</div>' +
        '</div>' : '') +

      '</div>' +

      /* Response counts */
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,.07)">' +
        '<div style="text-align:center;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:10px;padding:14px">' +
          '<div style="font-size:22px;font-weight:800;color:#22c55e">' + evt.attendCount + '</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">Will Attend</div>' +
        '</div>' +
        '<div style="text-align:center;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:14px">' +
          '<div style="font-size:22px;font-weight:800;color:#ef4444">' + evt.cantAttendCount + '</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">Cannot Attend</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    /* Attendance Form */
    '<div id="event-form-area">' +
      (isActive ? renderStudentLookupForm(evt.eventId) : renderClosedMessage()) +
    '</div>';
}

/* ── Student ID lookup form ──────────────────────────────────────── */
function renderStudentLookupForm(eventId) {
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px">' +
    '<h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">Mark Your Attendance</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.4);margin:0 0 20px">Enter your Student ID, or skip to enter your name manually.</p>' +

    '<div style="display:flex;gap:10px;margin-bottom:10px">' +
      '<input id="evt-student-id-input"' +
        ' type="text" placeholder="Student ID (optional)" maxlength="30"' +
        ' style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 16px;color:#fff;font-size:14px;font-family:\'DM Sans\',sans-serif;outline:none"' +
        ' onkeydown="if(event.key===\'Enter\') lookupStudentForEvent(\'' + eventId + '\')"' +
      '/>' +
      '<button onclick="lookupStudentForEvent(\'' + eventId + '\')"' +
        ' style="padding:12px 18px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;display:flex;align-items:center;gap:6px">' +
        _svgSearch + ' Search' +
      '</button>' +
    '</div>' +

    '<button onclick="showManualEntryForm(\'' + eventId + '\')"' +
      ' style="width:100%;padding:10px;background:transparent;color:rgba(255,255,255,.4);border:1px solid rgba(255,255,255,.1);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:12px;cursor:pointer;margin-bottom:12px">' +
      'Skip — Enter name manually' +
    '</button>' +

    '<div id="evt-lookup-error" style="display:none;font-size:13px;color:#f87171;padding:10px 14px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:8px;margin-bottom:12px"></div>' +
    '<div id="evt-student-confirm" style="display:none"></div>' +
  '</div>';
}

/* ── Manual entry form (no student ID) ──────────────────────────── */
function showManualEntryForm(eventId) {
  var formArea = document.getElementById('event-form-area');
  if (!formArea) return;

  formArea.innerHTML =
    '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px">' +
      '<h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">Manual Entry</h3>' +
      '<p style="font-size:13px;color:rgba(255,255,255,.4);margin:0 0 20px">Enter your full name and section.</p>' +

      '<div style="margin-bottom:14px">' +
        '<label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Full Name <span style="color:#ef4444">*</span></label>' +
        '<input id="manual-name-input" type="text" placeholder="Your full name" maxlength="80"' +
          ' style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 16px;color:#fff;font-size:14px;font-family:\'DM Sans\',sans-serif;outline:none">' +
      '</div>' +

      '<div style="margin-bottom:20px">' +
        '<label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Section <span style="font-weight:400;color:rgba(255,255,255,.3)">(optional)</span></label>' +
        '<input id="manual-section-input" type="text" placeholder="e.g. Section A" maxlength="30"' +
          ' style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 16px;color:#fff;font-size:14px;font-family:\'DM Sans\',sans-serif;outline:none">' +
      '</div>' +

      '<div id="manual-entry-error" style="display:none;font-size:13px;color:#f87171;padding:10px 14px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:8px;margin-bottom:14px"></div>' +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">' +
        '<button onclick="submitManualAttendance(\'' + eventId + '\',\'attend\')"' +
          ' style="padding:13px;background:#22c55e;color:#0d1117;border:none;border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">' +
          _svgCheck + ' I will Attend' +
        '</button>' +
        '<button onclick="submitManualAttendance(\'' + eventId + '\',\'cant_attend\')"' +
          ' style="padding:13px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">' +
          _svgX + ' Cannot Attend' +
        '</button>' +
      '</div>' +

      '<button onclick="resetEventForm(\'' + eventId + '\')"' +
        ' style="width:100%;padding:9px;background:transparent;color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:12px;cursor:pointer">' +
        'Back — use Student ID instead' +
      '</button>' +
    '</div>';
}

/* ── Submit from manual entry form ──────────────────────────────── */
async function submitManualAttendance(eventId, response) {
  var nameInput    = document.getElementById('manual-name-input');
  var sectionInput = document.getElementById('manual-section-input');
  var errEl        = document.getElementById('manual-entry-error');
  if (!nameInput) return;

  var name    = nameInput.value.trim();
  var section = sectionInput ? sectionInput.value.trim() : '';

  if (!name) {
    errEl.textContent  = 'Please enter your full name.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  var formArea = document.getElementById('event-form-area');
  if (formArea) formArea.innerHTML =
    '<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,.5)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div><p>Submitting...</p></div>';

  try {
    var res  = await fetch('/api/events/attend', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventId, studentName: name, section: section, response }),
    });
    var data = await res.json();

    if (!res.ok) {
      if (res.status === 409) { formArea.innerHTML = renderAlreadySubmitted(data.existingResponse); return; }
      formArea.innerHTML = renderEventError(data.message || 'Something went wrong.');
      return;
    }
    formArea.innerHTML = renderSuccessScreen(data, response);
  } catch (err) {
    if (formArea) formArea.innerHTML = renderEventError('Connection error. Please try again.');
  }
}

/* ── Lookup the student by ID ────────────────────────────────────── */
async function lookupStudentForEvent(eventId) {
  var input   = document.getElementById('evt-student-id-input');
  var errEl   = document.getElementById('evt-lookup-error');
  var confirm = document.getElementById('evt-student-confirm');
  if (!input) return;

  var studentId = input.value.trim();
  errEl.style.display = 'none';

  /* Empty student ID → show manual form instead of blocking */
  if (!studentId) {
    showManualEntryForm(eventId);
    return;
  }

  input.disabled = true;
  var btn = input.nextElementSibling;
  if (btn) { btn.disabled = true; btn.innerHTML = 'Searching...'; }

  try {
    var res  = await fetch('/api/events/lookup-student', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ studentId }),
    });
    var data = await res.json();

    if (!res.ok || !data.found) {
      /* Student not found — show error but keep the skip button visible */
      errEl.textContent  = (data.message || 'Student ID not found.') + ' You can also skip to enter manually.';
      errEl.style.display = 'block';
      input.disabled = false;
      if (btn) { btn.disabled = false; btn.innerHTML = _svgSearch + ' Search'; }
      return;
    }

    /* Show confirm card with editable section field */
    confirm.style.display = 'block';
    confirm.innerHTML =
      '<div style="margin-top:16px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:12px;padding:18px">' +
        '<div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Student Found</div>' +
        '<div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">' + escapeHtml(data.studentName) + '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:14px">ID: ' + escapeHtml(data.studentId) + '</div>' +

        /* Editable section field */
        '<div style="margin-bottom:16px">' +
          '<label style="display:block;font-size:11px;font-weight:700;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Section <span style="font-weight:400;color:rgba(255,255,255,.25)">(optional, confirm or update)</span></label>' +
          '<input id="evt-section-input" type="text" placeholder="e.g. Section A" maxlength="30" value="' + escapeHtml(data.section || '') + '"' +
            ' style="width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 14px;color:#fff;font-size:13px;font-family:\'DM Sans\',sans-serif;outline:none">' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
          '<button onclick="submitWithStudentId(\'' + eventId + '\',\'' + escapeHtml(data.studentId) + '\',\'attend\')"' +
            ' style="padding:13px;background:#22c55e;color:#0d1117;border:none;border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">' +
            _svgCheck + ' I will Attend' +
          '</button>' +
          '<button onclick="submitWithStudentId(\'' + eventId + '\',\'' + escapeHtml(data.studentId) + '\',\'cant_attend\')"' +
            ' style="padding:13px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">' +
            _svgX + ' Cannot Attend' +
          '</button>' +
        '</div>' +

        '<button onclick="resetEventForm(\'' + eventId + '\')"' +
          ' style="width:100%;margin-top:2px;padding:9px;background:transparent;color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:12px;cursor:pointer">' +
          'Not you? Search again' +
        '</button>' +
      '</div>';

  } catch (err) {
    errEl.textContent  = 'Connection error. Please try again.';
    errEl.style.display = 'block';
    input.disabled = false;
    if (btn) { btn.disabled = false; btn.innerHTML = _svgSearch + ' Search'; }
  }
}

/* ── Submit with student ID (from lookup confirm screen) ─────────── */
async function submitWithStudentId(eventId, studentId, response) {
  var sectionInput = document.getElementById('evt-section-input');
  var section      = sectionInput ? sectionInput.value.trim() : '';

  await submitEventAttendance(eventId, studentId, response, section);
}

/* ── Submit attendance response (student ID path) ────────────────── */
async function submitEventAttendance(eventId, studentId, response, section) {
  var formArea = document.getElementById('event-form-area');
  if (!formArea) return;

  formArea.innerHTML =
    '<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,.5)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div><p>Submitting your response...</p></div>';

  try {
    var res  = await fetch('/api/events/attend', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventId, studentId, section: section || '', response }),
    });
    var data = await res.json();

    if (!res.ok) {
      if (res.status === 409) { formArea.innerHTML = renderAlreadySubmitted(data.existingResponse); return; }
      formArea.innerHTML = renderEventError(data.message || 'Something went wrong.');
      return;
    }
    formArea.innerHTML = renderSuccessScreen(data, response);
  } catch (err) {
    formArea.innerHTML = renderEventError('Connection error. Please try again.');
  }
}

/* ── Reset form (search again) ───────────────────────────────────── */
function resetEventForm(eventId) {
  var formArea = document.getElementById('event-form-area');
  if (formArea) formArea.innerHTML = renderStudentLookupForm(eventId);
}

/* ── Success screen ──────────────────────────────────────────────── */
function renderSuccessScreen(data, response) {
  var isAttend = response === 'attend';
  var iconHtml = isAttend
    ? '<div style="color:#22c55e">' + _svgCheck + '</div>'
    : '<div style="color:#ef4444">' + _svgX + '</div>';
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">' +
    '<div style="width:64px;height:64px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:' + (isAttend ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.1)') + ';border:2px solid ' + (isAttend ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.25)') + '">' + iconHtml + '</div>' +
    '<h3 style="font-size:18px;font-weight:800;color:#fff;margin:0 0 8px">' + (isAttend ? "You're In!" : "Got It!") + '</h3>' +
    '<p style="font-size:14px;color:rgba(255,255,255,.5);margin:0 0 20px;line-height:1.6">' + escapeHtml(data.message) + '</p>' +
    '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;margin-bottom:4px">' +
      '<div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.8)">' + escapeHtml(data.studentName) + '</div>' +
      (data.section && data.section !== 'N/A' ? '<div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:3px">Section ' + escapeHtml(data.section) + '</div>' : '') +
    '</div>' +
    '<div style="font-size:11px;color:rgba(255,255,255,.25);margin-top:12px">You can now close this page.</div>' +
  '</div>';
}

/* ── Already submitted message ───────────────────────────────────── */
function renderAlreadySubmitted(existingResponse) {
  var wasAttend = existingResponse === 'attend';
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">' +
    '<div style="width:48px;height:48px;margin:0 auto 14px;border-radius:50%;background:rgba(245,158,11,.1);border:2px solid rgba(245,158,11,.25);display:grid;place-items:center;color:#f59e0b">' + _svgAlert + '</div>' +
    '<h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 8px">Already Submitted</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin:0">' +
      'You already responded to this event as ' +
      '<strong style="color:' + (wasAttend ? '#22c55e' : '#f87171') + '">' + (wasAttend ? 'Attending' : "Cannot Attend") + '</strong>.' +
      '<br>You can only submit once per event.' +
    '</p>' +
  '</div>';
}

/* ── Closed event message ────────────────────────────────────────── */
function renderClosedMessage() {
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">' +
    '<div style="width:52px;height:52px;margin:0 auto 14px;border-radius:50%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);display:grid;place-items:center;color:rgba(255,255,255,.4)">' + _svgLock + '</div>' +
    '<h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 8px">Attendance Closed</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin:0">This event is no longer accepting attendance responses.</p>' +
  '</div>';
}

/* ── Error message ───────────────────────────────────────────────── */
function renderEventError(msg) {
  return '<div style="text-align:center;padding:60px 20px">' +
    '<div style="width:48px;height:48px;margin:0 auto 14px;border-radius:50%;background:rgba(239,68,68,.1);border:2px solid rgba(239,68,68,.2);display:grid;place-items:center;color:#ef4444">' + _svgX + '</div>' +
    '<p style="font-size:15px;font-weight:700;color:#fff;margin:0 0 8px">Something went wrong</p>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.4);margin:0">' + escapeHtml(msg) + '</p>' +
  '</div>';
}

/* ── HTML escape utility ─────────────────────────────────────────── */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}