/* ══════════════════════════════════════════════════════════════════════
   qr.js — QR Code Generation & Handling
   CIT Document Tracker · Group 6

   RULE: QR always encodes a STATIC permanent URL using the Internal ID:
         baseUrl + "?track=" + doc.internalId (ULID)
         The QR never changes even after status updates.
         The ULID is not predictable — it is not an incrementing sequence.

   CHANGES (v2):
     • confirmScanLog now calls apiAddMovementLog() (admin-only, JWT)
       instead of the public apiLogScan(). This enforces backend role
       validation for manual movement log entries.
     • simulateScan already enforces admin-only on the frontend.
       Backend now enforces it too via the /movement route.
══════════════════════════════════════════════════════════════════════ */

function encodeSnapshot(snap) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(snap))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function decodeSnapshot(str) {
  return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));
}

function getSavedBaseUrl() {
  /* Use full current page URL (origin + pathname) so QR works
     on GitHub Pages, Render, localhost — anywhere. */
  return window.location.href.split('?')[0].replace(/\/+$/, '');
}

/* Build a static QR pointing to ?track=<internalId> */
function buildQR(docKey, baseUrl, targetElId) {
  const d = docs.find(function(x){ return (x.internalId||x.id) === docKey; });
  if (!d) return;

  const cleanBase = window.location.href.split('?')[0].replace(/\/+$/, '');
  const trackUrl  = cleanBase + '?track=' + (d.internalId || d.id);

  const wrap = document.getElementById(targetElId || 'qr-wrap');
  if (!wrap) return;

  wrap.innerHTML = '';
  const target = document.createElement('div');
  wrap.appendChild(target);
  new QRCode(target, {
    text: trackUrl,
    width:  200,
    height: 200,
    correctLevel: QRCode.CorrectLevel.M
  });

  const urlPreviewEl = document.getElementById('qr-url-preview');
  const urlTextEl    = document.getElementById('qr-url-text');
  const hintEl       = document.getElementById('qr-enc-hint');
  if (urlTextEl)    urlTextEl.textContent  = trackUrl;
  if (urlPreviewEl) urlPreviewEl.style.display = 'block';
  if (hintEl) {
    hintEl.textContent = 'Permanent URL · Display ID: ' + (d.fullDisplayId||d.displayId||d.id) + ' · Never changes';
    hintEl.style.display = '';
  }

  return trackUrl;
}

let _qrRebuildTimer = null;
let _currentQRDocId = '';

function regenerateQR() {
  if (!_currentQRDocId) return;
  const baseUrl = document.getElementById('qr-base-url').value.trim();
  localStorage.setItem('cit_qr_base_url', baseUrl);
  clearTimeout(_qrRebuildTimer);
  _qrRebuildTimer = setTimeout(function(){ buildQR(_currentQRDocId, baseUrl); }, 400);
}

function openQR(docKey) {
  const d = docs.find(function(x){ return (x.internalId||x.id) === docKey; });
  if (!d) return;

  _currentQRDocId = docKey;
  document.getElementById('qr-name').textContent   = d.name;
  document.getElementById('qr-status').textContent = 'Status: ' + d.status + '  ·  ID: ' + (d.fullDisplayId||d.displayId||d.id);
  document.getElementById('qr-wrap').innerHTML      = '';
  document.getElementById('qr-url-preview').style.display = 'none';

  const saved = getSavedBaseUrl() || (window.location.origin + window.location.pathname);
  localStorage.setItem('cit_qr_base_url', saved);
  document.getElementById('qr-base-url').value = saved;

  /* ── Hide "Simulate QR Scan" button for non-admins ── */
  const simBtn = document.getElementById('qr-simulate-btn');
  if (simBtn) {
    simBtn.style.display = (currentUser && currentUser.role === 'admin') ? '' : 'none';
  }

  openModal('qr-modal');
  setTimeout(function(){ buildQR(docKey, saved); }, 150);
}

/* ── simulateScan — ADMIN ONLY ─────────────────────────────────────
   Opens the manual movement log modal from within the app.
   Only admins can see this button (enforced in openQR above).
   Backend further enforces admin role on the /movement endpoint.
─────────────────────────────────────────────────────────────────── */
function simulateScan() {
  if (!_currentQRDocId) { toast('Open a QR code first.'); return; }

  /* Frontend admin check */
  if (!currentUser || currentUser.role !== 'admin') {
    toast('Only admins can log movement from within the app.');
    return;
  }

  const d = docs.find(function(x){ return (x.internalId||x.id) === _currentQRDocId; });
  if (!d) { toast('Document not found.'); return; }

  closeModal('qr-modal');
  document.getElementById('scan-log-handler').value  = currentUser ? (currentUser.name || currentUser.username) : '';
  document.getElementById('scan-log-location').value = '';
  document.getElementById('scan-log-error').style.display = 'none';
  document.getElementById('scan-log-doc-info').innerHTML = `
    <strong>${d.name}</strong><br>
    <span style="font-size:11px;color:var(--muted);font-family:'DM Mono',monospace">${d.fullDisplayId||d.displayId||d.id}</span>
    &nbsp;·&nbsp; <span style="font-size:11px;color:var(--muted)">Current status: ${d.status}</span>`;
  openModal('scan-log-modal');
}

/* Build receipt QR on the register page */
function buildReceiptQR(doc) {
  const cleanBase = window.location.href.split('?')[0].replace(/\/+$/, '');
  const trackUrl  = cleanBase + '?track=' + (doc.internalId || doc.id);

  document.getElementById('receipt-qr-url').textContent = trackUrl;

  const wrap = document.getElementById('receipt-qr-wrap');
  wrap.innerHTML = '';
  const target = document.createElement('div');
  wrap.appendChild(target);
  new QRCode(target, {
    text: trackUrl,
    width:  200,
    height: 200,
    correctLevel: QRCode.CorrectLevel.M
  });
  return trackUrl;
}

/* ── confirmScanLog — ADMIN ONLY ───────────────────────────────────
   Called when admin submits the manual movement log form.
   Uses apiAddMovementLog() which hits the admin-protected backend
   endpoint POST /api/documents/:id/movement.
   Backend enforces: protect() + adminOnly middleware.
─────────────────────────────────────────────────────────────────── */
async function confirmScanLog() {
  /* Frontend admin check — belt and suspenders */
  if (!currentUser || currentUser.role !== 'admin') {
    toast('Only admins can log movement.');
    closeModal('scan-log-modal');
    return;
  }

  const handler  = document.getElementById('scan-log-handler').value.trim();
  const location = document.getElementById('scan-log-location').value.trim();
  const errEl    = document.getElementById('scan-log-error');

  if (!handler || !location) {
    errEl.textContent = 'Please fill in both your name and location.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';

  const d = docs.find(function(x){ return (x.internalId||x.id) === _currentQRDocId; });
  if (!d) { toast('Document not found.'); return; }

  /* Record locally first */
  logMovement(d.internalId || d.id, handler, location);

  /* ── Persist to backend via ADMIN-ONLY endpoint ──────────────────
     POST /api/documents/:id/movement requires JWT + admin role.
     The backend controller (addMovementLog) validates both.
  ─────────────────────────────────────────────────────────────────── */
  try {
    if (typeof apiAddMovementLog === 'function') {
      const result = await apiAddMovementLog(
        d.internalId || d.id,
        {
          handledBy: handler,
          location,
          note: `Movement logged by admin: ${currentUser.username || currentUser.name}`
        },
        currentUser.token
      );

      if (result && result._error) {
        console.warn('[confirmScanLog] Backend sync failed:', result.message);
        /* Don't block the UI — local log was already saved */
      }
    }
  } catch(e) {
    console.warn('[confirmScanLog] Backend sync failed:', e);
  }

  closeModal('scan-log-modal');
  renderScanResult(d);
  openModal('scan-result-modal');
  toast('Movement logged successfully.');
}

function skipScanLog() {
  closeModal('scan-log-modal');
  const d = docs.find(function(x){ return (x.internalId||x.id) === _currentQRDocId; });
  if (!d) return;
  renderScanResult(d);
  openModal('scan-result-modal');
}