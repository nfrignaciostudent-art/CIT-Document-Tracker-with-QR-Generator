/* ══════════════════════════════════════════════════════════════════════
   public/js/eventAdmin.js — Admin Event Management UI
   CIT Document Tracker - Group 6

   REDESIGNED: Rich event modal with banner, description, pinned
   announcement, what to bring, organizer, attachments, attendance
   sorted by section, download record, related events.
══════════════════════════════════════════════════════════════════════ */

let _adminEvents          = [];
let _currentEventQRData   = null;
let _createEventImageFile = null;

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
   LOAD & RENDER CARDS
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
      '<div style="font-size:12px;color:var(--muted);margin-top:6px">' + _ea(data && data.message ? data.message : 'Server error') + '</div></div>';
    return;
  }

  _adminEvents = Array.isArray(data) ? data : [];

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

  if (_adminEvents.length === 0) {
    container.innerHTML =
      '<div style="text-align:center;padding:80px 20px">' +
      '<div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:8px">No events yet</div>' +
      '<div style="font-size:13px;color:var(--muted);margin-bottom:24px">Create your first event to generate a QR code for student attendance.</div>' +
      '<button class="btn btn-primary" onclick="openCreateEventModal()">+ Create First Event</button></div>';
    return;
  }

  container.innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;padding:20px">' +
    _adminEvents.map(function(evt,idx){ return _renderEventCard(evt,idx); }).join('') +
    '</div>';
}

function _statCard(label, value, valueColor, sub) {
  return '<div class="stat-card">' +
    '<div style="font-size:11px;font-weight:700;color:var(--muted);letter-spacing:.5px;margin-bottom:6px">' + label + '</div>' +
    '<div style="font-size:32px;font-weight:800;color:' + valueColor + ';line-height:1;margin-bottom:4px">' + value + '</div>' +
    (sub ? '<div style="font-size:12px;color:var(--muted)">' + sub + '</div>' : '') +
  '</div>';
}

function _renderEventCard(evt, idx) {
  var gradient = EVENT_GRADIENTS[idx % EVENT_GRADIENTS.length];
  var isActive = evt.isActive;
  var total    = (evt.attendCount||0) + (evt.cantAttendCount||0);
  var pct      = total > 0 ? Math.round((evt.attendCount/total)*100) : 0;

  var statusBadge = isActive
    ? '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#22c55e;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.25);padding:3px 10px;border-radius:20px"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span>Open</span>'
    : '<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#ef4444;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);padding:3px 10px;border-radius:20px"><span style="width:6px;height:6px;border-radius:50%;background:#ef4444;display:inline-block"></span>Closed</span>';

  return '<div class="event-card" onclick="openEventDetailModal(\'' + _ea(evt.eventId) + '\')"' +
    ' style="background:var(--white);border:1px solid var(--border);border-radius:16px;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 2px 8px rgba(0,0,0,.06)"' +
    ' onmouseover="this.style.transform=\'translateY(-3px)\';this.style.boxShadow=\'0 8px 24px rgba(0,0,0,.12)\'"' +
    ' onmouseout="this.style.transform=\'\';this.style.boxShadow=\'0 2px 8px rgba(0,0,0,.06)\'">' +
    '<div style="height:120px;background:' + gradient + ';position:relative;overflow:hidden">' +
      '<div style="position:absolute;top:10px;right:10px">' + statusBadge + '</div>' +
    '</div>' +
    '<div style="padding:16px">' +
      '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _ea(evt.title) + '</div>' +
      '<div style="font-size:11px;color:var(--muted);font-family:\'DM Mono\',monospace;margin-bottom:10px">' + _ea(evt.eventId) + '</div>' +
      (evt.date ? '<div style="font-size:12px;color:var(--muted);margin-bottom:3px">' + _ea(evt.date) + (evt.time ? ' · ' + _ea(evt.time) : '') + '</div>' : '') +
      (evt.location ? '<div style="font-size:12px;color:var(--muted);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _ea(evt.location) + '</div>' : '') +
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
        '<button class="btn btn-sm btn-ghost" style="font-size:11px;padding:5px 10px" onclick="toggleEventActive(\'' + _ea(evt.eventId) + '\')">' + (isActive?'Close':'Open') + '</button>' +
        '<button class="btn btn-sm" style="background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2);font-size:11px;padding:5px 10px" onclick="deleteAdminEvent(\'' + _ea(evt.eventId) + '\',\'' + _ea(evt.title) + '\')">Delete</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ══════════════════════════════════════════════════════════════════
   EVENT DETAIL MODAL — FULL REDESIGN
══════════════════════════════════════════════════════════════════ */
async function openEventDetailModal(eventId) {
  var titleEl   = document.getElementById('attendance-modal-title');
  var contentEl = document.getElementById('attendance-modal-content');
  var evt       = _adminEvents.find(function(e){ return e.eventId === eventId; });

  if (titleEl)   titleEl.textContent = evt ? evt.title : 'Event Details';
  if (contentEl) contentEl.innerHTML =
    '<div style="text-align:center;padding:60px 20px;color:var(--muted)">' +
    '<div class="spinner" style="margin:0 auto 16px"></div>' +
    '<p style="font-size:13px">Loading...</p></div>';

  openModal('event-attendance-modal');

  var data = await apiGetEventAttendance(eventId);

  if (!data || data._error) {
    contentEl.innerHTML =
      '<div style="text-align:center;padding:40px;color:#f87171">' +
      '<p style="font-weight:600">Failed to load event</p></div>';
    return;
  }

  if (titleEl) titleEl.textContent = data.event.title;

  var idx      = _adminEvents.findIndex(function(e){ return e.eventId === eventId; });
  var gradient = EVENT_GRADIENTS[idx >= 0 ? idx % EVENT_GRADIENTS.length : 0];
  var isActive = data.event.isActive;
  var total    = data.summary.total;
  var pct      = total > 0 ? Math.round((data.summary.attending/total)*100) : 0;

  /* ── Countdown timer ── */
  var countdownHtml = '';
  if (data.event.date) {
    var target = new Date(data.event.date + (data.event.time ? ' ' + data.event.time : 'T10:00:00'));
    var diff   = Math.max(0, Math.floor((target - Date.now()) / 1000));
    var cd_d   = Math.floor(diff / 86400);
    var cd_h   = Math.floor((diff % 86400) / 3600);
    var cd_m   = Math.floor((diff % 3600) / 60);
    var cd_s   = diff % 60;
    if (diff > 0) {
      countdownHtml =
        '<div style="display:flex;gap:6px;margin-top:10px" id="evt-countdown-' + _ea(eventId) + '">' +
        _cdChip(String(cd_d).padStart(2,'0'), 'days') +
        '<span style="font-size:14px;color:rgba(255,255,255,.4);margin-top:4px">:</span>' +
        _cdChip(String(cd_h).padStart(2,'0'), 'hrs') +
        '<span style="font-size:14px;color:rgba(255,255,255,.4);margin-top:4px">:</span>' +
        _cdChip(String(cd_m).padStart(2,'0'), 'min') +
        '<span style="font-size:14px;color:rgba(255,255,255,.4);margin-top:4px">:</span>' +
        _cdChip(String(cd_s).padStart(2,'0'), 'sec') +
        '</div>';
    }
  }

  /* ── Tags / badges ── */
  var tagHtml =
    '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(255,255,255,.18);color:rgba(255,255,255,.85);font-weight:600">School Event</span>' +
    (isActive
      ? '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(34,197,94,.3);color:#e1fde9;font-weight:600">Open</span>'
      : '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(239,68,68,.25);color:#fde8e8;font-weight:600">Closed</span>');

  /* ── Banner ── */
  var bannerHtml =
    '<div style="background:' + gradient + ';padding:22px 22px 20px;position:relative;overflow:hidden">' +
      '<div style="position:absolute;inset:0;background:rgba(0,0,0,.18)"></div>' +
      '<div style="position:relative;z-index:1">' +
        /* Event Details sub-label removed per UI requirements */
        '<div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:8px">' + _ea(data.event.title) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' + tagHtml + '</div>' +
        countdownHtml +
      '</div>' +
    '</div>';

  /* ── Info grid ── */
  var updatedAt = new Date().toLocaleDateString('en-PH', { timeZone:'Asia/Manila', year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
  var attWindow = (data.event.attendanceStartTime && data.event.attendanceEndTime)
    ? data.event.attendanceStartTime + ' – ' + data.event.attendanceEndTime
    : '—';
  var infoGridHtml =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0;border-bottom:1px solid var(--border-lt)">' +
      _infoCell('Date', data.event.date || '—') +
      _infoCell('Time', data.event.time || '—') +
      _infoCell('Venue', data.event.location || '—') +
      _infoCell('Status', isActive ? '<span style="color:#16a34a;font-weight:700">Open</span>' : '<span style="color:#ef4444;font-weight:700">Closed</span>') +
      _infoCell('Organizer', (cachedEvt && cachedEvt.organizer) ? cachedEvt.organizer : '—') +
      _infoCell('Attendance Window', attWindow) +
    '</div>' +
    '<div style="padding:8px 16px;border-bottom:1px solid var(--border-lt)">' +
      '<span style="font-size:11px;color:var(--muted)">Last updated: ' + updatedAt + '</span>' +
    '</div>';

  /* ── Description ── */
  var descHtml = '';
  /* Note: description not returned by getEventAttendance — use from _adminEvents cache */
  var cachedEvt = _adminEvents.find(function(e){ return e.eventId === eventId; }) || {};
  if (cachedEvt.description) {
    descHtml =
      '<div style="padding:14px 16px;border-bottom:1px solid var(--border-lt)">' +
        '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">About this event</div>' +
        '<p style="font-size:13px;color:var(--text);line-height:1.65;margin:0">' + _ea(cachedEvt.description) + '</p>' +
      '</div>';
  }

  /* ── Pinned announcement ── */
  var pinnedHtml =
    '<div style="padding:14px 16px;border-bottom:1px solid var(--border-lt)">' +
      '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">Pinned Announcement</div>' +
      '<div style="background:#faeeda;border-left:3px solid #ef9f27;border-radius:0 8px 8px 0;padding:10px 14px">' +
        '<div style="font-size:10px;font-weight:700;color:#854f0b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">From the organizer</div>' +
        '<p style="font-size:12px;color:#633806;line-height:1.5;margin:0">' +
          (cachedEvt.description ? 'Please be on time. Bring your Student ID for attendance verification.' : 'No announcements yet.') +
        '</p>' +
      '</div>' +
    '</div>';

  /* ── What to bring ── */
  var bringHtml =
    '<div style="padding:14px 16px;border-bottom:1px solid var(--border-lt)">' +
      '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">What to bring</div>' +
      '<ul style="list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:7px">' +
        _bringItem('Student ID card') +
        _bringItem('School uniform or prescribed attire') +
        _bringItem('Water bottle') +
      '</ul>' +
    '</div>';

  /* ── Organizer ── */
  var orgHtml =
    '<div style="padding:14px 16px;border-bottom:1px solid var(--border-lt)">' +
      '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">Organized by</div>' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:#eeedfe;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#3c3489;flex-shrink:0">' +
          (cachedEvt.organizer ? cachedEvt.organizer.slice(0,2).toUpperCase() : 'OR') +
        '</div>' +
        '<div>' +
          '<div style="font-size:13px;font-weight:600;color:var(--text)">' + _ea(cachedEvt.organizer || 'School Organizer') + '</div>' +
          '<div style="font-size:11px;color:var(--muted)">Event Organizer</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  /* ── Attendance summary ── */
  var summaryHtml =
    '<div style="padding:14px 16px;border-bottom:1px solid var(--border-lt)">' +
      '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">Attendance</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">' +
        '<div style="text-align:center;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px">' +
          '<div style="font-size:24px;font-weight:800;color:var(--text)">' + total + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px;font-weight:600">Total</div>' +
        '</div>' +
        '<div style="text-align:center;padding:12px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.2);border-radius:10px">' +
          '<div style="font-size:24px;font-weight:800;color:#22c55e">' + data.summary.attending + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px;font-weight:600">Attending</div>' +
        '</div>' +
        '<div style="text-align:center;padding:12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.2);border-radius:10px">' +
          '<div style="font-size:24px;font-weight:800;color:#ef4444">' + data.summary.cantAttend + '</div>' +
          '<div style="font-size:11px;color:var(--muted);margin-top:2px;font-weight:600">Cannot Attend</div>' +
        '</div>' +
      '</div>' +
      (total > 0 ?
        '<div>' +
          '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:6px">' +
            '<span>Attendance rate</span>' +
            '<span style="font-weight:700;color:' + (pct>=50?'#22c55e':'#f59e0b') + '">' + pct + '%</span>' +
          '</div>' +
          '<div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#22c55e,#10b981);border-radius:99px"></div>' +
          '</div>' +
        '</div>'
      : '') +
    '</div>';

  /* ── Section breakdown ── */
  var sectionHtml = _buildSectionBreakdown(data.records);

  /* ── Attending list ── */
  var attendHtml =
    '<div style="padding:14px 16px;border-bottom:1px solid var(--border-lt)">' +
      '<div style="font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Attending (' + data.summary.attending + ')</div>' +
      (data.attending.length === 0
        ? '<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">No students confirmed yet.</div>'
        : '<div style="display:flex;flex-direction:column;gap:8px">' + data.attending.map(function(r){ return _attendeeRow(r,'attend'); }).join('') + '</div>'
      ) +
    '</div>';

  /* ── Cannot attend list ── */
  var cantHtml =
    '<div style="padding:14px 16px;border-bottom:1px solid var(--border-lt)">' +
      '<div style="font-size:12px;font-weight:700;color:#ef4444;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Cannot Attend (' + data.summary.cantAttend + ')</div>' +
      (data.cantAttend.length === 0
        ? '<div style="text-align:center;padding:16px;color:var(--muted);font-size:13px;background:var(--bg);border-radius:10px;border:1px solid var(--border)">No declines yet.</div>'
        : '<div style="display:flex;flex-direction:column;gap:8px">' + data.cantAttend.map(function(r){ return _attendeeRow(r,'cant_attend'); }).join('') + '</div>'
      ) +
    '</div>';

  /* ── Action bar ── */
  var actionsHtml =
    '<div style="display:flex;gap:8px;flex-wrap:wrap;padding:14px 16px">' +
      '<button class="btn btn-sm btn-ghost" onclick="closeModal(\'event-attendance-modal\');setTimeout(function(){openEventQRModal(\'' + _ea(eventId) + '\')},220)">QR Code</button>' +
      '<button class="btn btn-sm btn-ghost" onclick="toggleEventActive(\'' + _ea(eventId) + '\');closeModal(\'event-attendance-modal\')">' +
        (isActive ? 'Close Attendance' : 'Open Attendance') +
      '</button>' +
      '<button class="btn btn-sm" style="background:rgba(52,199,90,.1);color:#16a34a;border:1px solid rgba(52,199,90,.3)" onclick="downloadEventRecord(\'' + _ea(eventId) + '\',\'' + _ea(data.event.title) + '\')">Download Record</button>' +
      '<button class="btn btn-sm" style="background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2);margin-left:auto" ' +
        'onclick="deleteAdminEvent(\'' + _ea(eventId) + '\',\'' + _ea(data.event.title) + '\');closeModal(\'event-attendance-modal\')">Delete Event</button>' +
    '</div>';

  contentEl.innerHTML = bannerHtml + infoGridHtml + descHtml + pinnedHtml + bringHtml + orgHtml + summaryHtml + sectionHtml + attendHtml + cantHtml + actionsHtml;

  /* Start countdown ticker */
  if (data.event.date) _startCountdown(eventId, data.event.date, data.event.time);
}

/* ── Countdown helpers ─────────────────────────────────────────── */
function _cdChip(val, label) {
  return '<div style="background:rgba(0,0,0,.25);border-radius:6px;padding:3px 8px;text-align:center">' +
    '<span style="font-size:15px;font-weight:700;color:#fff;display:block">' + val + '</span>' +
    '<span style="font-size:9px;color:rgba(255,255,255,.6);display:block">' + label + '</span>' +
  '</div>';
}

function _startCountdown(eventId, date, time) {
  var target = new Date(date + (time ? ' ' + time : 'T10:00:00'));
  var wrap   = document.getElementById('evt-countdown-' + eventId);
  if (!wrap) return;

  var timer = setInterval(function() {
    var diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
    if (diff === 0) { clearInterval(timer); return; }
    var d = Math.floor(diff / 86400);
    var h = Math.floor((diff % 86400) / 3600);
    var m = Math.floor((diff % 3600) / 60);
    var s = diff % 60;
    wrap.innerHTML =
      _cdChip(String(d).padStart(2,'0'), 'days') +
      '<span style="font-size:14px;color:rgba(255,255,255,.4);margin-top:4px">:</span>' +
      _cdChip(String(h).padStart(2,'0'), 'hrs') +
      '<span style="font-size:14px;color:rgba(255,255,255,.4);margin-top:4px">:</span>' +
      _cdChip(String(m).padStart(2,'0'), 'min') +
      '<span style="font-size:14px;color:rgba(255,255,255,.4);margin-top:4px">:</span>' +
      _cdChip(String(s).padStart(2,'0'), 'sec');
  }, 1000);
}

/* ── Info cell helper ──────────────────────────────────────────── */
function _infoCell(key, val) {
  return '<div style="padding:11px 16px;border-right:1px solid var(--border-lt);border-bottom:1px solid var(--border-lt)">' +
    '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">' + key + '</div>' +
    '<div style="font-size:13px;font-weight:600;color:var(--text)">' + val + '</div>' +
  '</div>';
}

/* ── What to bring item ────────────────────────────────────────── */
function _bringItem(text) {
  return '<li style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text)">' +
    '<div style="width:16px;height:16px;border-radius:50%;border:1.5px solid var(--border);flex-shrink:0"></div>' +
    text + '</li>';
}

/* ── Attendee row ──────────────────────────────────────────────── */
function _attendeeRow(r, type) {
  var isAttend = type === 'attend';
  var bg     = isAttend ? 'rgba(34,197,94,.04)'  : 'rgba(239,68,68,.04)';
  var border = isAttend ? 'rgba(34,197,94,.15)'  : 'rgba(239,68,68,.15)';
  var dot    = isAttend ? '#22c55e' : '#ef4444';
  var initial = _ea((r.studentName||'S').charAt(0).toUpperCase());

  var excuseBadge = (!isAttend && r.hasExcuseLetter)
    ? '<span style="font-size:9px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.25);padding:1px 7px;border-radius:20px;margin-left:6px">Letter</span>'
    : '';

  var excuseRow = (!isAttend && r.excuseLetter)
    ? '<div style="margin-top:7px;padding:7px 10px;background:rgba(239,68,68,.04);border:1px solid rgba(239,68,68,.1);border-radius:7px;font-size:11px;color:var(--muted);font-style:italic;line-height:1.5">' +
        '"' + _ea((r.excuseLetter||'').slice(0,140) + ((r.excuseLetter||'').length > 140 ? '…' : '')) + '"' +
      '</div>'
    : '';

  return '<div style="padding:10px 12px;background:' + bg + ';border:1px solid ' + border + ';border-radius:10px">' +
    '<div style="display:flex;align-items:center;gap:10px">' +
      '<div style="width:30px;height:30px;border-radius:50%;background:' + dot + ';display:grid;place-items:center;flex-shrink:0;font-size:13px;color:#fff;font-weight:700">' + initial + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:600;color:var(--text)">' + _ea(r.studentName) + excuseBadge + '</div>' +
        '<div style="font-size:11px;color:var(--muted)">ID: <span style="font-family:\'DM Mono\',monospace">' + _ea(r.studentId||'—') + '</span>' + (r.section ? ' · Section <strong>' + _ea(r.section) + '</strong>' : '') + '</div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--muted);white-space:nowrap">' + _ea((r.displayDate||'').split(' ').slice(0,2).join(' ')) + '</div>' +
    '</div>' +
    excuseRow +
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
    return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<div style="font-size:13px;font-weight:700;color:var(--text)">Section ' + _ea(sec) + '</div>' +
        '<div style="font-size:11px;color:var(--muted)">' + total + ' resp.</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:5px">' +
        '<span style="font-size:12px;color:#22c55e;font-weight:600">' + attend + ' attending</span>' +
        '<span style="font-size:12px;color:#ef4444;font-weight:600">' + cant + ' can\'t</span>' +
      '</div>' +
      '<div style="height:4px;background:var(--border);border-radius:99px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:#22c55e;border-radius:99px"></div>' +
      '</div>' +
      '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + pct + '% attending</div>' +
    '</div>';
  }).join('');

  return '<div style="padding:14px 16px;border-bottom:1px solid var(--border-lt)">' +
    '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">By Section</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">' + cards + '</div>' +
  '</div>';
}

/* ══════════════════════════════════════════════════════════════════
   DOWNLOAD RECORD
══════════════════════════════════════════════════════════════════ */
async function downloadEventRecord(eventId, title) {
  if (typeof toast === 'function') toast('Preparing download record...');
  try {
    var result = await apiDownloadAttendanceRecord(eventId);
    if (!result || result._error) {
      if (typeof toast === 'function') toast('Failed to download record.');
      return;
    }
    var url = URL.createObjectURL(result.blob);
    var a   = document.createElement('a');
    a.href     = url;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof toast === 'function') toast('Download saved — ' + result.filename);
  } catch(e) {
    if (typeof toast === 'function') toast('Download failed. Please try again.');
  }
}

/* ══════════════════════════════════════════════════════════════════
   CREATE EVENT MODAL
══════════════════════════════════════════════════════════════════ */
function openCreateEventModal() {
  _createEventImageFile = null;
  var modalBody = document.querySelector('#create-event-modal .modal-body');
  if (modalBody) modalBody.innerHTML = _buildCreateEventForm();
  else {
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
    '<div>' +
      '<label style="' + lbl + '">Event Title <span style="color:#ef4444">*</span></label>' +
      '<input id="evt-title" type="text" placeholder="e.g. Yellow Paper Day" maxlength="100"' +
        ' style="' + inp + '" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'">' +
    '</div>' +
    '<div>' +
      '<label style="' + lbl + '">Description</label>' +
      '<textarea id="evt-desc" placeholder="Brief description of the event..." rows="3" maxlength="500"' +
        ' style="' + inp + ';resize:vertical" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'"></textarea>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<div><label style="' + lbl + '">Date <span style="color:#ef4444">*</span></label>' +
        '<input id="evt-date" type="date" value="' + today + '" style="' + inp + '" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'"></div>' +
      '<div><label style="' + lbl + '">Time</label>' +
        '<input id="evt-time" type="text" placeholder="e.g. 9:00 AM" style="' + inp + '" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'"></div>' +
    '</div>' +
    '<div>' +
      '<label style="' + lbl + '">Location</label>' +
      '<input id="evt-location" type="text" placeholder="e.g. CIT Gym, Main Building" style="' + inp + '" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'"></div>' +
    '<div>' +
      '<label style="' + lbl + '">Organizer</label>' +
      '<input id="evt-organizer" type="text" placeholder="e.g. SSG, Class Adviser" style="' + inp + '" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'"></div>' +
    '<div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 16px">' +
      '<div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">&#9201; Attendance Time Window <span style="font-weight:400;text-transform:none;letter-spacing:0">(optional)</span></div>' +
      '<p style="font-size:11px;color:var(--muted);margin:0 0 10px;line-height:1.5">Set a window during which students may submit attendance. Outside this range, the backend will reject submissions even if the QR is active.</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
        '<div><label style="' + lbl + '">Open at (24h)</label>' +
          '<input id="evt-att-start" type="time" style="' + inp + '" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'"></div>' +
        '<div><label style="' + lbl + '">Close at (24h)</label>' +
          '<input id="evt-att-end" type="time" style="' + inp + '" onfocus="this.style.borderColor=\'#6366f1\'" onblur="this.style.borderColor=\'\'"></div>' +
      '</div>' +
    '</div>' +
    '<div id="create-event-error" style="display:none;font-size:13px;color:#f87171;padding:10px 14px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:8px"></div>' +
    '<div style="display:flex;gap:10px;justify-content:flex-end;padding-top:4px">' +
      '<button class="btn btn-ghost" onclick="closeModal(\'create-event-modal\')">Cancel</button>' +
      '<button class="btn btn-primary" id="create-event-btn" onclick="submitCreateEvent()">Create &amp; Generate QR</button>' +
    '</div>' +
  '</div>';
}

async function submitCreateEvent() {
  var title     = ((document.getElementById('evt-title')    ||{}).value||'').trim();
  var desc      = ((document.getElementById('evt-desc')     ||{}).value||'').trim();
  var date      = ((document.getElementById('evt-date')     ||{}).value||'').trim();
  var time      = ((document.getElementById('evt-time')     ||{}).value||'').trim();
  var location  = ((document.getElementById('evt-location') ||{}).value||'').trim();
  var organizer  = ((document.getElementById('evt-organizer') ||{}).value||'').trim();
  var attStart   = ((document.getElementById('evt-att-start')  ||{}).value||'').trim() || null;
  var attEnd     = ((document.getElementById('evt-att-end')    ||{}).value||'').trim() || null;
  var errEl     = document.getElementById('create-event-error');
  var btn       = document.getElementById('create-event-btn');

  if (!title) { errEl.textContent = 'Event title is required.'; errEl.style.display = 'block'; return; }
  if (!date)  { errEl.textContent = 'Event date is required.';  errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  btn.disabled    = true;
  btn.textContent = 'Creating...';

  var result = await apiCreateEvent({ title, description: desc, date, time, location, organizer, attendanceStartTime: attStart, attendanceEndTime: attEnd }, null);

  if (!result || result._error) {
    errEl.textContent   = (result && result.message) ? result.message : 'Failed to create event. Try again.';
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.textContent     = 'Create & Generate QR';
    return;
  }

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
  if (typeof window.showPage === 'function') _wrap(window.showPage);
  else document.addEventListener('DOMContentLoaded', function() {
    if (typeof window.showPage === 'function') _wrap(window.showPage);
  });
})();

function _ea(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}