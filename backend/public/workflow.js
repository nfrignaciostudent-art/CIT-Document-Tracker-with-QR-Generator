/* ══════════════════════════════════════════════════════════════════════
   workflow.js — Production-Level Workflow UI
   CIT Document Tracker - Group 6

   WORKFLOW REFACTOR:
     Replaced old status/action labels with the new canonical workflow.
     Added user resubmission flow (openResubmitModal / submitResubmit).
     Updated all dashActions(), renderStats(), renderDash() patches
     to reflect new status names and role-correct action buttons.

   NEW STATUS LABELS (matches Document.js enum exactly):
     Submitted                     → staff queue (initial intake)
     Under Initial Review          → staff is reviewing
     Action Required: Resubmission → user must correct & re-upload
     Returned to Requester         → terminated by staff
     Under Evaluation              → faculty is reviewing
     Revision Requested            → staff must address faculty comments
     Pending Final Approval        → admin must make final decision
     Sent Back for Reevaluation    → faculty must re-review (admin sent back)
     Approved and Released         → document finalized & released
     Rejected                      → document denied

   NEW ACTIONS:
     Staff   : start_review | forward | request_resubmission | return_to_requester
     Faculty : approve | reject | request_revision
     Admin   : release | reject | send_back
     User    : resubmit (via openResubmitModal)

   LOAD ORDER: Must be loaded AFTER script.js (patches functions defined there).
══════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   STATUS DISPLAY HELPERS
   Centralised so every badge, label, and owner reference is consistent.
══════════════════════════════════════════════════════════════════════ */

/** Map status → CSS color used for badges
 *  Colors are semantically distinct — no two statuses share the same hue family.
 *  Must stay in sync with statusColorMap in script.js.
 */
const WF_STATUS_COLOR = {
  'Submitted':                    '#60a5fa',   // blue-400       — neutral intake
  'Under Initial Review':         '#818cf8',   // indigo-400     — staff working
  'Action Required: Resubmission':'#ef4444',   // red-500        — urgent: user must act
  'Returned to Requester':        '#f43f5e',   // rose-500       — terminal: returned to owner (distinct from Rejected dark-red)
  'Under Evaluation':             '#c084fc',   // purple-400     — faculty stage
  'Revision Requested':           '#f97316',   // orange-500     — internal revision
  'Pending Final Approval':       '#38bdf8',   // sky-400        — near completion
  'Sent Back for Reevaluation':   '#f59e0b',   // amber-400      — admin feedback loop
  'Approved and Released':        '#22c55e',   // green-500      — success terminal
  'Rejected':                     '#be123c',   // rose-700       — rejection terminal (dark, distinct from rose-500 above)
  /* Legacy */
  'Received':   '#06b6d4',   // cyan-500  — legacy intake (distinct from blue Submitted)
  'Processing': '#f59e0b',   // amber
  'On Hold':    '#fbbf24',   // yellow
  'Released':   '#22c55e',   // green
  'Returned':   '#f43f5e',   // rose-500  — legacy alias of Returned to Requester
};

/** Map status → "current owner" label shown in UI */
const WF_STATUS_OWNER = {
  'Submitted':                    'Staff',
  'Under Initial Review':         'Staff',
  'Action Required: Resubmission':'You (Requester)',
  'Returned to Requester':        'Closed',
  'Under Evaluation':             'Faculty',
  'Revision Requested':           'Staff',
  'Pending Final Approval':       'Admin',
  'Sent Back for Reevaluation':   'Faculty',
  'Approved and Released':        'Completed',
  'Rejected':                     'Closed',
};

/** Short display label for status (used in tight spaces) */
const WF_STATUS_SHORT = {
  'Submitted':                    'Submitted',
  'Under Initial Review':         'Under Review',
  'Action Required: Resubmission':'Action Required',
  'Returned to Requester':        'Returned',
  'Under Evaluation':             'Under Evaluation',
  'Revision Requested':           'Revision Needed',
  'Pending Final Approval':       'Pending Approval',
  'Sent Back for Reevaluation':   'Sent Back',
  'Approved and Released':        'Released',
  'Rejected':                     'Rejected',
};

/* ══════════════════════════════════════════════════════════════════════
   1. WORKFLOW ACTION MODAL  (staff | faculty | admin)
══════════════════════════════════════════════════════════════════════ */

let _wfDocKey = null;
let _wfAction = null;

/**
 * openWorkflowAction(docKey, action)
 * Opens the confirm-action modal for workflow transitions.
 *
 * Staff actions    : 'start_review' | 'forward' | 'request_resubmission' | 'return_to_requester'
 * Faculty actions  : 'approve' | 'reject' | 'request_revision'
 * Admin actions    : 'release' | 'reject' | 'send_back'
 */
function openWorkflowAction(docKey, action) {
  const d = docs.find(x => (x.internalId || x.id) === docKey);
  if (!d) { toast('Document not found.'); return; }

  _wfDocKey = docKey;
  _wfAction = action;

  /* Per-action configuration */
  const cfg = {

    /* ── Staff ── */
    start_review: {
      title:    'Start Initial Review',
      desc:     'Mark this document as Under Initial Review. You are taking ownership of this submission.',
      btnText:  'Start Review',
      btnClass: 'btn btn-primary',
    },
    forward: {
      title:    'Forward to Faculty',
      desc:     'Forward this document to faculty for evaluation. You confirm the submission is complete and meets initial requirements.',
      btnText:  'Forward to Faculty',
      btnClass: 'btn btn-primary',
    },
    request_resubmission: {
      title:       'Request Resubmission from User',
      desc:        'Send this document back to the requester for correction and re-upload. A clear reason is required — the user will be notified and must submit a corrected file.',
      btnText:     'Request Resubmission',
      btnClass:    'btn btn-yellow-soft',
      requireNote: true,
    },
    return_to_requester: {
      title:       'Return Document to Requester',
      desc:        'Return this document and permanently close the workflow. The requester will be notified. This action cannot be undone.',
      btnText:     'Return & Close Workflow',
      btnClass:    'btn btn-red-soft',
      requireNote: true,
    },

    /* ── Faculty ── */
    approve: {
      title:    'Approve Document',
      desc:     'Approve this document and forward it to admin for final release. Your approval confirms the document meets all faculty requirements.',
      btnText:  'Approve & Forward to Admin',
      btnClass: 'btn btn-primary',
    },
    request_revision: {
      title:       'Request Revision from Staff',
      desc:        'Send this document back to staff with revision notes. Staff must address your comments and re-forward before faculty review continues. A detailed note is required.',
      btnText:     'Request Revision',
      btnClass:    'btn btn-yellow-soft',
      requireNote: true,
    },
    reject: {
      title:    'Reject Document',
      desc:     'Permanently reject this document. The requester will be notified. This action cannot be undone.',
      btnText:  'Confirm Rejection',
      btnClass: 'btn btn-red-soft',
    },

    /* ── Admin ── */
    release: {
      title:    'Approve and Release',
      desc:     'Grant final approval and release this document. The requester will be notified and may download the final file.',
      btnText:  'Approve & Release',
      btnClass: 'btn btn-primary',
    },
    send_back: {
      title:       'Send Back to Faculty for Reevaluation',
      desc:        'Return this document to faculty for additional review. Faculty must re-approve before you can release it. A reason is required.',
      btnText:     'Send Back to Faculty',
      btnClass:    'btn btn-yellow-soft',
      requireNote: true,
    },

  }[action] || { title: action, desc: '', btnText: action, btnClass: 'btn btn-primary' };

  /* Populate modal */
  document.getElementById('wf-modal-title').textContent = cfg.title;
  document.getElementById('wf-modal-desc').textContent  = cfg.desc;
  document.getElementById('wf-modal-doc-name').textContent =
    d.name || '(encrypted — name not visible)';
  document.getElementById('wf-modal-doc-id').textContent =
    d.fullDisplayId || d.displayId || docKey;

  /* Build current state info string */
  const shortStatus = WF_STATUS_SHORT[d.status] || d.status;
  const ownerLabel  = WF_STATUS_OWNER[d.status]  || '—';
  document.getElementById('wf-modal-status').textContent =
    `Current status: ${shortStatus}  ·  Owner: ${ownerLabel}`;

  const noteEl  = document.getElementById('wf-modal-note');
  const noteLbl = document.getElementById('wf-modal-note-label');
  noteEl.value  = '';

  if (noteLbl) {
    noteLbl.innerHTML = cfg.requireNote
      ? 'Note / Reason <span style="color:#ef4444">*</span>'
      : 'Note <span style="font-size:11px;color:var(--muted);font-weight:400">(optional)</span>';
  }
  noteEl.placeholder = cfg.requireNote
    ? 'Required — describe the reason clearly…'
    : 'Optional — add context or comments…';

  document.getElementById('wf-modal-error').style.display = 'none';

  const btn = document.getElementById('wf-submit-btn');
  btn.textContent = cfg.btnText;
  btn.className   = cfg.btnClass;
  btn.disabled    = false;

  openModal('wf-action-modal');
}

/**
 * submitWorkflowAction()
 * Called by the "Confirm" button in wf-action-modal.
 * Calls POST /api/documents/update-status then refreshes the UI.
 */
async function submitWorkflowAction() {
  if (!_wfDocKey || !_wfAction) return;

  const d = docs.find(x => (x.internalId || x.id) === _wfDocKey);
  if (!d) { toast('Document not found.'); return; }

  const note  = (document.getElementById('wf-modal-note').value || '').trim();
  const errEl = document.getElementById('wf-modal-error');
  const btn   = document.getElementById('wf-submit-btn');

  /* Actions that require a note */
  const noteRequiredActions = [
    'request_resubmission', 'return_to_requester', 'request_revision', 'send_back',
  ];
  if (noteRequiredActions.includes(_wfAction) && !note) {
    errEl.textContent   = 'A reason / note is required for this action.';
    errEl.style.display = 'block';
    document.getElementById('wf-modal-note').focus();
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Submitting…';
  errEl.style.display = 'none';

  const result = await apiUpdateDocumentStatusByRole(
    {
      documentId: d.internalId || d.id,
      action:     _wfAction,
      note:       note || undefined,
    },
    currentUser.token
  );

  btn.disabled    = false;
  btn.textContent = btn.textContent.replace('Submitting…', '');   // restored by openWorkflowAction next time

  if (!result) {
    errEl.textContent   = 'Cannot reach server. Please check your connection and try again.';
    errEl.style.display = 'block';
    return;
  }
  if (result._error) {
    errEl.textContent   = result.message || 'Action failed. Please try again.';
    errEl.style.display = 'block';
    return;
  }

  /* ── Update local docs array for immediate UI feedback ── */
  const idx = docs.findIndex(x => (x.internalId || x.id) === _wfDocKey);
  if (idx >= 0) {
    docs[idx].status        = result.status;
    docs[idx].current_role  = result.current_role;
    docs[idx].current_stage = result.current_stage;
    if (!docs[idx].history) docs[idx].history = [];
    docs[idx].history.push({
      action: 'Status Update',
      status: result.status,
      date:   new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
      note:   note || '',
      by:     currentUser.name || currentUser.username,
    });
  }

  closeModal('wf-action-modal');

  /* Human-readable verb for the activity log */
  const verbMap = {
    start_review:         'started initial review of',
    forward:              'forwarded to faculty',
    request_resubmission: 'requested resubmission for',
    return_to_requester:  'returned to requester',
    approve:              'approved',
    reject:               'rejected',
    request_revision:     'requested revision for',
    release:              'approved and released',
    send_back:            'sent back to faculty',
  };
  const verb  = verbMap[_wfAction] || _wfAction;
  const color = ['reject', 'return_to_requester'].includes(_wfAction) ? '#ef4444' :
                ['request_resubmission', 'request_revision', 'send_back'].includes(_wfAction) ? '#f59e0b' :
                '#22c55e';

  if (typeof logActivity === 'function') {
    logActivity(
      currentUser.id,
      `${verb.charAt(0).toUpperCase() + verb.slice(1)} document "${d.name || d.fullDisplayId}"`,
      color
    );
  }

  if (typeof save === 'function') save();
  renderAll();
  toast(`Document ${verb} successfully.`);

  /* Re-sync from backend after a short delay to confirm server state */
  setTimeout(function () {
    if (typeof _syncDocsFromBackend === 'function') {
      _syncDocsFromBackend().then(function () { renderAll(); });
    }
  }, 700);
}

/* ══════════════════════════════════════════════════════════════════════
   2. USER RESUBMISSION MODAL
   Called when doc.status === 'Action Required: Resubmission'
   and currentUser.role === 'user'.
══════════════════════════════════════════════════════════════════════ */

let _resubmitDocKey = null;

/**
 * openResubmitModal(docKey)
 * Opens a modal for the user to upload a corrected file.
 * Only callable when the document requires resubmission.
 */
function openResubmitModal(docKey) {
  const d = docs.find(x => (x.internalId || x.id) === docKey);
  if (!d) { toast('Document not found.'); return; }

  if (d.status !== 'Action Required: Resubmission') {
    toast('This document does not require resubmission.');
    return;
  }

  _resubmitDocKey = docKey;

  /* Populate modal fields */
  const nameEl = document.getElementById('resubmit-doc-name');
  const idEl   = document.getElementById('resubmit-doc-id');
  if (nameEl) nameEl.textContent = d.name || '(encrypted)';
  if (idEl)   idEl.textContent   = d.fullDisplayId || d.displayId || docKey;

  /* Show resubmission count if > 0 */
  const countEl = document.getElementById('resubmit-count');
  if (countEl) {
    const count = d.resubmissionCount || 0;
    countEl.textContent = count > 0
      ? `This document has been resubmitted ${count} time${count !== 1 ? 's' : ''} previously.`
      : '';
    countEl.style.display = count > 0 ? '' : 'none';
  }

  /* Reset file input and note */
  const fileEl = document.getElementById('resubmit-file');
  const noteEl = document.getElementById('resubmit-note');
  if (fileEl) fileEl.value = '';
  if (noteEl) noteEl.value = '';

  document.getElementById('resubmit-error').style.display   = 'none';
  document.getElementById('resubmit-submit-btn').disabled    = false;
  document.getElementById('resubmit-submit-btn').textContent = 'Submit Correction';

  openModal('resubmit-modal');
}

/**
 * submitResubmit()
 * Called by the Submit button in resubmit-modal.
 * Encrypts the file with IDEA-128-CBC (via CIT_VAULT) then
 * calls apiResubmitDocument() → POST /api/documents/resubmit.
 */
async function submitResubmit() {
  if (!_resubmitDocKey) return;

  const d = docs.find(x => (x.internalId || x.id) === _resubmitDocKey);
  if (!d) { toast('Document not found.'); return; }

  const fileEl  = document.getElementById('resubmit-file');
  const noteEl  = document.getElementById('resubmit-note');
  const errEl   = document.getElementById('resubmit-error');
  const btn     = document.getElementById('resubmit-submit-btn');

  errEl.style.display = 'none';

  /* File is required */
  if (!fileEl || !fileEl.files || !fileEl.files[0]) {
    errEl.textContent   = 'Please select the corrected file to upload.';
    errEl.style.display = 'block';
    return;
  }

  const file = fileEl.files[0];
  const note = (noteEl ? noteEl.value : '').trim();
  const fileExt = '.' + (file.name.split('.').pop() || 'bin');

  btn.disabled    = true;
  btn.textContent = 'Encrypting file…';

  try {
    /* Read and encrypt file using IDEA-128-CBC vault */
    let encryptedFileString = null;

    if (typeof CIT_VAULT !== 'undefined' && CIT_VAULT.hasKey && CIT_VAULT.hasKey()) {
      const arrayBuf   = await file.arrayBuffer();
      const uint8      = new Uint8Array(arrayBuf);
      const b64raw     = btoa(String.fromCharCode(...uint8));
      encryptedFileString = CIT_VAULT.encryptString ? CIT_VAULT.encryptString(b64raw) : b64raw;
    } else {
      /* Fallback: no vault active — send raw base64 (should not happen in production) */
      const arrayBuf = await file.arrayBuffer();
      const uint8    = new Uint8Array(arrayBuf);
      encryptedFileString = btoa(String.fromCharCode(...uint8));
      console.warn('[submitResubmit] CIT_VAULT not active — file sent without encryption.');
    }

    btn.textContent = 'Submitting…';

    const result = await apiResubmitDocument(
      d.internalId || d.id,
      encryptedFileString,
      fileExt,
      note || undefined,
      currentUser.token
    );

    btn.disabled    = false;
    btn.textContent = 'Submit Correction';

    if (!result) {
      errEl.textContent   = 'Cannot reach server. Please check your connection and try again.';
      errEl.style.display = 'block';
      return;
    }
    if (result._error) {
      errEl.textContent   = result.message || 'Resubmission failed. Please try again.';
      errEl.style.display = 'block';
      return;
    }

    /* ── Success: update local state ── */
    const idx = docs.findIndex(x => (x.internalId || x.id) === _resubmitDocKey);
    if (idx >= 0) {
      docs[idx].status             = result.status;
      docs[idx].current_role       = result.current_role;
      docs[idx].current_stage      = result.current_role === 'user' ? 'staff' : result.current_role;
      docs[idx].resubmissionCount  = result.resubmissionCount;
      docs[idx].hasOriginalFile    = true;
    }

    closeModal('resubmit-modal');

    if (typeof logActivity === 'function') {
      logActivity(
        currentUser.id,
        `Resubmitted corrected document "${d.name || d.fullDisplayId}"`,
        '#60a5fa'
      );
    }

    if (typeof save === 'function') save();
    renderAll();
    toast('Document resubmitted successfully. Staff will review your correction.');

    setTimeout(function () {
      if (typeof _syncDocsFromBackend === 'function') {
        _syncDocsFromBackend().then(function () { renderAll(); });
      }
    }, 700);

  } catch (err) {
    console.error('[submitResubmit]', err);
    btn.disabled    = false;
    btn.textContent = 'Submit Correction';
    errEl.textContent   = 'An error occurred. Please try again.';
    errEl.style.display = 'block';
  }
}

/* ══════════════════════════════════════════════════════════════════════
   3. CREATE STAFF / FACULTY USER MODAL  (admin only, unchanged API)
══════════════════════════════════════════════════════════════════════ */

function openCreateUserModal() {
  if (!currentUser || currentUser.role !== 'admin') {
    toast('Admin access required.');
    return;
  }
  ['cu-username', 'cu-name', 'cu-password', 'cu-employee-id'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const roleEl = document.getElementById('cu-role');
  if (roleEl) roleEl.value = 'staff';

  document.getElementById('cu-error').style.display   = 'none';
  document.getElementById('cu-success').style.display = 'none';
  document.getElementById('cu-submit-btn').disabled    = false;
  document.getElementById('cu-submit-btn').textContent = 'Create Account';

  openModal('create-user-modal');
}

async function submitCreateUser() {
  const username    = (document.getElementById('cu-username').value    || '').trim().toLowerCase();
  const name        = (document.getElementById('cu-name').value        || '').trim();
  const password    = (document.getElementById('cu-password').value    || '');
  const employee_id = (document.getElementById('cu-employee-id').value || '').trim();
  const role        = (document.getElementById('cu-role').value        || 'staff');
  const errEl       = document.getElementById('cu-error');
  const successEl   = document.getElementById('cu-success');
  const btn         = document.getElementById('cu-submit-btn');

  errEl.style.display     = 'none';
  successEl.style.display = 'none';

  if (!username || !name || !password) {
    errEl.textContent = 'Username, full name, and password are required.';
    errEl.style.display = 'block';
    return;
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    errEl.textContent = 'Username: lowercase letters, numbers, underscores only.';
    errEl.style.display = 'block';
    return;
  }
  if (password.length < 4) {
    errEl.textContent = 'Password must be at least 4 characters.';
    errEl.style.display = 'block';
    return;
  }
  if (['staff', 'faculty'].includes(role) && !employee_id) {
    errEl.textContent = 'Employee ID is required for staff and faculty accounts.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Creating account…';

  const payload = { username, name, password, role };
  if (employee_id) payload.employee_id = employee_id;

  const result = await apiCreateUserByAdmin(payload, currentUser.token);

  btn.disabled    = false;
  btn.textContent = 'Create Account';

  if (!result) {
    errEl.textContent = 'Cannot reach server. Please try again.';
    errEl.style.display = 'block';
    return;
  }
  if (result._error) {
    errEl.textContent = result.message || 'Failed to create account.';
    errEl.style.display = 'block';
    return;
  }

  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  successEl.textContent =
    `${roleLabel} account "${name}" (@${username})` +
    (employee_id ? ` [ID: ${employee_id}]` : '') +
    ' created successfully.';
  successEl.style.display = 'block';

  ['cu-username', 'cu-name', 'cu-password', 'cu-employee-id'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  if (typeof _fetchBackendUsers === 'function') {
    _fetchBackendUsers(true).then(function () {
      if (typeof renderUsers === 'function') renderUsers();
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   4. PATCH renderStats() — workflow-aware statistics
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.renderStats;

  window.renderStats = function () {
    if (!currentUser) return;
    var role = currentUser.role;

    if (role !== 'staff' && role !== 'faculty') {
      return _orig.apply(this, arguments);
    }

    var total = docs.length;
    var statsEl = document.getElementById('stats-row');
    if (!statsEl) return;

    var titleEl = document.getElementById('dash-title');
    var subEl   = document.getElementById('dash-subtitle');

    if (role === 'staff') {
      /* Staff queue stats — docs with current_role: 'staff' */
      var submitted    = docs.filter(function (d) { return d.status === 'Submitted'; }).length;
      var underReview  = docs.filter(function (d) { return d.status === 'Under Initial Review'; }).length;
      var revisionReq  = docs.filter(function (d) { return d.status === 'Revision Requested'; }).length;
      var forwarded    = 0;   /* Not in staff queue once forwarded */

      statsEl.innerHTML =
        '<div class="stat-card">' +
          '<div class="stat-card-label">In Queue</div>' +
          '<div class="stat-card-num">' + total + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-card-label">New Submissions</div>' +
          '<div class="stat-card-num" style="color:#60a5fa">' + submitted + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-card-label">Under Initial Review</div>' +
          '<div class="stat-card-num" style="color:#a78bfa">' + underReview + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-card-label">Revision Requested</div>' +
          '<div class="stat-card-num" style="color:#fbbf24">' + revisionReq + '</div>' +
        '</div>';

      if (titleEl) titleEl.textContent = 'Staff Dashboard';
      if (subEl)   subEl.textContent   = 'Welcome, ' + (currentUser.name || currentUser.username);

    } else if (role === 'faculty') {
      /* Faculty queue stats — docs with current_role: 'faculty' */
      var underEval  = docs.filter(function (d) { return d.status === 'Under Evaluation'; }).length;
      var sentBack   = docs.filter(function (d) { return d.status === 'Sent Back for Reevaluation'; }).length;

      statsEl.innerHTML =
        '<div class="stat-card">' +
          '<div class="stat-card-label">In Queue</div>' +
          '<div class="stat-card-num">' + total + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-card-label">Under Evaluation</div>' +
          '<div class="stat-card-num" style="color:#c084fc">' + underEval + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-card-label">Sent Back for Reevaluation</div>' +
          '<div class="stat-card-num" style="color:#fb923c">' + sentBack + '</div>' +
        '</div>';

      if (titleEl) titleEl.textContent = 'Faculty Dashboard';
      if (subEl)   subEl.textContent   = 'Welcome, ' + (currentUser.name || currentUser.username);
    }
  };
}());

/* ══════════════════════════════════════════════════════════════════════
   5. PATCH renderDash() — staff / faculty workflow queue view
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.renderDash;

  window.renderDash = function () {
    if (!currentUser) return;
    var role = currentUser.role;

    if (role !== 'staff' && role !== 'faculty') {
      return _orig.apply(this, arguments);
    }

    var rows = docs.slice().reverse().slice(0, 10);
    var tb   = document.getElementById('dash-tbody');
    if (!tb) return;

    if (!rows.length) {
      tb.innerHTML =
        '<tr><td colspan="4"><div class="empty-msg">Your queue is empty — no documents awaiting action.</div></td></tr>';
    } else {
      tb.innerHTML = rows.map(function (d) {
        var docKey   = d.internalId || d.id;
        var nameHtml = d.name
          ? d.name
          : '<span style="color:#94a3b8;font-style:italic">Encrypted</span>';
        var ownerHtml =
          '<br><span style="font-size:11px;color:var(--muted);font-weight:400">by ' +
          (d.ownerName || d.by || 'user') + '</span>';

        /* Status badge with new colors */
        var statusColor = WF_STATUS_COLOR[d.status] || '#64748b';
        var shortLabel  = WF_STATUS_SHORT[d.status]  || d.status;
        var badge =
          '<span style="display:inline-flex;align-items:center;gap:5px;' +
          'font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;' +
          'background:' + statusColor + '22;color:' + statusColor + ';' +
          'border:1px solid ' + statusColor + '44">' + shortLabel + '</span>';

        return '<tr>' +
          '<td class="doc-id-cell" title="' + (d.internalId || d.id) + '">' +
            (d.fullDisplayId || d.displayId || d.id) +
          '</td>' +
          '<td class="doc-name-cell">' + nameHtml + ownerHtml + '</td>' +
          '<td>' + badge + '</td>' +
          '<td>' + (typeof dashActions === 'function' ? dashActions(d) : '') + '</td>' +
        '</tr>';
      }).join('');
    }

    /* Recent activity */
    var al = document.getElementById('activity-list');
    if (al) {
      var acts = (activityLogs[currentUser.id] || []).slice().reverse().slice(0, 6);
      if (!acts.length) {
        al.innerHTML = '<p style="font-size:13px;color:var(--muted)">No recent activity.</p>';
      } else {
        al.innerHTML = acts.map(function (a) {
          return '<div class="activity-item">' +
            '<div>' +
              '<div class="activity-text">' + a.msg + '</div>' +
              '<div class="activity-time">' + a.date + '</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
    }

    var titleEl = document.getElementById('my-activity-title');
    if (titleEl) titleEl.textContent = 'My Recent Activity';
  };
}());

/* ══════════════════════════════════════════════════════════════════════
   6. PATCH dashActions() — role-correct action buttons
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.dashActions;

  window.dashActions = function (d) {
    if (!currentUser) return _orig.apply(this, arguments);
    var role   = currentUser.role;
    var docKey = d.internalId || d.id;
    var status = d.status;
    var cRole  = d.current_role;

    /* ── STAFF ─────────────────────────────────────────────────── */
    if (role === 'staff') {
      var canStartReview      = status === 'Submitted'                && cRole === 'staff';
      var canForward          = (status === 'Under Initial Review' || status === 'Revision Requested') && cRole === 'staff';
      var canRequestResubmit  = status === 'Under Initial Review'     && cRole === 'staff';
      var canReturnUser       = status === 'Under Initial Review'     && cRole === 'staff';

      var items = _histBtn(docKey);

      if (canStartReview) {
        items +=
          '<button class="dropdown-item" style="color:#3b82f6;font-weight:700" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'start_review\')">' +
          '&#9654;&nbsp; Start Initial Review</button>';
      }
      if (canForward) {
        var fwdLabel = status === 'Revision Requested'
          ? '&#9654;&nbsp; Re-forward to Faculty'
          : '&#9654;&nbsp; Forward to Faculty';
        items +=
          '<button class="dropdown-item" style="color:#22c55e;font-weight:700" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'forward\')">' +
          fwdLabel + '</button>';
      }
      if (canRequestResubmit) {
        items +=
          '<button class="dropdown-item" style="color:#f59e0b;font-weight:600" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'request_resubmission\')">' +
          '&#9998;&nbsp; Request Resubmission</button>';
      }
      if (canReturnUser) {
        items +=
          '<button class="dropdown-item danger" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'return_to_requester\')">' +
          '&#8617;&nbsp; Return to Requester</button>';
      }
      if (!canStartReview && !canForward && !canRequestResubmit) {
        items +=
          '<button class="dropdown-item" disabled ' +
          'title="No workflow actions available for this document\'s current state">' +
          'No Actions Available</button>';
      }

      return _buildMenu(docKey, items);
    }

    /* ── FACULTY ────────────────────────────────────────────────── */
    if (role === 'faculty') {
      var canReview = (status === 'Under Evaluation' || status === 'Sent Back for Reevaluation')
                      && cRole === 'faculty';

      var items = _histBtn(docKey);

      if (canReview) {
        items +=
          '<button class="dropdown-item" style="color:#22c55e;font-weight:700" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'approve\')">' +
          '&#10003;&nbsp; Approve</button>' +
          '<button class="dropdown-item" style="color:#f59e0b;font-weight:600" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'request_revision\')">' +
          '&#9998;&nbsp; Request Revision</button>' +
          '<button class="dropdown-item danger" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'reject\')">' +
          '&#10007;&nbsp; Reject</button>';
      } else {
        items +=
          '<button class="dropdown-item" disabled ' +
          'title="Document is not in the faculty review stage">' +
          'No Actions Available</button>';
      }

      return _buildMenu(docKey, items);
    }

    /* ── USER ───────────────────────────────────────────────────── */
    if (role === 'user') {
      var needsResubmit = status === 'Action Required: Resubmission' && cRole === 'user';
      var isTerminal    = ['Approved and Released', 'Rejected', 'Returned to Requester'].includes(status);
      var items         = _histBtn(docKey);

      if (needsResubmit) {
        items +=
          '<button class="dropdown-item" style="color:#f97316;font-weight:700" ' +
          'onclick="closeAllActionMenus();openResubmitModal(\'' + docKey + '\')">' +
          '&#8593;&nbsp; Submit Correction</button>';
      } else if (isTerminal) {
        var termLabel = status === 'Approved and Released' ? 'Download File' : 'View Details';
        items +=
          '<button class="dropdown-item" style="color:#4ade80;font-weight:600" ' +
          'onclick="closeAllActionMenus();' +
          (status === 'Approved and Released' ? 'decryptAndDownload(\'' + docKey + '\',this)' : 'openHistory(\'' + docKey + '\')') +
          '">' + termLabel + '</button>';
      } else {
        items +=
          '<button class="dropdown-item" disabled>Awaiting ' +
          (WF_STATUS_OWNER[status] || 'review') +
          '</button>';
      }

      return _buildMenu(docKey, items);
    }

    /* ── ADMIN ─────────────────────────────────────────────────────
       Inject workflow actions for documents in the admin stage.
    ───────────────────────────────────────────────────────────────── */
    if (role === 'admin') {
      var origHtml = _orig.apply(this, arguments);

      if (status === 'Pending Final Approval' && cRole === 'admin') {
        var adminItems =
          '<button class="dropdown-item" style="color:#22c55e;font-weight:700" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'release\')">' +
          '&#10003;&nbsp; Approve &amp; Release</button>' +
          '<button class="dropdown-item" style="color:#f59e0b;font-weight:600" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'send_back\')">' +
          '&#8617;&nbsp; Send Back to Faculty</button>' +
          '<button class="dropdown-item danger" ' +
          'onclick="closeAllActionMenus();openWorkflowAction(\'' + docKey + '\',\'reject\')">' +
          '&#10007;&nbsp; Reject</button>';
        origHtml = origHtml.replace(/<\/div>\s*<\/div>\s*$/, adminItems + '</div></div>');
      }

      return origHtml;
    }

    return _orig.apply(this, arguments);
  };

  function _histBtn(docKey) {
    return '<button class="dropdown-item" ' +
      'onclick="closeAllActionMenus();openHistory(\'' + docKey + '\')">' +
      'View History</button>';
  }

  function _buildMenu(docKey, items) {
    return '<div class="dash-actions">' +
      '<button class="btn btn-sm btn-ghost action-toggle" ' +
      'onclick="toggleActionMenu(\'' + docKey + '\', event)">Actions</button>' +
      '<div class="action-menu" id="action-menu-' + docKey + '" ' +
      'onclick="event.stopPropagation()">' + items + '</div>' +
    '</div>';
  }
}());

/* ══════════════════════════════════════════════════════════════════════
   7. PATCH renderUsers() — inject "Create Staff / Faculty" button
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.renderUsers;

  window.renderUsers = function () {
    if (currentUser && currentUser.role === 'admin') {
      var cardHead = document.querySelector('#page-users .card-head');
      if (cardHead && !document.getElementById('wf-create-user-btn')) {
        var btn       = document.createElement('button');
        btn.id        = 'wf-create-user-btn';
        btn.className = 'btn btn-primary btn-sm';
        btn.innerHTML =
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
          '&nbsp;Create Staff / Faculty';
        btn.onclick   = openCreateUserModal;
        cardHead.appendChild(btn);
      }
    }
    _orig.apply(this, arguments);
  };
}());

/* ══════════════════════════════════════════════════════════════════════
   8. USER DASHBOARD — highlight Action Required documents
   Patches the user's document list to show an alert banner for docs
   requiring resubmission, so users never miss required actions.
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.renderDash;

  /* Only patch further for 'user' role — staff/faculty already patched above */
  var _patched = window.renderDash;
  window.renderDash = function () {
    if (!currentUser || currentUser.role !== 'user') {
      return _patched.apply(this, arguments);
    }

    /* Original user renderDash */
    _patched.apply(this, arguments);

    /* Inject Action Required banner ONLY for this user's own docs
       that need resubmission. Triple-guard: role check (above) +
       status + current_role + ownerId.  Staff/faculty/admin cannot
       reach this code path (they return early from the role check),
       but the ownerId filter is added as an explicit safety net so
       that even if the docs array somehow contains other users' docs,
       the banner never appears for documents this user doesn't own. */
    var actionDocs = docs.filter(function (d) {
      return d.status === 'Action Required: Resubmission'
        && d.current_role === 'user'
        && (d.ownerId === currentUser.id || d.ownerId === currentUser.userId);
    });

    var bannerContainerId = 'wf-action-required-banner';
    var existing = document.getElementById(bannerContainerId);
    if (existing) existing.remove();

    if (!actionDocs.length) return;

    var dashContent = document.getElementById('page-dashboard');
    if (!dashContent) return;

    var bannerHtml =
      '<div id="' + bannerContainerId + '" style="' +
      'background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.4);' +
      'border-radius:10px;padding:14px 18px;margin-bottom:16px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
        '<strong style="color:#dc2626;font-size:13px">Action Required — ' + actionDocs.length +
        ' document' + (actionDocs.length > 1 ? 's require' : ' requires') + ' your attention</strong>' +
      '</div>' +
      actionDocs.map(function (d) {
        var docKey = d.internalId || d.id;
        /* Find last note from history that explains the resubmission request */
        var lastNote = '';
        if (d.history && d.history.length) {
          var last = d.history[d.history.length - 1];
          lastNote = last.note || '';
        }
        return '<div style="display:flex;align-items:center;justify-content:space-between;' +
          'background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.25);' +
          'border-radius:8px;padding:10px 14px;margin-top:8px">' +
          '<div>' +
            /* Document name — dark red, high-contrast on light background */
            '<div style="font-size:13px;font-weight:700;color:#7f1d1d;margin-bottom:3px">' +
              (d.name || '(encrypted)') + '</div>' +
            /* Doc ID — slate gray, clearly readable */
            '<div style="font-size:11px;color:#475569;font-family:\'DM Mono\',monospace">' +
              (d.fullDisplayId || d.displayId || d.id) + '</div>' +
            (lastNote
              /* Reason note — dark red tone, readable on light red tint background */
              ? '<div style="font-size:11px;color:#991b1b;margin-top:4px">' +
                  '&#8220;' + lastNote.replace(/<[^>]+>/g, '') + '&#8221;</div>'
              : '') +
          '</div>' +
          '<button class="btn btn-sm" ' +
          'style="background:#dc2626;color:#fff;border:none;white-space:nowrap" ' +
          'onclick="openResubmitModal(\'' + docKey + '\')">' +
          'Submit Correction</button>' +
        '</div>';
      }).join('') +
      '</div>';

    /* Insert at top of dashboard content */
    var firstChild = dashContent.firstElementChild;
    if (firstChild) {
      var tempDiv = document.createElement('div');
      tempDiv.innerHTML = bannerHtml;
      dashContent.insertBefore(tempDiv.firstElementChild, firstChild);
    }
  };
}());