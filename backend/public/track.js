/* ══════════════════════════════════════════════════════════════════════
   public/js/track.js — Public Document Tracking + Zero-Knowledge Masking
   CIT Document Tracker - Group 6

   VAULT CHANGES:
     renderPublicTrackResult — reads d.enc / d.encPurpose (CBC blobs).
       If CIT_VAULT has an active key → decrypts transparently.
       Otherwise → shows: ●●●●●●●● (Protected by IDEA-128)
       + "Sign In to Unlock" button.

     initTrackingPage / _fetchAndRenderPublicDoc — calls _tryAutoDecrypt()
       which reads the master key from sessionStorage (survives refresh,
       deleted on tab close). No password re-entry needed on refresh.

     _handleSignInToUnlock — stores internalId in sessionStorage under
       'cit_pending_track', opens login modal. After login, auth.js calls
       _handlePostLoginRedirect() → navigates back to ?track=<id>.

     logout (auth.js) → CIT_VAULT.clearAll() → "Go Back" shows masks.
══════════════════════════════════════════════════════════════════════ */

let _pubTrackDocId = null;

/* ── Spam prevention: no duplicate scan logs within 30 seconds ── */
const SCAN_COOLDOWN_MS = 30000;
function _getScanKey(docId) { return 'cit_lastscan_' + docId; }
function _canLog(docId) {
  try {
    const last = parseInt(localStorage.getItem(_getScanKey(docId)) || '0', 10);
    return Date.now() - last > SCAN_COOLDOWN_MS;
  } catch (e) { return true; }
}
function _markScanned(docId) {
  try { localStorage.setItem(_getScanKey(docId), String(Date.now())); } catch (e) {}
}

/* ══════════════════════════════════════════════════════════════════════
   VAULT HELPERS
══════════════════════════════════════════════════════════════════════ */

const PRIVACY_MASK = '●●●●●●●● (Protected by IDEA-128)';
const MASK_SHORT   = '●●●●●●●●';

function _vaultDecrypt(enc) {
  if (!enc) return '';
  if (typeof CIT_VAULT === 'undefined' || !CIT_VAULT.hasKey()) return PRIVACY_MASK;
  try { return CIT_VAULT.decrypt(enc) || PRIVACY_MASK; } catch (e) { return PRIVACY_MASK; }
}

function _vaultActive() {
  return typeof CIT_VAULT !== 'undefined' && CIT_VAULT.hasKey();
}

async function _tryAutoDecrypt(encryptedIdeaKey) {
  if (typeof CIT_VAULT === 'undefined') return false;
  if (CIT_VAULT.hasKey()) return true;
  return CIT_VAULT.restoreFromSession(encryptedIdeaKey || null);
}

/* ══════════════════════════════════════════════════════════════════════
   SIGN-IN-TO-UNLOCK
══════════════════════════════════════════════════════════════════════ */

function _handleSignInToUnlock(internalId) {
  try { sessionStorage.setItem('cit_pending_track', internalId); } catch (e) {}
  if (typeof openAuth === 'function') openAuth('login');
}

function _buildUnlockBanner(internalId) {
  return '<div id="vault-unlock-banner" style="' +
    'display:flex;align-items:center;gap:12px;padding:10px 14px;' +
    'background:rgba(74,222,128,.06);border:1px solid rgba(74,222,128,.18);' +
    'border-radius:8px;margin-bottom:10px;flex-wrap:wrap;">' +
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(74,222,128,.7)"' +
    ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="11" width="18" height="11" rx="2"/>' +
    '<path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
    '<span style="font-size:12px;color:rgba(255,255,255,.5);flex:1;min-width:140px">' +
    'Some fields are encrypted with <strong style="color:rgba(74,222,128,.7)">IDEA-128-CBC</strong>. Sign in to unlock them.' +
    '</span>' +
    '<button onclick="_handleSignInToUnlock(\'' + internalId + '\')"' +
    ' style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;' +
    'background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.35);' +
    'border-radius:6px;font-family:inherit;font-size:12px;font-weight:600;' +
    'color:#4ade80;cursor:pointer;white-space:nowrap">' +
    'Sign In to Unlock' +
    '</button></div>';
}

/* ══════════════════════════════════════════════════════════════════════
   AUTO SCAN LOG — automatic, silent
══════════════════════════════════════════════════════════════════════ */
function _autoLogQRScan(d) {
  const docId = d.internalId || d.id;
  if (!_canLog(docId)) return;
  _markScanned(docId);
  if (typeof apiLogScan === 'function') {
    apiLogScan(docId, { handledBy:'QR Visitor', location:'QR Scan', note:'Auto-logged on QR scan' })
      .catch(function(e){ console.warn('[_autoLogQRScan]', e); });
  }
  _showScanToast('QR scan logged automatically.');
}

function _showScanToast(msg) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
    'background:#0d1a10;border:1px solid rgba(74,222,128,.3);color:rgba(74,222,128,.9);' +
    'padding:9px 20px;border-radius:8px;font-family:\'DM Sans\',sans-serif;' +
    'font-size:12px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.4);pointer-events:none;';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function(){ el.remove(); }, 3000);
}

/* ══════════════════════════════════════════════════════════════════════
   initTrackingPage — called on page load from _appInit in script.js
══════════════════════════════════════════════════════════════════════ */
function initTrackingPage() {
  var params     = new URLSearchParams(window.location.search);
  var trackParam = params.get('track');
  var applyParam = params.get('apply');

  if (applyParam) {
    load();
    try {
      var update = decodeSnapshot(applyParam);
      var d = findDoc(update.docId) || docs.find(function(x){ return x.id === update.docId; });
      if (!d) { alert('Document not found in this browser.\nMake sure you are on the correct device.'); return false; }
      if (!d.history) d.history = [];
      d.history.push({ status:update.status, date:update.date, by:update.handler, location:update.location, handler:update.handler, note:update.note });
      d.status = update.status;
      save();
      window.history.replaceState({}, '', window.location.pathname);
      alert('Update applied!\n\nDocument: ' + d.name + '\nNew status: ' + update.status + '\nLocation: ' + (update.location||'-') + '\nHandler: ' + (update.handler||'-'));
    } catch (e) { alert('Could not apply update. Invalid link.'); }
    return false;
  }

  if (!trackParam) return false;

  load();

  var localDoc = findDoc(trackParam) ||
    docs.find(function(x){ return x.id === trackParam; }) ||
    docs.find(function(x){ return x.id && x.id.toUpperCase() === trackParam.toUpperCase(); });

  if (localDoc) {
    var encKey = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.encryptedIdeaKey : null;
    _tryAutoDecrypt(encKey).then(function(vaultOk) {
      /* Fix 5 — Debug: vault activation status */
      console.log('[Track] Vault Activation Successful:', vaultOk);
      renderPublicTrackResult(localDoc);
      setTimeout(function(){ _autoLogQRScan(localDoc); }, 800);
    });
    return true;
  }

  _fetchAndRenderPublicDoc(trackParam);
  return true;
}

async function _fetchAndRenderPublicDoc(trackParam) {
  var errEl = document.getElementById('search-error');
  if (errEl) { errEl.innerHTML = '<span style="color:rgba(255,255,255,.5)">Looking up document...</span>'; errEl.style.display = 'block'; }

  try {
    var result = await apiTrackDocument(trackParam);

    /* Fix 5 — Debug: log raw server response */
    console.log('[Track] Data received from server:', result);

    if (!result || result._error || result.message) {
      showPublicError('Document <code style="color:#4ade80">' + trackParam + '</code> was not found.<br>Please check the ID or contact the issuing office.');
      return;
    }

    var d = Object.assign({}, result, {
      id:            result.internalId,
      fullDisplayId: result.fullDisplayId || result.displayId,
      name:          result.name    || '',
      purpose:       result.purpose || '',
    });

    var existing = docs.findIndex(function(x){ return (x.internalId||x.id) === d.internalId; });
    if (existing >= 0) { docs[existing] = Object.assign({}, docs[existing], d); }
    else { docs.push(d); }

    if (errEl) errEl.style.display = 'none';

    /* Fix 2 — AUTO-DECRYPT: restore IDEA key from sessionStorage if present.
       currentUser is now populated by tryRestoreSession() which was called
       in _appInit() BEFORE initTrackingPage(), so encryptedIdeaKey is available. */
    var encKey = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.encryptedIdeaKey : null;
    var vaultOk = await _tryAutoDecrypt(encKey);

    /* Fix 5 — Debug: report vault activation result */
    console.log('[Track] Vault Activation Successful:', vaultOk);

    renderPublicTrackResult(d);
    setTimeout(function(){ _autoLogQRScan(d); }, 800);

  } catch (e) {
    console.error('[_fetchAndRenderPublicDoc]', e);
    showPublicError('Could not reach the server. Please check your connection and try again.');
  }
}

/* ── handleTrack — user clicks "Track Document" in hero ── */
async function handleTrack() {
  var raw   = (document.getElementById('doc-input').value || '').trim().toUpperCase();
  var errEl = document.getElementById('search-error');
  if (!raw) { errEl.innerHTML = 'Please enter a Document ID.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  document.getElementById('btn-label').style.display  = 'none';
  document.getElementById('btn-spinner').style.display = '';
  document.getElementById('track-btn').disabled        = true;

  try {
    load();
    var d = findDoc(raw) || docs.find(function(x){ return x.id && x.id.toUpperCase() === raw; });

    if (!d) {
      var r = await apiTrackDocument(raw);
      if (r && !r._error && !r.message) {
        d = Object.assign({}, r, { id:r.internalId, fullDisplayId:r.fullDisplayId||r.displayId, name:r.name||'', purpose:r.purpose||'' });
        var idx = docs.findIndex(function(x){ return (x.internalId||x.id) === d.internalId; });
        if (idx >= 0) { docs[idx] = Object.assign({}, docs[idx], d); } else { docs.push(d); }
      }
    }

    if (!d) { errEl.innerHTML = 'Document <strong>' + raw + '</strong> not found. Check the ID and try again.'; errEl.style.display = 'block'; return; }

    var encKey = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.encryptedIdeaKey : null;
    await _tryAutoDecrypt(encKey);
    renderPublicTrackResult(d);

  } catch (e) {
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
  var errEl = document.getElementById('search-error');
  errEl.innerHTML = msg; errEl.style.display = 'block';
}

/* ══════════════════════════════════════════════════════════════════════
   COMPACT CARD STYLES — injected once
══════════════════════════════════════════════════════════════════════ */
var _compactStylesInjected = false;
function _injectCompactCardStyles() {
  if (_compactStylesInjected) return;
  _compactStylesInjected = true;
  var s = document.createElement('style');
  s.id = 'compact-card-styles';
  s.textContent = [
    '.cct-wrap{max-width:680px;margin:0 auto;padding:16px}',
    '.cct{background:#052e16;border:1px solid rgba(74,222,128,.18);border-radius:12px;padding:14px 16px;font-family:\'Inter\',system-ui,sans-serif}',
    '.cct-header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}',
    '.cct-title{font-size:15px;font-weight:600;color:rgba(255,255,255,.9);line-height:1.3}',
    '.cct-title.masked{color:rgba(255,255,255,.3);font-style:italic;letter-spacing:.05em}',
    '.cct-meta{font-size:11px;color:rgba(255,255,255,.3);margin-top:2px;letter-spacing:.02em}',
    '.cct-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;border-radius:20px;padding:3px 10px;white-space:nowrap;flex-shrink:0}',
    '.cct-badge-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}',
    '@keyframes cct-pulse{0%,100%{opacity:1}50%{opacity:.3}}',
    '.cct-badge-dot.pulsing{animation:cct-pulse 1.8s ease-in-out infinite}',
    '.cct-progress{font-size:11px;color:rgba(255,255,255,.28);margin-bottom:10px;letter-spacing:.01em}',
    '.cct-progress .p-active{color:#4ade80;font-weight:600}.cct-progress .p-done{color:rgba(255,255,255,.55)}.cct-progress .p-rej{color:#ef4444;font-weight:600}',
    '.cct-divider{border:none;border-top:1px solid rgba(74,222,128,.13);margin:0 0 10px}',
    '.cct-body{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:start}',
    '.cct-fields{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px}',
    '.cct-field label{display:block;font-size:10px;color:rgba(255,255,255,.28);text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px}',
    '.cct-field span{font-size:12px;color:rgba(255,255,255,.85)}',
    '.cct-field span.masked{color:rgba(255,255,255,.25);font-style:italic;letter-spacing:.04em}',
    '.cct-field span.prio-high{color:#f97316}.cct-field span.prio-urgent{color:#ef4444}.cct-field span.prio-low{color:rgba(255,255,255,.45)}',
    '.cct-field span.val-pending{color:rgba(255,255,255,.3);font-style:italic}.cct-field span.val-released{color:#4ade80;font-weight:600}',
    '.cct-qr-col{display:flex;flex-direction:column;align-items:center;gap:6px}',
    '.cct-qr-box{width:120px;height:120px;background:#fff;border-radius:8px;padding:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden}',
    '.cct-qr-box img,.cct-qr-box canvas{width:100%!important;height:100%!important;max-width:108px!important;max-height:108px!important;display:block;object-fit:contain}',
    '.cct-qr-hint{font-size:10px;color:rgba(255,255,255,.25);text-align:center}',
    '.cct-qr-btn{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#4ade80;background:transparent;border:1px solid rgba(74,222,128,.22);border-radius:6px;padding:4px 10px;cursor:pointer;font-family:inherit;transition:background .15s;white-space:nowrap}',
    '.cct-qr-btn:hover{background:rgba(74,222,128,.1)}',
    '.cct-hist{margin-top:10px;border-top:1px solid rgba(74,222,128,.13);padding-top:10px}',
    '.cct-sect-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:rgba(255,255,255,.28);margin-bottom:7px}',
    '.cct-hist-item{display:flex;align-items:stretch;gap:10px;margin-bottom:8px}',
    '.cct-h-line{width:2px;border-radius:2px;flex-shrink:0}',
    '.cct-h-tag{display:inline-block;font-size:9px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;border-radius:4px;padding:1px 6px;margin-bottom:2px}',
    '.cct-h-tag.stat{color:#60a5fa;background:rgba(96,165,250,.1);border:1px solid rgba(96,165,250,.2)}',
    '.cct-h-tag.move{color:#fbbf24;background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.2)}',
    '.cct-h-title{font-size:12px;font-weight:600;color:rgba(255,255,255,.82)}',
    '.cct-h-meta{font-size:11px;color:rgba(255,255,255,.35)}.cct-h-loc{font-size:11px;color:rgba(255,255,255,.45);margin-top:1px}',
    '.cct-h-note{font-size:11px;color:rgba(255,255,255,.3);font-style:italic;margin-top:2px}',
    '.cct-files{margin-top:10px;border-top:1px solid rgba(74,222,128,.13);padding-top:10px}',
    '.cct-file-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.cct-file-row:last-child{border-bottom:none}',
    '.cct-file-icon{width:30px;height:30px;border-radius:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);display:grid;place-items:center;flex-shrink:0;color:rgba(255,255,255,.35)}',
    '.cct-file-icon.final{background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.25);color:#4ade80}',
    '.cct-file-name{font-size:12px;font-weight:600;color:rgba(255,255,255,.75)}.cct-file-name.final{color:#4ade80}',
    '.cct-file-sub{font-weight:400;color:rgba(255,255,255,.35)}.cct-file-meta{font-size:11px;color:rgba(255,255,255,.3);margin-top:1px}',
    '.cct-file-badge{margin-left:auto;font-size:10px;font-weight:600;color:rgba(255,255,255,.3);padding:2px 8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:20px;white-space:nowrap;flex-shrink:0}',
    '.cct-file-badge.final{color:#4ade80;background:rgba(74,222,128,.1);border-color:rgba(74,222,128,.25)}',
    '.cct-lock{text-align:center;padding:14px 0 6px}.cct-lock-title{font-size:13px;font-weight:600;color:rgba(255,255,255,.6);margin-bottom:4px}',
    '.cct-lock-desc{font-size:11px;color:rgba(255,255,255,.3);line-height:1.6}',
    '.cct-dl-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 24px;background:#4ade80;color:#052e16;border:none;border-radius:8px;font-family:\'Inter\',inherit;font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s;margin-top:8px}',
    '.cct-dl-btn:hover{opacity:.85}.cct-dl-hint{font-size:10px;color:rgba(255,255,255,.2);margin-top:6px}',
    '.cct-admin{margin-top:10px;border-top:1px solid rgba(74,222,128,.18);padding-top:10px}',
    '.cct-admin-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#4ade80;margin-bottom:8px;display:flex;align-items:center;gap:5px}',
    '.cct-admin-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
    '.cct-admin-select{flex:1;min-width:140px;background:rgba(255,255,255,.06);border:1px solid rgba(74,222,128,.25);border-radius:6px;padding:6px 10px;font-size:12px;color:rgba(255,255,255,.8);font-family:\'Inter\',inherit;cursor:pointer}',
    '.cct-admin-input{flex:1;min-width:120px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:6px 10px;font-size:12px;color:rgba(255,255,255,.8);font-family:\'Inter\',inherit}',
    '.cct-admin-input::placeholder{color:rgba(255,255,255,.2)}',
    '.cct-admin-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;background:#4ade80;color:#052e16;border:none;border-radius:6px;font-family:\'Inter\',inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;transition:opacity .15s}',
    '.cct-admin-btn:hover{opacity:.85}.cct-admin-err{font-size:11px;color:#f87171;margin-top:5px;display:none}',
    '.cct-back-row{margin-top:12px;text-align:center}',
    '.cct-back-btn{background:transparent;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:8px 20px;font-size:12px;color:rgba(255,255,255,.45);font-family:\'Inter\',inherit;cursor:pointer;transition:border-color .15s,color .15s}',
    '.cct-back-btn:hover{border-color:rgba(255,255,255,.25);color:rgba(255,255,255,.7)}',
    '.cct-loc-pills{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}',
    '.cct-loc-pill{font-size:10px;color:rgba(255,255,255,.45);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:2px 9px}',
    '@media(max-width:480px){.cct-body{grid-template-columns:1fr}.cct-qr-col{flex-direction:row;align-items:center}.cct-fields{grid-template-columns:1fr}}'
  ].join('');
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════════════
   renderPublicTrackResult — compact dark card with privacy masking
══════════════════════════════════════════════════════════════════════ */
function renderPublicTrackResult(d) {
  _pubTrackDocId = d.internalId || d.id;
  _injectCompactCardStyles();

  var vaultOn = _vaultActive();

  /* Decrypt or mask sensitive fields */
  var docName    = d.enc        ? _vaultDecrypt(d.enc)        : (d.name    || MASK_SHORT);
  var docPurpose = d.encPurpose ? _vaultDecrypt(d.encPurpose) : (d.purpose || MASK_SHORT);
  var nameIsMasked    = (docName    === PRIVACY_MASK || docName    === MASK_SHORT);
  var purposeIsMasked = (docPurpose === PRIVACY_MASK || docPurpose === MASK_SHORT);

  var STATUS_COLORS = {
    'Received':'#4ade80','Processing':'#60a5fa','For Approval':'#a78bfa',
    'Approved':'#34d399','Signed':'#34d399','Released':'#4ade80',
    'Rejected':'#f87171','Pending':'#fbbf24'
  };
  var sc         = STATUS_COLORS[d.status] || '#94a3b8';
  var isReleased = d.status === 'Released';
  var isRejected = d.status === 'Rejected';
  var workflow   = ['Received','Processing','For Approval','Approved','Released'];
  var curIdx     = workflow.indexOf(d.status);
  var dispId     = d.fullDisplayId || d.displayId || d.id;
  var office     = (typeof docOfficeMap !== 'undefined' ? docOfficeMap[d.type] : null) || 'Document Control Office';
  var relEntry   = [].concat(d.history || []).reverse().find(function(h){ return h.status === 'Released'; });
  var lastLoc    = getLatestLocationPublic(d);
  var docKey     = d.internalId || d.id;
  var trackUrl   = window.location.href.split('?')[0].replace(/\/+$/, '') + '?track=' + docKey;

  /* Progress breadcrumb */
  var progressHtml = isRejected
    ? '<span class="p-rej">✕ Rejected</span>'
    : workflow.map(function(step, i) {
        var done = curIdx > i, curr = curIdx === i;
        var cls  = done ? 'p-done' : curr ? 'p-active' : '';
        return (i > 0 ? '<span style="margin:0 3px;opacity:.3">›</span>' : '') +
               '<span class="' + cls + '">' + step + '</span>';
      }).join('');

  function _prioCls(p) {
    return { High:'prio-high', Urgent:'prio-urgent', Low:'prio-low' }[p] || '';
  }

  /* Details fields */
  var fields = [
    ['Submitted By',    '<span>' + (d.by || '-') + '</span>'],
    ['Purpose',         '<span class="' + (purposeIsMasked ? 'masked' : '') + '">' + docPurpose + '</span>'],
    ['Assigned Office', '<span>' + office + '</span>'],
    ['Priority',        '<span class="' + _prioCls(d.priority) + '">' + (d.priority || 'Normal') + '</span>'],
    ['Date Filed',      '<span>' + (d.date || '-') + '</span>'],
    ['Release Date',    relEntry
      ? '<span class="val-released">' + relEntry.date + '</span>'
      : '<span class="val-pending">Pending</span>'],
  ];
  var fieldsHtml = fields.map(function(f) {
    return '<div class="cct-field"><label>' + f[0] + '</label>' + f[1] + '</div>';
  }).join('');

  /* History */
  var STATUS_DOT_COLORS = {
    'Received':'#60a5fa','Processing':'#a78bfa','For Approval':'#fbbf24',
    'Signed':'#34d399','Approved':'#34d399','Released':'#4ade80','Rejected':'#f87171','Pending':'#fbbf24'
  };
  var hist = (d.history || [])
    .filter(function(h){ return h.action === 'Status Update' || h.action === 'Movement' || !h.action; })
    .map(function(h){ return { _type:h.action==='Movement'?'movement':'status', status:h.status||'', by:h.by||'-', date:h.date||'', location:h.location||'', handler:h.handler||'', note:h.note||'' }; })
    .sort(function(a,b){ return new Date(b.date) - new Date(a.date); });

  var histHtml = hist.length === 0
    ? '<div class="cct-h-meta">No history recorded yet.</div>'
    : hist.map(function(h) {
        var isMove   = h._type === 'movement';
        var dotColor = isMove ? '#fbbf24' : (STATUS_DOT_COLORS[h.status] || '#60a5fa');
        return '<div class="cct-hist-item">' +
          '<div class="cct-h-line" style="background:' + dotColor + '"></div>' +
          '<div style="flex:1;min-width:0;padding-bottom:4px">' +
          '<span class="cct-h-tag ' + (isMove ? 'move' : 'stat') + '">' + (isMove ? 'Movement' : 'Status Update') + '</span>' +
          '<div class="cct-h-title">' + (isMove ? 'Handled by ' + h.by : h.status) + '</div>' +
          '<div class="cct-h-meta">' + (isMove ? '' : 'By ' + h.by + ' · ') + h.date + '</div>' +
          ((h.location||h.handler) ? '<div class="cct-h-loc">' + [h.location,h.handler].filter(Boolean).join(' · ') + '</div>' : '') +
          (h.note ? '<div class="cct-h-note">"' + h.note + '"</div>' : '') +
          '</div></div>';
      }).join('');

  /* File section */
  var hasOriginal  = (typeof docHasOriginalFile  === 'function') ? docHasOriginalFile(d)  : !!(d.hasOriginalFile);
  var hasProcessed = (typeof docHasProcessedFile === 'function') ? docHasProcessedFile(d) : !!(d.hasProcessedFile);
  var fileHtml = '';
  if (hasOriginal || hasProcessed) {
    fileHtml += '<div class="cct-files"><div class="cct-sect-label">Files</div>';
    if (hasOriginal) {
      fileHtml += '<div class="cct-file-row">' +
        '<div class="cct-file-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
        '<div style="flex:1;min-width:0"><div class="cct-file-name">Original File <span class="cct-file-sub">(Submitted)</span></div>' +
        '<div class="cct-file-meta">Submitted by ' + (d.by || 'user') + '</div></div>' +
        '<span class="cct-file-badge">Reference Only</span></div>';
    }
    if (hasProcessed && isReleased) {
      fileHtml += '<div class="cct-file-row">' +
        '<div class="cct-file-icon final"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="18" x2="12" y2="3"/></svg></div>' +
        '<div style="flex:1;min-width:0"><div class="cct-file-name final">Final File <span class="cct-file-sub">(Approved)</span></div>' +
        '<div class="cct-file-meta">By ' + (d.processedBy||'Admin') + (d.processedAt ? ' · ' + d.processedAt : '') + '</div></div>' +
        '<span class="cct-file-badge final">Released</span></div>' +
        '<div style="text-align:center;padding:10px 0 4px">' +
        '<button onclick="decryptAndDownload(\'' + docKey + '\',this)" class="cct-dl-btn">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        'Download Final File</button><div class="cct-dl-hint">Decrypted locally · IDEA-128-CBC</div></div>';
    } else if (!isReleased) {
      fileHtml += '<div class="cct-lock"><div class="cct-lock-title">No processed file attached</div>' +
        '<div class="cct-lock-desc">The admin hasn\'t uploaded the final file yet.<br>' +
        'Download becomes available when status is <strong style="color:#4ade80">Released</strong>.<br>' +
        '<span style="color:rgba(255,255,255,.5);font-size:11px">Current: <strong style="color:rgba(255,255,255,.85)">' + d.status + '</strong></span></div></div>';
    }
    fileHtml += '</div>';
  }

  /* Admin panel */
  var adminHtml = '';
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.role === 'admin') {
    var STATUSES = ['Received','Processing','For Approval','Signed','Approved','Released','Rejected'];
    var opts = STATUSES.map(function(s){
      return '<option value="' + s + '"' + (s === d.status ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
    adminHtml = '<div class="cct-admin">' +
      '<div class="cct-admin-label">' +
      '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
      'Admin — Update Status</div>' +
      '<div class="cct-admin-row">' +
      '<select class="cct-admin-select" id="cct-admin-status">' + opts + '</select>' +
      '<input class="cct-admin-input" id="cct-admin-note" placeholder="Note (optional)"/>' +
      '<button class="cct-admin-btn" onclick="_cctAdminUpdate(\'' + docKey + '\')">' +
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Update</button></div>' +
      '<div class="cct-admin-err" id="cct-admin-err"></div></div>';
  }

  /* Location pills */
  var locPillsHtml = '';
  if (lastLoc.location || lastLoc.handler) {
    locPillsHtml = '<div class="cct-loc-pills">' +
      (lastLoc.location ? '<span class="cct-loc-pill">' + lastLoc.location + '</span>' : '') +
      (lastLoc.handler  ? '<span class="cct-loc-pill">' + lastLoc.handler  + '</span>' : '') +
      '</div>';
  }

  /* Privacy unlock banner */
  var unlockBanner = vaultOn ? '' : _buildUnlockBanner(docKey);
  var titleCls  = nameIsMasked ? 'cct-title masked' : 'cct-title';
  var titleText = nameIsMasked ? MASK_SHORT : docName;

  /* Assemble card */
  var cardHtml = '<div class="cct-wrap"><div class="cct">' +
    unlockBanner +
    '<div class="cct-header"><div>' +
    '<div class="' + titleCls + '">' + titleText + '</div>' +
    '<div class="cct-meta">' + dispId + ' &nbsp;·&nbsp; ' + (d.type || '') + '</div></div>' +
    '<span class="cct-badge" style="color:' + sc + ';background:' + sc + '1a;border:1px solid ' + sc + '40">' +
    '<span class="cct-badge-dot' + (!isRejected && !isReleased ? ' pulsing' : '') + '" style="background:' + sc + '"></span>' +
    d.status + '</span></div>' +
    locPillsHtml +
    '<div class="cct-progress">' + progressHtml + '</div>' +
    '<hr class="cct-divider">' +
    '<div class="cct-body"><div class="cct-fields">' + fieldsHtml + '</div>' +
    '<div class="cct-qr-col">' +
    '<div class="cct-qr-box" id="cct-qr-target"></div>' +
    '<div class="cct-qr-hint">Scan to track</div>' +
    '<button class="cct-qr-btn" onclick="_cctDownloadQR()">' +
    '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
    'Download QR</button></div></div>' +
    '<div class="cct-hist"><div class="cct-sect-label">Activity History</div>' + histHtml + '</div>' +
    fileHtml + adminHtml +
    '</div><div class="cct-back-row"><button class="cct-back-btn" onclick="goBack()">← Search Another Document</button></div></div>';

  var resultSection = document.getElementById('result-section');
  resultSection.innerHTML = cardHtml;
  resultSection.style.display = '';
  document.getElementById('hero').style.display = 'none';
  window.scrollTo({ top:0, behavior:'smooth' });

  var qrTarget = document.getElementById('cct-qr-target');
  if (qrTarget && typeof QRCode !== 'undefined') {
    new QRCode(qrTarget, { text:trackUrl, width:108, height:108, correctLevel:QRCode.CorrectLevel.M });
  }
}

/* ── Download QR ── */
function _cctDownloadQR() {
  var box = document.getElementById('cct-qr-target');
  if (!box) return;
  var canvas = box.querySelector('canvas'), img = box.querySelector('img');
  var link = document.createElement('a'); link.download = 'document-qr.png';
  if (canvas) { link.href = canvas.toDataURL('image/png'); }
  else if (img) { link.href = img.src; }
  else { alert('QR not ready. Please wait a moment.'); return; }
  link.click();
}

/* ── Admin update from compact card ── */
async function _cctAdminUpdate(docId) {
  if (typeof currentUser === 'undefined' || !currentUser || currentUser.role !== 'admin') return;
  var statusEl = document.getElementById('cct-admin-status');
  var noteEl   = document.getElementById('cct-admin-note');
  var errEl    = document.getElementById('cct-admin-err');
  var btn      = document.querySelector('.cct-admin-btn');
  var newStatus = statusEl ? statusEl.value : '';
  var note      = noteEl  ? noteEl.value.trim() : '';
  if (!newStatus) { errEl.textContent = 'Select a status.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }

  try {
    var result = await apiUpdateDocumentStatus(docId, { status:newStatus, note:note||('Status updated to '+newStatus+' by admin'), by:currentUser.name||currentUser.username }, currentUser.token);
    if (result && result._error) { errEl.textContent = result.message||'Update failed.'; errEl.style.display = 'block'; return; }
    if (result === null) { errEl.textContent = 'Cannot reach server.'; errEl.style.display = 'block'; return; }
    var fresh = await apiTrackDocument(docId);
    if (fresh && !fresh._error) {
      var nd = Object.assign({}, fresh, { id:fresh.internalId, fullDisplayId:fresh.fullDisplayId||fresh.displayId, name:fresh.name||'', purpose:fresh.purpose||'' });
      var idx = docs.findIndex(function(x){ return (x.internalId||x.id) === nd.internalId; });
      if (idx >= 0) { docs[idx] = Object.assign({}, docs[idx], nd); } else { docs.push(nd); }
      renderPublicTrackResult(nd);
    }
    if (typeof toast === 'function') toast('Status updated to ' + newStatus);
    if (typeof renderAll === 'function') renderAll();
    if (typeof save    === 'function') save();
  } catch (e) {
    console.error('[_cctAdminUpdate]', e);
    errEl.textContent = 'Error updating status.'; errEl.style.display = 'block';
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Update'; } }
}

/* ── Go back ── */
function goBack() {
  var rs = document.getElementById('result-section');
  if (rs) rs.style.display = 'none';
  var heroEl = document.getElementById('hero'); if (heroEl) heroEl.style.display = '';
  var inp = document.getElementById('doc-input'); if (inp) inp.value = '';
  var errEl = document.getElementById('search-error'); if (errEl) errEl.style.display = 'none';
  _pubTrackDocId = null;
  window.history.replaceState({}, '', window.location.pathname);
}

function getLatestLocationPublic(d) {
  if (!d.history || !d.history.length) return { location:'', handler:'' };
  for (var i = d.history.length - 1; i >= 0; i--) {
    var h = d.history[i];
    if (h.location || h.handler) return { location:h.location||'', handler:h.handler||'' };
  }
  return { location:'', handler:'' };
}

/* ── Internal (app) track-by-ID search ── */
async function searchByTrackingId() {
  var raw    = (document.getElementById('track-id-input').value || '').trim().toUpperCase();
  var result = document.getElementById('track-search-result');
  if (!raw) { toast('Please enter a Tracking ID.'); return; }

  var d = findDoc(raw) || docs.find(function(x){ return x.id && x.id.toUpperCase() === raw; });
  if (!d) {
    toast('Searching server...');
    var apiResult = await apiTrackDocument(raw);
    if (apiResult && !apiResult._error && !apiResult.message) {
      d = Object.assign({}, apiResult, { id:apiResult.internalId, fullDisplayId:apiResult.fullDisplayId||apiResult.displayId, name:apiResult.name||'', purpose:apiResult.purpose||'' });
      var existing = docs.findIndex(function(x){ return (x.internalId||x.id) === d.internalId; });
      if (existing >= 0) { docs[existing] = Object.assign({}, docs[existing], d); } else { docs.push(d); }
    }
  }

  if (!d) {
    result.style.display = 'block';
    result.innerHTML = '<div class="card"><div class="card-body" style="text-align:center;padding:36px"><p style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">Document Not Found</p><p style="font-size:13px;color:var(--muted)">No document with ID <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">' + raw + '</code> was found.</p></div></div>';
    return;
  }

  /* Internal view: user is authenticated — decrypt for display */
  var docName    = d.enc        ? (typeof CIT_VAULT !== 'undefined' && CIT_VAULT.hasKey() ? CIT_VAULT.decrypt(d.enc)        : (d.name    || MASK_SHORT)) : (d.name    || raw);
  var sc         = statusColorMap[d.status] || '#64748b';
  var workflow   = ['Received','Processing','For Approval','Approved','Released'];
  var curIdx     = workflow.indexOf(d.status);
  var isRejected = d.status === 'Rejected';
  var isReleased = d.status === 'Released';
  var dispId     = d.fullDisplayId || d.displayId || d.id;
  var baseUrl    = (typeof getSavedBaseUrl === 'function' ? getSavedBaseUrl() : window.location.origin + window.location.pathname).replace(/\/+$/, '').split('?')[0];
  var trackUrl   = baseUrl + '?track=' + (d.internalId || d.id);

  var wfDots = isRejected
    ? '<div style="text-align:center;width:100%;padding:8px 0"><span style="font-size:13px;color:#ef4444;font-weight:600">Document was Rejected</span></div>'
    : workflow.map(function(step, i){
        var done = curIdx > i, curr = curIdx === i;
        var cls  = done ? 'done' : curr ? 'current' : '';
        return (i > 0 ? '<div class="twf-arrow">&rsaquo;</div>' : '') +
          '<div class="twf-step"><div class="twf-dot ' + cls + '">' + (done ? '&#10003;' : i+1) + '</div><div class="twf-label ' + cls + '">' + step + '</div></div>';
      }).join('');

  var entries = (d.history||[]).filter(function(h){ return h.action==='Status Update'||h.action==='Movement'||!h.action; })
    .map(function(h){ return { _type:h.action==='Movement'?'movement':'status', status:h.status||'', by:h.by||'-', date:h.date||'', location:h.location||'', handler:h.handler||'', note:h.note||'' }; })
    .sort(function(a,b){ var da=new Date(a.date),db=new Date(b.date); return (isNaN(da)||isNaN(db))?0:db-da; });

  var histHtml = entries.length===0 ? '<p style="font-size:13px;color:var(--muted)">No history recorded.</p>'
    : entries.map(function(h){
        var isM=h._type==='movement';
        var dotCls=isM?'received':(h.status||'').toLowerCase().replace(/\s+/g,'');
        var aLabel=isM?'Movement':'Status Update';
        var aBg=isM?'#fffbeb':'#eff6ff', aColor=isM?'#92400e':'#1d4ed8', aBorder=isM?'#fde68a':'#bfdbfe';
        return '<div class="ttl-item"><div class="ttl-dot '+dotCls+'" '+(isM?'style="background:#f59e0b;border-color:#d97706"':'')+'/></div>' +
          '<div style="margin-bottom:3px"><span style="display:inline-flex;align-items:center;padding:2px 8px;background:'+aBg+';border:1px solid '+aBorder+';border-radius:20px;font-size:9px;font-weight:700;color:'+aColor+';letter-spacing:.4px;text-transform:uppercase">'+aLabel+'</span></div>' +
          '<div class="ttl-status-label">'+(isM?'Handled by '+h.by:h.status)+'</div>' +
          '<div class="ttl-meta">'+(isM?'':'By '+h.by+' &nbsp;·&nbsp; ')+h.date+'</div>' +
          ((h.location||h.handler)?'<div class="ttl-loc">'+(h.location||'')+(h.location&&h.handler?' &nbsp;·&nbsp; ':'')+(h.handler||'')+'</div>':'') +
          (h.note?'<div class="ttl-note">"'+h.note+'"</div>':'')+
          '</div>';
      }).join('');

  var fileSection = buildInternalFileSection(d, sc);

  result.style.display = 'block';
  result.innerHTML =
    '<div class="card"><div class="card-head" style="background:#f8fafc"><div>' +
    '<h3>'+docName+'</h3>' +
    '<p style="font-size:12px;color:var(--muted);font-family:\'DM Mono\',monospace">'+dispId+' · '+d.type+'</p></div>' +
    '<span class="badge badge-'+(d.status||'').toLowerCase().replace(/\s+/g,'')+'">'+d.status+'</span></div>' +
    '<div class="card-body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;flex-wrap:wrap">' +
    '<div style="text-align:center"><p style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Permanent QR Code</p>' +
    '<div id="track-search-qr" style="display:inline-block;padding:12px;background:#fff;border:2px solid var(--border);border-radius:12px;margin-bottom:8px"></div>' +
    '<p style="font-size:10px;color:var(--muted);margin-bottom:4px">Scan to track · Always shows live status</p>' +
    '<p style="font-size:9px;color:#94a3b8;font-family:\'DM Mono\',monospace;word-break:break-all;max-width:200px;margin:0 auto;line-height:1.5">'+trackUrl+'</p></div>' +
    '<div><p style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Document Progress</p>' +
    '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:18px" class="track-workflow">'+wfDots+'</div>' +
    '<p style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Status Timeline</p>' +
    '<div class="track-timeline" style="background:rgba(0,0,0,.02);border-radius:8px;padding:14px 14px 14px 32px">'+histHtml+'</div></div>' +
    '</div></div></div>' + fileSection;

  var qrTarget = document.getElementById('track-search-qr');
  if (qrTarget) new QRCode(qrTarget, { text:trackUrl, width:180, height:180, correctLevel:QRCode.CorrectLevel.M });
  toast('Document found. QR code generated.');
}

/* ── File section for internal app view ── */
function buildInternalFileSection(d, sc) {
  var isReleased   = d.status === 'Released';
  var hasOriginal  = (typeof docHasOriginalFile  === 'function') ? docHasOriginalFile(d)  : !!(d.originalFile || d.fileData);
  var hasProcessed = (typeof docHasProcessedFile === 'function') ? docHasProcessedFile(d) : !!(d.processedFile);
  var docKey       = d.internalId || d.id;
  if (!hasOriginal && !hasProcessed) return '';

  var html = '<div class="card" style="margin-top:14px"><div class="card-head"><h3>Document Files</h3></div><div class="card-body" style="padding:0">';
  if (hasOriginal) {
    html += '<div style="display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--border)">' +
      '<div style="width:36px;height:36px;background:#f8fafc;border:1px solid var(--border);border-radius:8px;display:grid;place-items:center;flex-shrink:0">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>' +
      '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text)">Original File <span style="font-size:11px;font-weight:400;color:var(--muted)">(Submitted)</span></div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:2px">IDEA-128-CBC encrypted · Reference copy only</div></div>' +
      '<span style="font-size:10px;font-weight:700;color:#94a3b8;padding:3px 10px;background:#f1f5f9;border:1px solid var(--border);border-radius:20px">Reference Only</span></div>';
  }
  if (hasProcessed && isReleased) {
    html += '<div style="padding:20px;text-align:center"><div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px">' +
      '<div style="width:36px;height:36px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:8px;display:grid;place-items:center;flex-shrink:0">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="18" x2="12" y2="3"/></svg></div>' +
      '<div style="flex:1;text-align:left"><div style="font-size:13px;font-weight:700;color:#15803d">Final File <span style="font-weight:500">(Approved)</span></div>' +
      '<div style="font-size:11px;color:#16a34a;margin-top:1px">Processed by '+(d.processedBy||'Admin')+(d.processedAt?' · '+d.processedAt:'')+'</div></div>' +
      '<span style="font-size:10px;font-weight:700;color:#16a34a;padding:3px 10px;background:#dcfce7;border:1px solid #bbf7d0;border-radius:20px">Released</span></div>' +
      '<button onclick="decryptAndDownload(\''+docKey+'\',this)" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:8px;padding:12px 28px;font-size:14px;border:none;cursor:pointer;">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
      'Download Final File</button><p style="font-size:11px;color:var(--muted);margin-top:10px">Decrypted locally with IDEA-128-CBC</p></div>';
  } else {
    html += '<div style="padding:24px;text-align:center"><p style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:5px">Final File Pending</p>' +
      '<p style="font-size:12px;color:var(--muted);line-height:1.6">Admin will upload the processed/approved file before releasing.<br>Current status: <strong style="color:'+sc+'">'+d.status+'</strong></p></div>';
  }
  html += '</div></div>';
  return html;
}

/* ── Download public QR as PNG ── */
function downloadPublicQR() {
  var qrBox = document.getElementById('pub-qr-box');
  if (!qrBox) return;
  var canvas = qrBox.querySelector('canvas'), img = qrBox.querySelector('img');
  if (canvas) {
    var link = document.createElement('a'); link.download = 'document-qr-code.png';
    link.href = canvas.toDataURL('image/png'); link.click();
  } else if (img) {
    var link2 = document.createElement('a'); link2.download = 'document-qr-code.png';
    link2.href = img.src; link2.click();
  } else { alert('QR code not ready yet. Please wait a moment and try again.'); }
}