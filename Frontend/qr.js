/* ══════════════════════════════════════════════════════════════════════
   qr.js — QR Code Generation & Handling
   CIT Document Tracker · Group 6

   RULE: QR always encodes a STATIC permanent URL using the Internal ID:
         baseUrl + "?track=" + doc.internalId (ULID)
         The QR never changes even after status updates.
         The ULID is not predictable — it is not an incrementing sequence.
══════════════════════════════════════════════════════════════════════ */

function encodeSnapshot(snap) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(snap))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function decodeSnapshot(str) {
  return JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/')))));
}

function getSavedBaseUrl() {
  /* FIX: Use full current page URL (origin + pathname) so QR works
     on GitHub Pages, Render, localhost — anywhere.
     e.g. https://site.github.io/repo/Frontend/index.html → correct full path */
  return window.location.href.split('?')[0].replace(/\/+$/, '');
}

/* Build a static QR pointing to ?track=<internalId> */
function buildQR(docKey, baseUrl, targetElId) {
  const d = docs.find(function(x){ return (x.internalId||x.id) === docKey; });
  if (!d) return;

  /* Always build from the current full page URL */
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

  openModal('qr-modal');
  setTimeout(function(){ buildQR(docKey, saved); }, 150);
}

function simulateScan() {
  if (!_currentQRDocId) { toast('Open a QR code first.'); return; }
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
  /* FIX: Use full current page URL so QR works on GitHub Pages, Render, etc. */
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

function confirmScanLog() {
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

  logMovement(d.internalId || d.id, handler, location);
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
