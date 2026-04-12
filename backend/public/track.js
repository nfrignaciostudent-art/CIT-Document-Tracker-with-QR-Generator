/* ══════════════════════════════════════════════════════════════════════
   track.js - Public Document Tracking Logic
   CIT Document Tracker - Group 6

   SCAN LOGGING RULE:
     QR scan logging is FULLY AUTOMATIC.
     No form, no manual input, no banner.
     When ?track= is detected, the system silently logs the scan event
     to the backend scan_logs collection (separate from doc.history).
     Users cannot manually add or edit movement logs.

   TIMEZONE: Displays timestamps in Asia/Manila (UTC+8).
══════════════════════════════════════════════════════════════════════ */

let _pubTrackDocId = null;

/* ── Spam prevention: no duplicate scan logs within 30 seconds ── */
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

/* ── Manila timestamp helper ── */
function _manilaDisplayDate() {
  return new Date().toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true
  });
}

/* ── _autoLogQRScan - AUTOMATIC, SILENT scan log on QR detection ──
   No form. No manual input. System-generated only.
   Saves to scan_logs collection via POST /api/documents/:id/scan-log.
   Does NOT touch doc.history. Does NOT change document status.
───────────────────────────────────────────────────────────────────── */
function _autoLogQRScan(d) {
  const docId = d.internalId || d.id;

  if (!_canLog(docId)) return;
  _markScanned(docId);

  /* Persist to backend scan_logs collection - fire and forget */
  if (typeof apiLogScan === 'function') {
    apiLogScan(docId, {
      handledBy: 'QR Visitor',
      location:  'QR Scan',
      note:      'Auto-logged on QR scan'
    }).catch(e => console.warn('[_autoLogQRScan] Backend sync failed:', e));
  }

  _showScanToast('QR scan logged automatically.');
}

/* Small, non-blocking toast for scan confirmation */
function _showScanToast(msg) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:#0d1a10;border:1px solid rgba(74,222,128,.3);color:rgba(74,222,128,.9);
    padding:9px 20px;border-radius:8px;font-family:'DM Sans',sans-serif;
    font-size:12px;font-weight:600;z-index:9999;
    box-shadow:0 4px 20px rgba(0,0,0,.4);pointer-events:none;
    animation:fadeInUp .2s ease;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ── initTrackingPage - called on page load ── */
function initTrackingPage() {
  const params      = new URLSearchParams(window.location.search);
  const trackParam  = params.get('track');
  const applyParam  = params.get('apply');

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
            '\nLocation: '  + (update.location || '-') +
            '\nHandler: '   + (update.handler  || '-'));
    } catch (e) { alert('Could not apply update. Invalid link.'); }
    return false;
  }

  if (!trackParam) return false;

  load();

  const localDoc = findDoc(trackParam) ||
    docs.find(x => x.id === trackParam) ||
    docs.find(x => x.id && x.id.toUpperCase() === trackParam.toUpperCase());

  if (localDoc) {
    renderPublicTrackResult(localDoc);
    setTimeout(() => _autoLogQRScan(localDoc), 800);
    return true;
  }

  _fetchAndRenderPublicDoc(trackParam);
  return true;
}

async function _fetchAndRenderPublicDoc(trackParam) {
  const errEl = document.getElementById('search-error');
  if (errEl) {
    errEl.innerHTML = '<span style="color:rgba(255,255,255,.5)">Looking up document...</span>';
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

    const d = {
      ...result,
      id:            result.internalId,
      fullDisplayId: result.fullDisplayId || result.displayId,
    };

    const existing = docs.findIndex(x => (x.internalId||x.id) === d.internalId);
    if (existing >= 0) {
      docs[existing] = { ...docs[existing], ...d };
    } else {
      docs.push(d);
    }

    if (errEl) errEl.style.display = 'none';
    renderPublicTrackResult(d);

    setTimeout(() => _autoLogQRScan(d), 800);

  } catch(e) {
    console.error('[_fetchAndRenderPublicDoc]', e);
    showPublicError('Could not reach the server. Please check your connection and try again.');
  }
}

/* ── handleTrack - user clicks "Track Document" in hero ── */
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
    let d = findDoc(raw) || docs.find(x => x.id && x.id.toUpperCase() === raw);

    if (!d) {
      const result = await apiTrackDocument(raw);
      if (result && !result._error && !result.message) {
        d = { ...result, id: result.internalId, fullDisplayId: result.fullDisplayId || result.displayId };
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
    /* Manual "Track" search does NOT auto-log a scan -
       only an actual QR scan (via URL ?track= param) triggers logging. */
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

/* ── Render full public tracking result - READ-ONLY ── */
function renderPublicTrackResult(d) {
  _pubTrackDocId = d.internalId || d.id;

  const sc         = statusColorMap[d.status] || '#64748b';
  const isReleased = d.status === 'Released';
  const isRejected = d.status === 'Rejected';
  const workflow   = ['Received', 'Processing', 'For Approval', 'Approved', 'Released'];
  const curIdx     = workflow.indexOf(d.status);
  const lastLoc    = getLatestLocationPublic(d);
  const dispId     = d.fullDisplayId || d.displayId || d.id;
  const office     = (typeof docOfficeMap !== 'undefined' ? docOfficeMap[d.type] : null) || 'Document Control Office';
  const relEntry   = [...(d.history || [])].reverse().find(h => h.status === 'Released');

  /* ── Header ── */
  document.getElementById('res-doc-name').textContent = d.name;
  document.getElementById('res-doc-meta').textContent = dispId + ' · ' + (d.type || '');
  document.getElementById('res-status-badge').innerHTML =
    `<span style="display:inline-flex;align-items:center;gap:7px;padding:6px 14px;border-radius:99px;
      font-size:12px;font-weight:700;background:${sc}18;border:1px solid ${sc}44;color:${sc}">
      <span style="width:7px;height:7px;border-radius:50%;background:${sc};flex-shrink:0;display:inline-block${
        !isRejected && !isReleased ? ';animation:pulse 1.5s infinite' : ''}"></span>
      ${d.status}
    </span>`;

  /* ── Location row ── */
  const locRow = document.getElementById('res-location-row');
  if (lastLoc.location || lastLoc.handler) {
    locRow.style.display = '';
    locRow.innerHTML =
      (lastLoc.location ? `<span class="rec-loc-pill">${lastLoc.location}</span>` : '') +
      (lastLoc.handler  ? `<span class="rec-loc-pill">${lastLoc.handler}</span>`  : '');
  } else {
    locRow.style.display = 'none';
  }

  /* ── Workflow ── */
  document.getElementById('receipt-workflow').innerHTML = isRejected
    ? `<div class="rec-wf-rejected">Document Rejected</div>`
    : workflow.map((step, i) => {
        const done = curIdx > i, curr = curIdx === i;
        return `
          ${i > 0 ? `<div class="rec-wf-line${done ? ' done' : ''}"></div>` : ''}
          <div class="rec-wf-step">
            <div class="rec-wf-dot${done ? ' done' : curr ? ' curr' : ''}">
              ${done
                ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
                : curr ? `<span class="rec-wf-pulse"></span>` : i + 1}
            </div>
            <span class="rec-wf-label${done ? ' done' : curr ? ' curr' : ''}">${step}</span>
          </div>`;
      }).join('');

  /* ── Details ── */
  document.getElementById('detail-list').innerHTML = [
    ['Submitted By',    d.by],
    ['Purpose',         d.purpose],
    ['Assigned Office', office],
    ['Priority',        d.priority || 'Normal'],
    ['Date Filed',      d.date],
    ['Release Date',    relEntry
      ? `<span style="color:#4ade80;font-weight:600">${relEntry.date}</span>`
      : `<span style="opacity:.4">Pending</span>`]
  ].map(([lbl, val]) =>
    `<div class="rec-detail-row">
      <span class="rec-detail-label">${lbl}</span>
      <span class="rec-detail-value">${val}</span>
    </div>`
  ).join('');

  /* ── Timeline ── */
  const hist = (d.history || [])
    .filter(h => h.action === 'Status Update' || h.action === 'Movement' || !h.action)
    .map(h => ({
      _type: h.action === 'Movement' ? 'movement' : 'status',
      status: h.status || '', by: h.by || '-',
      date: h.date || '', location: h.location || '',
      handler: h.handler || '', note: h.note || ''
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .reverse();

  document.getElementById('pub-timeline').innerHTML = hist.length === 0
    ? `<p class="rec-empty">No history recorded yet.</p>`
    : hist.map(h => {
        const isMove = h._type === 'movement';
        return `<div class="rec-tl-item">
          <div class="rec-tl-dot" style="background:${isMove ? '#f59e0b' : sc}"></div>
          <div class="rec-tl-body">
            <span class="rec-tl-tag ${isMove ? 'move' : 'stat'}">${isMove ? 'Movement' : 'Status Update'}</span>
            <div class="rec-tl-title">${isMove ? 'Handled by ' + h.by : h.status}</div>
            <div class="rec-tl-meta">${isMove ? '' : 'By ' + h.by + ' · '}${h.date}</div>
            ${h.location ? `<div class="rec-tl-loc">${h.location}${h.handler ? ' · ' + h.handler : ''}</div>` : ''}
            ${h.note ? `<div class="rec-tl-note">"${h.note}"</div>` : ''}
          </div>
        </div>`;
      }).join('');

  /* ── QR ── */
  const trackUrl = window.location.href.split('?')[0].replace(/\/+$/, '') + '?track=' + (d.internalId || d.id);
  const qrBox = document.getElementById('pub-qr-box');
  qrBox.innerHTML = '';
  const target = document.createElement('div');
  qrBox.appendChild(target);
  new QRCode(target, { text: trackUrl, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
  document.getElementById('qr-url-tag').textContent = trackUrl;

  /* ── Files ── */
  const hasOriginal  = (typeof docHasOriginalFile  === 'function') ? docHasOriginalFile(d)  : !!(d.originalFile || d.fileData);
  const hasProcessed = (typeof docHasProcessedFile === 'function') ? docHasProcessedFile(d) : !!(d.processedFile);
  const docKey       = d.internalId || d.id;
  let fileHtml = '';

  if (!hasOriginal && !hasProcessed) {
    fileHtml = `<p class="rec-empty">No digital file attached.</p>`;
  } else {
    if (hasOriginal) {
      fileHtml += `
        <div class="rec-file-row">
          <div class="rec-file-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="rec-file-info">
            <div class="rec-file-name">Original File <span class="rec-file-sub">(Submitted)</span></div>
            <div class="rec-file-meta">By ${d.by || 'user'} · IDEA-128 encrypted · Not downloadable</div>
          </div>
          <span class="rec-file-badge">Reference Only</span>
        </div>`;
    }
    if (hasProcessed && isReleased) {
      fileHtml += `
        <div class="rec-file-row final">
          <div class="rec-file-icon final">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="18" x2="12" y2="12"/></svg>
          </div>
          <div class="rec-file-info">
            <div class="rec-file-name" style="color:#4ade80">Final File <span class="rec-file-sub">(Approved)</span></div>
            <div class="rec-file-meta">By ${d.processedBy || 'Admin'}${d.processedAt ? ' · ' + d.processedAt : ''}</div>
          </div>
          <span class="rec-file-badge final">Released</span>
        </div>
        <div style="padding:14px 0 4px;text-align:center">
          <button onclick="decryptAndDownload('${docKey}',this)" class="rec-dl-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Final File
          </button>
          <p class="rec-dl-hint">Decrypted locally · IDEA-128</p>
        </div>`;
    } else if (!isReleased) {
      fileHtml += `
        <div class="rec-file-locked">
          <div class="rec-lock-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <div class="rec-lock-title">Final File Pending</div>
          <div class="rec-lock-desc">Available once status reaches <strong style="color:#4ade80">Released</strong>.<br>Current: <strong style="color:${sc}">${d.status}</strong></div>
        </div>`;
    }
  }
  document.getElementById('download-zone').innerHTML = fileHtml;

  document.getElementById('hero').style.display           = 'none';
  document.getElementById('result-section').style.display = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
  _pubTrackDocId = d.internalId || d.id;

  const sc         = statusColorMap[d.status] || '#64748b';
  const isReleased = d.status === 'Released';
  const isRejected = d.status === 'Rejected';
  const workflow   = ['Received', 'Processing', 'For Approval', 'Approved', 'Released'];
  const curIdx     = workflow.indexOf(d.status);
  const lastLoc    = getLatestLocationPublic(d);
  const dispId     = d.fullDisplayId || d.displayId || d.id;
  const office     = (typeof docOfficeMap !== 'undefined' ? docOfficeMap[d.type] : null) || 'Document Control Office';
  const relEntry   = [...(d.history || [])].reverse().find(h => h.status === 'Released');
  const trackUrl   = window.location.href.split('?')[0].replace(/\/+$/, '') + '?track=' + (d.internalId || d.id);

  /* ── Workflow progress bar ── */
  const wfHtml = isRejected
    ? `<div class="pub-wf-rejected">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        Document Rejected
       </div>`
    : workflow.map((step, i) => {
        const done = curIdx > i;
        const curr = curIdx === i;
        return `
          ${i > 0 ? `<div class="pub-wf-line ${done ? 'done' : ''}"></div>` : ''}
          <div class="pub-wf-step">
            <div class="pub-wf-dot ${done ? 'done' : curr ? 'current' : ''}">
              ${done
                ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
                : curr ? `<span class="pub-wf-pulse"></span>` : i + 1}
            </div>
            <span class="pub-wf-label ${done ? 'done' : curr ? 'current' : ''}">${step}</span>
          </div>`;
      }).join('');

  /* ── Activity timeline ── */
  const hist = (d.history || [])
    .filter(h => h.action === 'Status Update' || h.action === 'Movement' || !h.action)
    .map(h => ({
      _type:    h.action === 'Movement' ? 'movement' : 'status',
      status:   h.status   || '',
      by:       h.by       || '-',
      date:     h.date     || '',
      location: h.location || '',
      handler:  h.handler  || '',
      note:     h.note     || ''
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .reverse();

  const timelineHtml = hist.length === 0
    ? `<p class="pub-empty">No history recorded yet.</p>`
    : hist.map(h => {
        const isMove = h._type === 'movement';
        const dotBg  = isMove ? '#f59e0b' : sc;
        const tag    = isMove
          ? `<span class="pub-tl-tag move">Movement</span>`
          : `<span class="pub-tl-tag status">Status Update</span>`;
        return `
          <div class="pub-tl-item">
            <div class="pub-tl-dot" style="background:${dotBg};box-shadow:0 0 0 3px ${dotBg}22"></div>
            <div class="pub-tl-body">
              ${tag}
              <div class="pub-tl-title">${isMove ? 'Handled by ' + h.by : h.status}</div>
              <div class="pub-tl-meta">${isMove ? '' : 'By ' + h.by + ' &nbsp;·&nbsp; '}${h.date}</div>
              ${h.location ? `<div class="pub-tl-loc">${h.location}${h.handler ? ' · ' + h.handler : ''}</div>` : ''}
              ${h.note ? `<div class="pub-tl-note">"${h.note}"</div>` : ''}
            </div>
          </div>`;
      }).join('');

  /* ── File / download section ── */
  const hasOriginal  = (typeof docHasOriginalFile  === 'function') ? docHasOriginalFile(d)  : !!(d.originalFile || d.fileData);
  const hasProcessed = (typeof docHasProcessedFile === 'function') ? docHasProcessedFile(d) : !!(d.processedFile);
  const docKey       = d.internalId || d.id;

  let fileHtml = '';
  if (hasOriginal) {
    fileHtml += `
      <div class="pub-file-row">
        <div class="pub-file-icon ref">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="pub-file-info">
          <div class="pub-file-name">Original File <span class="pub-file-sub">(Submitted)</span></div>
          <div class="pub-file-meta">Submitted by ${d.by || 'user'} · IDEA-128 encrypted at rest</div>
        </div>
        <span class="pub-file-badge ref">Reference Only</span>
      </div>`;
}

/* Go back */
function goBack() {
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('hero').style.display           = '';
  document.getElementById('doc-input').value              = '';
  document.getElementById('search-error').style.display   = 'none';
  _pubTrackDocId = null;
  window.history.replaceState({}, '', window.location.pathname);
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

  let d = findDoc(raw) || docs.find(x => x.id && x.id.toUpperCase() === raw);

  if (!d) {
    toast('Searching server...');
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
        return (i > 0 ? '<div class="twf-arrow">&rsaquo;</div>' : '') +
          `<div class="twf-step">
             <div class="twf-dot ${cls}">${done ? '&#10003;' : i + 1}</div>
             <div class="twf-label ${cls}">${step}</div>
           </div>`;
      }).join('');

  /* Show only Status Update and Movement entries from history */
  const _sEntries = (d.history || [])
    .filter(h => h.action === 'Status Update' || h.action === 'Movement' || !h.action)
    .map(function(h){ return {
      _type:    h.action === 'Movement' ? 'movement' : 'status',
      status:   h.status   || '',
      by:       h.by       || '-',
      date:     h.date     || '',
      location: h.location || '',
      handler:  h.handler  || '',
      note:     h.note     || ''
    }; });

  const _combined = _sEntries.sort(function(a, b){
    const da = new Date(a.date), db = new Date(b.date);
    return (isNaN(da) || isNaN(db)) ? 0 : da - db;
  });

  const histHtml = _combined.length === 0
    ? '<p style="font-size:13px;color:var(--muted)">No history recorded.</p>'
    : [..._combined].reverse().map(function(h){
        const isMovement = h._type === 'movement';
        const dotCls  = isMovement ? 'received' : (h.status || '').toLowerCase().replace(/\s+/g, '');
        const aLabel  = isMovement ? 'Movement' : 'Status Update';
        const aBg     = isMovement ? '#fffbeb' : '#eff6ff';
        const aColor  = isMovement ? '#92400e' : '#1d4ed8';
        const aBorder = isMovement ? '#fde68a' : '#bfdbfe';
        return `<div class="ttl-item">
          <div class="ttl-dot ${dotCls}" ${isMovement ? 'style="background:#f59e0b;border-color:#d97706"' : ''}></div>
          <div style="margin-bottom:3px">
            <span style="display:inline-flex;align-items:center;padding:2px 8px;background:${aBg};border:1px solid ${aBorder};border-radius:20px;font-size:9px;font-weight:700;color:${aColor};letter-spacing:.4px;text-transform:uppercase">${aLabel}</span>
          </div>
          <div class="ttl-status-label">${isMovement ? 'Handled by ' + h.by : h.status}</div>
          <div class="ttl-meta">${isMovement ? '' : 'By ' + h.by + ' &nbsp;·&nbsp; '}${h.date}</div>
          ${(h.location || h.handler) ? `<div class="ttl-loc">${h.location ? h.location : ''}${h.location && h.handler ? ' &nbsp;·&nbsp; ' : ''}${h.handler ? h.handler : ''}</div>` : ''}
          ${h.note ? `<div class="ttl-note">"${h.note}"</div>` : ''}
        </div>`;
      }).join('');

  const baseUrl  = (getSavedBaseUrl() || window.location.origin + window.location.pathname)
                     .replace(/\/+$/, '').split('?')[0];
  const trackUrl = baseUrl + '?track=' + (d.internalId || d.id);

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

/* File section for internal app view */
function buildInternalFileSection(d, sc) {
  const isReleased   = d.status === 'Released';
  const hasOriginal  = (typeof docHasOriginalFile  === 'function') ? docHasOriginalFile(d)  : !!(d.originalFile || d.fileData);
  const hasProcessed = (typeof docHasProcessedFile === 'function') ? docHasProcessedFile(d) : !!(d.processedFile);
  const docKey       = d.internalId || d.id;

  if (!hasOriginal && !hasProcessed) return '';

  let html = `<div class="card" style="margin-top:14px"><div class="card-head"><h3>Document Files</h3></div><div class="card-body" style="padding:0">`;

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
          <span style="font-size:10px;font-weight:700;color:#16a34a;padding:3px 10px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:20px">Released</span>
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
        <p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px">Final File Attached - Pending Release</p>
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