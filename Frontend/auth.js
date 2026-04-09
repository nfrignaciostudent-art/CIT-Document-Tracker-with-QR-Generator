/* ══════════════════════════════════════════════════════════════════════
   auth.js — Authentication & Session Logic
   CIT Document Tracker · Group 6

   MODE DETECTION:
     - If backend API responds → use JWT-based auth (MongoDB)
     - If backend is offline   → fall back to localStorage accounts[]
══════════════════════════════════════════════════════════════════════ */

function openAuth(tab) {
  switchAuthTab(tab || 'login');
  document.getElementById('auth-overlay').style.display = 'flex';
  document.getElementById('l-error').style.display = 'none';
  document.getElementById('r-error').style.display = 'none';
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

/* ── JWT / session helpers ── */
function saveSession(userObj, token) {
  try {
    if (token) localStorage.setItem('cit_jwt', token);
    localStorage.setItem('cit_session', JSON.stringify(userObj));
  } catch(e) {}
}
function clearSession() {
  try { localStorage.removeItem('cit_jwt'); localStorage.removeItem('cit_session'); } catch(e) {}
}
function getSavedToken() {
  try { return localStorage.getItem('cit_jwt') || null; } catch(e) { return null; }
}
function getSavedSession() {
  try { const s = localStorage.getItem('cit_session'); return s ? JSON.parse(s) : null; } catch(e) { return null; }
}

/* Map backend user → app user shape */
function _mapBackendUser(apiUser, token) {
  return {
    id:           apiUser._id || apiUser.userId || apiUser.id,
    userId:       apiUser.userId,
    username:     apiUser.username,
    name:         apiUser.name,
    role:         apiUser.role  || 'user',
    color:        apiUser.color || '#4ade80',
    token:        token,
    _backendMode: true
  };
}

/* Try to restore session on page load */
async function tryRestoreSession() {
  const token = getSavedToken();
  const saved = getSavedSession();
  if (!token && !saved) return false;
  if (token) {
    const me = await apiGetMe(token);
    if (me && (me._id || me.username)) {
      currentUser = _mapBackendUser(me, token);
      return true;
    }
  }
  /* Backend offline — use saved session */
  if (saved) {
    const local = accounts.find(a => a.username === saved.username);
    currentUser = local || saved;
    return true;
  }
  return false;
}

/* ── Sign In ── */
async function doLogin() {
  const u   = document.getElementById('l-user').value.trim().toLowerCase();
  const p   = document.getElementById('l-pass').value;
  const err = document.getElementById('l-error');
  if (!u || !p) { showAuthError(err, 'Please enter username and password.'); return; }

  const btn = document.getElementById('l-btn');
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    const apiResult = await apiLoginUser({ username: u, password: p });

    if (apiResult && apiResult.token) {
      currentUser = _mapBackendUser(apiResult, apiResult.token);
      saveSession(currentUser, apiResult.token);
      const idx = accounts.findIndex(a => a.username === currentUser.username);
      if (idx >= 0) accounts[idx] = { ...accounts[idx], ...currentUser, password: p };
      else accounts.push({ ...currentUser, password: p });
      if (!notifications[currentUser.id]) notifications[currentUser.id] = [];
      if (!activityLogs[currentUser.id])  activityLogs[currentUser.id]  = [];
      clearAuthFields(); closeAuth();
      logActivity(currentUser.id, 'Logged in', '#4ade80');
      save(); enterApp();
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

    /* Fallback to localStorage */
    const acc = (accounts || []).find(a => a.username === u && a.password === p);
    if (!acc) {
      showAuthError(err, 'Incorrect username or password.');
      return;
    }
    currentUser = acc;
    saveSession(acc, null);
    clearAuthFields(); closeAuth();
    logActivity(acc.id, 'Logged in', '#4ade80');
    save(); enterApp();
  } catch (e) {
    console.error('[doLogin]', e);
    showAuthError(err, 'Unable to sign in. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

/* ── Create Account ── */
async function doRegister() {
  const name = document.getElementById('r-name').value.trim();
  const u    = document.getElementById('r-user').value.trim().toLowerCase();
  const p    = document.getElementById('r-pass').value;
  const c    = document.getElementById('r-confirm').value;
  const err  = document.getElementById('r-error');

  if (!name || !u || !p || !c) { showAuthError(err, 'Please fill all fields.'); return; }
  if (!/^[a-z0-9_]+$/.test(u)) { showAuthError(err, 'Username: letters, numbers, underscores only.'); return; }
  if (p.length < 4)             { showAuthError(err, 'Password must be at least 4 characters.'); return; }
  if (p !== c)                  { showAuthError(err, 'Passwords do not match.'); return; }

  const btn = document.getElementById('r-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';

  const apiResult = await apiRegisterUser({ username: u, name, password: p });

  if (apiResult && apiResult.token) {
    currentUser = _mapBackendUser(apiResult, apiResult.token);
    saveSession(currentUser, apiResult.token);
    if (!accounts.find(a => a.username === u)) accounts.push({ ...currentUser, password: p });
    if (!notifications[currentUser.id]) notifications[currentUser.id] = [];
    if (!activityLogs[currentUser.id])  activityLogs[currentUser.id]  = [];
    btn.disabled = false; btn.textContent = 'Create Account';
    clearAuthFields(); closeAuth();
    logActivity(currentUser.id, 'Account created', '#4ade80');
    save(); enterApp(); return;
  }

  /* Fallback localStorage registration */
  btn.disabled = false; btn.textContent = 'Create Account';
  if (apiResult && apiResult.message) { showAuthError(err, apiResult.message); return; }
  if (accounts.find(a => a.username === u)) { showAuthError(err, 'Username already taken.'); return; }

  const idx = accounts.length;
  const acc = { id: genUID(), username: u, name, password: p, role: 'user', color: avatarColor(idx), created: nowStr() };
  accounts.push(acc);
  if (!notifications[acc.id]) notifications[acc.id] = [];
  if (!activityLogs[acc.id])  activityLogs[acc.id]  = [];
  logActivity(acc.id, 'Account created', '#4ade80');
  save();
  currentUser = acc;
  saveSession(acc, null);
  clearAuthFields(); closeAuth(); enterApp();
}

/* ── Enter app ── */
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

/* ── Log out ── */
function logout() {
  if (currentUser) logActivity(currentUser.id, 'Logged out', '#94a3b8');
  save(); clearSession(); currentUser = null;
  document.getElementById('app-view').style.display    = 'none';
  document.getElementById('public-view').style.display = '';
  document.getElementById('topnav').style.display      = '';
  document.body.classList.remove('app-mode');
  document.body.classList.add('public-mode');
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('hero').style.display           = '';
  document.getElementById('doc-input').value              = '';
  document.getElementById('search-error').style.display   = 'none';
}

/* ── Setup sidebar ── */
function setupSidebar() {
  const isAdmin = currentUser.role === 'admin';
  const modeTag = currentUser._backendMode
    ? '<span style="font-size:9px;color:rgba(74,222,128,.6);display:block;margin-top:2px">● MongoDB</span>'
    : '<span style="font-size:9px;color:rgba(251,146,60,.5);display:block;margin-top:2px">○ Offline</span>';

  document.getElementById('user-info-bar').innerHTML = `
    <div class="user-avatar" style="background:${currentUser.color || '#4ade80'}">${initials(currentUser.name || currentUser.username)}</div>
    <div>
      <div class="user-name">${currentUser.name || currentUser.username}</div>
      <span class="user-role-badge ${isAdmin ? 'role-admin' : 'role-user'}">${isAdmin ? 'ADMIN' : 'USER'}</span>
      ${modeTag}
    </div>`;

  document.getElementById('nav-users').style.display     = isAdmin ? '' : 'none';
  document.getElementById('nav-actlogs').style.display   = isAdmin ? '' : 'none';
  document.getElementById('nav-movements').style.display = isAdmin ? '' : 'none';
  const adminCard = document.getElementById('admin-settings-card');
  if (adminCard) adminCard.style.display = isAdmin ? '' : 'none';
}