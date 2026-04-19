/* ══════════════════════════════════════════════════════════════════════
   public/js/event.js — Public Event Page + Attendance
   CIT Document Tracker - Group 6

   RULES:
     - Student ID is the ONLY way to mark attendance.
     - Manual name entry removed entirely.
     - Users without a Student ID must ask admin to assign one via
       PATCH /api/auth/users/:userId/student-id
     - No SVG icon variables — clean emoji/text approach.

   FLOW:
     1. Page loads → reads ?event= param → fetches event info
     2. Shows event details
     3. Student enters Student ID → clicks Search
     4. System looks up student → shows name + section confirmation
     5. Student clicks Attend or Cannot Attend
     6. Success screen
══════════════════════════════════════════════════════════════════════ */

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

async function loadEventPage(eventId) {
  var container = document.getElementById('event-content');
  if (!container) return;

  container.innerHTML =
    '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.5)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div><p>Loading event...</p></div>';

  try {
    var res  = await fetch('/api/events/public/' + encodeURIComponent(eventId));
    var data = await res.json();

    if (!res.ok) {
      container.innerHTML = _evtError(data.message || 'Event not found.');
      return;
    }
    _renderEventDetails(container, data);
  } catch (err) {
    container.innerHTML = _evtError('Could not connect to server. Please try again.');
  }
}

function _renderEventDetails(container, evt) {
  var isActive = evt.isActive;

  var statusBadge = isActive
    ? '<span style="background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3);padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700">Open</span>'
    : '<span style="background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700">Closed</span>';

  var imageSection = '';
  if (evt.imageData) {
    imageSection =
      '<div style="width:100%;max-width:480px;margin:0 auto 24px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08)">' +
        '<img src="' + _ee(evt.imageData) + '" alt="' + _ee(evt.title) + '" style="width:100%;display:block;object-fit:cover;max-height:260px">' +
      '</div>';
  }

  var infoRows = '';
  if (evt.date)      infoRows += _infoRow('Date',      _ee(evt.date) + (evt.time ? ' &middot; ' + _ee(evt.time) : ''));
  if (evt.location)  infoRows += _infoRow('Location',  _ee(evt.location));
  if (evt.organizer) infoRows += _infoRow('Organizer', _ee(evt.organizer));

  container.innerHTML =
    imageSection +
    '<div style="text-align:center;margin-bottom:32px">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.35);margin-bottom:12px;text-transform:uppercase">CIT Event</div>' +
      '<h1 style="font-size:26px;font-weight:800;color:#fff;margin:0 0 12px;line-height:1.3">' + _ee(evt.title) + '</h1>' +
      statusBadge +
    '</div>' +

    '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px;margin-bottom:24px">' +
      (evt.description ? '<p style="font-size:14px;color:rgba(255,255,255,.65);line-height:1.7;margin:0 0 20px;padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,.07)">' + _ee(evt.description) + '</p>' : '') +
      (infoRows ? '<div style="display:grid;gap:14px">' + infoRows + '</div>' : '') +
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

    '<div id="event-form-area">' +
      (isActive ? _lookupForm(evt.eventId) : _closedMsg()) +
    '</div>';
}

function _infoRow(label, valueHtml) {
  return '<div style="display:flex;align-items:flex-start;gap:14px">' +
    '<div style="width:36px;height:36px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:10px;display:grid;place-items:center;flex-shrink:0;color:#818cf8;font-size:15px">' +
      (label === 'Date' ? '📅' : label === 'Location' ? '📍' : '👤') +
    '</div>' +
    '<div>' +
      '<div style="font-size:11px;color:rgba(255,255,255,.35);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">' + label + '</div>' +
      '<div style="font-size:14px;color:rgba(255,255,255,.85);font-weight:600">' + valueHtml + '</div>' +
    '</div>' +
  '</div>';
}

/* ── Student ID lookup form ──────────────────────────────────────── */
function _lookupForm(eventId) {
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px">' +
    '<h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">Mark Your Attendance</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.4);margin:0 0 20px">Enter your Student ID to find your record.</p>' +

    '<div style="display:flex;gap:10px;margin-bottom:10px">' +
      '<input id="evt-student-id-input" type="text" placeholder="Enter your Student ID" maxlength="30"' +
        ' style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 16px;color:#fff;font-size:14px;font-family:\'DM Sans\',sans-serif;outline:none"' +
        ' onkeydown="if(event.key===\'Enter\') _evtLookup(\'' + eventId + '\')">' +
      '<button onclick="_evtLookup(\'' + eventId + '\')"' +
        ' style="padding:12px 20px;background:#6366f1;color:#fff;border:none;border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap">' +
        'Search' +
      '</button>' +
    '</div>' +

    '<div id="evt-lookup-error" style="display:none;font-size:13px;color:#f87171;padding:10px 14px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:8px;margin-bottom:12px;line-height:1.5"></div>' +
    '<div id="evt-student-confirm" style="display:none"></div>' +
  '</div>';
}

async function _evtLookup(eventId) {
  var input   = document.getElementById('evt-student-id-input');
  var errEl   = document.getElementById('evt-lookup-error');
  var confirm = document.getElementById('evt-student-confirm');
  if (!input) return;

  var studentId = input.value.trim();
  errEl.style.display = 'none';

  if (!studentId) {
    errEl.textContent   = 'Please enter your Student ID.';
    errEl.style.display = 'block';
    return;
  }

  input.disabled = true;
  var btn = input.nextElementSibling;
  if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }

  try {
    var res  = await fetch('/api/events/lookup-student', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ studentId }),
    });
    var data = await res.json();

    input.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Search'; }

    if (!res.ok || !data.found) {
      errEl.innerHTML =
        '<strong>' + _ee(data.message || 'Student ID not found.') + '</strong>' +
        '<br><span style="font-size:12px;opacity:.8;margin-top:4px;display:block">' +
        'If you don\'t have a Student ID yet, please contact your administrator to have one assigned to your account.' +
        '</span>';
      errEl.style.display = 'block';
      return;
    }

    confirm.style.display = 'block';
    confirm.innerHTML =
      '<div style="margin-top:16px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:12px;padding:18px">' +
        '<div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Student Found</div>' +
        '<div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">' + _ee(data.studentName) + '</div>' +
        '<div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:' + (data.section ? '4px' : '16px') + '">' +
          'ID: <span style="font-family:\'DM Mono\',monospace">' + _ee(data.studentId) + '</span>' +
        '</div>' +
        (data.section ? '<div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:16px">Section: <strong style="color:rgba(255,255,255,.8)">' + _ee(data.section) + '</strong></div>' : '') +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
          '<button onclick="_evtSubmit(\'' + eventId + '\',\'' + _ee(data.studentId) + '\',\'attend\')"' +
            ' style="padding:13px;background:#22c55e;color:#0d1117;border:none;border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer">' +
            'I will Attend' +
          '</button>' +
          '<button onclick="_evtSubmit(\'' + eventId + '\',\'' + _ee(data.studentId) + '\',\'cant_attend\')"' +
            ' style="padding:13px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer">' +
            'Cannot Attend' +
          '</button>' +
        '</div>' +
        '<button onclick="_evtReset(\'' + eventId + '\')"' +
          ' style="width:100%;padding:9px;background:transparent;color:rgba(255,255,255,.3);border:1px solid rgba(255,255,255,.08);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:12px;cursor:pointer">' +
          'Not you? Search again' +
        '</button>' +
      '</div>';

  } catch (err) {
    input.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
    errEl.textContent   = 'Connection error. Please try again.';
    errEl.style.display = 'block';
  }
}

async function _evtSubmit(eventId, studentId, response) {
  var formArea = document.getElementById('event-form-area');
  if (!formArea) return;

  formArea.innerHTML =
    '<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,.5)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div><p>Submitting your response...</p></div>';

  try {
    var res  = await fetch('/api/events/attend', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventId, studentId, response }),
    });
    var data = await res.json();

    if (!res.ok) {
      if (res.status === 409) { formArea.innerHTML = _evtAlreadySubmitted(data.existingResponse); return; }
      formArea.innerHTML = _evtError(data.message || 'Something went wrong.');
      return;
    }
    formArea.innerHTML = _evtSuccess(data, response);
  } catch (err) {
    formArea.innerHTML = _evtError('Connection error. Please try again.');
  }
}

function _evtReset(eventId) {
  var formArea = document.getElementById('event-form-area');
  if (formArea) formArea.innerHTML = _lookupForm(eventId);
}

function _evtSuccess(data, response) {
  var isAttend = response === 'attend';
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">' +
    '<div style="width:64px;height:64px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;' +
      'background:' + (isAttend ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.1)') + ';' +
      'border:2px solid ' + (isAttend ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.25)') + ';' +
      'font-size:32px;color:' + (isAttend ? '#22c55e' : '#ef4444') + '">' +
      (isAttend ? '✓' : '✕') +
    '</div>' +
    '<h3 style="font-size:18px;font-weight:800;color:#fff;margin:0 0 8px">' + (isAttend ? "You\'re In!" : 'Got It!') + '</h3>' +
    '<p style="font-size:14px;color:rgba(255,255,255,.5);margin:0 0 20px;line-height:1.6">' + _ee(data.message) + '</p>' +
    '<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px">' +
      '<div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.8)">' + _ee(data.studentName) + '</div>' +
      (data.section ? '<div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:3px">Section ' + _ee(data.section) + '</div>' : '') +
    '</div>' +
    '<div style="font-size:11px;color:rgba(255,255,255,.25);margin-top:12px">You can now close this page.</div>' +
  '</div>';
}

function _evtAlreadySubmitted(existingResponse) {
  var wasAttend = existingResponse === 'attend';
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">' +
    '<div style="width:48px;height:48px;margin:0 auto 14px;border-radius:50%;background:rgba(245,158,11,.1);border:2px solid rgba(245,158,11,.25);display:grid;place-items:center;color:#f59e0b;font-size:22px;font-weight:700">!</div>' +
    '<h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 8px">Already Submitted</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin:0">' +
      'You already responded as <strong style="color:' + (wasAttend ? '#22c55e' : '#f87171') + '">' + (wasAttend ? 'Attending' : 'Cannot Attend') + '</strong>.<br>' +
      'You can only submit once per event.' +
    '</p>' +
  '</div>';
}

function _closedMsg() {
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">' +
    '<div style="width:52px;height:52px;margin:0 auto 14px;border-radius:50%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);display:grid;place-items:center;color:rgba(255,255,255,.4);font-size:22px">🔒</div>' +
    '<h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 8px">Attendance Closed</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin:0">This event is no longer accepting attendance responses.</p>' +
  '</div>';
}

function _evtError(msg) {
  return '<div style="text-align:center;padding:60px 20px">' +
    '<div style="width:48px;height:48px;margin:0 auto 14px;border-radius:50%;background:rgba(239,68,68,.1);border:2px solid rgba(239,68,68,.2);display:grid;place-items:center;color:#ef4444;font-size:22px">✕</div>' +
    '<p style="font-size:15px;font-weight:700;color:#fff;margin:0 0 8px">Something went wrong</p>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.4);margin:0">' + _ee(msg) + '</p>' +
  '</div>';
}

function _ee(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}