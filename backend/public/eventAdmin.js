/* ══════════════════════════════════════════════════════════════════════
   eventAdmin.js — Admin Event Management UI
   CIT Document Tracker - Group 6

   Handles:
     - Loading & rendering all events list
     - Create event modal + form submission
     - Showing event QR code modal
     - Downloading QR image
     - Viewing attendance per event (modal with section breakdown)
     - Toggle event open/closed
     - Delete event
     - Stats row (total events, total attending, total cant attend)

   Called from index.html when admin navigates to "Events" page.
   All functions are global so onclick= attributes work.
══════════════════════════════════════════════════════════════════════ */

/* ── State ───────────────────────────────────────────────────────── */
let _adminEvents        = [];      // cached events array
let _currentEventQRData = null;    // { title, qrCode, eventUrl } for QR modal

/* ══════════════════════════════════════════════════════════════════
   LOAD & RENDER EVENTS LIST
══════════════════════════════════════════════════════════════════ */
async function loadAdminEvents() {
  const container = document.getElementById('events-list-container');
  const statsRow  = document.getElementById('events-stats-row');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;padding:48px 20px;color:var(--muted)">
      <div style="font-size:13px">Loading events...</div>
    </div>`;

  const data = await apiGetAllEvents();

  if (!data || data._error) {
    container.innerHTML = `
      <div style="text-align:center;padding:48px 20px;color:var(--muted)">
        <div style="font-size:13px;color:#f87171">Failed to load events. ${data?.message || ''}</div>
      </div>`;
    return;
  }

  _adminEvents = Array.isArray(data) ? data : [];

  /* ── Stats row ── */
  if (statsRow) {
    const totalEvents   = _adminEvents.length;
    const totalAttend   = _adminEvents.reduce((s, e) => s + (e.attendCount || 0), 0);
    const totalCant     = _adminEvents.reduce((s, e) => s + (e.cantAttendCount || 0), 0);
    const activeEvents  = _adminEvents.filter(e => e.isActive).length;

    statsRow.innerHTML = `
      ${_statCard('Total Events',    totalEvents,  '#6366f1')}
      ${_statCard('Will Attend',     totalAttend,  '#22c55e')}
      ${_statCard("Can't Attend",    totalCant,    '#ef4444')}
      ${_statCard('Active Now',      activeEvents, '#f59e0b')}`;
  }

  /* ── Empty state ── */
  if (_adminEvents.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:36px;margin-bottom:12px">📅</div>
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">No events yet</div>
        <div style="font-size:13px;color:var(--muted)">Click "Create Event" to get started.</div>
      </div>`;
    return;
  }

  /* ── Events table ── */
  container.innerHTML = `
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Date & Time</th>
            <th>Location</th>
            <th style="text-align:center">Attending</th>
            <th style="text-align:center">Can't</th>
            <th style="text-align:center">Status</th>
            <th style="text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${_adminEvents.map(evt => _renderEventRow(evt)).join('')}
        </tbody>
      </table>
    </div>`;
}

function _statCard(label, value, color) {
  return `
    <div class="stat-card">
      <div class="stat-value" style="color:${color}">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
}

function _renderEventRow(evt) {
  const isActive = evt.isActive;
  const badge    = isActive
    ? `<span style="background:rgba(34,197,94,.12);color:#22c55e;border:1px solid rgba(34,197,94,.25);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">● Open</span>`
    : `<span style="background:rgba(239,68,68,.08);color:#ef4444;border:1px solid rgba(239,68,68,.2);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">● Closed</span>`;

  return `
    <tr>
      <td>
        <div style="font-weight:700;color:var(--text);font-size:13px;max-width:200px">${_esc(evt.title)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;font-family:'DM Mono',monospace">${_esc(evt.eventId)}</div>
      </td>
      <td style="white-space:nowrap">
        <div style="font-size:13px;color:var(--text)">${_esc(evt.date)}</div>
        <div style="font-size:11px;color:var(--muted)">${_esc(evt.time || '—')}</div>
      </td>
      <td style="font-size:13px;color:var(--muted);max-width:140px">${_esc(evt.location || '—')}</td>
      <td style="text-align:center">
        <span style="font-size:16px;font-weight:800;color:#22c55e">${evt.attendCount || 0}</span>
      </td>
      <td style="text-align:center">
        <span style="font-size:16px;font-weight:800;color:#ef4444">${evt.cantAttendCount || 0}</span>
      </td>
      <td style="text-align:center">${badge}</td>
      <td style="text-align:center">
        <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-sm btn-ghost" onclick="openEventAttendance('${_esc(evt.eventId)}')" title="View Attendance">
            👥 Attendance
          </button>
          <button class="btn btn-sm btn-ghost" onclick="openEventQRModal('${_esc(evt.eventId)}')" title="Show QR">
            📷 QR
          </button>
          <button class="btn btn-sm btn-ghost" onclick="toggleEventActive('${_esc(evt.eventId)}')" title="${isActive ? 'Close' : 'Open'} attendance">
            ${isActive ? '🔒 Close' : '🔓 Open'}
          </button>
          <button class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.2)" onclick="deleteAdminEvent('${_esc(evt.eventId)}','${_esc(evt.title)}')" title="Delete event">
            🗑️
          </button>
        </div>
      </td>
    </tr>`;
}

/* ══════════════════════════════════════════════════════════════════
   CREATE EVENT MODAL
══════════════════════════════════════════════════════════════════ */
function openCreateEventModal() {
  /* Clear previous values */
  ['evt-title','evt-desc','evt-time','evt-location','evt-organizer'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const dateEl = document.getElementById('evt-date');
  if (dateEl) dateEl.value = new Date().toISOString().slice(0, 10);

  const errEl = document.getElementById('create-event-error');
  if (errEl) errEl.style.display = 'none';

  const btn = document.getElementById('create-event-btn');
  if (btn) { btn.disabled = false; btn.textContent = 'Create & Generate QR'; }

  openModal('create-event-modal');
}

async function submitCreateEvent() {
  const title    = document.getElementById('evt-title')?.value.trim();
  const desc     = document.getElementById('evt-desc')?.value.trim();
  const date     = document.getElementById('evt-date')?.value.trim();
  const time     = document.getElementById('evt-time')?.value.trim();
  const location = document.getElementById('evt-location')?.value.trim();
  const organizer= document.getElementById('evt-organizer')?.value.trim();
  const errEl    = document.getElementById('create-event-error');
  const btn      = document.getElementById('create-event-btn');

  /* Validate */
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

  const result = await apiCreateEvent({ title, description: desc, date, time, location, organizer });

  if (!result || result._error) {
    errEl.textContent = result?.message || 'Failed to create event. Try again.';
    errEl.style.display = 'block';
    btn.disabled    = false;
    btn.textContent = 'Create & Generate QR';
    return;
  }

  closeModal('create-event-modal');
  if (typeof toast === 'function') toast('Event created successfully!');

  /* Refresh events list */
  await loadAdminEvents();

  /* Immediately show the QR for the new event */
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
  const evt = _adminEvents.find(e => e.eventId === eventId);
  if (!evt) return;

  const baseUrl  = window.location.origin + window.location.pathname;
  const eventUrl = `${baseUrl}?event=${evt.eventId}`;

  _currentEventQRData = {
    title:    evt.title,
    qrCode:   evt.qrCode,
    eventUrl,
    eventId:  evt.eventId,
  };
  _showEventQRModal();
}

function _showEventQRModal() {
  if (!_currentEventQRData) return;

  const titleEl  = document.getElementById('event-qr-title');
  const imgWrap  = document.getElementById('event-qr-img-wrap');
  const urlEl    = document.getElementById('event-qr-url-display');

  if (titleEl) titleEl.textContent = _currentEventQRData.title;

  if (imgWrap) {
    if (_currentEventQRData.qrCode) {
      imgWrap.innerHTML = `
        <img src="${_currentEventQRData.qrCode}" alt="Event QR"
             style="width:220px;height:220px;border-radius:12px;border:6px solid #fff">`;
    } else {
      /* Fallback: generate QR with QRCode library if qrCode not returned */
      imgWrap.innerHTML = '';
      const target = document.createElement('div');
      imgWrap.appendChild(target);
      if (typeof QRCode !== 'undefined') {
        new QRCode(target, {
          text: _currentEventQRData.eventUrl,
          width: 220, height: 220,
          correctLevel: QRCode.CorrectLevel.M,
        });
      }
    }
  }

  if (urlEl) urlEl.textContent = _currentEventQRData.eventUrl;

  openModal('event-qr-modal');
}

function downloadEventQR() {
  if (!_currentEventQRData?.qrCode) {
    if (typeof toast === 'function') toast('No QR to download.');
    return;
  }
  const a    = document.createElement('a');
  a.href     = _currentEventQRData.qrCode;
  a.download = `QR-${_currentEventQRData.title.replace(/\s+/g, '_')}.png`;
  a.click();
}

/* ══════════════════════════════════════════════════════════════════
   ATTENDANCE MODAL
══════════════════════════════════════════════════════════════════ */
async function openEventAttendance(eventId) {
  const titleEl   = document.getElementById('attendance-modal-title');
  const contentEl = document.getElementById('attendance-modal-content');

  if (titleEl)   titleEl.textContent = 'Loading attendance...';
  if (contentEl) contentEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted)">Loading...</div>`;

  openModal('event-attendance-modal');

  const data = await apiGetEventAttendance(eventId);

  if (!data || data._error) {
    contentEl.innerHTML = `<div style="text-align:center;padding:40px;color:#f87171">Failed to load attendance.</div>`;
    return;
  }

  if (titleEl) titleEl.textContent = data.event.title;

  /* ── Summary cards ── */
  const summaryHtml = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px">
      <div style="text-align:center;padding:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:var(--text)">${data.summary.total}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Total Responses</div>
      </div>
      <div style="text-align:center;padding:16px;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#22c55e">${data.summary.attending}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Will Attend</div>
      </div>
      <div style="text-align:center;padding:16px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:10px">
        <div style="font-size:24px;font-weight:800;color:#ef4444">${data.summary.cantAttend}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Can't Attend</div>
      </div>
    </div>`;

  /* ── Section breakdown ── */
  const sectionBreakdown = _buildSectionBreakdown(data.records);

  /* ── Attendance table ── */
  const tableHtml = data.records.length === 0
    ? `<div style="text-align:center;padding:40px;color:var(--muted)">No responses yet.</div>`
    : `
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Student ID</th>
              <th>Section</th>
              <th>Response</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${data.records.map(r => `
              <tr>
                <td style="font-weight:600;font-size:13px">${_esc(r.studentName)}</td>
                <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--muted)">${_esc(r.studentId)}</td>
                <td>
                  <span style="background:rgba(99,102,241,.1);color:#818cf8;border:1px solid rgba(99,102,241,.2);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">
                    ${_esc(r.section || 'N/A')}
                  </span>
                </td>
                <td>
                  ${r.response === 'attend'
                    ? '<span style="color:#22c55e;font-weight:700;font-size:12px">✅ Attending</span>'
                    : '<span style="color:#ef4444;font-weight:700;font-size:12px">❌ Can\'t Attend</span>'}
                </td>
                <td style="font-size:11px;color:var(--muted);white-space:nowrap">${_esc(r.displayDate || r.scannedAt || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

  contentEl.innerHTML = summaryHtml + sectionBreakdown + tableHtml;
}

/* ── Build section breakdown chart ──────────────────────────────── */
function _buildSectionBreakdown(records) {
  if (!records || records.length === 0) return '';

  /* Group by section */
  const sections = {};
  records.forEach(r => {
    const sec = r.section || 'Unknown';
    if (!sections[sec]) sections[sec] = { attend: 0, cant: 0 };
    if (r.response === 'attend') sections[sec].attend++;
    else sections[sec].cant++;
  });

  const sectionKeys = Object.keys(sections).sort();
  if (sectionKeys.length === 0) return '';

  const cards = sectionKeys.map(sec => {
    const { attend, cant } = sections[sec];
    const total = attend + cant;
    const pct   = total > 0 ? Math.round((attend / total) * 100) : 0;
    return `
      <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
          <div style="font-size:14px;font-weight:800;color:var(--text)">Section ${_esc(sec)}</div>
          <div style="font-size:11px;color:var(--muted)">${total} response${total !== 1 ? 's' : ''}</div>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:10px">
          <div style="font-size:12px;color:#22c55e;font-weight:700">✅ ${attend} attending</div>
          <div style="font-size:12px;color:#ef4444;font-weight:700">❌ ${cant} can't</div>
        </div>
        <!-- Progress bar -->
        <div style="height:6px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:#22c55e;border-radius:99px;transition:width .3s"></div>
        </div>
        <div style="font-size:10px;color:var(--muted);margin-top:5px">${pct}% attending</div>
      </div>`;
  }).join('');

  return `
    <div style="margin-bottom:20px">
      <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">By Section</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">
        ${cards}
      </div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   TOGGLE OPEN / CLOSED
══════════════════════════════════════════════════════════════════ */
async function toggleEventActive(eventId) {
  const evt = _adminEvents.find(e => e.eventId === eventId);
  if (!evt) return;

  const action = evt.isActive ? 'close' : 'reopen';
  if (!confirm(`Are you sure you want to ${action} attendance for "${evt.title}"?`)) return;

  const result = await apiToggleEvent(eventId);
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
  if (!confirm(`Delete event "${title}"?\n\nThis will also delete all attendance records. This cannot be undone.`)) return;

  const result = await apiDeleteEvent(eventId);
  if (!result || result._error) {
    if (typeof toast === 'function') toast('Failed to delete event.');
    return;
  }

  if (typeof toast === 'function') toast('Event deleted.');
  await loadAdminEvents();
}

/* ══════════════════════════════════════════════════════════════════
   HOOK INTO showPage — load events when admin opens the page
══════════════════════════════════════════════════════════════════ */
(function patchShowPage() {
  const _orig = window.showPage;
  if (typeof _orig !== 'function') {
    /* showPage not loaded yet — wait for it */
    document.addEventListener('DOMContentLoaded', function() {
      const _orig2 = window.showPage;
      if (typeof _orig2 === 'function') _wrap(_orig2);
    });
    return;
  }
  _wrap(_orig);

  function _wrap(orig) {
    window.showPage = function(page, btn) {
      orig(page, btn);
      if (page === 'events') loadAdminEvents();
    };
  }
})();

/* ── Utility: HTML escape ────────────────────────────────────────── */
function _esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
