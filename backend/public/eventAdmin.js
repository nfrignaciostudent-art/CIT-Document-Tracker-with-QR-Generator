/* ══════════════════════════════════════════════════════════════════════
   public/js/eventAdmin.js — Admin Event Management UI
   CIT Document Tracker - Group 6

   CHANGES:
     - Stats cards redesigned: no icons, matches the document stats style
       (label on top, large bold number, small sub-label below).
     - Create Event modal: fully injected at runtime so no stale HTML
       from index.html survives. Includes image upload with live preview.
     - No SVG icon helpers anywhere — clean text / label buttons only.
     - Student ID note removed from attendance (handled in event.js).
══════════════════════════════════════════════════════════════════════ */

let _adminEvents          = [];
let _currentEventQRData   = null;
let _createEventImageFile = null;

/* ── Colour gradients (card banners when no image) ─────────────── */
const EVENT_GRADIENTS = [
  'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
  'linear-gradient(135deg,#0ea5e9 0%,#6366f1 100%)',
  'linear-gradient(135deg,#10b981 0%,#0ea5e9 100%)',
  'linear-gradient(135deg,#f59e0b 0%,#ef4444 100%)',
  'linear-gradient(135deg,#ec4899 0%,#8b5cf6 100%)',
  'linear-gradient(135deg,#14b8a6 0%,#6366f1 100%)',
  'linear-gradient(135deg,#f97316 0%,#ec4899 100%)',
  'linear-gradient(135deg,#22c55e 0%,#0ea5e9 100%)',
];

/* ══════════════════════════════════════════════════════════════════
   LOAD & RENDER
══════════════════════════════════════════════════════════════════ */
async function loadAdminEvents() {
  var container = document.getElementById('events-list-container');
  var statsRow  = document.getElementById('events-stats-row');
  if (!container) return;

  container.innerHTML =
    '<div style="text-align:center;padding:60px 20px;color:var(--muted)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div>' +
    '<div style="font-size:13px">Loading events...</div></div>';

  var data = await apiGetAllEvents();

  if (!data || data._error) {
    container.innerHTML =
      '<div style="text-align:center;padding:60px 20px">' +
      '<div style="font-size:14px;color:#f87171;font-weight:600">Failed to load events</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-top:6px">' +
        _ea(data && data.message ? data.message : 'Server error') +
      '</div></div>';
    return;
  }

  _adminEvents = Array.isArray(data) ? data : [];

  /* ── Stats row — matches the document stats card style ── */
  if (statsRow) {
    var totalEvents  = _adminEvents.length;
    var totalAttend  = _adminEvents.reduce(function(s,e){ return s+(e.attendCount||0); }, 0);
    var totalCant    = _adminEvents.reduce(function(s,e){ return s+(e.cantAttendCount||0); }, 0);
    var activeEvents = _adminEvents.filter(function(e){ return e.isActive; }).length;

    statsRow.innerHTML =
      _statCard('TOTAL EVENTS',  totalEvents,  'var(--text)',  '') +
      _statCard('WILL ATTEND',   totalAttend,  '#22c55e',     '') +
      _statCard("CAN'T ATTEND",  totalCant,    '#ef4444',     '') +
      _statCard('ACTIVE NOW',    activeEvents, '#f59e0b',     '');
  }

  /* ── Empty state ── */
  if (_adminEvents.length === 0) {
    container.innerHTML =
      '<div style="text-align:center;padding:80px 20px">' +
      '<div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px">No events yet</div>' +
      '<div style="font-size:13px;color:var(--muted);margin-bottom:24px">Create your first event to generate a QR code for student attendance.</div>' +
      '<button class="btn btn-primary" onclick="openCreateEventModal()">+ Create First Event</button></div>';
    return;
  }

  /* ── Card grid ── */
  container.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;padding:20px">' +
    _adminEvents.map(function(evt,idx){ return _renderEventCard(evt,idx); }).join('') +
    '</div>';
}

/* ── Stat card — clean, no icons, matches document stats style ── */
function _statCard(label, value, valueColor, sub) {
  return '<div class="stat-card">' +
    '<div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:6px">' + label + '</div>' +
    '<div style="font-size:32px;font-weight:800;color:' + valueColor + ';line-height:1;margin-bottom:4px">' + value + '</div>' +
    (sub ? '<div style="font-size:12px;color:var(--muted)">' + sub + '</div>' : '') +
  '</div>';
}

/* ── Individual event card ────────────────────────────────────── */
function _renderEventCard(evt, idx) {
  var gradient = EVENT_GRADIENTS[idx % EVENT_GRADIENTS.length];
  var isActive = evt.isActive;
  var total    = (evt.attendCount||0) + (evt.cantAttendCount||0);
  var pct      = total > 0 ? Math.round((evt.attendCount/total)*100) : 0;

  var statusBadge = isActive
    ? '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#22c55e;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.25);padding:3px 10px;border-radius:20px">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span>Open</span>'
    : '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#ef4444;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);padding:3px 10px;border-radius:20px">' +
        '<span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block"></span>Closed</span>';

  var bannerInner = evt.hasImage
    ? '<div style="position:absolute;inset:0">' +
        '<img src="/api/events/public/' + _ea(evt.eventId) + '/image" alt="" ' +
          'style="width:100%;height:100%;object-fit:cover;display:block" ' +
          'onerror="this.parentElement.style.background=\'' + gradient + '\';this.remove()">' +
      '</div>'
    : '';

  var dateText = evt.date ? _ea(evt.date) + (evt.time ? ' · ' + _ea(evt.time) : '') : '';
  var locText  = evt.location ? _ea(evt.location) : '';

  return '<div class="event-card" onclick="openEventDetailModal(\'' + _ea(evt.eventId) + '\')"' +
    ' style="background:var(--white);border:1px solid var(--border);border-radius:16px;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 2px 8px rgba(0,0,0,.06)"' +
    ' onmouseover="this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'0 8px 24px rgba(0,0,0,.12)\'"' +
    ' onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.06)\'">' +

    '<div style="height:120px;background:' + gradient + ';position:relative;overflow:hidden">' +
      bannerInner +
      '<div style="position:absolute;top:10px;right:10px">' + statusBadge + '</div>' +
    '</div>' +

    '<div style="padding:16px">' +
      '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _ea(evt.title) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);font-family:\'DM Mono\',monospace;margin-bottom:10px">' + _ea(evt.eventId) + '</div>' +

      (dateText ? '<div style="font-size:12px;color:var(--muted);margin-bottom:3px">' + dateText + '</div>' : '') +
      (locText  ? '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + locText + '</div>' : '') +

      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
          '<span style="font-size:11px;color:#22c55e;font-weight:700">' + (evt.attendCount||0) + ' attending</span>' +
          '<span style="font-size:11px;color:#ef4444;font-weight:700">' + (evt.cantAttendCount||0) + ' can\'t</span>' +
        '</div>' +
        '<div style="height:4px;background:var(--border);border-radius:99px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:#22c55e;border-radius:99px"></div>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + total + ' response' + (total!==1?'s':'') + ' · ' + pct + '% attending</div>' +
      '</div>' +

      '<div style="display:flex;gap:6px;flex-wrap:wrap" onclick="event.stopPropagation()">' +
        '<button class="btn btn-sm btn-primary" style="flex:1;justify-content:center;font-size:11px" onclick="openEventDetailModal(\'' + _ea(evt.eventId) + '\')">View</button>' +
        '<button class="btn btn-sm btn-ghost" style="font-size:11px;padding:5px 10px" onclick="openEventQRModal(\'' + _ea(evt.eventId) + '\')" title="Show QR">QR</button>' +
        '<button class="btn btn-sm btn-ghost" style="font-size:11px;padding:5px 10px" onclick="toggleEventActive(\'' + _ea(evt.eventId) + '\')" title="' + (isActive?'Close':'Open') + ' attendance">' + (isActive?'Close':'Open') + '</button>' +
        '<button class="btn btn-sm" style="background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2);font-size:11px;padding:5px 10px" onclick="deleteAdminEvent(\'' + _ea(evt.eventId) + '\',\'' + _ea(evt.title) + '\')" title="Delete">Delete</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ══════════════════════════════════════════════════════════════════
   EVENT DETAIL MODAL
══════════════════════════════════════════════════════════════════ */
async function openEventDetailModal(eventId) {
  var titleEl   = document.getElementById('attendance-modal-title');
  var contentEl = document.getElementById('attendance-modal-content');
  var evt       = _adminEvents.find(function(e){ return e.eventId === eventId; });

  if (titleEl)   titleEl.textContent = evt ? evt.title : 'Event Details';
  if (contentEl) contentEl.innerHTML =
    '<div style="text-align:center;padding:60px 20px;color:var(--muted)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div>' +
    '<p style="font-size:13px">Loading attendance...</p></div>';

  openModal('event-attendance-modal');

  var data = await apiGetEventAttendance(eventId);

  if (!data || data._error) {
    contentEl.innerHTML =
      '<div style="text-align:center;padding:40px;color:#f87171">' +
      '<p style="font-weight:600">Failed to load attendance</p>' +
      '<p style="font-size:12px;color:var(--muted)">' + _ea(data && data.message ? data.message : '') + '</p></div>';
    return;
  }

  var idx      = _adminEvents.findIndex(function(e){ return e.eventId === eventId; });
  var gradient = EVENT_GRADIENTS[idx >= 0 ? idx % EVENT_GRADIENTS.length : 0];
  var isActive = data.event.isActive;
  var total    = data.summary.total;
  var pct      = total > 0 ? Math.round((data.summary.attending/total)*100) : 0;

  var headerHtml =
    '<div style="background:' + gradient + ';border-radius:12px;padding:24px;margin-bottom:20px;color:#fff">' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:2px;opacity:.7;text-transform:uppercase;margin-bottom:8px">Event Details</div>' +
      '<div style="font-size:20px;font-weight:800;margin-bottom:12px">' + _ea(data.event.title) + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:12px;opacity:.85">' +
        (data.event.date ? '<span>' + _ea(data.event.date) + (data.event.time ? ' · ' + _ea(data.event.time) : '') + '</span>' : '') +
        (data.event.location ? '<span>' + _ea(data.event.location) + '</span>' : '') +
        '<span>' + (isActive ? 'Open' : 'Closed') + '</span>' +
      '</div>' +
    '</div>';

  var summaryHtml =
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">' +
      '<div style="text-align:center;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:12px">' +
        '<div style="font-size:28px;font-weight:800;color:var(--text)">' + total + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px;font-weight:600">Total</div>' +
      '</div>' +
      '<div style="text-align:center;padding:16px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:12px">' +
        '<div style="font-size:28px;font-weight:800;color:#22c55e">' + data.summary.attending + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px;font-weight:600">Attending</div>' +
      '</div>' +
      '<div style="text-align:center;padding:16px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:12px">' +
        '<div style="font-size:28px;font-weight:800;color:#ef4444">' + data.summary.cantAttend + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px;font-weight:600">Not Attending</div>' +
      '</div>' +
    '</div>' +
    (total > 0 ?
      '<div style="margin-bottom:20px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:6px">' +
          '<span>Attendance rate</span>' +
          '<span style="font-weight:700;color:' + (pct>=50?'#22c55e':'#f59e0b') + '">' + pct + '%</span>' +
        '</div>' +
        '<div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#22c55e,#10b981);border-radius:99px"></div>' +
        '</div>' +
      '</div>'
    : '');

  var sectionHtml = _buildSectionBreakdown(data.records);

  var attendHtml =
    '<div style="margin-bottom:20px">' +
      '<div style="font-size:12px;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Attending (' + data.summary.attending + ')</div>' +
      (data.attending.length === 0
        ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">No students attending yet.</div>'
        : '<div style="display:flex;flex-direction:column;gap:8px">' + data.attending.map(function(r){ return _attendeeRow(r,'attend'); }).join('') + '</div>'
      ) +
    '</div>';

  var cantHtml =
    '<div style="margin-bottom:16px">' +
      '<div style="font-size:12px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Cannot Attend (' + data.summary.cantAttend + ')</div>' +
      (data.cantAttend.length === 0
        ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">No declines yet.</div>'
        : '<div style="display:flex;flex-direction:column;gap:8px">' + data.cantAttend.map(function(r){ return _attendeeRow(r,'cant_attend'); }).join('') + '</div>'
      ) +
    '</div>';

  var actionsHtml =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--border)">' +
      '<button class="btn btn-sm btn-ghost" onclick="openEventQRModal(\'' + _ea(eventId) + '\')">QR Code</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="toggleEventActive(\'' + _ea(eventId) + '\');closeModal(\'event-attendance-modal\')">' +
        (isActive ? 'Close Attendance' : 'Open Attendance') +
      '</button>' +
      '<button class="btn btn-sm" style="background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2)" ' +
        'onclick="deleteAdminEvent(\'' + _ea(eventId) + '\',\'' + _ea(data.event.title) + '\');closeModal(\'event-attendance-modal\')">' +
        'Delete Event' +
      '</button>' +
    '</div>';

  contentEl.innerHTML = headerHtml + summaryHtml + sectionHtml + attendHtml + cantHtml + actionsHtml;
  if (titleEl) titleEl.textContent = data.event.title;
}

function _attendeeRow(r, type) {
  var isAttend = type === 'attend';
  var bg     = isAttend ? 'rgba(34,197,94,.04)'  : 'rgba(239,68,68,.04)';
  var border = isAttend ? 'rgba(34,197,94,.15)'  : 'rgba(239,68,68,.15)';
  var dot    = isAttend ? '#22c55e' : '#ef4444';
  var initial = _ea((r.studentName||'S').charAt(0).toUpperCase());

  return '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:' + bg + ';border:1px solid ' + border + ';border-radius:10px">' +
    '<div style="width:32px;height:32px;border-radius:50%;background:' + dot + ';display:grid;place-items:center;flex-shrink:0;font-size:14px;color:#fff;font-weight:700">' + initial + '</div>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:13px;font-weight:600;color:var(--text)">' + _ea(r.studentName) + '</div>' +
      '<div style="font-size:11px;color:var(--muted)">ID: <span style="font-family:\'DM Mono\',monospace">' + _ea(r.studentId||'—') + '</span>' + (r.section ? ' · Section: <strong>' + _ea(r.section) + '</strong>' : '') + '</div>' +
    '</div>' +
    '<div style="font-size:10px;color:var(--muted);white-space:nowrap">' + _ea((r.displayDate||'').split(' ').slice(0,2).join(' ')) + '</div>' +
  '</div>';
}

function _buildSectionBreakdown(records) {
  if (!records || records.length === 0) return '';
  var sections = {};
  records.forEach(function(r) {
    var sec = r.section || 'Unknown';
    if (!sections[sec]) sections[sec] = { attend: 0, cant: 0 };
    if (r.response === 'attend') sections[sec].attend++;
    else sections[sec].cant++;
  });
  var keys = Object.keys(sections).sort();
  if (keys.length <= 1 && keys[0] === 'Unknown') return '';

  var cards = keys.map(function(sec) {
    var attend = sections[sec].attend;
    var cant   = sections[sec].cant;
    var total  = attend + cant;
    var pct    = total > 0 ? Math.round((attend/total)*100) : 0;
    return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text)">Section ' + _ea(sec) + '</div>' +
        '<div style="font-size:11px;color:var(--muted)">' + total + ' resp.</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:6px">' +
        '<span style="font-size:12px;color:#22c55e;font-weight:600">' + attend + ' attending</span>' +
        '<span style="font-size:12px;color:#ef4444;font-weight:600">' + cant + ' can\'t</span>' +
      '</div>' +
      '<div style="height:4px;background:var(--border);border-radius:99px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:#22c55e;border-radius:99px"></div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--muted);margin-top:4px">' + pct + '% attending</div>' +
    '</div>';
  }).join('');

  return '<div style="margin-bottom:20px">' +
    '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">By Section</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px">' + cards + '</div>' +
  '</div>';
}

/* ══════════════════════════════════════════════════════════════════
   CREATE EVENT MODAL
   Fully injects into the modal body — no reliance on hardcoded HTML
   in index.html (that's why the redesign never showed before).
══════════════════════════════════════════════════════════════════ */
function openCreateEventModal() {
  _createEventImageFile = null;

  /* Replace the entire modal body including footer buttons */
  var modalBody = document.querySelector('#create-event-modal .modal-body');
  if (modalBody) {
    modalBody.innerHTML = _buildCreateEventForm();
  } else {
    /* Fallback: try the create-event-body id */
    var bodyEl = document.getElementById('create-event-body');
    if (bodyEl) bodyEl.innerHTML = _buildCreateEventForm();
  }

  openModal('create-event-modal');
}

function _buildCreateEventForm() {
  var today = new Date().toISOString().slice(0, 10);
  var inp   = 'width:100%;box-sizing:border-box;background:var(--bg);border:1.5px solid var(--border);border-radius:10px;padding:11px 14px;color:var(--text);font-size:14px;font-family:\'DM Sans\',sans-serif;outline:none;transition:border-color .15s';
  var lbl   = 'display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:6px';

  return '<div style="display:flex;flex-direction:column;gap:16px;padding:24px">' +

    /* Title */
    '<div>' +
      '<label style="' + lbl + '">Event Title <span style="color:#ef4444">*</span></label>' +
      '<input id="evt-title" type="text" placeholder="e.g. CIT Foundation Day" maxlength="100"' +
        ' style="' + inp + '"' +
        ' onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'">' +
    '</div>' +

    /* Description */
    '<div>' +
      '<label style="' + lbl + '">Description</label>' +
      '<textarea id="evt-desc" placeholder="Brief description of the event..." rows="3" maxlength="500"' +
        ' style="' + inp + ';resize:vertical"' +
        ' onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'"></textarea>' +
    '</div>' +

    /* Date + Time */
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div>' +
        '<label style="' + lbl + '">Date <span style="color:#ef4444">*</span></label>' +
        '<input id="evt-date" type="date" value="' + today + '"' +
          ' style="' + inp + '"' +
          ' onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'">' +
      '</div>' +
      '<div>' +
        '<label style="' + lbl + '">Time</label>' +
        '<input id="evt-time" type="text" placeholder="e.g. 9:00 AM"' +
          ' style="' + inp + '"' +
          ' onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'">' +
      '</div>' +
    '</div>' +

    /* Location */
    '<div>' +
      '<label style="' + lbl + '">Location</label>' +
      '<input id="evt-location" type="text" placeholder="e.g. CIT Gym, Room 201"' +
        ' style="' + inp + '"' +
        ' onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'">' +
    '</div>' +

    /* Organizer */
    '<div>' +
      '<label style="' + lbl + '">Organizer</label>' +
      '<input id="evt-organizer" type="text" placeholder="e.g. SSG, CIT Admin"' +
        ' style="' + inp + '"' +
        ' onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'">' +
    '</div>' +

    /* Image upload */
    '<div>' +
      '<label style="' + lbl + '">Event Image <span style="font-weight:400;font-size:11px">(optional · JPG / PNG / WEBP · max 5 MB)</span></label>' +
      '<label for="evt-image-input" id="evt-image-dropzone"' +
        ' style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:18px;background:var(--bg);border:1.5px dashed var(--border);border-radius:10px;cursor:pointer;text-align:center;transition:border-color .15s"' +
        ' onmouseover="this.style.borderColor=\'#6366f1\'" onmouseout="this.style.borderColor=\'\'">' +
        '<span style="font-size:22px">🖼</span>' +
        '<span style="font-size:13px;color:var(--muted)">Click to upload an event image</span>' +
        '<div id="evt-image-preview" style="display:none;margin-top:6px"></div>' +
      '</label>' +
      '<input id="evt-image-input" type="file" accept="image/*" style="display:none" onchange="handleEventImageSelect(this)">' +
    '</div>' +

    /* Error */
    '<div id="create-event-error" style="display:none;font-size:13px;color:#f87171;padding:10px 14px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:8px"></div>' +

    /* Footer buttons */
    '<div style="display:flex;gap:10px;justify-content:flex-end;padding-top:4px">' +
      '<button class="btn btn-ghost" onclick="closeModal(\'create-event-modal\')">Cancel</button>' +
      '<button class="btn btn-primary" id="create-event-btn" onclick="submitCreateEvent()">Create &amp; Generate QR</button>' +
    '</div>' +

  '</div>';
}

/* ── Image file selection ─────────────────────────────────────── */
function handleEventImageSelect(input) {
  var file = input.files && input.files[0];
  if (!file) { _createEventImageFile = null; _updateImagePreview(null); return; }

  if (file.size > 5 * 1024 * 1024) {
    if (typeof toast === 'function') toast('Image must be under 5 MB.');
    input.value = '';
    _createEventImageFile = null;
    _updateImagePreview(null);
    return;
  }

  _createEventImageFile = file;
  var reader = new FileReader();
  reader.onload = function(e) { _updateImagePreview(e.target.result); };
  reader.readAsDataURL(file);
}

function _updateImagePreview(dataUrl) {
  var previewEl = document.getElementById('evt-image-preview');
  var dropzone  = document.getElementById('evt-image-dropzone');
  if (!previewEl) return;

  if (dataUrl) {
    previewEl.style.display = 'block';
    previewEl.innerHTML =
      '<img src="' + dataUrl + '" alt="Preview" style="max-height:110px;max-width:100%;border-radius:8px;object-fit:contain;border:1px solid var(--border)">' +
      '<div style="font-size:11px;color:var(--muted);margin-top:4px">' + (_createEventImageFile ? _ea(_createEventImageFile.name) : '') + '</div>' +
      '<button type="button" onclick="clearEventImage()" style="margin-top:4px;font-size:11px;color:#ef4444;background:none;border:none;cursor:pointer;font-family:\'DM Sans\',sans-serif">Remove</button>';
    if (dropzone) dropzone.style.borderStyle = 'solid';
  } else {
    previewEl.style.display = 'none';
    previewEl.innerHTML = '';
    if (dropzone) dropzone.style.borderStyle = 'dashed';
  }
}

function clearEventImage() {
  _createEventImageFile = null;
  var input = document.getElementById('evt-image-input');
  if (input) input.value = '';
  _updateImagePreview(null);
}

/* ── Submit create event ──────────────────────────────────────── */
async function submitCreateEvent() {
  var title     = ((document.getElementById('evt-title')    ||{}).value||'').trim();
  var desc      = ((document.getElementById('evt-desc')     ||{}).value||'').trim();
  var date      = ((document.getElementById('evt-date')     ||{}).value||'').trim();
  var time      = ((document.getElementById('evt-time')     ||{}).value||'').trim();
  var location  = ((document.getElementById('evt-location') ||{}).value||'').trim();
  var organizer = ((document.getElementById('evt-organizer')||{}).value||'').trim();
  var errEl     = document.getElementById('create-event-error');
  var btn       = document.getElementById('create-event-btn');

  if (!title) { errEl.textContent = 'Event title is required.'; errEl.style.display = 'block'; return; }
  if (!date)  { errEl.textContent = 'Event date is required.';  errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  btn.disabled    = true;
  btn.textContent = 'Creating...';

  var result = await apiCreateEvent(
    { title, description: desc, date, time, location, organizer },
    _createEventImageFile || null
  );

  if (!result || result._error) {
    errEl.textContent  = (result && result.message) ? result.message : 'Failed to create event. Try again.';
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.textContent     = 'Create & Generate QR';
    return;
  }

  _createEventImageFile = null;
  closeModal('create-event-modal');
  if (typeof toast === 'function') toast('Event created successfully.');

  await loadAdminEvents();

  _currentEventQRData = {
    title:    result.event.title,
    qrCode:   result.event.qrCode,
    eventUrl: result.event.eventUrl,
    eventId:  result.event.eventId,
  };
  _showEventQRModal();
}

/* ══════════════════════════════════════════════════════════════════
   EVENT QR MODAL
══════════════════════════════════════════════════════════════════ */
function openEventQRModal(eventId) {
  var evt = _adminEvents.find(function(e){ return e.eventId === eventId; });
  if (!evt) return;

  var baseUrl  = window.location.origin + window.location.pathname.replace(/\/+$/, '');
  var eventUrl = baseUrl + '?event=' + evt.eventId;

  _currentEventQRData = { title: evt.title, qrCode: evt.qrCode, eventUrl: eventUrl, eventId: evt.eventId };
  _showEventQRModal();
}

function _showEventQRModal() {
  if (!_currentEventQRData) return;

  var titleEl = document.getElementById('event-qr-title');
  var imgWrap = document.getElementById('event-qr-img-wrap');
  var urlEl   = document.getElementById('event-qr-url-display');

  if (titleEl) titleEl.textContent = _currentEventQRData.title;

  if (imgWrap) {
    if (_currentEventQRData.qrCode) {
      imgWrap.innerHTML = '<img src="' + _currentEventQRData.qrCode + '" alt="Event QR" style="width:220px;height:220px;border-radius:12px;border:6px solid #fff;box-shadow:0 4px 20px rgba(0,0,0,.15)">';
    } else {
      imgWrap.innerHTML = '';
      var target = document.createElement('div');
      imgWrap.appendChild(target);
      if (typeof QRCode !== 'undefined') {
        new QRCode(target, { text: _currentEventQRData.eventUrl, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
      }
    }
  }

  if (urlEl) urlEl.innerHTML = '<span style="font-size:11px;color:var(--muted);word-break:break-all">' + _ea(_currentEventQRData.eventUrl) + '</span>';

  openModal('event-qr-modal');
}

function downloadEventQR() {
  if (!_currentEventQRData || !_currentEventQRData.qrCode) {
    if (typeof toast === 'function') toast('No QR to download.');
    return;
  }
  var a    = document.createElement('a');
  a.href   = _currentEventQRData.qrCode;
  a.download = 'QR-' + (_currentEventQRData.title||'event').replace(/\s+/g,'_') + '.png';
  a.click();
}

/* ══════════════════════════════════════════════════════════════════
   TOGGLE / DELETE
══════════════════════════════════════════════════════════════════ */
async function toggleEventActive(eventId) {
  var evt = _adminEvents.find(function(e){ return e.eventId === eventId; });
  if (!evt) return;

  var action = evt.isActive ? 'close' : 'reopen';
  if (!confirm('Are you sure you want to ' + action + ' attendance for "' + evt.title + '"?')) return;

  var result = await apiToggleEvent(eventId);
  if (!result || result._error) { if (typeof toast==='function') toast('Failed to update event.'); return; }
  if (typeof toast==='function') toast(result.message||'Event updated.');
  await loadAdminEvents();
}

async function deleteAdminEvent(eventId, title) {
  if (!confirm('Delete event "' + title + '"?\n\nThis will also delete ALL attendance records. Cannot be undone.')) return;

  var result = await apiDeleteEvent(eventId);
  if (!result || result._error) { if (typeof toast==='function') toast('Failed to delete event.'); return; }
  if (typeof toast==='function') toast('Event deleted.');
  await loadAdminEvents();
}

/* ══════════════════════════════════════════════════════════════════
   HOOK INTO showPage
══════════════════════════════════════════════════════════════════ */
(function patchShowPage() {
  function _wrap(orig) {
    window.showPage = function(page, btn) {
      orig(page, btn);
      if (page === 'events') loadAdminEvents();
    };
  }
  if (typeof window.showPage === 'function') {
    _wrap(window.showPage);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof window.showPage === 'function') _wrap(window.showPage);
    });
  }
})();

/* ── HTML escape ─────────────────────────────────────────────── */
function _ea(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}