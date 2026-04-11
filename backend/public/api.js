/* ══════════════════════════════════════════════════════════════════════
   api.js — Centralized API Requests
   CIT Document Tracker · Group 6

   CHANGES (v2):
     • Added apiAddMovementLog() — admin-only endpoint for manual
       movement log entries from within the app (qr.js confirmScanLog).
       Requires JWT. Distinct from apiLogScan (which is public/auto).
   ─────────────────────────────────────────────────────────────────────

   TWO SCAN LOG FUNCTIONS:
     apiLogScan()        — public, auto, no auth. Called on QR scan.
     apiAddMovementLog() — protected, admin only. Called manually.

   Returns:
     - Response JSON  if request succeeded (2xx)
     - { _error, status, message }  if server returned an error (4xx/5xx)
     - null           ONLY if the server is completely unreachable (offline)
══════════════════════════════════════════════════════════════════════ */

/* ── API Base URL ──────────────────────────────────────────────────────
   IMPORTANT: If your frontend (GitHub Pages) is separate from your
   backend (Render), set window.CIT_API_BASE to your Render URL.
   Add this in index.html BEFORE api.js loads:
     <script>window.CIT_API_BASE = 'https://your-app.onrender.com';</script>
   If frontend + backend are on the SAME server (Render serving both),
   leave it as '' (relative URLs will work automatically).
──────────────────────────────────────────────────────────────────── */
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

/* ── Core FormData helper (no Content-Type header — browser sets boundary) ── */
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

/* Helper: get stored JWT */
function _jwt() {
  try { return localStorage.getItem('cit_jwt') || null; } catch(e) { return null; }
}

/* ══════════════════════════════════════════════════════════════════════
   AUTH ENDPOINTS
══════════════════════════════════════════════════════════════════════ */
async function apiRegisterUser(payload) {
  const r = await apiRequest('POST', '/api/auth/register', payload);
  if (r && r._error) return r;
  return r;
}

async function apiLoginUser(payload) {
  const r = await apiRequest('POST', '/api/auth/login', payload);
  if (r && r._error) return r;
  return r;
}

async function apiGetMe(token) {
  return await apiRequest('GET', '/api/auth/me', null, token || _jwt());
}

/* ══════════════════════════════════════════════════════════════════════
   DOCUMENT ENDPOINTS
══════════════════════════════════════════════════════════════════════ */

/* Plain JSON registration — used when there is NO file attachment */
async function apiRegisterDocument(payload, token) {
  return await apiRequest('POST', '/api/documents/register', payload, token || _jwt());
}

/* FormData registration — used when a file IS attached */
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

/* Fetch all documents (no file blobs — too large for list) */
async function apiGetAllDocuments(token, ownerId, role) {
  let path = '/api/documents';
  const params = [];
  if (ownerId) params.push('ownerId=' + encodeURIComponent(ownerId));
  if (role)    params.push('role='    + encodeURIComponent(role));
  if (params.length) path += '?' + params.join('&');
  return await apiRequest('GET', path, null, token || _jwt());
}

/* Public track endpoint — no auth needed */
async function apiTrackDocument(documentId) {
  return await apiRequest('GET', `/api/documents/track/${encodeURIComponent(documentId)}`);
}

/* Fetch the original file blob (auth required) */
async function apiGetOriginalFile(documentId) {
  return await apiRequest('GET', `/api/documents/${encodeURIComponent(documentId)}/original-file`, null, _jwt());
}

/* Download the processed/final file — returns { fileData, fileExt } */
async function apiDownloadDocument(documentId) {
  return await apiRequest('GET', `/api/documents/download/${encodeURIComponent(documentId)}`, null, _jwt());
}

/* Plain JSON status update — used when there is NO processed file */
async function apiUpdateDocumentStatus(documentId, payload, token) {
  return await apiRequest('PATCH', `/api/documents/${encodeURIComponent(documentId)}/status`, payload, token || _jwt());
}

/* FormData status update — used when admin attaches a processed file */
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

/* Delete a document */
async function apiDeleteDocument(documentId, token) {
  return await apiRequest('DELETE', `/api/documents/${encodeURIComponent(documentId)}`, null, token || _jwt());
}

/* ── POST /api/documents/:id/scan-log (PUBLIC — no auth) ──────────
   Auto-log when a QR code is scanned. System-generated only.
   No user form or input required. handledBy/location are optional
   (the backend sets safe defaults if absent). */
async function apiLogScan(documentId, payload) {
  return await apiRequest('POST', `/api/documents/${encodeURIComponent(documentId)}/scan-log`, payload);
}

/* ── POST /api/documents/:id/movement (Admin only — JWT required) ──
   Manual movement log entry, added by admin from within the app.
   Requires a valid JWT token with admin role.
   This is the ONLY way to manually add a movement log entry.
   Users cannot call this endpoint (403 Forbidden from backend). */
async function apiAddMovementLog(documentId, payload, token) {
  return await apiRequest(
    'POST',
    `/api/documents/${encodeURIComponent(documentId)}/movement`,
    payload,
    token || _jwt()
  );
}

/* ── GET /api/scan-logs (admin only) ──────────────────────────────
   Fetches all QR scan logs from MongoDB so Movement Logs page
   shows scans from ALL devices, not just the current browser. */
async function apiGetAllScanLogs(token) {
  return await apiRequest('GET', '/api/documents/scan-logs', null, token || _jwt());
}