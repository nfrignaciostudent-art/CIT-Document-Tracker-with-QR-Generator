/* ══════════════════════════════════════════════════════════════════════
   public/js/event.js — Student QR Scan Page
   CIT Document Tracker - Group 6

   REDESIGNED: Mobile-first, matches existing dark green theme.
   Full event info, section dropdown, excuse letter required.
══════════════════════════════════════════════════════════════════════ */

async function initEventPage() {
  var params  = new URLSearchParams(window.location.search);
  var eventId = params.get('event');
  if (!eventId) return;

  /* Hide main app shell and public landing, show the standalone event page.
     NOTE: the actual wrapper IDs in index.html are #public-view and #app-view
     — there is no #app element. Hiding both ensures nothing is visible behind. */
  var publicView = document.getElementById('public-view');
  var appView    = document.getElementById('app-view');
  var topnav     = document.getElementById('topnav');
  var eventEl    = document.getElementById('event-page');
  if (publicView) publicView.style.display = 'none';
  if (appView)    appView.style.display    = 'none';
  if (topnav)     topnav.style.display     = 'none';
  if (eventEl)    eventEl.style.display    = 'flex';
  document.body.style.background = '#0d1117';
  window.scrollTo(0, 0);

  await loadEventPage(eventId);
}

async function loadEventPage(eventId) {
  var container = document.getElementById('event-content');
  if (!container) return;

  container.innerHTML =
    '<div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.4)">' +
    '<div class="spinner" style="margin:0 auto 16px;border-top-color:#34c75a"></div>' +
    '<p style="font-size:13px">Loading event...</p></div>';

  try {
    var res  = await fetch('/api/events/public/' + encodeURIComponent(eventId));
    var data = await res.json();
    if (!res.ok) { container.innerHTML = _evtError(data.message || 'Event not found.'); return; }
    _renderEventPage(container, data);
  } catch (err) {
    container.innerHTML = _evtError('Could not connect to server. Please try again.');
  }
}

function _renderEventPage(container, evt) {
  var isActive = evt.isActive;

  /* ── Banner ── */
  var bannerHtml =
    '<div style="background:linear-gradient(150deg,#1a3d22 0%,#0d2318 60%,#091510 100%);padding:24px 20px 28px;border-bottom:1px solid rgba(52,199,90,.12)">' +
      '<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:10px">CIT Document Tracker</div>' +
      (evt.imageData ? '<div style="width:100%;border-radius:12px;overflow:hidden;margin-bottom:16px;border:1px solid rgba(255,255,255,.08)">' +
        '<img src="' + _ee(evt.imageData) + '" alt="" style="width:100%;display:block;object-fit:cover;max-height:180px"></div>' : '') +
      '<h1 style="font-size:22px;font-weight:800;color:#fff;margin:0 0 10px;line-height:1.3">' + _ee(evt.title) + '</h1>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">' +
        '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.7);font-weight:600">School Event</span>' +
        (isActive
          ? '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(52,199,90,.25);color:#a7f3c0;font-weight:700">Open</span>'
          : '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(239,68,68,.2);color:#fca5a5;font-weight:700">Closed</span>') +
      '</div>' +
    '</div>';

  /* ── Info strip ── */
  var infoHtml =
    '<div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(255,255,255,.07)">' +
      _evtInfoCell('Date',     (evt.date || '—') + (evt.time ? ' · ' + evt.time : '')) +
      _evtInfoCell('Venue',    evt.location || '—') +
      _evtInfoCell('Organizer', evt.organizer || '—') +
      _evtInfoCell('Responses', (evt.attendCount + evt.cantAttendCount) + ' submitted') +
    '</div>';

  /* ── Description ── */
  var descHtml = evt.description
    ? '<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07)">' +
        '<div style="font-size:10px;font-weight:700;color:rgba(52,199,90,.6);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">About this event</div>' +
        '<p style="font-size:13px;color:rgba(255,255,255,.65);line-height:1.7;margin:0">' + _ee(evt.description) + '</p>' +
      '</div>'
    : '';

  /* ── Pinned announcement ── */
  var announcementHtml =
    '<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07)">' +
      '<div style="font-size:10px;font-weight:700;color:rgba(52,199,90,.6);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Announcement</div>' +
      '<div style="background:rgba(239,159,39,.1);border-left:3px solid #ef9f27;border-radius:0 8px 8px 0;padding:10px 14px">' +
        '<div style="font-size:10px;font-weight:700;color:#ef9f27;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">From the organizer</div>' +
        '<p style="font-size:12px;color:rgba(255,255,255,.65);line-height:1.6;margin:0">Please be on time. Bring your Student ID for attendance verification. Wear appropriate school attire.</p>' +
      '</div>' +
    '</div>';

  /* ── What to bring ── */
  var bringHtml =
    '<div style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07)">' +
      '<div style="font-size:10px;font-weight:700;color:rgba(52,199,90,.6);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">What to bring</div>' +
      '<ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px">' +
        _evtBringItem('Student ID card') +
        _evtBringItem('School uniform or prescribed attire') +
        _evtBringItem('Water bottle') +
      '</ul>' +
    '</div>';

  /* ── Organizer strip ── */
  var orgHtml = (evt.organizer)
    ? '<div style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,.07)">' +
        '<div style="font-size:10px;font-weight:700;color:rgba(52,199,90,.6);text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px">Organized by</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
          '<div style="width:34px;height:34px;border-radius:50%;background:rgba(99,102,241,.2);border:1px solid rgba(99,102,241,.3);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#a5b4fc;flex-shrink:0">' +
            _ee(evt.organizer.slice(0,2).toUpperCase()) +
          '</div>' +
          '<div>' +
            '<div style="font-size:13px;font-weight:600;color:#fff">' + _ee(evt.organizer) + '</div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,.4)">Event Organizer</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    : '';

  /* ── Attendance counter ── */
  var counterHtml =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.07)">' +
      '<div style="text-align:center;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:10px;padding:12px">' +
        '<div style="font-size:20px;font-weight:800;color:#22c55e">' + (evt.attendCount||0) + '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">Will Attend</div>' +
      '</div>' +
      '<div style="text-align:center;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:12px">' +
        '<div style="font-size:20px;font-weight:800;color:#ef4444">' + (evt.cantAttendCount||0) + '</div>' +
        '<div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">Cannot Attend</div>' +
      '</div>' +
    '</div>';

  /* ── Attendance form or closed message ── */
  var formHtml =
    '<div id="event-form-area" style="padding:20px">' +
      (!isActive ? _closedMsg() : _isOutsideTimeWindow(evt) ? _timeWindowMsg(evt) : _lookupForm(evt.eventId)) +
    '</div>';

  /* ── Footer ── */
  var footerHtml =
    '<div style="padding:16px 20px;text-align:center;border-top:1px solid rgba(255,255,255,.06)">' +
      '<p style="font-size:10px;color:rgba(255,255,255,.2);font-family:\'DM Mono\',monospace">CIT Document Tracker · Group 6</p>' +
    '</div>';

  container.innerHTML =
    '<div style="background:#0d1a10;border-radius:16px;overflow:hidden;border:1px solid rgba(52,199,90,.1)">' +
      bannerHtml + infoHtml + descHtml + announcementHtml + bringHtml + orgHtml + counterHtml + formHtml + footerHtml +
    '</div>';
}

/* ── Info cell helper ──────────────────────────────────────────── */
function _evtInfoCell(key, val) {
  return '<div style="padding:12px 16px;border-right:1px solid rgba(255,255,255,.07);border-bottom:1px solid rgba(255,255,255,.07)">' +
    '<div style="font-size:10px;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">' + key + '</div>' +
    '<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.8)">' + _ee(val) + '</div>' +
  '</div>';
}

function _evtBringItem(text) {
  return '<li style="display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,.65)">' +
    '<div style="width:6px;height:6px;border-radius:50%;background:#6366f1;flex-shrink:0"></div>' +
    text + '</li>';
}

/* ── Lookup form ─────────────────────────────────────────────────── */
function _lookupForm(eventId) {
  var iStyle = 'width:100%;padding:12px 16px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;font-size:15px;font-family:\'DM Sans\',sans-serif;outline:none;box-sizing:border-box;letter-spacing:.06em;-webkit-appearance:none;';
  return '<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:20px">' +
    '<h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 4px">Confirm Your Attendance</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.4);margin:0 0 18px;line-height:1.5">Enter your 10-digit Student ID to look up your record.</p>' +

    /* ID input */
    '<div style="margin-bottom:12px">' +
      '<label style="font-size:12px;font-weight:600;color:rgba(255,255,255,.5);display:block;margin-bottom:6px">Student ID</label>' +
      '<div style="display:flex;gap:8px">' +
        '<input id="evt-student-id-input" type="text" inputmode="numeric" placeholder="e.g. 2026000010" maxlength="10"' +
          ' style="' + iStyle + 'flex:1"' +
          ' oninput="this.value=this.value.replace(/[^0-9]/g,\'\')"' +
          ' onkeydown="if(event.key===\'Enter\') _evtLookup(\'' + eventId + '\')">' +
        '<button onclick="_evtLookup(\'' + eventId + '\')"' +
          ' style="padding:12px 18px;background:#34c75a;color:#0d1117;border:none;border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0">' +
          'Search' +
        '</button>' +
      '</div>' +
    '</div>' +

    '<div id="evt-lookup-error" style="display:none;font-size:13px;color:#f87171;padding:10px 14px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:8px;margin-bottom:12px;line-height:1.5"></div>' +
    '<div id="evt-student-confirm" style="display:none"></div>' +
  '</div>';
}

/* ── Sections ─────────────────────────────────────────────────────── */
var _SECTIONS = ['A','B','C','D','E','F','G','H'];

function _sectionSelect(current) {
  var style = 'width:100%;padding:11px 14px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;font-size:14px;font-family:\'DM Sans\',sans-serif;outline:none;box-sizing:border-box;-webkit-appearance:none;appearance:none;cursor:pointer;margin-top:6px';
  var opts  = '<option value="" style="background:#0d1117">-- Select your section --</option>';
  _SECTIONS.forEach(function(s) {
    opts += '<option value="' + s + '"' + (current === s ? ' selected' : '') + ' style="background:#0d1117">Section ' + s + '</option>';
  });
  return '<select id="evt-section-select" style="' + style + '">' + opts + '</select>';
}

/* ── Lookup student ──────────────────────────────────────────────── */
async function _evtLookup(eventId) {
  var input  = document.getElementById('evt-student-id-input');
  var errEl  = document.getElementById('evt-lookup-error');
  var confEl = document.getElementById('evt-student-confirm');
  if (!input) return;

  var studentId = input.value.trim();
  errEl.style.display = 'none';
  confEl.style.display = 'none';

  if (!studentId) {
    errEl.textContent   = 'Please enter your Student ID.';
    errEl.style.display = 'block';
    return;
  }
  if (!/^\d{10}$/.test(studentId)) {
    errEl.textContent   = 'Student ID must be exactly 10 digits (e.g. 2026000010).';
    errEl.style.display = 'block';
    return;
  }

  input.disabled = true;
  var btn = input.nextElementSibling;
  if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }

  try {
    var res  = await fetch('/api/events/lookup-student', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    });
    var data = await res.json();

    input.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Search'; }

    if (!res.ok || !data.found) {
      errEl.innerHTML =
        '<strong>' + _ee(data.message || 'Student ID not found.') + '</strong>' +
        '<br><span style="font-size:12px;opacity:.8;margin-top:4px;display:block">Contact your administrator if you believe this is an error.</span>';
      errEl.style.display = 'block';
      return;
    }

    /* ── Show student confirmation card ── */
    confEl.style.display = 'block';
    confEl.innerHTML =
      '<div style="margin-top:14px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:12px;padding:18px">' +

        /* Student found header */
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.08)">' +
          '<div style="width:38px;height:38px;border-radius:50%;background:rgba(99,102,241,.25);border:1px solid rgba(99,102,241,.4);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#a5b4fc;flex-shrink:0">' +
            _ee(data.studentName.charAt(0).toUpperCase()) +
          '</div>' +
          '<div>' +
            '<div style="font-size:15px;font-weight:700;color:#fff">' + _ee(data.studentName) + '</div>' +
            '<div style="font-size:12px;color:rgba(255,255,255,.45);font-family:\'DM Mono\',monospace">ID: ' + _ee(data.studentId) + '</div>' +
          '</div>' +
        '</div>' +

        /* Section dropdown */
        '<div style="margin-bottom:16px">' +
          '<label style="font-size:12px;font-weight:600;color:rgba(255,255,255,.5);display:block">Your Section</label>' +
          _sectionSelect(data.section || '') +
          '<div id="evt-section-error" style="display:none;font-size:12px;color:#f87171;margin-top:5px">Please select your section.</div>' +
        '</div>' +

        /* Action buttons */
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">' +
          '<button onclick="_evtSubmitAttend(\'' + eventId + '\',\'' + _ee(data.studentId) + '\')"' +
            ' style="padding:14px 10px;background:#34c75a;color:#0d1117;border:none;border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer">' +
            '✓ I will Attend' +
          '</button>' +
          '<button onclick="_evtShowExcuseForm()"' +
            ' style="padding:14px 10px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer">' +
            '✕ Cannot Attend' +
          '</button>' +
        '</div>' +

        '<button onclick="_evtReset(\'' + eventId + '\')"' +
          ' style="width:100%;padding:9px;background:transparent;color:rgba(255,255,255,.25);border:1px solid rgba(255,255,255,.08);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:12px;cursor:pointer">' +
          'Not you? Search again' +
        '</button>' +

        /* Excuse letter form */
        '<div id="evt-excuse-form" style="display:none;margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08)">' +
          '<div style="display:flex;align-items:center;gap:7px;margin-bottom:8px">' +
            '<div style="width:18px;height:18px;background:rgba(239,68,68,.2);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;color:#f87171;font-weight:700;flex-shrink:0">!</div>' +
            '<div style="font-size:12px;font-weight:700;color:#f87171">Excuse Letter Required</div>' +
          '</div>' +
          '<p style="font-size:12px;color:rgba(255,255,255,.45);margin:0 0 10px;line-height:1.6">Please write your reason for not attending. This will be recorded for the organizer.</p>' +
          '<textarea id="evt-excuse-text" placeholder="Write your reason here (e.g. medical appointment, family emergency...)" rows="4"' +
            ' style="width:100%;padding:11px 14px;background:rgba(255,255,255,.06);border:1.5px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;font-size:13px;font-family:\'DM Sans\',sans-serif;outline:none;box-sizing:border-box;resize:vertical;line-height:1.5"></textarea>' +
          '<div id="evt-excuse-error" style="display:none;font-size:12px;color:#f87171;margin-top:6px"></div>' +
          '<button id="evt-excuse-submit-btn" onclick="_evtSubmitCannotAttend(\'' + eventId + '\',\'' + _ee(data.studentId) + '\')"' +
            ' style="width:100%;margin-top:10px;padding:13px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);border-radius:10px;font-family:\'DM Sans\',sans-serif;font-size:13px;font-weight:700;cursor:pointer">' +
            'Submit Excuse Letter' +
          '</button>' +
        '</div>' +

      '</div>';

  } catch (err) {
    input.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
    errEl.textContent   = 'Connection error. Please try again.';
    errEl.style.display = 'block';
  }
}

function _evtShowExcuseForm() {
  var form = document.getElementById('evt-excuse-form');
  if (form) { form.style.display = 'block'; var ta = document.getElementById('evt-excuse-text'); if (ta) ta.focus(); }
}

function _evtValidateSection() {
  var sel = document.getElementById('evt-section-select');
  var err = document.getElementById('evt-section-error');
  if (!sel || !sel.value) {
    if (err) err.style.display = 'block';
    if (sel) sel.style.borderColor = 'rgba(239,68,68,.5)';
    return null;
  }
  if (err) err.style.display = 'none';
  if (sel) sel.style.borderColor = '';
  return sel.value;
}

async function _evtSubmitAttend(eventId, studentId) {
  var section = _evtValidateSection();
  if (!section) return;
  await _evtDoSubmit(eventId, studentId, 'attend', section, null);
}

async function _evtSubmitCannotAttend(eventId, studentId) {
  var section = _evtValidateSection();
  if (!section) return;

  var excuseText  = (document.getElementById('evt-excuse-text') || {}).value || '';
  var excuseErrEl = document.getElementById('evt-excuse-error');

  if (!excuseText.trim()) {
    if (excuseErrEl) { excuseErrEl.textContent = 'Please write your reason for not attending.'; excuseErrEl.style.display = 'block'; }
    return;
  }
  if (excuseErrEl) excuseErrEl.style.display = 'none';

  await _evtDoSubmit(eventId, studentId, 'cant_attend', section, excuseText.trim());
}

async function _evtDoSubmit(eventId, studentId, response, section, excuseLetter) {
  var formArea = document.getElementById('event-form-area');
  if (!formArea) return;

  formArea.innerHTML =
    '<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,.4)">' +
    '<div class="spinner" style="margin:0 auto 16px;border-top-color:#34c75a"></div>' +
    '<p style="font-size:13px">Submitting your response...</p></div>';

  try {
    var body = { eventId, studentId, section, response };
    if (excuseLetter) body.excuseLetter = excuseLetter;

    var res  = await fetch('/api/events/attend', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
  var fa = document.getElementById('event-form-area');
  if (fa) fa.innerHTML = _lookupForm(eventId);
}

/* ── Success screen ──────────────────────────────────────────────── */
function _evtSuccess(data, response) {
  var isAttend = response === 'attend';
  /* ── Confirmation card — matches student_qr_scan_page design ── */
  return '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:36px 20px 28px">' +

    /* Big checkmark / X circle */
    '<div style="width:72px;height:72px;border-radius:50%;background:' +
      (isAttend ? '#e1f5ee' : '#fde8e8') +
      ';display:flex;align-items:center;justify-content:center;margin:0 auto 20px">' +
      '<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:32px;height:32px">' +
        (isAttend
          ? '<path d="M5 14l7 7L23 7" stroke="#0F6E56" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
          : '<path d="M6 6l16 16M22 6L6 22" stroke="#993C1D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>') +
      '</svg>' +
    '</div>' +

    /* Title */
    '<div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:8px">' +
      (isAttend ? 'Attendance confirmed!' : 'Response recorded.') +
    '</div>' +

    /* Subtitle */
    '<div style="font-size:13px;color:rgba(255,255,255,.55);line-height:1.6;margin-bottom:24px;max-width:280px">' +
      (isAttend
        ? "You\'re all set. See you at the event. Don\'t forget what to bring!"
        : "Got it! We\'ve noted that you cannot attend. Thank you for letting us know.") +
    '</div>' +

    /* Event detail card */
    '<div style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:18px 20px;text-align:left">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div>' +
          '<div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:4px">' + _ee(data.eventTitle || '') + '</div>' +
          '<div style="font-size:12px;color:rgba(255,255,255,.4)">' + _ee(data.section ? 'Section ' + data.section : '') + '</div>' +
        '</div>' +
      '</div>' +
      (data.studentId ? '<div style="margin-top:14px;display:inline-block;font-size:12px;font-weight:600;color:#a5b4fc;background:rgba(99,102,241,.15);border:1px solid rgba(99,102,241,.25);padding:4px 14px;border-radius:20px">ID: ' + _ee(data.studentId) + '</div>' : '') +
      (!isAttend ? '<div style="margin-top:12px;padding:10px 12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.15);border-radius:8px;font-size:12px;color:rgba(255,255,255,.5)">Your excuse letter has been received and recorded.</div>' : '') +
    '</div>' +

  '</div>';
}

function _evtAlreadySubmitted(existingResponse) {
  var wasAttend = existingResponse === 'attend';
  return '<div style="text-align:center;padding:28px 0">' +
    '<div style="width:48px;height:48px;margin:0 auto 14px;border-radius:50%;background:rgba(245,158,11,.1);border:2px solid rgba(245,158,11,.3);display:flex;align-items:center;justify-content:center;color:#f59e0b;font-size:20px;font-weight:700">!</div>' +
    '<h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 8px">Already Submitted</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin:0;padding:0 8px">' +
      'You already responded as <strong style="color:' + (wasAttend ? '#34c75a' : '#f87171') + '">' + (wasAttend ? 'Attending' : 'Cannot Attend') + '</strong>.<br>You can only submit once per event.' +
    '</p>' +
  '</div>';
}


/* ── Attendance time-window helpers ───────────────────────────── */
function _isOutsideTimeWindow(evt) {
  if (!evt.attendanceStartTime || !evt.attendanceEndTime) return false;
  var nowPH = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  var sh = parseInt(evt.attendanceStartTime.split(':')[0], 10);
  var sm = parseInt(evt.attendanceStartTime.split(':')[1], 10);
  var eh = parseInt(evt.attendanceEndTime.split(':')[0], 10);
  var em = parseInt(evt.attendanceEndTime.split(':')[1], 10);
  var winStart = new Date(nowPH); winStart.setHours(sh, sm, 0, 0);
  var winEnd   = new Date(nowPH); winEnd.setHours(eh, em, 59, 999);
  return nowPH < winStart || nowPH > winEnd;
}

function _timeWindowMsg(evt) {
  var fmt = function(t) {
    if (!t) return t;
    var p = t.split(':'), h = parseInt(p[0], 10), m = p[1];
    return (h % 12 || 12) + ':' + m + ' ' + (h >= 12 ? 'PM' : 'AM');
  };
  return '<div style="text-align:center;padding:32px 20px">' +
    '<div style="font-size:40px;margin-bottom:14px">⏱</div>' +
    '<h3 style="font-size:17px;font-weight:700;color:#fff;margin:0 0 10px">Outside Attendance Window</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.55);line-height:1.7;margin:0 0 16px">' +
      'Attendance submissions are only accepted between<br>' +
      '<strong style="color:#4ade80">' + _ee(fmt(evt.attendanceStartTime)) + '</strong>' +
      ' and ' +
      '<strong style="color:#4ade80">' + _ee(fmt(evt.attendanceEndTime)) + '</strong>.' +
    '</p>' +
    '<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;font-size:12px;color:rgba(255,255,255,.4)">' +
      '🔒 Check back during the attendance window' +
    '</div>' +
  '</div>';
}

function _closedMsg() {
  return '<div style="text-align:center;padding:28px 0">' +
    '<div style="width:52px;height:52px;margin:0 auto 14px;border-radius:50%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.4);font-size:22px">🔒</div>' +
    '<h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 8px">Attendance Closed</h3>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin:0">This event is no longer accepting responses.</p>' +
  '</div>';
}

function _evtError(msg) {
  return '<div style="text-align:center;padding:40px 20px">' +
    '<div style="width:48px;height:48px;margin:0 auto 14px;border-radius:50%;background:rgba(239,68,68,.1);border:2px solid rgba(239,68,68,.2);display:flex;align-items:center;justify-content:center;color:#ef4444;font-size:22px">✕</div>' +
    '<p style="font-size:15px;font-weight:700;color:#fff;margin:0 0 8px">Something went wrong</p>' +
    '<p style="font-size:13px;color:rgba(255,255,255,.4);margin:0">' + _ee(msg) + '</p>' +
  '</div>';
}

function _ee(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}