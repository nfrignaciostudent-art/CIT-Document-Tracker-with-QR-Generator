/* ══════════════════════════════════════════════════════════════════════
   api.js — Centralized API Requests
   CIT Document Tracker · Group 6

   FIX NOTES:
   ─────────────────────────────────────────────────────────────────────
   • Added apiUploadDocumentWithFile()  — uses FormData so the IDEA-
     encrypted file blob is sent as multipart, bypassing Express's
     default 100 KB JSON body-parser limit.
   • Added apiUpdateStatusWithFile()    — same reason for processed files.
   • Plain apiRegisterDocument() still works for no-attachment docs.
   • apiDownloadDocument() unchanged — backend should return { fileData }.
   ─────────────────────────────────────────────────────────────────────

   Returns:
     - Response JSON  if request succeeded (2xx)
     - { _error, status, message }  if server returned an error (4xx/5xx)
     - null           ONLY if the server is completely unreachable (offline)
══════════════════════════════════════════════════════════════════════ */

const API_BASE = window.CIT_API_BASE || 'http://localhost:3000';

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

/* ── FIX: FormData registration — used when a file IS attached ──────
   Sends payload as a JSON field called "data" plus the encrypted file
   blob as a field called "file".  The backend must use multer (or
   equivalent) to parse multipart/form-data on this route.

   Why FormData instead of base64-in-JSON?
   ─ Express body-parser default limit: ~100 KB
   ─ A 500 KB file after base64 + IDEA encryption ≈ 1.3 MB JSON string
   ─ FormData transfers the blob as binary — no size inflation, no limit
───────────────────────────────────────────────────────────────────── */
async function apiUploadDocumentWithFile(jsonPayload, encryptedFileString, fileExt, token) {
  try {
    const form = new FormData();

    // Put all document metadata as a JSON string in the "data" field
    form.append('data', JSON.stringify(jsonPayload));

    // Convert the IDEA-encrypted file string to a Blob and attach it
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

/* Fetch the original file blob (auth required — for in-app viewing after page refresh) */
async function apiGetOriginalFile(documentId) {
  return await apiRequest('GET', `/api/documents/${encodeURIComponent(documentId)}/original-file`, null, _jwt());
}

/* Download the processed/final file — returns { fileData, fileExt } */
async function apiDownloadDocument(documentId) {
  return await apiRequest('GET', `/api/documents/download/${encodeURIComponent(documentId)}`, null, _jwt());
}

/* ── Plain JSON status update — used when there is NO processed file ── */
async function apiUpdateDocumentStatus(documentId, payload, token) {
  return await apiRequest('PATCH', `/api/documents/${encodeURIComponent(documentId)}/status`, payload, token || _jwt());
}

/* ── FIX: FormData status update — used when admin attaches a processed file ──
   Same reasoning as apiUploadDocumentWithFile above.
─────────────────────────────────────────────────────────────────────────────── */
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