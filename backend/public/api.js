/* ══════════════════════════════════════════════════════════════════════
   api.js - Centralized API Requests
   CIT Document Tracker - Group 6

   CHANGES (Event section only):
     apiCreateEvent() — now accepts FormData so an optional event image
     can be uploaded alongside the event fields.
     Pass a plain object (no image) or FormData (with image field).
     The function auto-detects which format to use.

   All other functions are IDENTICAL to the original.
══════════════════════════════════════════════════════════════════════ */

const API_BASE = window.CIT_API_BASE || '';

/* ══════════════════════════════════════════════════════════════════════
   WORKFLOW CONSTANTS
══════════════════════════════════════════════════════════════════════ */

const WORKFLOW_STATUS = Object.freeze({
  SUBMITTED:                    'Submitted',
  UNDER_INITIAL_REVIEW:         'Under Initial Review',
  ACTION_REQUIRED_RESUBMISSION: 'Action Required: Resubmission',
  RETURNED_TO_REQUESTER:        'Returned to Requester',
  UNDER_EVALUATION:             'Under Evaluation',
  REVISION_REQUESTED:           'Revision Requested',
  PENDING_FINAL_APPROVAL:       'Pending Final Approval',
  SENT_BACK_FOR_REEVALUATION:   'Sent Back for Reevaluation',
  APPROVED_AND_RELEASED:        'Approved and Released',
  REJECTED:                     'Rejected',
});

const WORKFLOW_ROLE = Object.freeze({
  STAFF:     'staff',
  FACULTY:   'faculty',
  ADMIN:     'admin',
  USER:      'user',
  COMPLETED: 'completed',
});

const WORKFLOW_ACTIONS = Object.freeze({
  STAFF: {
    START_REVIEW:         'start_review',
    FORWARD:              'forward',
    REQUEST_RESUBMISSION: 'request_resubmission',
    RETURN_TO_REQUESTER:  'return_to_requester',
  },
  FACULTY: {
    APPROVE:          'approve',
    REJECT:           'reject',
    REQUEST_REVISION: 'request_revision',
  },
  ADMIN: {
    SEND_BACK: 'send_back',
  },
  USER: {
    RESUBMIT: 'resubmit',
  },
});

const STATUS_LABELS = {
  'Submitted':                    'Submitted',
  'Under Initial Review':         'Under Initial Review',
  'Action Required: Resubmission':'Action Required',
  'Returned to Requester':        'Returned to Requester',
  'Under Evaluation':             'Under Evaluation',
  'Revision Requested':           'Revision Requested',
  'Pending Final Approval':       'Pending Final Approval',
  'Sent Back for Reevaluation':   'Sent Back for Reevaluation',
  'Approved and Released':        'Approved & Released',
  'Rejected':                     'Rejected',
  'Received':   'Received',
  'Processing': 'Processing',
  'On Hold':    'On Hold',
  'Released':   'Released',
  'Returned':   'Returned',
};

const STATUS_OWNER = {
  'Submitted':                    'Staff',
  'Under Initial Review':         'Staff',
  'Action Required: Resubmission':'You',
  'Returned to Requester':        '-',
  'Under Evaluation':             'Faculty',
  'Revision Requested':           'Staff',
  'Pending Final Approval':       'Admin',
  'Sent Back for Reevaluation':   'Faculty',
  'Approved and Released':        '-',
  'Rejected':                     '-',
};

/* ── Core JSON helper ── */
async function apiRequest(method, path, body = null, token = null) {
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body)  opts.body = JSON.stringify(body);
    const res  = await fetch(API_BASE + path, opts);
    const data = await res.json().catch(() => ({ message: 'Server error' }));
    if (!res.ok) return { _error: true, status: res.status, message: data.message || `HTTP ${res.status}` };
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
    if (!res.ok) return { _error: true, status: res.status, message: data.message || `HTTP ${res.status}` };
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
async function apiRegisterUser(payload)   { return await apiRequest('POST', '/api/auth/register', payload); }
async function apiLoginUser(payload)      { return await apiRequest('POST', '/api/auth/login', payload); }
async function apiGetMe(token)            { return await apiRequest('GET',  '/api/auth/me', null, token || _jwt()); }
async function apiGetUsers(token)         { return await apiRequest('GET',  '/api/auth/users', null, token || _jwt()); }
async function apiHeartbeat(token)        { return await apiRequest('POST', '/api/auth/heartbeat', {}, token || _jwt()); }

/* ══════════════════════════════════════════════════════════════════════
   DOCUMENT ENDPOINTS
══════════════════════════════════════════════════════════════════════ */
async function apiRegisterDocument(payload, token) {
  return await apiRequest('POST', '/api/documents/register', payload, token || _jwt());
}

async function apiUploadDocumentWithFile(jsonPayload, encryptedFileString, fileExt, token) {
  try {
    const form = new FormData();
    const blob = new Blob([encryptedFileString], { type: 'application/octet-stream' });
    form.append('file', blob, 'document' + (fileExt ? '.' + fileExt : '.bin'));
    form.append('data', JSON.stringify({ ...jsonPayload, fileExt }));
    return await apiFormRequest('POST', '/api/documents/register', form, token || _jwt());
  } catch (e) {
    console.warn('[apiUploadDocumentWithFile]', e.message);
    return null;
  }
}

async function apiCreateDocument(jsonPayload, encryptedFileString, fileExt, token) {
  try {
    const form = new FormData();
    const blob = new Blob([encryptedFileString], { type: 'application/octet-stream' });
    form.append('file', blob, 'document' + (fileExt ? '.' + fileExt : '.bin'));
    form.append('data', JSON.stringify({ ...jsonPayload, fileExt }));
    return await apiFormRequest('POST', '/api/documents/create', form, token || _jwt());
  } catch (e) {
    console.warn('[apiCreateDocument]', e.message);
    return null;
  }
}

async function apiResubmitDocument(documentId, encryptedFileString, fileExt, note, token) {
  try {
    const form = new FormData();
    const blob = new Blob([encryptedFileString], { type: 'application/octet-stream' });
    form.append('file', blob, 'resubmit' + (fileExt ? '.' + fileExt : '.bin'));
    form.append('data', JSON.stringify({ documentId, fileExt, note: note || '' }));
    return await apiFormRequest('POST', '/api/documents/resubmit', form, token || _jwt());
  } catch (e) {
    console.warn('[apiResubmitDocument]', e.message);
    return null;
  }
}

async function apiGetDocuments(token) {
  return await apiRequest('GET', '/api/documents', null, token || _jwt());
}

async function apiGetMyDocuments(token) {
  return await apiRequest('GET', '/api/documents/my', null, token || _jwt());
}

async function apiGetAllDocuments(token, ownerId, role) {
  let url = '/api/documents';
  if (ownerId) url += `?ownerId=${encodeURIComponent(ownerId)}`;
  return await apiRequest('GET', url, null, token || _jwt());
}

async function apiUpdateDocumentStatusByRole(payload, token) {
  return await apiRequest('POST', '/api/documents/update-status', payload, token || _jwt());
}

async function apiUpdateDocumentStatus(documentId, updates, token) {
  return await apiRequest('PATCH', `/api/documents/${documentId}/status`, updates, token || _jwt());
}

async function apiUpdateDocumentStatusWithFile(documentId, jsonPayload, processedFileString, processedFileExt, token) {
  try {
    const form = new FormData();
    const blob = new Blob([processedFileString], { type: 'application/octet-stream' });
    form.append('processedFile', blob, 'processed' + (processedFileExt ? '.' + processedFileExt : '.bin'));
    form.append('data', JSON.stringify({ ...jsonPayload, processedFileExt }));
    return await apiFormRequest('PATCH', `/api/documents/${documentId}/status`, form, token || _jwt());
  } catch (e) {
    console.warn('[apiUpdateDocumentStatusWithFile]', e.message);
    return null;
  }
}

async function apiTrackDocument(documentId) {
  return await apiRequest('GET', `/api/documents/track/${documentId}`);
}

async function apiDownloadDocument(documentId) {
  return await apiRequest('GET', `/api/documents/download/${documentId}`);
}

async function apiGetOriginalFile(documentId, token) {
  return await apiRequest('GET', `/api/documents/${documentId}/original-file`, null, token || _jwt());
}

async function apiGetDocumentDetails(documentId, token) {
  return await apiRequest('GET', `/api/documents/${documentId}/details`, null, token || _jwt());
}

async function apiDeleteDocument(documentId, token) {
  return await apiRequest('DELETE', `/api/documents/${documentId}`, null, token || _jwt());
}

async function apiAddMovementLog(documentId, payload, token) {
  return await apiRequest('POST', `/api/documents/${documentId}/movement`, payload, token || _jwt());
}

async function apiGetAllScanLogs(token) {
  return await apiRequest('GET', '/api/documents/scan-logs', null, token || _jwt());
}

async function apiGetAllMovementLogs(token) {
  return await apiRequest('GET', '/api/documents/movement-logs', null, token || _jwt());
}

async function apiUpdateVaultKey(payload, token) {
  return await apiRequest('PATCH', '/api/auth/vault-key', payload, token || _jwt());
}

async function apiCreateUserByAdmin(payload, token) {
  return await apiRequest('POST', '/api/auth/users/create', payload, token || _jwt());
}

/* ══════════════════════════════════════════════════════════════════════
   EVENT API CALLS
   CHANGE: apiCreateEvent now accepts either a plain object (no image)
   or a FormData instance (with image).  When imageFile is provided it
   builds FormData automatically.
══════════════════════════════════════════════════════════════════════ */

/**
 * apiCreateEvent
 * @param {object} fields   — { title, description, date, time, location, organizer }
 * @param {File|null} imageFile — optional File object for the event image
 * @param {string} token
 */
async function apiCreateEvent(fields, imageFile, token) {
  if (imageFile) {
    /* Use FormData so multer can process the image on the backend */
    const form = new FormData();
    Object.entries(fields).forEach(([k, v]) => form.append(k, v || ''));
    form.append('image', imageFile, imageFile.name);
    return await apiFormRequest('POST', '/api/events/create', form, token || _jwt());
  }
  /* Plain JSON when no image is attached */
  return await apiRequest('POST', '/api/events/create', fields, token || _jwt());
}

async function apiGetAllEvents(token) {
  return await apiRequest('GET', '/api/events', null, token || _jwt());
}

async function apiGetEventAttendance(eventId, token) {
  return await apiRequest('GET', `/api/events/${eventId}/attendance`, null, token || _jwt());
}

async function apiToggleEvent(eventId, token) {
  return await apiRequest('PATCH', `/api/events/${eventId}/toggle`, {}, token || _jwt());
}

async function apiDeleteEvent(eventId, token) {
  return await apiRequest('DELETE', `/api/events/${eventId}`, null, token || _jwt());
}