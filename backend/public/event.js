/* ══════════════════════════════════════════════════════════════════════
   public/js/event.js — Public Event Page + Attendance
   CIT Document Tracker - Group 6

   Triggered when URL contains ?event=<eventId>
   No login required — student just enters their Student ID.

   FLOW:
     1. Page loads → reads ?event= param → fetches event info
     2. Shows event details (title, date, location, etc.)
     3. Student enters their Student ID → clicks Search
     4. System looks up student → shows name + section
     5. Student clicks "I will Attend" or "I can't Attend"
     6. Response is saved → success screen shown
══════════════════════════════════════════════════════════════════════ */

/* ── Init: called on page load if ?event= param is detected ─────── */
async function initEventPage() {
  const params  = new URLSearchParams(window.location.search);
  const eventId = params.get('event');
  if (!eventId) return;

  /* Hide the main app, show the event page */
  const appEl   = document.getElementById('app');
  const eventEl = document.getElementById('event-page');
  if (appEl)   appEl.style.display   = 'none';
  if (eventEl) eventEl.style.display = 'flex';

  await loadEventPage(eventId);
}

/* ── Load and render the event page ─────────────────────────────── */
async function loadEventPage(eventId) {
  const container = document.getElementById('event-content');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align:center;padding:60px 20px;color:rgba(255,255,255,.5)">
      <div class="spinner" style="margin:0 auto 16px"></div>
      <p>Loading event...</p>
    </div>`;

  try {
    const res  = await fetch(`/api/events/public/${eventId}`);
    const data = await res.json();

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
  const isActive = evt.isActive;
  const statusBadge = isActive
    ? `<span style="background:rgba(34,197,94,.15);color:#22c55e;border:1px solid rgba(34,197,94,.3);padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700">● Open</span>`
    : `<span style="background:rgba(239,68,68,.12);color:#ef4444;border:1px solid rgba(239,68,68,.25);padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700">● Closed</span>`;

  container.innerHTML = `
    <!-- Event Header -->
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:rgba(255,255,255,.35);margin-bottom:12px;text-transform:uppercase">CIT Event</div>
      <h1 style="font-size:26px;font-weight:800;color:#fff;margin:0 0 12px;line-height:1.3">${escapeHtml(evt.title)}</h1>
      ${statusBadge}
    </div>

    <!-- Event Info Card -->
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px;margin-bottom:24px">
      ${evt.description ? `<p style="font-size:14px;color:rgba(255,255,255,.65);line-height:1.7;margin:0 0 20px;padding-bottom:20px;border-bottom:1px solid rgba(255,255,255,.07)">${escapeHtml(evt.description)}</p>` : ''}

      <div style="display:grid;gap:14px">
        ${evt.date ? `
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:36px;height:36px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:10px;display:grid;place-items:center;flex-shrink:0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div>
            <div style="font-size:11px;color:rgba(255,255,255,.35);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Date</div>
            <div style="font-size:14px;color:rgba(255,255,255,.85);font-weight:600">${escapeHtml(evt.date)}${evt.time ? ' · ' + escapeHtml(evt.time) : ''}</div>
          </div>
        </div>` : ''}

        ${evt.location ? `
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:36px;height:36px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:10px;display:grid;place-items:center;flex-shrink:0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>
          <div>
            <div style="font-size:11px;color:rgba(255,255,255,.35);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Location</div>
            <div style="font-size:14px;color:rgba(255,255,255,.85);font-weight:600">${escapeHtml(evt.location)}</div>
          </div>
        </div>` : ''}

        ${evt.organizer ? `
        <div style="display:flex;align-items:center;gap:14px">
          <div style="width:36px;height:36px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.25);border-radius:10px;display:grid;place-items:center;flex-shrink:0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div>
            <div style="font-size:11px;color:rgba(255,255,255,.35);font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Organizer</div>
            <div style="font-size:14px;color:rgba(255,255,255,.85);font-weight:600">${escapeHtml(evt.organizer)}</div>
          </div>
        </div>` : ''}
      </div>

      <!-- Response counts -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;padding-top:20px;border-top:1px solid rgba(255,255,255,.07)">
        <div style="text-align:center;background:rgba(34,197,94,.06);border:1px solid rgba(34,197,94,.15);border-radius:10px;padding:14px">
          <div style="font-size:22px;font-weight:800;color:#22c55e">${evt.attendCount}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">Will Attend</div>
        </div>
        <div style="text-align:center;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);border-radius:10px;padding:14px">
          <div style="font-size:22px;font-weight:800;color:#ef4444">${evt.cantAttendCount}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.4);margin-top:2px">Can't Attend</div>
        </div>
      </div>
    </div>

    <!-- Attendance Form -->
    <div id="event-form-area">
      ${isActive ? renderStudentLookupForm(evt.eventId) : renderClosedMessage()}
    </div>`;
}

/* ── Student ID lookup form ──────────────────────────────────────── */
function renderStudentLookupForm(eventId) {
  return `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:24px">
      <h3 style="font-size:15px;font-weight:700;color:#fff;margin:0 0 6px">Mark Your Attendance</h3>
      <p style="font-size:13px;color:rgba(255,255,255,.4);margin:0 0 20px">Enter your Student ID to get started.</p>

      <div style="display:flex;gap:10px;margin-bottom:12px">
        <input id="evt-student-id-input"
          type="text"
          placeholder="e.g. 2021-00123"
          maxlength="30"
          style="flex:1;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:10px;
                 padding:12px 16px;color:#fff;font-size:14px;font-family:'DM Sans',sans-serif;outline:none"
          onkeydown="if(event.key==='Enter') lookupStudentForEvent('${eventId}')"
        />
        <button onclick="lookupStudentForEvent('${eventId}')"
          style="padding:12px 20px;background:#6366f1;color:#fff;border:none;border-radius:10px;
                 font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap">
          Search
        </button>
      </div>

      <div id="evt-lookup-error" style="display:none;font-size:13px;color:#f87171;padding:10px 14px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.2);border-radius:8px;margin-bottom:12px"></div>
      <div id="evt-student-confirm" style="display:none"></div>
    </div>`;
}

/* ── Lookup the student by ID ────────────────────────────────────── */
async function lookupStudentForEvent(eventId) {
  const input   = document.getElementById('evt-student-id-input');
  const errEl   = document.getElementById('evt-lookup-error');
  const confirm = document.getElementById('evt-student-confirm');

  if (!input) return;
  const studentId = input.value.trim();
  errEl.style.display = 'none';

  if (!studentId) {
    errEl.textContent = 'Please enter your Student ID.';
    errEl.style.display = 'block';
    return;
  }

  /* Disable input during lookup */
  input.disabled = true;
  const btn = input.nextElementSibling;
  if (btn) { btn.disabled = true; btn.textContent = 'Searching...'; }

  try {
    const res  = await fetch('/api/events/lookup-student', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ studentId }),
    });
    const data = await res.json();

    if (!res.ok || !data.found) {
      errEl.textContent = data.message || 'Student ID not found.';
      errEl.style.display = 'block';
      input.disabled = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
      return;
    }

    /* Show confirm card */
    confirm.style.display = 'block';
    confirm.innerHTML = `
      <div style="margin-top:16px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.2);border-radius:12px;padding:18px">
        <div style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px">Student Found</div>
        <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">${escapeHtml(data.studentName)}</div>
        <div style="font-size:13px;color:rgba(255,255,255,.5)">
          ID: ${escapeHtml(data.studentId)}
          ${data.section && data.section !== 'N/A' ? ' · Section: <strong style="color:rgba(255,255,255,.75)">' + escapeHtml(data.section) + '</strong>' : ''}
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px">
          <button onclick="submitEventAttendance('${eventId}','${escapeHtml(data.studentId)}','attend')"
            style="padding:13px;background:#22c55e;color:#0d1117;border:none;border-radius:10px;
                   font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer">
            ✅ I will Attend
          </button>
          <button onclick="submitEventAttendance('${eventId}','${escapeHtml(data.studentId)}','cant_attend')"
            style="padding:13px;background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.3);border-radius:10px;
                   font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer">
            ❌ I can't Attend
          </button>
        </div>

        <button onclick="resetEventForm('${eventId}')"
          style="width:100%;margin-top:10px;padding:9px;background:transparent;color:rgba(255,255,255,.3);
                 border:1px solid rgba(255,255,255,.08);border-radius:10px;font-family:'DM Sans',sans-serif;
                 font-size:12px;cursor:pointer">
          Not you? Search again
        </button>
      </div>`;

  } catch (err) {
    errEl.textContent = 'Connection error. Please try again.';
    errEl.style.display = 'block';
    input.disabled = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Search'; }
  }
}

/* ── Submit attendance response ──────────────────────────────────── */
async function submitEventAttendance(eventId, studentId, response) {
  const formArea = document.getElementById('event-form-area');
  if (!formArea) return;

  formArea.innerHTML = `
    <div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,.5)">
      <div class="spinner" style="margin:0 auto 16px"></div>
      <p>Submitting your response...</p>
    </div>`;

  try {
    const res  = await fetch('/api/events/attend', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventId, studentId, response }),
    });
    const data = await res.json();

    if (!res.ok) {
      /* Already submitted */
      if (res.status === 409) {
        formArea.innerHTML = renderAlreadySubmitted(data.existingResponse);
        return;
      }
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
  const formArea = document.getElementById('event-form-area');
  if (formArea) formArea.innerHTML = renderStudentLookupForm(eventId);
}

/* ── Success screen ──────────────────────────────────────────────── */
function renderSuccessScreen(data, response) {
  const isAttend = response === 'attend';
  return `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">
      <div style="width:64px;height:64px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;
                  background:${isAttend ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.1)'};
                  border:2px solid ${isAttend ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.25)'}">
        <span style="font-size:28px">${isAttend ? '✅' : '😔'}</span>
      </div>
      <h3 style="font-size:18px;font-weight:800;color:#fff;margin:0 0 8px">
        ${isAttend ? "You're In!" : "Got It!"}
      </h3>
      <p style="font-size:14px;color:rgba(255,255,255,.5);margin:0 0 20px;line-height:1.6">
        ${escapeHtml(data.message)}
      </p>
      <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px;margin-bottom:4px">
        <div style="font-size:13px;font-weight:700;color:rgba(255,255,255,.8)">${escapeHtml(data.studentName)}</div>
        ${data.section && data.section !== 'N/A' ? `<div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:3px">Section ${escapeHtml(data.section)}</div>` : ''}
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.25);margin-top:12px">You can now close this page.</div>
    </div>`;
}

/* ── Already submitted message ───────────────────────────────────── */
function renderAlreadySubmitted(existingResponse) {
  const wasAttend = existingResponse === 'attend';
  return `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">
      <div style="font-size:40px;margin-bottom:14px">⚠️</div>
      <h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 8px">Already Submitted</h3>
      <p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin:0">
        You already responded to this event as
        <strong style="color:${wasAttend ? '#22c55e' : '#f87171'}">${wasAttend ? 'Attending' : "Can't Attend"}</strong>.
        <br>You can only submit once per event.
      </p>
    </div>`;
}

/* ── Closed event message ────────────────────────────────────────── */
function renderClosedMessage() {
  return `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px;text-align:center">
      <div style="font-size:36px;margin-bottom:14px">🔒</div>
      <h3 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 8px">Attendance Closed</h3>
      <p style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin:0">
        This event is no longer accepting attendance responses.
      </p>
    </div>`;
}

/* ── Error message ───────────────────────────────────────────────── */
function renderEventError(msg) {
  return `
    <div style="text-align:center;padding:60px 20px">
      <div style="font-size:36px;margin-bottom:14px">❌</div>
      <p style="font-size:15px;font-weight:700;color:#fff;margin:0 0 8px">Something went wrong</p>
      <p style="font-size:13px;color:rgba(255,255,255,.4);margin:0">${escapeHtml(msg)}</p>
    </div>`;
}

/* ── HTML escape utility ─────────────────────────────────────────── */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
