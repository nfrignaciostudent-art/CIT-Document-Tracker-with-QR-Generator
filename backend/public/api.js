/* ══════════════════════════════════════════════════════════════════════
   api.js - Centralized API Requests
   CIT Document Tracker - Group 6

   WORKFLOW REFACTOR ADDITIONS:
     apiResubmitDocument()        — POST /api/documents/resubmit
       User uploads corrected file when status = 'Action Required: Resubmission'.
       Uses FormData (multipart). Requires file attachment.

     WORKFLOW_STATUS              — Canonical status string constants.
       Import/use these instead of raw strings to avoid typos.
       Example: WORKFLOW_STATUS.SUBMITTED === 'Submitted'

     WORKFLOW_ACTIONS             — Canonical action string constants.
       Example: WORKFLOW_ACTIONS.STAFF.FORWARD === 'forward'

   UPDATED:
     apiUpdateDocumentStatusByRole() — unchanged signature; now maps to
       the new deterministic state machine on the backend.

   Returns:
     - Response JSON  if request succeeded (2xx)
     - { _error, status, message }  if server returned an error (4xx/5xx)
     - null           ONLY if the server is completely unreachable
══════════════════════════════════════════════════════════════════════ */

const API_BASE = window.CIT_API_BASE || '';

/* ══════════════════════════════════════════════════════════════════════
   WORKFLOW CONSTANTS
   Use these instead of raw strings to prevent typos and make refactoring
   easier. All values match the backend Document model enum exactly.
══════════════════════════════════════════════════════════════════════ */

/** Canonical status values — must match Document.js status enum */
const WORKFLOW_STATUS = Object.freeze({
  /* Intake */
  SUBMITTED:                    'Submitted',
  /* Staff stage */
  UNDER_INITIAL_REVIEW:         'Under Initial Review',
  ACTION_REQUIRED_RESUBMISSION: 'Action Required: Resubmission',
  RETURNED_TO_REQUESTER:        'Returned to Requester',
  /* Faculty stage */
  UNDER_EVALUATION:             'Under Evaluation',
  REVISION_REQUESTED:           'Revision Requested',
  /* Admin stage */
  PENDING_FINAL_APPROVAL:       'Pending Final Approval',
  SENT_BACK_FOR_REEVALUATION:   'Sent Back for Reevaluation',
  /* Terminal */
  APPROVED_AND_RELEASED:        'Approved and Released',
  REJECTED:                     'Rejected',
});

/** Canonical current_role values */
const WORKFLOW_ROLE = Object.freeze({
  STAFF:     'staff',
  FACULTY:   'faculty',
  ADMIN:     'admin',
  USER:      'user',
  COMPLETED: 'completed',
});

/** Canonical action values per role */
const WORKFLOW_ACTIONS = Object.freeze({
  STAFF: {
    START_REVIEW:          'start_review',
    FORWARD:               'forward',
    REQUEST_RESUBMISSION:  'request_resubmission',
    RETURN_TO_REQUESTER:   'return_to_requester',
  },
  FACULTY: {
    APPROVE:               'approve',
    REJECT:                'reject',
    REQUEST_REVISION:      'request_revision',
  },
  /* DESIGN RULE (Option B): Admin has ONE workflow action — SEND_BACK.
     Release is handled via PATCH /api/documents/:id/status (file upload).
     Reject is removed from admin; Faculty is the sole approver/rejecter. */
  ADMIN: {
    SEND_BACK:             'send_back',
  },
  USER: {
    RESUBMIT:              'resubmit',
  },
});

/** Human-readable labels for each status */
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
  /* Legacy */
  'Received':    'Received',
  'Processing':  'Processing',
  'On Hold':     'On Hold',
  'Released':    'Released',
  'Returned':    'Returned',
};

/** Owner label for each status (who needs to act next) */
const STATUS_OWNER = {
  'Submitted':                    'Staff',
  'Under Initial Review':         'Staff',
  'Action Required: Resubmission':'You',
  'Returned to Requester':        '—',
  'Under Evaluation':             'Faculty',
  'Revision Requested':           'Staff',
  'Pending Final Approval':       'Admin',
  'Sent Back for Reevaluation':   'Faculty',
  'Approved and Released':        '—',
  'Rejected':                     '—',
};

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

async function apiGetUsers(token) {
  return await apiRequest('GET', '/api/auth/users', null, token || _jwt());
}

async function apiHeartbeat(token) {
  return await apiRequest('POST', '/api/auth/heartbeat', {}, token || _jwt());
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
  return await apiRequest(
    'GET',
    `/api/documents/track/${encodeURIComponent(documentId)}?_ts=${Date.now()}`
  );
}

async function apiGetDocumentForOwner(documentId, token) {
  return await apiRequest(
    'GET',
    `/api/documents/${encodeURIComponent(documentId)}/details?_ts=${Date.now()}`,
    null,
    token || _jwt()
  );
}

async function apiGetOriginalFile(documentId) {
  return await apiRequest(
    'GET',
    `/api/documents/${encodeURIComponent(documentId)}/original-file`,
    null,
    _jwt()
  );
}

async function apiDownloadDocument(documentId) {
  return await apiRequest(
    'GET',
    `/api/documents/download/${encodeURIComponent(documentId)}`,
    null,
    _jwt()
  );
}

async function apiUpdateDocumentStatus(documentId, payload, token) {
  return await apiRequest(
    'PATCH',
    `/api/documents/${encodeURIComponent(documentId)}/status`,
    payload,
    token || _jwt()
  );
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
  return await apiRequest(
    'DELETE',
    `/api/documents/${encodeURIComponent(documentId)}`,
    null,
    token || _jwt()
  );
}

async function apiLogScan(documentId, payload) {
  return await apiRequest(
    'POST',
    `/api/documents/${encodeURIComponent(documentId)}/scan-log`,
    payload
  );
}

async function apiAddMovementLog(documentId, payload, token) {
  return await apiRequest(
    'POST',
    `/api/documents/${encodeURIComponent(documentId)}/movement`,
    payload,
    token || _jwt()
  );
}

async function apiGetAllScanLogs(token) {
  return await apiRequest('GET', '/api/documents/scan-logs', null, token || _jwt());
}

async function apiGetAllMovementLogs(token) {
  return await apiRequest('GET', '/api/documents/movement-logs', null, token || _jwt());
}

/* ══════════════════════════════════════════════════════════════════════
   NOTIFICATION ENDPOINTS
══════════════════════════════════════════════════════════════════════ */

async function apiGetNotifications(token) {
  return await apiRequest('GET', '/api/notifications', null, token || _jwt());
}

async function apiMarkNotificationsRead(token) {
  return await apiRequest('POST', '/api/notifications/mark-read', {}, token || _jwt());
}

/* ══════════════════════════════════════════════════════════════════════
   WORKFLOW ENDPOINTS  (staff | faculty | admin)
══════════════════════════════════════════════════════════════════════ */

/**
 * apiUpdateDocumentStatusByRole()
 * Calls POST /api/documents/update-status.
 * Backend enforces strict state-machine transitions.
 *
 * @param {Object} payload  { documentId, action, note?, location? }
 * @param {string} token    JWT (optional; falls back to localStorage)
 *
 * Staff actions:
 *   WORKFLOW_ACTIONS.STAFF.START_REVIEW
 *   WORKFLOW_ACTIONS.STAFF.FORWARD
 *   WORKFLOW_ACTIONS.STAFF.REQUEST_RESUBMISSION  (note required)
 *   WORKFLOW_ACTIONS.STAFF.RETURN_TO_REQUESTER   (note required)
 *
 * Faculty actions:
 *   WORKFLOW_ACTIONS.FACULTY.APPROVE
 *   WORKFLOW_ACTIONS.FACULTY.REJECT
 *   WORKFLOW_ACTIONS.FACULTY.REQUEST_REVISION    (note required)
 *
 * Admin actions:
 *   WORKFLOW_ACTIONS.ADMIN.RELEASE
 *   WORKFLOW_ACTIONS.ADMIN.REJECT
 *   WORKFLOW_ACTIONS.ADMIN.SEND_BACK             (note required)
 */
async function apiUpdateDocumentStatusByRole(payload, token) {
  return await apiRequest('POST', '/api/documents/update-status', payload, token || _jwt());
}

/**
 * apiResubmitDocument()
 * Calls POST /api/documents/resubmit  (user role only).
 * Used when doc.status === 'Action Required: Resubmission'.
 *
 * @param {string}      documentId           internalId or displayId
 * @param {string}      encryptedFileString  IDEA-encrypted file content
 * @param {string}      fileExt              file extension (e.g. '.pdf')
 * @param {string|null} note                 optional user note / correction summary
 * @param {string}      token                JWT (optional; falls back to localStorage)
 *
 * Returns { status: 'Submitted', current_role: 'staff', resubmissionCount, … }
 *      or { _error: true, message } on failure
 *      or null on network error
 */
async function apiResubmitDocument(documentId, encryptedFileString, fileExt, note, token) {
  try {
    const form = new FormData();

    const payload = { documentId };
    if (note) payload.note = note;
    if (fileExt) payload.fileExt = fileExt;

    form.append('data', JSON.stringify(payload));

    if (encryptedFileString) {
      const blob = new Blob([encryptedFileString], { type: 'application/octet-stream' });
      const filename = 'resubmission' + (fileExt || '.bin');
      form.append('file', blob, filename);
    }

    return await apiFormRequest('POST', '/api/documents/resubmit', form, token || _jwt());
  } catch (e) {
    console.warn('[apiResubmitDocument]', e.message);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════
   ADMIN USER MANAGEMENT
══════════════════════════════════════════════════════════════════════ */

async function apiCreateUserByAdmin(payload, token) {
  return await apiRequest('POST', '/api/auth/users/create', payload, token || _jwt());
}

/* ══════════════════════════════════════════════════════════════════════
   EVENT API CALLS
   CIT Document Tracker - Group 6
══════════════════════════════════════════════════════════════════════ */

async function apiCreateEvent(payload, token) {
  return await apiRequest('POST', '/api/events/create', payload, token || _jwt());
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