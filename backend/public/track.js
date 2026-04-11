/* ══════════════════════════════════════════════════════════════════════
   track.js — Public Document Tracking Logic
   CIT Document Tracker · Group 6

   SCAN LOGGING RULE: Logging is AUTOMATIC on QR scan only.
   When a user visits ?track=<internalId>, a scan modal appears
   to capture handler identity. The log is created automatically
   upon QR scan — no manual movement logging from inside the app.
══════════════════════════════════════════════════════════════════════ */

let _pubTrackDocId = null; // holds current tracked doc internal ID

/* ─────────────────────────────────────────────────────────────────────
   Spam prevention — prevent duplicate scan logs within 30 seconds
───────────────────────────────────────────────────────────────────── */
const SCAN_COOLDOWN_MS = 30000;
function _getScanKey(docId) { return 'cit_lastscan_' + docId; }
function _canLog(docId) {
  try {
    const last = parseInt(localStorage.getItem(_getScanKey(docId)) || '0', 10);
    return Date.now() - last > SCAN_COOLDOWN_MS;
  } catch(e) { return true; }
}
function _markScanned(docId) {
  try { localStorage.setItem(_getScanKey(docId), String(Date.now())); } catch(e) {}
}

/* ─────────────────────────────────────────────────────────────────────
   initTrackingPage — called on page load
   Checks URL params for ?track= or ?apply=
───────────────────────────────────────────────────────────────────── */
function initTrackingPage() {
  const params      = new URLSearchParams(window.location.search);
  const trackParam  = params.get('track');
  const applyParam  = params.get('apply');

  /* Handle ?apply= admin update link */
  if (applyParam) {
    load();
    try {
      const update = decodeSnapshot(applyParam);
      const d = findDoc(update.docId) || docs.find(x => x.id === update.docId);
      if (!d) {
        alert('Document not found in this browser.\nMake sure you are on the correct device.');
        return false;
      }
      if (!d.history) d.history = [];
      d.history.push({
        status:   update.status,
        date:     update.date,
        by:       update.handler,
        location: update.location,
        handler:  update.handler,
        note:     update.note
      });
      d.status = update.status;
      save();
      window.history.replaceState({}, '', window.location.pathname);
      alert('Update applied!\n\nDocument: ' + d.name +
            '\nNew status: ' + update.status +
            '\nLocation: '  + (update.location || '—') +
            '\nHandler: '   + (update.handler  || '—'));
    } catch (e) { alert('Could not apply update. Invalid link.'); }
    return false;
  }

  if (!trackParam) return false;

  load();

  /* Try local first */
  const localDoc = findDoc(trackParam) ||
    docs.find(x => x.id === trackParam) ||
    docs.find(x => x.id && x.id.toUpperCase() === trackParam.toUpperCase());

  if (localDoc) {
    renderPublicTrackResult(localDoc);
    if (_canLog(localDoc.internalId || localDoc.id)) {
      setTimeout(() => showScanLogPrompt(localDoc), 800);
    }
    return true;
  }

  /* Not found locally — fetch from backend API */
  _fetchAndRenderPublicDoc(trackParam);
  return true;
}

async function _fetchAndRenderPublicDoc(trackParam) {
  /* Show a loading state */
  const errEl = document.getElementById('search-error');
  if (errEl) {
    errEl.innerHTML = '<span style="color:rgba(255,255,255,.5)">Looking up document…</span>';
    errEl.style.display = 'block';
  }

  try {
    const result = await apiTrackDocument(trackParam);

    if (!result || result._error || result.message) {
      showPublicError(
        'Document <code style="color:#4ade80">' + trackParam + '</code> was not found.<br>' +
        'Please check the ID or contact the issuing office.'
      );
      return;
    }

    /* Normalize backend response to match local doc shape */
    const d = {
      ...result,
      id:            result.internalId,
      fullDisplayId: result.fullDisplayId || result.displayId,
    };

    /* Cache in local docs array for this session so QR/history work */
    const existing = docs.findIndex(x => (x.internalId||x.id) === d.internalId);
    if (existing >= 0) {
      docs[existing] = { ...docs[existing], ...d };
    } else {
      docs.push(d);
    }

    if (errEl) errEl.style.display = 'none';
    renderPublicTrackResult(d);

    if (_canLog(d.internalId || d.id)) {
      setTimeout(() => showScanLogPrompt(d), 800);
    }
  } catch(e) {
    console.error('[_fetchAndRenderPublicDoc]', e);
    showPublicError(
      'Could not reach the server. Please check your connection and try again.'
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────
   Show auto scan log prompt (appears when QR is scanned)
   This is NOT a manual form — it appears automatically on QR scan
───────────────────────────────────────────────────────────────────── */
function showScanLogPrompt(d) {
  const banner = document.createElement('div');
  banner.id = 'scan-auto-banner';
  banner.style.cssText = `
    position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    width:min(480px, 92vw);background:#0d1a10;border:1px solid rgba(74,222,128,.3);
    border-radius:12px;padding:18px 20px;z-index:9999;
    box-shadow:0 8px 40px rgba(0,0,0,.6);font-family:'DM Sans',sans-serif;`;
  banner.innerHTML = `
    <p style="font-size:12px;font-weight:700;color:rgba(74,222,128,.8);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">QR Scan Detected — Log Movement</p>
    <p style="font-size:12px;color:rgba(255,255,255,.4);margin-bottom:14px;line-height:1.5">
      Scanning logs movement only. It does <u>not</u> change the document status.
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div>
        <label style="font-size:10px;font-weight:700;color:rgba(255,255,255,.3);text-transform:uppercase;display:block;margin-bottom:5px">Your Name *</label>
        <input id="auto-scan-handler" type="text" placeholder="e.g. John Santos"
          style="width:100%;padding:8px 11px;border:1px solid rgba(255,255,255,.12);border-radius:7px;
                 background:rgba(255,255,255,.06);color:#e6edf3;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;box-sizing:border-box">
      </div>
      <div>
        <label style="font-size:10px;font-weight:700;color:rgba(255,255,255,.3);text-transform:uppercase;display:block;margin-bottom:5px">Location *</label>
        <input id="auto-scan-location" type="text" placeholder="e.g. Registrar's Office" list="auto-scan-loc-opts"
          style="width:100%;padding:8px 11px;border:1px solid rgba(255,255,255,.12);border-radius:7px;
                 background:rgba(255,255,255,.06);color:#e6edf3;font-family:'DM Sans',sans-serif;font-size:13px;outline:none;box-sizing:border-box">
        <datalist id="auto-scan-loc-opts">
          <option value="Registrar's Office"><option value="Dean's Office">
          <option value="Accounting Office"><option value="Administrative Office">
          <option value="Document Control Office"><option value="Archive Room">
          <option value="Faculty Room"><option value="Library">
        </datalist>
      </div>
    </div>
    <p id="auto-scan-error" style="color:#f87171;font-size:11px;min-height:14px;margin-bottom:8px"></p>
    <div style="display:flex;gap:8px">
      <button onclick="confirmAutoScanLog('${d.internalId||d.id}')"
        style="flex:1;padding:10px 0;background:#4ade80;color:#0d1117;border:none;border-radius:7px;
               font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">
        Log Movement
      </button>
      <button onclick="dismissScanBanner()"
        style="padding:10px 18px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.5);
               border:1px solid rgba(255,255,255,.1);border-radius:7px;
               font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;">
        Skip
      </button>
    </div>`;
  document.body.appendChild(banner);
}

function confirmAutoScanLog(docId) {
  const handler  = (document.getElementById('auto-scan-handler')  || {value:''}).value.trim();
  const location = (document.getElementById('auto-scan-location') || {value:''}).value.trim();
  const errEl    = document.getElementById('auto-scan-error');

  if (!handler || !location) {
    if (errEl) errEl.textContent = 'Please enter your name and current location.';
    return;
  }

  /* Auto-create movement log entry */
  const entry = {
    documentId:  docId,
    handledBy:   handler,
    location,
    action:      'Scanned',
    timestamp:   new Date().toISOString(),
    displayDate: new Date().toLocaleString('en-PH')
  };
  try {
    const raw  = localStorage.getItem('cit_movements');
    const logs = raw ? JSON.parse(raw) : [];
    logs.push(entry);
    localStorage.setItem('cit_movements', JSON.stringify(logs));
    _markScanned(docId);
  } catch(e) { console.warn('Could not save movement log', e); }

  dismissScanBanner();

  /* Show confirmation toast */
  const conf = document.createElement('div');
  conf.style.cssText = `
    position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:#22c55e;color:#0d1117;padding:10px 22px;border-radius:8px;
    font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;
    z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.4);`;
  conf.textContent = 'Movement logged successfully.';
  document.body.appendChild(conf);
  setTimeout(() => conf.remove(), 3000);
}

function dismissScanBanner() {
  const banner = document.getElementById('scan-auto-banner');
  if (banner) banner.remove();
}

/* ─────────────────────────────────────────────────────────────────────
   handleTrack — user clicks "Track Document" in hero
───────────────────────────────────────────────────────────────────── */
async function handleTrack() {
  const raw   = (document.getElementById('doc-input').value || '').trim().toUpperCase();
  const errEl = document.getElementById('search-error');

  if (!raw) {
    errEl.innerHTML = 'Please enter a Document ID.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  document.getElementById('btn-label').style.display  = 'none';
  document.getElementById('btn-spinner').style.display = '';
  document.getElementById('track-btn').disabled        = true;

  try {
    load();
    /* Search locally first */
    let d = findDoc(raw) || docs.find(x => x.id && x.id.toUpperCase() === raw);

    /* Not found locally — try backend API */
    if (!d) {
      const result = await apiTrackDocument(raw);
      if (result && !result._error && !result.message) {
        d = { ...result, id: result.internalId, fullDisplayId: result.fullDisplayId || result.displayId };
        /* Cache for this session */
        const existing = docs.findIndex(x => (x.internalId||x.id) === d.internalId);
        if (existing >= 0) { docs[existing] = { ...docs[existing], ...d }; }
        else { docs.push(d); }
      }
    }

    if (!d) {
      errEl.innerHTML = 'Document <strong>' + raw + '</strong> not found. Check the ID and try again.';
      errEl.style.display = 'block';
      return;
    }

    renderPublicTrackResult(d);
  } catch(e) {
    console.error('[handleTrack]', e);
    errEl.innerHTML = 'Error searching for document. Please try again.';
    errEl.style.display = 'block';
  } finally {
    document.getElementById('btn-label').style.display  = '';
    document.getElementById('btn-spinner').style.display = 'none';
    document.getElementById('track-btn').disabled        = false;
  }
}

function showPublicError(msg) {
  const errEl = document.getElementById('search-error');
  errEl.innerHTML     = msg;
  errEl.style.display = 'block';
}

/* ─────────────────────────────────────────────────────────────────────
   Render full public tracking result
───────────────────────────────────────────────────────────────────── */
function renderPublicTrackResult(d) {
  _pubTrackDocId = d.internalId || d.id;

  const sc         = statusColorMap[d.status] || '#64748b';
  const isReleased = d.status === 'Released';
  const isRejected = d.status === 'Rejected';
  const workflow   = ['Received', 'Processing', 'For Approval', 'Approved', 'Released'];
  const curIdx     = workflow.indexOf(d.status);
  const lastLoc    = getLatestLocationPublic(d);
  const dispId     = d.fullDisplayId || d.displayId || d.id;

  /* ── Populate new compact header card ── */
  document.getElementById('res-doc-name').textContent = d.name;
  document.getElementById('res-doc-meta').textContent = dispId + ' · ' + d.type;
  document.getElementById('res-status-badge').innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:99px;font-size:12px;font-weight:700;background:${sc}22;border:1px solid ${sc}55;color:${sc}">
      <span style="width:6px;height:6px;border-radius:50%;background:${sc};display:inline-block${!isRejected&&!isReleased?';animation:pulse 1.5s infinite':''}"></span>
      ${d.status}
    </span>`;

  const locRow = document.getElementById('res-location-row');
  if (lastLoc.location || lastLoc.handler) {
    locRow.style.display = '';
    locRow.innerHTML =
      (lastLoc.location ? `<span class="res-loc-item">📍 <strong>${lastLoc.location}</strong></span>` : '') +
      (lastLoc.handler  ? `<span class="res-loc-item">👤 <strong>${lastLoc.handler}</strong></span>`  : '');
  } else {
    locRow.style.display = 'none';
  }



  /* Document Details */
  const relEntry    = [...(d.history || [])].reverse().find(function(h){ return h.status === 'Released'; });
  const releaseDate = relEntry ? relEntry.date : null;
  const office      = docOfficeMap[d.type] || 'Document Control Office';

  document.getElementById('detail-list').innerHTML = [
    ['Submitted By',    d.by],
    ['Purpose',         d.purpose],
    ['Assigned Office', office],
    ['Priority',        d.priority || 'Normal'],
    ['Date Filed',      d.date],
    ['Release Date',    releaseDate
      ? `<span style="color:#4ade80;font-weight:600">${releaseDate}</span>`
      : `<span style="color:rgba(255,255,255,.25)">Pending</span>`]
  ].map(function(row){
    return `<div class="res-field-row">
      <span class="res-field-label">${row[0]}</span>
      <span class="res-field-value">${row[1]}</span>
    </div>`;
  }).join('');

  /* Download zone */
  document.getElementById('download-zone').innerHTML = buildPublicFileSection(d);

  /* QR code — FIX: use full page URL so QR works on GitHub Pages, Render, etc. */
  const trackUrl = window.location.href.split('?')[0].replace(/\/+$/, '') + '?track=' + (d.internalId || d.id);
  const qrBox    = document.getElementById('pub-qr-box');
  qrBox.innerHTML = '';
  const target = document.createElement('div');
  qrBox.appendChild(target);
  new QRCode(target, { text: trackUrl, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
  document.getElementById('qr-url-tag').textContent = trackUrl;

  /* Activity History */
  const hist    = d.history || [];
  let moves = [];
  try {
    const raw = localStorage.getItem('cit_movements');
    if (raw) {
      moves = JSON.parse(raw).filter(function(m){ return m.documentId === (d.internalId || d.id); });
    }
  } catch(e) {}
  if (typeof movementLogs !== 'undefined') {
    moves = moves.concat(movementLogs.filter(function(m){ return m.documentId === (d.internalId || d.id); }));
  }

  const combined = [
    ...hist.map(function(h){ return { _type: h.action === 'Scanned' ? 'scan' : 'status', status: h.status || '', by: h.by || '—', date: h.date || '', location: h.location || '', handler: h.handler || '', note: h.note || '' }; }),
    ...moves.map(function(m){ return { _type: 'scan', status: '', by: m.handledBy || '—', date: m.displayDate || m.timestamp, location: m.location || '', handler: '', note: '' }; })
  ].sort(function(a, b){
    const da = new Date(a.date), db = new Date(b.date);
    return (isNaN(da) || isNaN(db)) ? 0 : da - db;
  });

  const timelineHtml = combined.length === 0
    ? '<p style="font-size:13px;color:rgba(255,255,255,.3)">No history recorded.</p>'
    : [...combined].reverse().map(function(h){
        const isScan    = h._type === 'scan';
        const dotCls    = isScan ? '' : (h.status || '').toLowerCase().replace(/\s+/g, '');
        const dotStyle  = isScan ? 'style="background:#4ade80;border-color:rgba(74,222,128,.5)"' : '';
        const aLabel    = isScan ? 'QR Scanned' : 'Status Update';
        const aBg       = isScan ? 'rgba(74,222,128,.12)' : 'rgba(59,130,246,.12)';
        const aColor    = isScan ? '#4ade80' : '#93c5fd';
        const aBorder   = isScan ? 'rgba(74,222,128,.25)' : 'rgba(59,130,246,.25)';
        return `<div class="ttl-item">
          <div class="ttl-dot ${isScan ? '' : dotCls}" ${dotStyle}></div>
          <div style="margin-bottom:3px">
            <span style="display:inline-flex;align-items:center;padding:2px 8px;background:${aBg};border:1px solid ${aBorder};border-radius:20px;font-size:9px;font-weight:700;color:${aColor};letter-spacing:.4px;text-transform:uppercase">${aLabel}</span>
          </div>
          <div class="ttl-status-label">${isScan ? 'Handled by ' + h.by : (h.status || '—')}</div>
          <div class="ttl-meta">${isScan ? '' : 'By ' + h.by + ' &nbsp;·&nbsp; '}${h.date}</div>
          ${(h.location || h.handler) ? `<div class="ttl-loc">${h.location ? h.location : ''}${h.location && h.handler ? ' &nbsp;·&nbsp; ' : ''}${h.handler ? h.handler : ''}</div>` : ''}
          ${h.note ? `<div class="ttl-note">"${h.note}"</div>` : ''}
        </div>`;
      }).join('');

  document.getElementById('pub-timeline').innerHTML = timelineHtml;

  /* Show result, hide hero */
  document.getElementById('hero').style.display           = 'none';
  document.getElementById('result-section').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Go back */
function goBack() {
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('hero').style.display           = '';
  document.getElementById('doc-input').value              = '';
  document.getElementById('search-error').style.display   = 'none';
  _pubTrackDocId = null;
  window.history.replaceState({}, '', window.location.pathname);
  dismissScanBanner();
}

function getLatestLocationPublic(d) {
  if (!d.history || !d.history.length) return { location: '', handler: '' };
  for (let i = d.history.length - 1; i >= 0; i--) {
    const h = d.history[i];
    if (h.location || h.handler) return { location: h.location || '', handler: h.handler || '' };
  }
  return { location: '', handler: '' };
}

/* ── Internal (app) track-by-ID search ── */
async function searchByTrackingId() {
  const raw    = (document.getElementById('track-id-input').value || '').trim().toUpperCase();
  const result = document.getElementById('track-search-result');

  if (!raw) { toast('Please enter a Tracking ID.'); return; }

  /* Search locally first */
  let d = findDoc(raw) || docs.find(x => x.id && x.id.toUpperCase() === raw);

  /* Fall back to backend */
  if (!d) {
    toast('Searching server…');
    const apiResult = await apiTrackDocument(raw);
    if (apiResult && !apiResult._error && !apiResult.message) {
      d = { ...apiResult, id: apiResult.internalId, fullDisplayId: apiResult.fullDisplayId || apiResult.displayId };
      const existing = docs.findIndex(x => (x.internalId||x.id) === d.internalId);
      if (existing >= 0) { docs[existing] = { ...docs[existing], ...d }; }
      else { docs.push(d); }
    }
  }

  if (!d) {
    result.style.display = 'block';
    result.innerHTML = `
      <div class="card">
        <div class="card-body" style="text-align:center;padding:36px">
          <p style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">Document Not Found</p>
          <p style="font-size:13px;color:var(--muted)">No document with ID <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${raw}</code> was found.</p>
        </div>
      </div>`;
    return;
  }

  const sc       = statusColorMap[d.status] || '#64748b';
  const workflow = ['Received', 'Processing', 'For Approval', 'Approved', 'Released'];
  const curIdx   = workflow.indexOf(d.status);
  const isRejected = d.status === 'Rejected';
  const isReleased = d.status === 'Released';
  const lastLoc    = getLatestLocation(d);
  const dispId     = d.fullDisplayId || d.displayId || d.id;

  const wfDots = isRejected
    ? `<div style="text-align:center;width:100%;padding:8px 0"><span style="font-size:13px;color:#ef4444;font-weight:600">Document was Rejected</span></div>`
    : workflow.map(function(step, i){
        const done = curIdx > i, curr = curIdx === i;
        const cls  = done ? 'done' : curr ? 'current' : '';
        return (i > 0 ? '<div class="twf-arrow">›</div>' : '') +
          `<div class="twf-step">
             <div class="twf-dot ${cls}">${done ? '✓' : i + 1}</div>
             <div class="twf-label ${cls}">${step}</div>
           </div>`;
      }).join('');

  const _sEntries = (d.history || []).map(function(h){ return {
    _type: h.action === 'Scanned' ? 'scan' : 'status',
    status: h.status || '', by: h.by || '—',
    date: h.date || '', location: h.location || '', handler: h.handler || '', note: h.note || ''
  }; });
  const _mEntries = movementLogs.filter(function(m){ return m.documentId === (d.internalId||d.id); }).map(function(m){ return {
    _type: 'scan', status: '', by: m.handledBy || '—',
    date: m.displayDate || m.timestamp, location: m.location || '', handler: '', note: ''
  }; });
  const _combined = [..._sEntries, ..._mEntries].sort(function(a, b){
    const da = new Date(a.date), db = new Date(b.date);
    return (isNaN(da) || isNaN(db)) ? 0 : da - db;
  });

  const histHtml = _combined.length === 0
    ? '<p style="font-size:13px;color:var(--muted)">No history recorded.</p>'
    : [..._combined].reverse().map(function(h){
        const isScan  = h._type === 'scan';
        const dotCls  = isScan ? 'received' : (h.status || '').toLowerCase().replace(/\s+/g, '');
        const aLabel  = isScan ? 'QR Scanned' : 'Status Update';
        const aBg     = isScan ? '#f0fdf4' : '#eff6ff';
        const aColor  = isScan ? '#15803d' : '#1d4ed8';
        const aBorder = isScan ? '#bbf7d0' : '#bfdbfe';
        return `<div class="ttl-item">
          <div class="ttl-dot ${isScan ? '' : dotCls}" ${isScan ? 'style="background:#4ade80;border-color:#22c55e"' : ''}></div>
          <div style="margin-bottom:3px">
            <span style="display:inline-flex;align-items:center;padding:2px 8px;background:${aBg};border:1px solid ${aBorder};border-radius:20px;font-size:9px;font-weight:700;color:${aColor};letter-spacing:.4px;text-transform:uppercase">${aLabel}</span>
          </div>
          <div class="ttl-status-label">${isScan ? 'Handled by ' + h.by : h.status}</div>
          <div class="ttl-meta">${isScan ? '' : 'By ' + h.by + ' &nbsp;·&nbsp; '}${h.date}</div>
          ${(h.location || h.handler) ? `<div class="ttl-loc">${h.location ? h.location : ''}${h.location && h.handler ? ' &nbsp;·&nbsp; ' : ''}${h.handler ? h.handler : ''}</div>` : ''}
          ${h.note ? `<div class="ttl-note">"${h.note}"</div>` : ''}
        </div>`;
      }).join('');

  const baseUrl  = (getSavedBaseUrl() || window.location.origin + window.location.pathname)
                     .replace(/\/+$/, '').split('?')[0];
  const trackUrl = baseUrl + '?track=' + (d.internalId || d.id);

  /* File section — no preview, clean download button */
  const fileSection = buildInternalFileSection(d, sc);

  result.style.display = 'block';
  result.innerHTML = `
    <div class="card">
      <div class="card-head" style="background:#f8fafc">
        <div>
          <h3>${d.name}</h3>
          <p style="font-size:12px;color:var(--muted);font-family:'DM Mono',monospace">${dispId} · ${d.type}</p>
        </div>
        <span class="badge badge-${(d.status || '').toLowerCase().replace(/\s+/g, '')}">${d.status}</span>
      </div>
      <div class="card-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;flex-wrap:wrap">
          <div style="text-align:center">
            <p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Permanent QR Code</p>
            <div id="track-search-qr"
                 style="display:inline-block;padding:12px;background:#fff;border:2px solid var(--border);border-radius:12px;margin-bottom:8px"></div>
            <p style="font-size:10px;color:var(--muted);margin-bottom:4px">Scan to track · Always shows live status</p>
            <p style="font-size:9px;color:#94a3b8;font-family:'DM Mono',monospace;word-break:break-all;max-width:200px;margin:0 auto;line-height:1.5">${trackUrl}</p>
          </div>
          <div>
            <p style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Document Progress</p>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:18px" class="track-workflow">${wfDots}</div>
            <p style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Status Timeline</p>
            <div class="track-timeline" style="background:rgba(0,0,0,.02);border-radius:8px;padding:14px 14px 14px 32px">${histHtml}</div>
          </div>
        </div>
      </div>
    </div>
    ${fileSection}`;

  const qrTarget = document.getElementById('track-search-qr');
  if (qrTarget) {
    new QRCode(qrTarget, { text: trackUrl, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
  }
  toast('Document found. QR code generated.');
}

/* File section for internal app view — shows both originalFile and processedFile */
function buildInternalFileSection(d, sc) {
  const isReleased   = d.status === 'Released';
  const hasOriginal  = (typeof docHasOriginalFile  === 'function') ? docHasOriginalFile(d)  : !!(d.originalFile || d.fileData);
  const hasProcessed = (typeof docHasProcessedFile === 'function') ? docHasProcessedFile(d) : !!(d.processedFile);
  const docKey       = d.internalId || d.id;

  if (!hasOriginal && !hasProcessed) return '';

  let html = `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Document Files</h3></div><div class="card-body" style="padding:0">`;

  /* Original file row */
  if (hasOriginal) {
    html += `
      <div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border)">
        <div style="width:36px;height:36px;background:#f8fafc;border:1px solid var(--border);border-radius:8px;display:grid;place-items:center;flex-shrink:0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:var(--text)">Original File <span style="font-size:11px;font-weight:400;color:var(--muted)">(Submitted)</span></div>
          <div style="font-size:11px;color:var(--muted);margin-top:2px">Submitted by ${d.by || d.ownerName || 'user'} · IDEA-128 encrypted · Reference copy only</div>
        </div>
        <span style="font-size:10px;font-weight:700;color:#94a3b8;padding:3px 10px;background:#f1f5f9;border:1px solid var(--border);border-radius:20px">Reference Only</span>
      </div>`;
  }

  /* Processed file row */
  if (hasProcessed && isReleased) {
    html += `
      <div style="padding:20px;text-align:center">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">
          <div style="width:36px;height:36px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:8px;display:grid;place-items:center;flex-shrink:0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="18" x2="12" y2="12"/></svg>
          </div>
          <div style="flex:1;text-align:left">
            <div style="font-size:13px;font-weight:700;color:#15803d">Final File <span style="font-weight:500">(Approved)</span></div>
            <div style="font-size:11px;color:#16a34a;margin-top:1px">Processed by ${d.processedBy||'Admin'}${d.processedAt?' · '+d.processedAt:''}</div>
          </div>
          <span style="font-size:10px;font-weight:700;color:#16a34a;padding:3px 10px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:20px">Released ✓</span>
        </div>
        <button onclick="decryptAndDownload('${docKey}',this)"
           class="btn btn-primary"
           style="display:inline-flex;align-items:center;gap:8px;padding:12px 28px;font-size:14px;border:none;cursor:pointer;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download Final File
        </button>
        <p style="font-size:11px;color:var(--muted);margin-top:10px">Decrypted locally with IDEA-128</p>
      </div>`;
  } else if (hasProcessed && !isReleased) {
    html += `
      <div style="padding:20px;text-align:center">
        <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px">Final File Attached — Pending Release</p>
        <p style="font-size:12px;color:var(--muted);margin-bottom:12px">Admin has uploaded the processed file. It will be downloadable once status is <strong>Released</strong>.</p>
        <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;background:#f8fafc;border:1px solid var(--border);border-radius:20px;font-size:12px;color:var(--muted)">
          Current status: <strong style="color:${sc};margin-left:4px">${d.status}</strong>
        </div>
      </div>`;
  } else {
    html += `
      <div style="padding:24px;text-align:center">
        <div style="width:44px;height:44px;margin:0 auto 12px;background:#f8fafc;border:2px solid var(--border);border-radius:50%;display:grid;place-items:center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:5px">Final File Pending</p>
        <p style="font-size:12px;color:var(--muted);line-height:1.6">Admin will upload the processed/approved file before releasing.<br>Current status: <strong style="color:${sc}">${d.status}</strong></p>
      </div>`;
  }

  html += '</div></div>';
  return html;
}
/* ── Download the public QR code as PNG ── */
function downloadPublicQR() {
  const qrBox = document.getElementById('pub-qr-box');
  if (!qrBox) return;
  const canvas = qrBox.querySelector('canvas');
  const img    = qrBox.querySelector('img');
  if (canvas) {
    const link = document.createElement('a');
    link.download = 'document-qr-code.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  } else if (img) {
    const link = document.createElement('a');
    link.download = 'document-qr-code.png';
    link.href = img.src;
    link.click();
  } else {
    alert('QR code not ready yet. Please wait a moment and try again.');
  }
}