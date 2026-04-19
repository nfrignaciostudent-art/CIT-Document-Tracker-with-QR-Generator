/* ══════════════════════════════════════════════════════════════════════
   eventAdmin.js — Admin Event Management UI
   CIT Document Tracker - Group 6

   Features:
     - Modern card-based event display with gradient banners
     - Per-event attendance (each event has its own isolated records)
     - Detailed event view modal: attendees, non-attendees, time, location
     - Create, toggle, delete events
     - QR code download
══════════════════════════════════════════════════════════════════════ */

/* ── State ─────────────────────────────────────────────────────────── */
let _adminEvents        = [];
let _currentEventQRData = null;

/* ── Gradient palettes for event card banners (cycles) ─────────────── */
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

const EVENT_ICONS = ['📅','🎓','🏆','📢','🎉','🔔','📝','🎤'];

/* ══════════════════════════════════════════════════════════════════
   LOAD & RENDER EVENTS AS CARDS
══════════════════════════════════════════════════════════════════ */
async function loadAdminEvents() {
  const container = document.getElementById('events-list-container');
  const statsRow  = document.getElementById('events-stats-row');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;padding:60px 20px;color:var(--muted)">
      <div class="spinner" style="margin:0 auto 16px"></div>
      <div style="font-size:13px">Loading events...</div>
    </div>`;

  const data = await apiGetAllEvents();

  if (!data || data._error) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:36px;margin-bottom:12px">⚠️</div>
        <div style="font-size:14px;color:#f87171;font-weight:600">Failed to load events</div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px">${_esc(data && data.message ? data.message : 'Server error')}</div>
      </div>`;
    return;
  }

  _adminEvents = Array.isArray(data) ? data : [];

  /* ── Stats row ── */
  if (statsRow) {
    var totalEvents  = _adminEvents.length;
    var totalAttend  = _adminEvents.reduce(function(s,e){ return s + (e.attendCount||0); }, 0);
    var totalCant    = _adminEvents.reduce(function(s,e){ return s + (e.cantAttendCount||0); }, 0);
    var activeEvents = _adminEvents.filter(function(e){ return e.isActive; }).length;
    statsRow.innerHTML =
      _statCard('Total Events',  totalEvents,  '#6366f1', '📅') +
      _statCard('Will Attend',   totalAttend,  '#22c55e', '✅') +
      _statCard("Can't Attend",  totalCant,    '#ef4444', '❌') +
      _statCard('Active Now',    activeEvents, '#f59e0b', '🟢');
  }

  /* ── Empty state ── */
  if (_adminEvents.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:80px 20px">
        <div style="font-size:56px;margin-bottom:16px">📅</div>
        <div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px">No events yet</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:24px">
          Create your first event to generate a QR code for student attendance.
        </div>
        <button class="btn btn-primary" onclick="openCreateEventModal()">+ Create First Event</button>
      </div>`;
    return;
  }

  /* ── Card grid ── */
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;padding:20px">
      ${_adminEvents.map(function(evt, idx){ return _renderEventCard(evt, idx); }).join('')}
    </div>`;
}

/* ── Stat card helper ─────────────────────────────────────────────── */
function _statCard(label, value, color, icon) {
  return `
    <div class="stat-card" style="display:flex;align-items:center;gap:14px">
      <div style="font-size:28px">${icon}</div>
      <div>
        <div class="stat-value" style="color:${color}">${value}</div>
        <div class="stat-label">${label}</div>
      </div>
    </div>`;
}

/* ── Individual event card ────────────────────────────────────────── */
function _renderEventCard(evt, idx) {
  var gradient = EVENT_GRADIENTS[idx % EVENT_GRADIENTS.length];
  var icon     = EVENT_ICONS[idx % EVENT_ICONS.length];
  var isActive = evt.isActive;
  var total    = (evt.attendCount || 0) + (evt.cantAttendCount || 0);
  var pct      = total > 0 ? Math.round((evt.attendCount / total) * 100) : 0;

  var statusDot = isActive
    ? '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#22c55e;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.25);padding:3px 10px;border-radius:20px"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span>Open</span>'
    : '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#ef4444;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);padding:3px 10px;border-radius:20px"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block"></span>Closed</span>';

  var dateRow = evt.date
    ? '<div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>' + _esc(evt.date) + (evt.time ? ' · ' + _esc(evt.time) : '') + '</span></div>'
    : '';

  var locRow = evt.location
    ? '<div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">' + _esc(evt.location) + '</span></div>'
    : '';

  return '<div class="event-card" onclick="openEventDetailModal(\'' + _esc(evt.eventId) + '\')"' +
    ' style="background:var(--white);border:1px solid var(--border);border-radius:16px;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 2px 8px rgba(0,0,0,.06)"' +
    ' onmouseover="this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'0 8px 24px rgba(0,0,0,.12)\'"' +
    ' onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.06)\'">' +

    /* Banner */
    '<div style="height:110px;background:' + gradient + ';display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">' +
      '<div style="font-size:52px;opacity:.9;filter:drop-shadow(0 2px 8px rgba(0,0,0,.3))">' + icon + '</div>' +
      '<div style="position:absolute;top:10px;right:10px">' + statusDot + '</div>' +
      '<div style="position:absolute;bottom:-20px;left:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.08)"></div>' +
      '<div style="position:absolute;top:-10px;right:60px;width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,.06)"></div>' +
    '</div>' +

    /* Content */
    '<div style="padding:18px">' +
      '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + _esc(evt.title) + '">' + _esc(evt.title) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);font-family:\'DM Mono\',monospace;margin-bottom:12px">' + _esc(evt.eventId) + '</div>' +

      '<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:14px">' + dateRow + locRow + '</div>' +

      /* Attendance bar */
      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:5px">' +
          '<span style="font-size:11px;color:#22c55e;font-weight:700">✅ ' + (evt.attendCount||0) + ' attending</span>' +
          '<span style="font-size:11px;color:#ef4444;font-weight:700">❌ ' + (evt.cantAttendCount||0) + " can't</span>" +
        '</div>' +
        '<div style="height:5px;background:var(--border);border-radius:99px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:#22c55e;border-radius:99px"></div>' +
        '</div>' +
        '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + total + ' total response' + (total !== 1 ? 's' : '') + ' · ' + pct + '% attending</div>' +
      '</div>' +

      /* Action buttons */
      '<div style="display:flex;gap:6px;flex-wrap:wrap" onclick="event.stopPropagation()">' +
        '<button class="btn btn-sm btn-primary" style="flex:1;justify-content:center;font-size:11px" onclick="openEventDetailModal(\'' + _esc(evt.eventId) + '\')">👁 View Details</button>' +
        '<button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="openEventQRModal(\'' + _esc(evt.eventId) + '\')" title="Show QR Code">📷</button>' +
        '<button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="toggleEventActive(\'' + _esc(evt.eventId) + '\')" title="' + (isActive ? 'Close' : 'Open') + ' attendance">' + (isActive ? '🔒' : '🔓') + '</button>' +
        '<button class="btn btn-sm" style="background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2);font-size:11px" onclick="deleteAdminEvent(\'' + _esc(evt.eventId) + '\',\'' + _esc(evt.title) + '\')" title="Delete">🗑️</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ══════════════════════════════════════════════════════════════════
   EVENT DETAIL MODAL — per-event attendance ONLY
   Fetches and displays data isolated to the clicked event.
   Attendance records from other events are never mixed in.
══════════════════════════════════════════════════════════════════ */
async function openEventDetailModal(eventId) {
  var titleEl   = document.getElementById('attendance-modal-title');
  var contentEl = document.getElementById('attendance-modal-content');
  var evt       = _adminEvents.find(function(e){ return e.eventId === eventId; });

  if (titleEl)   titleEl.textContent = evt ? evt.title : 'Event Details';
  if (contentEl) contentEl.innerHTML =
    '<div style="text-align:center;padding:60px 20px;color:var(--muted)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div>' +
    '<p style="font-size:13px">Loading attendance for this event...</p></div>';

  openModal('event-attendance-modal');

  /* ── Fetch attendance for THIS event only (filtered by eventId on backend) ── */
  var data = await apiGetEventAttendance(eventId);

  if (!data || data._error) {
    contentEl.innerHTML =
      '<div style="text-align:center;padding:40px;color:#f87171">' +
      '<div style="font-size:32px;margin-bottom:12px">⚠️</div>' +
      '<p style="font-weight:600">Failed to load attendance</p>' +
      '<p style="font-size:12px;color:var(--muted)">' + _esc(data && data.message ? data.message : '') + '</p></div>';
    return;
  }

  var idx      = _adminEvents.findIndex(function(e){ return e.eventId === eventId; });
  var gradient = EVENT_GRADIENTS[idx >= 0 ? idx % EVENT_GRADIENTS.length : 0];
  var icon     = EVENT_ICONS[idx >= 0 ? idx % EVENT_ICONS.length : 0];
  var isActive = data.event.isActive;
  var total    = data.summary.total;
  var pct      = total > 0 ? Math.round((data.summary.attending / total) * 100) : 0;

  /* ── Event info header ── */
  var headerHtml =
    '<div style="background:' + gradient + ';border-radius:12px;padding:24px;margin-bottom:20px;color:#fff;position:relative;overflow:hidden">' +
      '<div style="position:absolute;top:-20px;right:-20px;font-size:80px;opacity:.15">' + icon + '</div>' +
      '<div style="font-size:11px;font-weight:700;letter-spacing:2px;opacity:.7;text-transform:uppercase;margin-bottom:8px">Event Details</div>' +
      '<div style="font-size:20px;font-weight:800;margin-bottom:12px">' + _esc(data.event.title) + '</div>' +
      '<div style="display:flex;flex-wrap:wrap;gap:16px;font-size:12px;opacity:.85">' +
        (data.event.date ? '<span>📅 ' + _esc(data.event.date) + (data.event.time ? ' · ' + _esc(data.event.time) : '') + '</span>' : '') +
        (data.event.location ? '<span>📍 ' + _esc(data.event.location) + '</span>' : '') +
        '<span>' + (isActive ? '🟢 Open' : '🔴 Closed') + '</span>' +
      '</div>' +
    '</div>';

  /* ── Summary cards ── */
  var summaryHtml =
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">' +
      '<div style="text-align:center;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:12px">' +
        '<div style="font-size:28px;font-weight:800;color:var(--text)">' + total + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px;font-weight:600">Total Responses</div>' +
      '</div>' +
      '<div style="text-align:center;padding:16px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:12px">' +
        '<div style="font-size:28px;font-weight:800;color:#22c55e">' + data.summary.attending + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px;font-weight:600">✅ Will Attend</div>' +
      '</div>' +
      '<div style="text-align:center;padding:16px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:12px">' +
        '<div style="font-size:28px;font-weight:800;color:#ef4444">' + data.summary.cantAttend + '</div>' +
        '<div style="font-size:11px;color:var(--muted);margin-top:3px;font-weight:600">❌ Can\'t Attend</div>' +
      '</div>' +
    '</div>' +
    (total > 0 ?
      '<div style="margin-bottom:20px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:6px">' +
          '<span>Attendance rate</span>' +
          '<span style="font-weight:700;color:' + (pct >= 50 ? '#22c55e' : '#f59e0b') + '">' + pct + '%</span>' +
        '</div>' +
        '<div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#22c55e,#10b981);border-radius:99px"></div>' +
        '</div>' +
      '</div>'
    : '');

  /* ── Section breakdown ── */
  var sectionHtml = _buildSectionBreakdown(data.records);

  /* ── Attending list ── */
  var attendHtml =
    '<div style="margin-bottom:20px">' +
      '<div style="font-size:12px;font-weight:700;color:#22c55e;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;display:flex;align-items:center;gap:8px">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:#22c55e;display:inline-block"></span>' +
        'Attending (' + data.summary.attending + ')' +
      '</div>' +
      (data.attending.length === 0
        ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">No students attending yet.</div>'
        : '<div style="display:flex;flex-direction:column;gap:8px">' + data.attending.map(function(r){ return _renderAttendeeRow(r, 'attend'); }).join('') + '</div>'
      ) +
    '</div>';

  /* ── Can't attend list ── */
  var cantHtml =
    '<div style="margin-bottom:16px">' +
      '<div style="font-size:12px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;display:flex;align-items:center;gap:8px">' +
        '<span style="width:8px;height:8px;border-radius:50%;background:#ef4444;display:inline-block"></span>' +
        "Can't Attend (" + data.summary.cantAttend + ')' +
      '</div>' +
      (data.cantAttend.length === 0
        ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">No students declined yet.</div>'
        : '<div style="display:flex;flex-direction:column;gap:8px">' + data.cantAttend.map(function(r){ return _renderAttendeeRow(r, 'cant_attend'); }).join('') + '</div>'
      ) +
    '</div>';

  /* ── Action bar ── */
  var actionsHtml =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:16px;border-top:1px solid var(--border)">' +
      '<button class="btn btn-sm btn-ghost" onclick="openEventQRModal(\'' + _esc(eventId) + '\')">📷 Show QR</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="toggleEventActive(\'' + _esc(eventId) + '\');closeModal(\'event-attendance-modal\')">' +
        (isActive ? '🔒 Close Attendance' : '🔓 Open Attendance') +
      '</button>' +
      '<button class="btn btn-sm" style="background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2)" ' +
        'onclick="deleteAdminEvent(\'' + _esc(eventId) + '\',\'' + _esc(data.event.title) + '\');closeModal(\'event-attendance-modal\')">🗑️ Delete</button>' +
    '</div>';

  contentEl.innerHTML = headerHtml + summaryHtml + sectionHtml + attendHtml + cantHtml + actionsHtml;
  if (titleEl) titleEl.textContent = data.event.title;
}

/* ── Single attendee row ─────────────────────────────────────────── */
function _renderAttendeeRow(r, type) {
  var isAttend = type === 'attend';
  var bg       = isAttend ? 'rgba(34,197,94,.04)' : 'rgba(239,68,68,.04)';
  var border   = isAttend ? 'rgba(34,197,94,.15)'  : 'rgba(239,68,68,.15)';
  var dot      = isAttend ? '#22c55e' : '#ef4444';
  var initial  = _esc((r.studentName || 'S').charAt(0).toUpperCase());

  return '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:' + bg + ';border:1px solid ' + border + ';border-radius:10px">' +
    '<div style="width:32px;height:32px;border-radius:50%;background:' + dot + ';display:grid;place-items:center;flex-shrink:0;font-size:14px;color:#fff;font-weight:700">' + initial + '</div>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:13px;font-weight:600;color:var(--text)">' + _esc(r.studentName) + '</div>' +
      '<div style="font-size:11px;color:var(--muted)">ID: <span style="font-family:\'DM Mono\',monospace">' + _esc(r.studentId) + '</span>' + (r.section ? ' · Section: <strong>' + _esc(r.section) + '</strong>' : '') + '</div>' +
    '</div>' +
    '<div style="font-size:10px;color:var(--muted);white-space:nowrap;text-align:right">' + _esc((r.displayDate || '').split(' ').slice(0,2).join(' ')) + '</div>' +
  '</div>';
}

/* ── Section breakdown ───────────────────────────────────────────── */
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
    var pct    = total > 0 ? Math.round((attend / total) * 100) : 0;
    return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text)">Section ' + _esc(sec) + '</div>' +
        '<div style="font-size:11px;color:var(--muted)">' + total + ' response' + (total !== 1 ? 's' : '') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:8px">' +
        '<span style="font-size:12px;color:#22c55e;font-weight:600">✅ ' + attend + '</span>' +
        '<span style="font-size:12px;color:#ef4444;font-weight:600">❌ ' + cant + '</span>' +
      '</div>' +
      '<div style="height:5px;background:var(--border);border-radius:99px;overflow:hidden">' +
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
══════════════════════════════════════════════════════════════════ */
function openCreateEventModal() {
  ['evt-title','evt-desc','evt-time','evt-location','evt-organizer'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var dateEl = document.getElementById('evt-date');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

  var errEl = document.getElementById('create-event-error');
  if (errEl) errEl.style.display = 'none';

  var btn = document.getElementById('create-event-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Create & Generate QR'; }

  openModal('create-event-modal');
}

async function submitCreateEvent() {
  var title     = (document.getElementById('evt-title')    || {}).value;
  var desc      = (document.getElementById('evt-desc')     || {}).value;
  var date      = (document.getElementById('evt-date')     || {}).value;
  var time      = (document.getElementById('evt-time')     || {}).value;
  var location  = (document.getElementById('evt-location') || {}).value;
  var organizer = (document.getElementById('evt-organizer')|| {}).value;
  var errEl     = document.getElementById('create-event-error');
  var btn       = document.getElementById('create-event-btn');

  title    = (title    || '').trim();
  date     = (date     || '').trim();

  if (!title) {
    errEl.textContent = 'Event title is required.';
    errEl.style.display = 'block';
    return;
  }
  if (!date) {
    errEl.textContent = 'Event date is required.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  btn.disabled    = true;
  btn.textContent = 'Creating...';

  var result = await apiCreateEvent({
    title,
    description: (desc     || '').trim(),
    date,
    time:        (time     || '').trim(),
    location:    (location || '').trim(),
    organizer:   (organizer|| '').trim(),
  });

  if (!result || result._error) {
    errEl.textContent = (result && result.message) ? result.message : 'Failed to create event. Try again.';
    errEl.style.display = 'block';
    btn.disabled    = false;
    btn.textContent = 'Create & Generate QR';
    return;
  }

  closeModal('create-event-modal');
  if (typeof toast === 'function') toast('Event created! 🎉');

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

  var baseUrl  = window.location.origin + window.location.pathname;
  var eventUrl = baseUrl + '?event=' + evt.eventId;

  _currentEventQRData = {
    title:    evt.title,
    qrCode:   evt.qrCode,
    eventUrl: eventUrl,
    eventId:  evt.eventId,
  };
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

  if (urlEl) urlEl.innerHTML = '<span style="font-size:11px;color:var(--muted);word-break:break-all">' + _esc(_currentEventQRData.eventUrl) + '</span>';

  openModal('event-qr-modal');
}

function downloadEventQR() {
  if (!_currentEventQRData || !_currentEventQRData.qrCode) {
    if (typeof toast === 'function') toast('No QR to download.');
    return;
  }
  var a    = document.createElement('a');
  a.href   = _currentEventQRData.qrCode;
  a.download = 'QR-' + (_currentEventQRData.title || 'event').replace(/\s+/g,'_') + '.png';
  a.click();
}

/* ══════════════════════════════════════════════════════════════════
   TOGGLE OPEN / CLOSED
══════════════════════════════════════════════════════════════════ */
async function toggleEventActive(eventId) {
  var evt = _adminEvents.find(function(e){ return e.eventId === eventId; });
  if (!evt) return;

  var action = evt.isActive ? 'close' : 'reopen';
  if (!confirm('Are you sure you want to ' + action + ' attendance for "' + evt.title + '"?')) return;

  var result = await apiToggleEvent(eventId);
  if (!result || result._error) {
    if (typeof toast === 'function') toast('Failed to update event status.');
    return;
  }
  if (typeof toast === 'function') toast(result.message || 'Event updated.');
  await loadAdminEvents();
}

/* ══════════════════════════════════════════════════════════════════
   DELETE EVENT
══════════════════════════════════════════════════════════════════ */
async function deleteAdminEvent(eventId, title) {
  if (!confirm('Delete event "' + title + '"?\n\nThis will also delete ALL attendance records for this event. This cannot be undone.')) return;

  var result = await apiDeleteEvent(eventId);
  if (!result || result._error) {
    if (typeof toast === 'function') toast('Failed to delete event.');
    return;
  }
  if (typeof toast === 'function') toast('Event deleted.');
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

/* ── HTML escape ─────────────────────────────────────────────────── */
function _esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}