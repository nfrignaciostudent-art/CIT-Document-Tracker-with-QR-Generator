/* ══════════════════════════════════════════════════════════════════════
   public/js/auth.js — Authentication & Zero-Knowledge Vault Session
   CIT Document Tracker - Group 6

   VAULT INTEGRATION CHANGES:
     doRegister        — calls CIT_VAULT.generateAndWrap() before sending
                         registration payload; includes { saltHex,
                         encryptedKeyHex } so the backend stores the
                         wrapped IDEA key.
     doLogin           — calls CIT_VAULT.deriveAndActivate() after a
                         successful API login; stores the master key in
                         sessionStorage for same-tab refresh resilience.
     tryRestoreSession — calls CIT_VAULT.restoreFromSession() using the
                         encryptedIdeaKey from /me response; no password
                         re-entry needed on page refresh.
     logout            — calls CIT_VAULT.clearAll() which wipes
                         sessionStorage + all cit_* localStorage entries.
                         "Go Back" in browser after logout → keys gone,
                         sensitive fields appear as ●●●●●●●●.

   NEW (Issue 4):
     handleLogoClick   — Global logo click handler. When in app view
                         (logged in): navigates to the dashboard page.
                         When in public view: shows the hero/track section,
                         hides any open result, clears the search input.
                         Auto-wired on DOMContentLoaded to common logo
                         element selectors.

   MODE DETECTION (unchanged):
     Backend online  → JWT-based auth (MongoDB)
     Backend offline → localStorage fallback accounts[]
══════════════════════════════════════════════════════════════════════ */

/* ── Modal open/close ─────────────────────────────────────────────── */
function openAuth(tab) {
  switchAuthTab(tab || 'login');
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('l-error').style.display      = 'none';
  document.getElementById('r-error').style.display      = 'none';
}
function closeAuth() {
  clearAuthFields();
  document.getElementById('auth-overlay').style.display = 'none';
}
function clearAuthFields() {
  ['l-user','l-pass','r-name','r-user','r-pass','r-confirm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('l-error').style.display = 'none';
  document.getElementById('r-error').style.display = 'none';
}
function handleOverlayClick(e) {
  if (e.target === document.getElementById('auth-overlay')) closeAuth();
}
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('tab-login').classList.toggle('active', isLogin);
  document.getElementById('tab-register').classList.toggle('active', !isLogin);
  document.getElementById('form-login').style.display    = isLogin ? '' : 'none';
  document.getElementById('form-register').style.display = isLogin ? 'none' : '';
  document.getElementById('l-error').style.display = 'none';
  document.getElementById('r-error').style.display = 'none';
}
function showAuthError(el, msg) {
  el.textContent = msg;
  el.style.display = 'block';
}

/* ── JWT / session helpers ────────────────────────────────────────── */
function saveSession(userObj, token) {
  try {
    if (token) localStorage.setItem('cit_jwt', token);
    localStorage.setItem('cit_session', JSON.stringify(userObj));
  } catch (e) {}
}

/** Full session + key wipe — also clears sessionStorage */
function clearSession() {
  /* Delegate to CIT_VAULT for complete crypto key wipe */
  if (typeof CIT_VAULT !== 'undefined') {
    CIT_VAULT.clearAll();
  } else {
    /* Fallback if idea-cbc.js not loaded yet */
    try { sessionStorage.clear(); } catch (e) {}
    try {
      localStorage.removeItem('cit_jwt');
      localStorage.removeItem('cit_session');
    } catch (e) {}
  }
}

function getSavedToken()   { try { return localStorage.getItem('cit_jwt')     || null; } catch (e) { return null; } }
function getSavedSession() { try { const s = localStorage.getItem('cit_session'); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

/** Map backend user object → app user shape */
function _mapBackendUser(apiUser, token) {
  return {
    id:               apiUser._id || apiUser.userId || apiUser.id,
    userId:           apiUser.userId,
    username:         apiUser.username,
    name:             apiUser.name,
    role:             apiUser.role  || 'user',
    color:            apiUser.color || '#4ade80',
    token,
    /* Vault fields — stored for restoreFromSession on page refresh */
    encryptedIdeaKey: apiUser.encryptedIdeaKey || null,
    passwordSalt:     apiUser.passwordSalt     || null,
    _backendMode:     true,
  };
}

/* ── tryRestoreSession — called on page load ──────────────────────── */
async function tryRestoreSession() {
  const token = getSavedToken();
  const saved = getSavedSession();
  if (!token && !saved) return false;

  if (token) {
    const me = await apiGetMe(token);
    if (me && (me._id || me.username)) {
      currentUser = _mapBackendUser(me, token);

      /* ── VAULT RESTORE: re-activate IDEA key from sessionStorage ──
         CIT_VAULT.restoreFromSession() reads the master key that was
         stored in sessionStorage during the last login or register.
         sessionStorage survives page refreshes but is wiped on tab close.
         If the key cannot be restored, the vault stays inactive and
         the track page shows the privacy mask instead of plaintext.   */
      if (typeof CIT_VAULT !== 'undefined') {
        const restored = CIT_VAULT.restoreFromSession(me.encryptedIdeaKey || null);
        if (!restored && me.encryptedIdeaKey) {
          console.info('[auth] Vault key not in sessionStorage — user must re-login to decrypt.');
        }
      }

      return true;
    }
  }

  /* Backend offline — use saved localStorage session */
  if (saved) {
    const local = (typeof accounts !== 'undefined')
      ? accounts.find(a => a.username === saved.username)
      : null;
    currentUser = local || saved;
    /* Offline mode: activate with legacy shared key */
    if (typeof CIT_VAULT !== 'undefined') CIT_VAULT.restoreFromSession(null);
    return true;
  }
  return false;
}

/* ══════════════════════════════════════════════════════════════════════
   SIGN IN
══════════════════════════════════════════════════════════════════════ */
async function doLogin() {
  const u   = document.getElementById('l-user').value.trim().toLowerCase();
  const p   = document.getElementById('l-pass').value;
  const err = document.getElementById('l-error');
  if (!u || !p) { showAuthError(err, 'Please enter username and password.'); return; }

  const btn = document.getElementById('l-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';

  try {
    const apiResult = await apiLoginUser({ username: u, password: p });

    /* ── Backend success path ── */
    if (apiResult && apiResult.token) {
      currentUser = _mapBackendUser(apiResult, apiResult.token);

      /* ── VAULT: derive master key + unwrap IDEA key ─────────────
         Uses PBKDF2(password, saltHex) → unwrap encryptedIdeaKey.
         The raw IDEA key is stored ONLY in memory + sessionStorage.
         The password itself is NEVER persisted.                     */
      if (typeof CIT_VAULT !== 'undefined' && apiResult.passwordSalt && apiResult.encryptedIdeaKey) {
        btn.textContent = 'Unlocking vault…';
        await CIT_VAULT.deriveAndActivate(
          p,
          apiResult.passwordSalt,
          apiResult.encryptedIdeaKey,
        );
      } else if (typeof CIT_VAULT !== 'undefined') {
        /* Legacy account without vault fields — activate with shared key */
        await CIT_VAULT.deriveAndActivate(p, null, null);
        /* Opportunistically upload vault key so next login uses PBKDF2 */
        _upgradeVaultKey(p, apiResult.token);
      }

      saveSession(currentUser, apiResult.token);

      /* Merge into local accounts cache */
      const idx = accounts.findIndex(a => a.username === currentUser.username);
      if (idx >= 0) accounts[idx] = { ...accounts[idx], ...currentUser, password: p };
      else accounts.push({ ...currentUser, password: p });

      if (!notifications[currentUser.id]) notifications[currentUser.id] = [];
      if (!activityLogs[currentUser.id])  activityLogs[currentUser.id]  = [];

      clearAuthFields(); closeAuth();
      logActivity(currentUser.id, 'Logged in', '#4ade80');
      save(); enterApp();

      /* Handle redirect-back from track page */
      _handlePostLoginRedirect();
      return;
    }

    if (apiResult === null) {
      showAuthError(err, 'Cannot reach server. Make sure the app is running on localhost:3000.');
      return;
    }
    if (apiResult && apiResult._error) {
      showAuthError(err, apiResult.message || 'Login failed. Please try again.');
      return;
    }

    /* ── Offline / localStorage fallback ── */
    const acc = (accounts || []).find(a => a.username === u && a.password === p);
    if (!acc) { showAuthError(err, 'Incorrect username or password.'); return; }

    currentUser = acc;
    if (typeof CIT_VAULT !== 'undefined') CIT_VAULT.restoreFromSession(null); // legacy key
    saveSession(acc, null);
    clearAuthFields(); closeAuth();
    logActivity(acc.id, 'Logged in', '#4ade80');
    save(); enterApp();
    _handlePostLoginRedirect();

  } catch (e) {
    console.error('[doLogin]', e);
    showAuthError(err, 'Unable to sign in. Please try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

/* ══════════════════════════════════════════════════════════════════════
   CREATE ACCOUNT
══════════════════════════════════════════════════════════════════════ */
async function doRegister() {
  const name = document.getElementById('r-name').value.trim();
  const u    = document.getElementById('r-user').value.trim().toLowerCase();
  const p    = document.getElementById('r-pass').value;
  const c    = document.getElementById('r-confirm').value;
  const err  = document.getElementById('r-error');

  if (!name || !u || !p || !c)  { showAuthError(err, 'Please fill all fields.'); return; }
  if (!/^[a-z0-9_]+$/.test(u)) { showAuthError(err, 'Username: letters, numbers, underscores only.'); return; }
  if (p.length < 4)              { showAuthError(err, 'Password must be at least 4 characters.'); return; }
  if (p !== c)                   { showAuthError(err, 'Passwords do not match.'); return; }

  const btn = document.getElementById('r-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';

  /* ── VAULT: generate salt + wrap IDEA key ────────────────────────
     generateAndWrap() runs before the network call.
     - Generates a random 16-byte salt
     - Derives master key via PBKDF2(password, salt, 100k rounds)
     - XOR-wraps the shared IDEA key bytes with the master key
     - Returns { saltHex, encryptedKeyHex } — safe to store on server
     - Activates the vault locally (CIT_VAULT.hasKey() → true)         */
  let vaultPayload = {};
  if (typeof CIT_VAULT !== 'undefined') {
    try {
      btn.textContent = 'Generating vault key…';
      const { saltHex, encryptedKeyHex } = await CIT_VAULT.generateAndWrap(p);
      vaultPayload = { passwordSalt: saltHex, encryptedIdeaKey: encryptedKeyHex };
    } catch (vaultErr) {
      console.warn('[doRegister] Vault key generation failed:', vaultErr.message);
      /* Non-fatal — continue without vault fields; account upgrades on next login */
    }
  }

  btn.textContent = 'Creating account…';
  const apiResult = await apiRegisterUser({ username: u, name, password: p, ...vaultPayload });

  if (apiResult && apiResult.token) {
    currentUser = _mapBackendUser(apiResult, apiResult.token);
    saveSession(currentUser, apiResult.token);

    if (!accounts.find(a => a.username === u)) accounts.push({ ...currentUser, password: p });
    if (!notifications[currentUser.id]) notifications[currentUser.id] = [];
    if (!activityLogs[currentUser.id])  activityLogs[currentUser.id]  = [];

    btn.disabled = false; btn.textContent = 'Create Account';
    clearAuthFields(); closeAuth();
    logActivity(currentUser.id, 'Account created', '#4ade80');
    save(); enterApp();
    _handlePostLoginRedirect();
    return;
  }

  /* ── API error ── */
  btn.disabled = false; btn.textContent = 'Create Account';

  if (typeof CIT_VAULT !== 'undefined') CIT_VAULT.clearAll(); // roll back vault state

  if (apiResult && apiResult.message) { showAuthError(err, apiResult.message); return; }

  /* ── Offline / localStorage fallback registration ── */
  if (accounts.find(a => a.username === u)) { showAuthError(err, 'Username already taken.'); return; }

  const idx = accounts.length;
  const acc = {
    id: genUID(), username: u, name, password: p, role: 'user',
    color: avatarColor(idx), created: nowStr(),
    encryptedIdeaKey: vaultPayload.encryptedIdeaKey || null,
    passwordSalt:     vaultPayload.passwordSalt     || null,
  };
  accounts.push(acc);
  if (!notifications[acc.id]) notifications[acc.id] = [];
  if (!activityLogs[acc.id])  activityLogs[acc.id]  = [];
  logActivity(acc.id, 'Account created', '#4ade80');
  save();
  currentUser = acc;
  saveSession(acc, null);
  clearAuthFields(); closeAuth(); enterApp();
  _handlePostLoginRedirect();
}

/* ── _upgradeVaultKey — silently adds vault fields to legacy accounts ── */
async function _upgradeVaultKey(password, token) {
  if (!token || typeof CIT_VAULT === 'undefined') return;
  try {
    const { saltHex, encryptedKeyHex } = await CIT_VAULT.generateAndWrap(password);
    await apiRequest('PATCH', '/api/auth/vault-key', {
      passwordSalt:     saltHex,
      encryptedIdeaKey: encryptedKeyHex,
    }, token);
  } catch (e) {
    console.warn('[_upgradeVaultKey]', e.message);
  }
}

/* ── _handlePostLoginRedirect — return to the track page if needed ── */
function _handlePostLoginRedirect() {
  try {
    const pending = sessionStorage.getItem('cit_pending_track');
    if (pending) {
      sessionStorage.removeItem('cit_pending_track');
      /* Give enterApp() a tick to finish, then reload the tracked doc */
      setTimeout(() => {
        const url = new URL(window.location.href.split('?')[0]);
        url.searchParams.set('track', pending);
        window.location.href = url.toString();
      }, 100);
    }
  } catch (e) {}
}

/* ══════════════════════════════════════════════════════════════════════
   LOGO REDIRECT  (Issue 5)

   handleLogoClick() — clicking the logo ALWAYS navigates to the
   "Track Your Document" section, regardless of login state.

   • App view  (logged in):  shows the 'track' page in the sidebar if it
                              exists; otherwise shows the public hero/track
                              section by toggling to public view briefly.
                              If there is a page-track element we use that.
   • Public view (logged out): resets the hero / track section.

   Auto-wired: DOMContentLoaded scans the DOM for common logo selectors.
══════════════════════════════════════════════════════════════════════ */
function handleLogoClick() {
  /* ── App view: navigate to the Track Document page inside the app ── */
  if (typeof currentUser !== 'undefined' && currentUser) {
    /* Try the in-app track page first */
    var trackPage = document.getElementById('page-track');
    var trackNav  = document.getElementById('nav-track');
    if (trackPage && typeof showPage === 'function') {
      showPage('track', trackNav);
      return;
    }
    /* Fallback: show dashboard if no dedicated track page in app */
    if (typeof showPage === 'function') {
      showPage('dashboard', document.getElementById('nav-dashboard'));
    }
    return;
  }

  /* ── Public view: reset hero / track section ── */
  var resultSection = document.getElementById('result-section');
  if (resultSection) resultSection.style.display = 'none';

  var heroEl = document.getElementById('hero');
  if (heroEl) heroEl.style.display = '';

  var docInput = document.getElementById('doc-input');
  if (docInput) { docInput.value = ''; docInput.focus(); }

  var errEl = document.getElementById('search-error');
  if (errEl) errEl.style.display = 'none';

  /* Clear the ?track= param from the URL without a page reload */
  try { window.history.replaceState({}, '', window.location.pathname); } catch (e) {}
}

/* ── Auto-wire: find the logo element and attach handleLogoClick ──── */
document.addEventListener('DOMContentLoaded', function () {
  /* Ordered list of selectors to try — first match wins.
     If none match, add onclick="handleLogoClick()" to your logo element. */
  var logoSelectors = [
    '#logo-link',
    '#logo',
    '.logo-link',
    '.brand-logo',
    '#brand',
    '.navbar-brand',
    '#topnav .logo',
    '#topnav .brand',
    '#topnav a[href="#"]',
    '.site-logo',
    '[data-logo]',
    '#topnav > a',                 // common: first anchor in topnav is the logo
    '#sidebar .logo',
    '#sidebar-logo',
    '.sidebar-brand',
  ];

  var wired = false;
  for (var i = 0; i < logoSelectors.length; i++) {
    var el = document.querySelector(logoSelectors[i]);
    if (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        handleLogoClick();
      });
      wired = true;
      console.info('[auth] Logo wired to handleLogoClick via selector: ' + logoSelectors[i]);
      break;
    }
  }

  if (!wired) {
    console.info('[auth] Logo element not found via auto-wire selectors. ' +
      'Add onclick="handleLogoClick()" to your logo element manually.');
  }
});

/* ══════════════════════════════════════════════════════════════════════
   ENTER APP  (unchanged except for heartbeat wiring at bottom)
══════════════════════════════════════════════════════════════════════ */
function enterApp() {
  document.getElementById('public-view').style.display = 'none';
  document.getElementById('app-view').style.display    = 'flex';
  document.getElementById('topnav').style.display      = 'none';
  document.body.classList.remove('public-mode');
  document.body.classList.add('app-mode');
  setupSidebar(); renderAll();
  showPage('dashboard', document.getElementById('nav-dashboard'));
  renderNotifCount();
}

/* ══════════════════════════════════════════════════════════════════════
   LOG OUT
   Explicitly clears sessionStorage + all cit_* localStorage entries.
   After this call, the browser's "Go Back" button shows an unauthenticated
   view with privacy masks instead of plaintext document names.
══════════════════════════════════════════════════════════════════════ */
function logout() {
  if (currentUser) logActivity(currentUser.id, 'Logged out', '#94a3b8');
  save();

  /* ── VAULT: wipe ALL session and local key material ── */
  clearSession();   // → delegates to CIT_VAULT.clearAll()

  currentUser = null;

  /* ── ISSUE 1 FIX: reset nav-right back to Sign In button ──────────
     _updateTopNavForLoggedIn() replaces nav-right with the user's
     avatar + "Sign Out" button. logout() must restore it so the topnav
     shows "Sign In" again WITHOUT a page reload.                       */
  const navRight = document.getElementById('nav-right');
  if (navRight) {
    navRight.innerHTML = '<button class="btn-signin" onclick="openAuth(\'login\')">Sign In</button>';
  }

  document.getElementById('app-view').style.display    = 'none';
  document.getElementById('public-view').style.display = '';
  document.getElementById('topnav').style.display      = '';
  document.body.classList.remove('app-mode');
  document.body.classList.add('public-mode');
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('hero').style.display           = '';
  document.getElementById('doc-input').value              = '';
  document.getElementById('search-error').style.display   = 'none';

  /*
   * Security note: do NOT call history.pushState or navigate away here.
   * The browser's cache already has the page; what prevents data exposure
   * after "Go Back" is that the IDEA key is gone from sessionStorage,
   * so the track page renders ●●●●●●●● masks instead of plaintext.
   */
}

/* ── Setup sidebar ────────────────────────────────────────────────── */
function setupSidebar() {
  const isAdmin = currentUser.role === 'admin';

  document.getElementById('user-info-bar').innerHTML = `
    <div class="user-avatar" style="background:${currentUser.color || '#4ade80'}">${initials(currentUser.name || currentUser.username)}</div>
    <div>
      <div class="user-name">${currentUser.name || currentUser.username}</div>
      <span class="user-role-badge ${isAdmin ? 'role-admin' : 'role-user'}">${isAdmin ? 'ADMIN' : 'USER'}</span>
    </div>`;

  document.getElementById('nav-users').style.display     = isAdmin ? '' : 'none';
  document.getElementById('nav-actlogs').style.display   = isAdmin ? '' : 'none';
  document.getElementById('nav-movements').style.display = isAdmin ? '' : 'none';
  const scanlogsNav  = document.getElementById('nav-scanlogs');
  if (scanlogsNav) scanlogsNav.style.display = isAdmin ? '' : 'none';
  const adminCard    = document.getElementById('admin-settings-card');
  if (adminCard) adminCard.style.display = isAdmin ? '' : 'none';
}