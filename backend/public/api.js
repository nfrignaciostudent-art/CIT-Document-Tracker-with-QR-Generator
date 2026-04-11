/* ══════════════════════════════════════════════════════════════════════
   api.js - Centralized API Requests
   CIT Document Tracker - Group 6

   TWO SCAN LOG FUNCTIONS:
     apiLogScan()           - public, auto, no auth. Saves to scan_logs collection.
     apiAddMovementLog()    - protected, admin only. Saves to doc.history.

   TWO LOG FETCH FUNCTIONS:
     apiGetAllScanLogs()    - fetches from scan_logs collection (QR auto events)
     apiGetAllMovementLogs()- fetches admin movement entries from doc.history

   Returns:
     - Response JSON  if request succeeded (2xx)
     - { _error, status, message }  if server returned an error (4xx/5xx)
     - null           ONLY if the server is completely unreachable
══════════════════════════════════════════════════════════════════════ */

const API_BASE = window.CIT_API_BASE || '';

/* ── Core JSON helper ── */
async function apiRequest(method, path, body = null, token = null) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body)  opts.body = JSON.stringify(body);

    const res  = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({ message: 'Server error' }));

    if (!res.ok) {
      return { _error: true, status: res.status, message: data.message || `HTTP ${res.status}` };
    }
    return data;
  } catch (e) {
    console.warn('[API offline]', method, path, e.message);
    return null;
  }
}

/* ── Core FormData helper ── */
async function apiFormRequest(method, path, formData, token = null) {
  try {
    const opts = { method, headers: {}, body: formData };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    const res  = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({ message: 'Server error' }));

    if (!res.ok) {
      return { _error: true, status: res.status, message: data.message || `HTTP ${res.status}` };
    }
    return data;
  } catch (e) {
    console.warn('[API offline FormData]', method, path, e.message);
    return null;
  }
}

function _jwt() {
  try { return localStorage.getItem('cit_jwt') || null; } catch(e) { return null; }
}

/* ══════════════════════════════════════════════════════════════════════
   AUTH ENDPOINTS
══════════════════════════════════════════════════════════════════════ */
async function apiRegisterUser(payload) {
  return await apiRequest('POST', '/api/auth/register', payload);
}

async function apiLoginUser(payload) {
  return await apiRequest('POST', '/api/auth/login', payload);
}

async function apiGetMe(token) {
  return await apiRequest('GET', '/api/auth/me', null, token || _jwt());
}

/* ══════════════════════════════════════════════════════════════════════
   DOCUMENT ENDPOINTS
══════════════════════════════════════════════════════════════════════ */

async function apiRegisterDocument(payload, token) {
  return await apiRequest('POST', '/api/documents/register', payload, token || _jwt());
}

async function apiUploadDocumentWithFile(jsonPayload, encryptedFileString, fileExt, token) {
  try {
    const form = new FormData();
    form.append('data', JSON.stringify(jsonPayload));

    if (encryptedFileString) {
      const blob = new Blob([encryptedFileString], { type: 'application/octet-stream' });
      const filename = 'encrypted' + (fileExt || '.bin');
      form.append('file', blob, filename);
    }

    return await apiFormRequest('POST', '/api/documents/register', form, token || _jwt());
  } catch (e) {
    console.warn('[apiUploadDocumentWithFile]', e.message);
    return null;
  }
}

async function apiGetAllDocuments(token, ownerId, role) {
  let path = '/api/documents';
  const params = [];
  if (ownerId) params.push('ownerId=' + encodeURIComponent(ownerId));
  if (role)    params.push('role='    + encodeURIComponent(role));
  if (params.length) path += '?' + params.join('&');
  return await apiRequest('GET', path, null, token || _jwt());
}

async function apiTrackDocument(documentId) {
  return await apiRequest('GET', `/api/documents/track/${encodeURIComponent(documentId)}`);
}

async function apiGetOriginalFile(documentId) {
  return await apiRequest('GET', `/api/documents/${encodeURIComponent(documentId)}/original-file`, null, _jwt());
}

async function apiDownloadDocument(documentId) {
  return await apiRequest('GET', `/api/documents/download/${encodeURIComponent(documentId)}`, null, _jwt());
}

async function apiUpdateDocumentStatus(documentId, payload, token) {
  return await apiRequest('PATCH', `/api/documents/${encodeURIComponent(documentId)}/status`, payload, token || _jwt());
}

async function apiUpdateStatusWithFile(documentId, jsonPayload, encryptedFileString, fileExt, token) {
  try {
    const form = new FormData();
    form.append('data', JSON.stringify(jsonPayload));

    if (encryptedFileString) {
      const blob = new Blob([encryptedFileString], { type: 'application/octet-stream' });
      const filename = 'processed' + (fileExt || '.bin');
      form.append('processedFile', blob, filename);
    }

    return await apiFormRequest(
      'PATCH',
      `/api/documents/${encodeURIComponent(documentId)}/status`,
      form,
      token || _jwt()
    );
  } catch (e) {
    console.warn('[apiUpdateStatusWithFile]', e.message);
    return null;
  }
}

async function apiDeleteDocument(documentId, token) {
  return await apiRequest('DELETE', `/api/documents/${encodeURIComponent(documentId)}`, null, token || _jwt());
}

/* ── POST /api/documents/:id/scan-log (PUBLIC - no auth) ──────────
   Auto-log when a QR code is scanned.
   Saves to the scan_logs collection ONLY.
   Does NOT touch doc.history. */
async function apiLogScan(documentId, payload) {
  return await apiRequest('POST', `/api/documents/${encodeURIComponent(documentId)}/scan-log`, payload);
}

/* ── POST /api/documents/:id/movement (Admin only - JWT required) ──
   Manual movement log, added by admin. Saves to doc.history.
   Users cannot call this endpoint. */
async function apiAddMovementLog(documentId, payload, token) {
  return await apiRequest(
    'POST',
    `/api/documents/${encodeURIComponent(documentId)}/movement`,
    payload,
    token || _jwt()
  );
}

/* ── GET /api/documents/scan-logs (admin only) ────────────────────
   Fetches from the scan_logs collection.
   These are auto-generated QR scan events only. */
async function apiGetAllScanLogs(token) {
  return await apiRequest('GET', '/api/documents/scan-logs', null, token || _jwt());
}

/* ── GET /api/documents/movement-logs (admin only) ────────────────
   Fetches admin-created movement entries from document histories. */
async function apiGetAllMovementLogs(token) {
  return await apiRequest('GET', '/api/documents/movement-logs', null, token || _jwt());
}