/* ══════════════════════════════════════════════════════════════════════
   workflow.js — Staff / Faculty Workflow & Admin User Creation
   CIT Document Tracker - Group 6

   LOAD ORDER: Must be loaded AFTER script.js so the patches below can
   override the functions already defined there.

   WHAT THIS FILE DOES:
     1. Adds apiUpdateDocumentStatusByRole + apiCreateUserByAdmin
        (see api.js — they live there; no duplicates here).

     2. Adds workflow action UI:
          openWorkflowAction(docKey, action)
          submitWorkflowAction()

     3. Adds admin "Create Staff / Faculty" UI:
          openCreateUserModal()
          submitCreateUser()

     4. Patches renderStats()  — staff/faculty see their queue stats.
     5. Patches renderDash()   — staff/faculty see their queue rows.
     6. Patches dashActions()  — staff/faculty get role-appropriate buttons.
     7. Patches renderUsers()  — injects "Create Staff / Faculty" button.

   ALL patches guard against admin/user regression — original functions
   are called for those roles unchanged.
══════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   1. WORKFLOW ACTION MODAL
══════════════════════════════════════════════════════════════════════ */

let _wfDocKey = null;
let _wfAction = null;

/**
 * openWorkflowAction(docKey, action)
 * Opens the confirm-action modal for staff/faculty workflow transitions.
 * action ∈ { 'process', 'approve', 'reject' }
 */
function openWorkflowAction(docKey, action) {
  const d = docs.find(x => (x.internalId || x.id) === docKey);
  if (!d) { toast('Document not found.'); return; }

  _wfDocKey = docKey;
  _wfAction = action;

  /* Labels per action */
  const cfg = {
    process: {
      title:    'Process Document',
      desc:     'Mark this document as processed and forward it to Faculty for review.',
      btnText:  'Process & Forward to Faculty',
      btnClass: 'btn btn-primary',
    },
    approve: {
      title:    'Approve Document',
      desc:     'Approve this document and forward it to Admin for final release.',
      btnText:  'Approve & Forward to Admin',
      btnClass: 'btn btn-primary',
    },
    reject: {
      title:    'Reject Document',
      desc:     'Reject this document. The submitter will be notified. This cannot be undone.',
      btnText:  'Confirm Rejection',
      btnClass: 'btn btn-red-soft',
    },
  }[action] || { title: action, desc: '', btnText: action, btnClass: 'btn btn-primary' };

  /* Populate modal */
  document.getElementById('wf-modal-title').textContent = cfg.title;
  document.getElementById('wf-modal-desc').textContent  = cfg.desc;
  document.getElementById('wf-modal-doc-name').textContent =
    d.name || '(encrypted)';
  document.getElementById('wf-modal-doc-id').textContent =
    d.fullDisplayId || d.displayId || docKey;
  document.getElementById('wf-modal-status').textContent =
    'Current status: ' + d.status + ' / Stage: ' + (d.current_stage || '—');
  document.getElementById('wf-modal-note').value = '';
  document.getElementById('wf-modal-error').style.display = 'none';

  const btn = document.getElementById('wf-submit-btn');
  btn.textContent = cfg.btnText;
  btn.className   = cfg.btnClass;
  btn.disabled    = false;

  openModal('wf-action-modal');
}

/**
 * submitWorkflowAction()
 * Called by the "Confirm" button inside wf-action-modal.
 * Calls POST /api/documents/update-status then refreshes the UI.
 */
async function submitWorkflowAction() {
  if (!_wfDocKey || !_wfAction) return;

  const d = docs.find(x => (x.internalId || x.id) === _wfDocKey);
  if (!d) { toast('Document not found.'); return; }

  const note  = (document.getElementById('wf-modal-note').value || '').trim();
  const errEl = document.getElementById('wf-modal-error');
  const btn   = document.getElementById('wf-submit-btn');

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

  btn.disabled = false;

  if (!result) {
    errEl.textContent = 'Cannot reach server. Please check your connection.';
    errEl.style.display = 'block';
    btn.textContent = document.getElementById('wf-submit-btn').textContent; // restore label
    return;
  }
  if (result._error) {
    errEl.textContent = result.message || 'Action failed. Please try again.';
    errEl.style.display = 'block';
    return;
  }

  /* ── Update local docs array so the UI reflects changes immediately ── */
  const idx = docs.findIndex(x => (x.internalId || x.id) === _wfDocKey);
  if (idx >= 0) {
    docs[idx].status        = result.status;
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

  /* Log activity locally */
  const verb = { process: 'processed', approve: 'approved', reject: 'rejected' }[_wfAction] || _wfAction;
  if (typeof logActivity === 'function') {
    logActivity(
      currentUser.id,
      `${verb.charAt(0).toUpperCase() + verb.slice(1)} document "${d.name || d.fullDisplayId}"`,
      _wfAction === 'reject' ? '#ef4444' : '#22c55e'
    );
  }

  if (typeof save === 'function') save();
  renderAll();
  toast(`Document ${verb} successfully.`);

  /*
   * After a successful workflow action, staff/faculty no longer "own"
   * this document in their queue — it has moved to the next stage.
   * Re-sync from the backend after a brief delay so the list is accurate.
   */
  setTimeout(function () {
    if (typeof _syncDocsFromBackend === 'function') {
      _syncDocsFromBackend().then(function () { renderAll(); });
    }
  }, 600);
}

/* ══════════════════════════════════════════════════════════════════════
   2. CREATE STAFF / FACULTY USER MODAL
══════════════════════════════════════════════════════════════════════ */

/** openCreateUserModal() — only callable by admin */
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

/** submitCreateUser() — called by the submit button in create-user-modal */
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

  /* ── Validation ── */
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

  /* ── Success ── */
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  successEl.textContent =
    roleLabel + ' account "' + name + '" (@' + username + ')' +
    (employee_id ? ' [ID: ' + employee_id + ']' : '') +
    ' created successfully.';
  successEl.style.display = 'block';

  /* Clear form for next entry */
  ['cu-username', 'cu-name', 'cu-password', 'cu-employee-id'].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  /* Refresh users list in background */
  if (typeof _fetchBackendUsers === 'function') {
    _fetchBackendUsers(true).then(function () {
      if (typeof renderUsers === 'function') renderUsers();
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   3. PATCH renderStats() — staff / faculty queue statistics
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.renderStats;

  window.renderStats = function () {
    if (!currentUser) return;
    var role = currentUser.role;

    if (role !== 'staff' && role !== 'faculty') {
      return _orig.apply(this, arguments);
    }

    /*
     * docs[] is pre-filtered by the backend for this role:
     *   staff   → current_stage = 'staff'   (status = Received)
     *   faculty → current_stage = 'faculty' (status = Processing)
     */
    var total    = docs.length;
    var pending  = docs.filter(function (d) {
      return role === 'staff'
        ? (d.status === 'Received'   && d.current_stage === 'staff')
        : (d.status === 'Processing' && d.current_stage === 'faculty');
    }).length;
    var processed = docs.filter(function (d) {
      return role === 'staff'
        ? d.status === 'Processing'
        : d.current_stage === 'admin' || d.status === 'Released';
    }).length;
    var rejected = docs.filter(function (d) {
      return d.status === 'Rejected';
    }).length;

    var queueLabel     = role === 'staff' ? 'Awaiting Processing' : 'Awaiting Review';
    var processedLabel = role === 'staff' ? 'Forwarded to Faculty' : 'Forwarded to Admin';
    var dashTitle      = role === 'staff' ? 'Staff Dashboard'      : 'Faculty Dashboard';

    var statsEl = document.getElementById('stats-row');
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="stat-card">' +
          '<div class="stat-card-label">Total Assigned</div>' +
          '<div class="stat-card-num">' + total + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-card-label">' + queueLabel + '</div>' +
          '<div class="stat-card-num yellow">' + pending + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-card-label">' + processedLabel + '</div>' +
          '<div class="stat-card-num blue">' + processed + '</div>' +
        '</div>' +
        '<div class="stat-card">' +
          '<div class="stat-card-label">Rejected</div>' +
          '<div class="stat-card-num red">' + rejected + '</div>' +
        '</div>';
    }

    var titleEl = document.getElementById('dash-title');
    var subEl   = document.getElementById('dash-subtitle');
    if (titleEl) titleEl.textContent = dashTitle;
    if (subEl)   subEl.textContent   = 'Welcome back, ' + (currentUser.name || currentUser.username);
  };
}());

/* ══════════════════════════════════════════════════════════════════════
   4. PATCH renderDash() — staff / faculty see their workflow queue
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.renderDash;

  window.renderDash = function () {
    if (!currentUser) return;
    var role = currentUser.role;

    if (role !== 'staff' && role !== 'faculty') {
      return _orig.apply(this, arguments);
    }

    /*
     * docs[] is already filtered server-side for this role.
     * Show newest-first, up to 10 rows.
     */
    var rows = docs.slice().reverse().slice(0, 10);
    var tb   = document.getElementById('dash-tbody');
    if (!tb) return;

    if (!rows.length) {
      tb.innerHTML =
        '<tr><td colspan="4"><div class="empty-msg">No documents in your queue right now.</div></td></tr>';
    } else {
      tb.innerHTML = rows.map(function (d) {
        var docKey  = d.internalId || d.id;
        var nameHtml = d.name
          ? d.name
          : '<span style="color:#94a3b8;font-style:italic">Encrypted</span>';
        var ownerHtml =
          '<br><span style="font-size:11px;color:var(--muted);font-weight:400">by ' +
          (d.ownerName || d.by || 'user') + '</span>';
        return '<tr>' +
          '<td class="doc-id-cell" title="' + (d.internalId || d.id) + '">' +
            (d.fullDisplayId || d.displayId || d.id) +
          '</td>' +
          '<td class="doc-name-cell">' + nameHtml + ownerHtml + '</td>' +
          '<td>' + (typeof statusBadge === 'function' ? statusBadge(d.status) : d.status) + '</td>' +
          '<td>' + (typeof dashActions === 'function' ? dashActions(d) : '') + '</td>' +
        '</tr>';
      }).join('');
    }

    /* Recent personal activity */
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
   5. PATCH dashActions() — workflow buttons for staff / faculty
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.dashActions;

  window.dashActions = function (d) {
    if (!currentUser) return _orig.apply(this, arguments);
    var role   = currentUser.role;
    var docKey = d.internalId || d.id;

    /* ── STAFF ─────────────────────────────────────────────────── */
    if (role === 'staff') {
      var canProcess = d.status === 'Received' && d.current_stage === 'staff';
      var items =
        '<button class="dropdown-item" ' +
          'onclick="closeAllActionMenus(); openHistory(\'' + docKey + '\')">' +
          'View History' +
        '</button>';
      if (canProcess) {
        items +=
          '<button class="dropdown-item" ' +
            'style="color:#3b82f6;font-weight:700" ' +
            'onclick="closeAllActionMenus(); openWorkflowAction(\'' + docKey + '\',\'process\')">' +
            '&#9654;&nbsp; Process Document' +
          '</button>';
      } else {
        items +=
          '<button class="dropdown-item" disabled ' +
            'title="Document is not in the staff processing stage">' +
            'Already Processed' +
          '</button>';
      }
      return _buildMenu(docKey, items);
    }

    /* ── FACULTY ────────────────────────────────────────────────── */
    if (role === 'faculty') {
      var canReview = d.status === 'Processing' && d.current_stage === 'faculty';
      var items =
        '<button class="dropdown-item" ' +
          'onclick="closeAllActionMenus(); openHistory(\'' + docKey + '\')">' +
          'View History' +
        '</button>';
      if (canReview) {
        items +=
          '<button class="dropdown-item" ' +
            'style="color:#16a34a;font-weight:700" ' +
            'onclick="closeAllActionMenus(); openWorkflowAction(\'' + docKey + '\',\'approve\')">' +
            '&#10003;&nbsp; Approve' +
          '</button>' +
          '<button class="dropdown-item danger" ' +
            'onclick="closeAllActionMenus(); openWorkflowAction(\'' + docKey + '\',\'reject\')">' +
            '&#10007;&nbsp; Reject' +
          '</button>';
      } else {
        items +=
          '<button class="dropdown-item" disabled ' +
            'title="Document is not in the faculty review stage">' +
            'Already Reviewed' +
          '</button>';
      }
      return _buildMenu(docKey, items);
    }

    /* ── ADMIN / USER: original behaviour unchanged ─────────────── */
    return _orig.apply(this, arguments);
  };

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
   6. PATCH renderUsers() — inject "Create Staff / Faculty" button
══════════════════════════════════════════════════════════════════════ */
(function () {
  var _orig = window.renderUsers;

  window.renderUsers = function () {
    /* Inject the Create button once, into the card-head, admin only */
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
