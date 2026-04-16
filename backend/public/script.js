/* ======================================================================
   script.js - Main Initialization & Core App Logic
   CIT Document Tracker - Group 6

   Contains: IDEA encryption, ULID + Display ID generation,
             global state, save/load, render functions,
             document CRUD, history, movement logs,
             notifications, settings, demo
====================================================================== */

/* ========================================================
   IDEA ENCRYPTION (128-bit block cipher)
======================================================== */
const IDEA = (() => {
  function mu(a,b){a&=0xFFFF;b&=0xFFFF;if(!a)a=65536;if(!b)b=65536;const r=Number(BigInt(a)*BigInt(b)%65537n);return r===65536?0:r;}
  function mi(a){if(!a)return 0;if(a===1)return 1;let t=0n,nt=1n,r=65537n,nr=BigInt(a);while(nr){const q=r/nr;[t,nt]=[nt,t-q*nt];[r,nr]=[nr,r%nr];}return Number(t<0n?t+65537n:t);}
  const ai=a=>(65536-a)&0xFFFF,ad=(a,b)=>(a+b)&0xFFFF,xo=(a,b)=>a^b;
  function expandKey(keyStr){
    const src=new TextEncoder().encode(keyStr.padEnd(16,'\0').slice(0,16));
    const buf=new Uint8Array(16);buf.set(src);const sk=[];
    while(sk.length<52){
      for(let i=0;i<8&&sk.length<52;i++)sk.push(((buf[i*2]<<8)|buf[i*2+1])&0xFFFF);
      let v=0n;for(let i=0;i<16;i++)v=(v<<8n)|BigInt(buf[i]);
      v=((v<<25n)|(v>>103n))&((1n<<128n)-1n);
      for(let i=15;i>=0;i--){buf[i]=Number(v&0xFFn);v>>=8n;}
    }
    return sk;
  }
  function decSubkeys(ek){
    const dk=new Array(52).fill(0);let p=0,q=48;
    dk[p++]=mi(ek[q]);dk[p++]=ai(ek[q+1]);dk[p++]=ai(ek[q+2]);dk[p++]=mi(ek[q+3]);
    for(let r=7;r>=0;r--){q=r*6;dk[p++]=ek[q+4];dk[p++]=ek[q+5];dk[p++]=mi(ek[q]);
      if(r>0){dk[p++]=ai(ek[q+2]);dk[p++]=ai(ek[q+1]);}
      else{dk[p++]=ai(ek[q+1]);dk[p++]=ai(ek[q+2]);}dk[p++]=mi(ek[q+3]);}
    return dk;
  }
  function block(w1,w2,w3,w4,sk){
    let a=w1,b=w2,c=w3,d=w4;
    for(let r=0;r<8;r++){const z=r*6;
      const t1=mu(a,sk[z]),t2=ad(b,sk[z+1]),t3=ad(c,sk[z+2]),t4=mu(d,sk[z+3]);
      const t5=xo(t1,t3),t6=xo(t2,t4);
      const t7=mu(t5,sk[z+4]),t8=ad(t6,t7),t9=mu(t8,sk[z+5]),t10=ad(t7,t9);
      const o1=xo(t1,t9),o2=xo(t2,t10),o3=xo(t3,t9),o4=xo(t4,t10);
      if(r<7){a=o1;b=o3;c=o2;d=o4;}else{a=o1;b=o2;c=o3;d=o4;}
    }
    return[mu(a,sk[48]),ad(b,sk[49]),ad(c,sk[50]),mu(d,sk[51])];
  }
  function encrypt(text,keyStr){
    const sk=expandKey(keyStr);const data=new TextEncoder().encode(text);
    const pad=8-(data.length%8);const p=new Uint8Array(data.length+pad);
    p.set(data);p.fill(pad,data.length);let hex='';
    for(let i=0;i<p.length;i+=8){
      const[y1,y2,y3,y4]=block((p[i]<<8)|p[i+1],(p[i+2]<<8)|p[i+3],(p[i+4]<<8)|p[i+5],(p[i+6]<<8)|p[i+7],sk);
      hex+=y1.toString(16).padStart(4,'0')+y2.toString(16).padStart(4,'0')+y3.toString(16).padStart(4,'0')+y4.toString(16).padStart(4,'0');
    }
    return hex.toUpperCase();
  }
  function decrypt(hex,keyStr){
    const dk=decSubkeys(expandKey(keyStr));const bytes=[];
    for(let i=0;i<hex.length;i+=16){
      const c=hex.slice(i,i+16);
      const[y1,y2,y3,y4]=block(parseInt(c.slice(0,4),16),parseInt(c.slice(4,8),16),parseInt(c.slice(8,12),16),parseInt(c.slice(12,16),16),dk);
      bytes.push((y1>>8)&0xFF,y1&0xFF,(y2>>8)&0xFF,y2&0xFF,(y3>>8)&0xFF,y3&0xFF,(y4>>8)&0xFF,y4&0xFF);
    }
    const padLen=bytes[bytes.length-1];
    return new TextDecoder().decode(new Uint8Array(bytes.slice(0,bytes.length-padLen)));
  }
  return{encrypt,decrypt};
})();

/* ========================================================
   FILE ENCRYPTION - IDEA at Rest
======================================================== */

function encryptFile(dataURI, ext) {
  const commaIdx = dataURI.indexOf(',');
  if (commaIdx === -1) throw new Error('Invalid data URI');
  const prefix     = dataURI.slice(0, commaIdx + 1);
  const b64content = dataURI.slice(commaIdx + 1);
  const encHex     = IDEA.encrypt(b64content, KEY);
  return JSON.stringify({ encrypted: true, prefix, data: encHex, ext: ext || '' });
}

function decryptFile(stored) {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && parsed.encrypted === true) {
      const b64 = IDEA.decrypt(parsed.data, KEY);
      return { dataURI: parsed.prefix + b64, ext: parsed.ext || '' };
    }
  } catch(e) { /* not JSON - treat as legacy plain data URI */ }
  return { dataURI: stored, ext: '' };
}

function docHasOriginalFile(d) {
  if (d.hasOriginalFile === true)  return true;
  if (d.hasOriginalFile === false && !d.originalFile && !d.fileData) return false;
  const src = d.originalFile || d.fileData;
  if (!src) return false;
  try { const p = JSON.parse(src); return !!(p && p.encrypted); } catch(e) {}
  return src.startsWith('data:');
}

function docHasProcessedFile(d) {
  if (d.hasProcessedFile === true)  return true;
  if (d.hasProcessedFile === false && !d.processedFile) return false;
  if (!d.processedFile) return false;
  try { const p = JSON.parse(d.processedFile); return !!(p && p.encrypted); } catch(e) {}
  return d.processedFile.startsWith('data:');
}

function docHasFile(d) {
  return docHasOriginalFile(d);
}

async function decryptAndDownload(docKey, btnEl) {
  const d = (typeof findDoc === 'function' ? findDoc(docKey) : null)
          || docs.find(x => (x.internalId||x.id) === docKey);

  if (!d) { _dlToast('File not found.'); return; }

  if (d.status !== 'Released') {
    _dlToast('File is secured. Available once status is Released.');
    return;
  }

  const origText = btnEl ? btnEl.textContent : '';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Fetching…'; }

  try {
    /* ── ALWAYS fetch from backend so the admin-released file is served.
       Never use localStorage or in-memory cache — the admin may have
       uploaded a processed file from a different device/session. ── */
    if (btnEl) btnEl.textContent = 'Downloading…';

    const backendResult = await apiDownloadDocument(docKey);

    if (!backendResult || backendResult._error) {
      _dlToast(backendResult?.message || 'No processed file available yet. Ask admin to upload the final file.');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = origText; }
      return;
    }

    const fileSource = backendResult.fileData;
    if (!fileSource) {
      _dlToast('No processed file has been attached by admin yet.');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = origText; }
      return;
    }

    if (btnEl) btnEl.textContent = 'Decrypting…';
    await new Promise(r => setTimeout(r, 40));

    const result = decryptFile(fileSource);
    if (!result) throw new Error('Decryption returned null');

    const ext  = result.ext || backendResult.fileExt || d.processedFileExt || d.fileExt || '';
    const name = d.name.replace(/[^a-z0-9_\-]/gi, '_') + (ext.startsWith('.') ? ext : (ext ? '.'+ext : ''));

    const a = document.createElement('a');
    a.href     = result.dataURI;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    _dlToast('Download started - Final/Processed file.');
  } catch(err) {
    console.error('[decryptAndDownload]', err);
    _dlToast('Decryption failed. File may be corrupted.');
  }

  if (btnEl) { btnEl.disabled = false; btnEl.textContent = origText; }
}

function _dlToast(msg) {
  if (typeof toast === 'function') toast(msg);
  else alert(msg);
}

/* ========================================================
   VIEW FILE - decrypt and preview/download in modal
======================================================== */
async function viewFile(docKey, fileType, btnEl) {
  fileType = fileType || 'original';
  const d = docs.find(x => (x.internalId || x.id) === docKey);
  if (!d) { toast('Document not found.'); return; }

  const origText = btnEl ? btnEl.textContent : '';
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Opening…'; }

  try {
    let source = fileType === 'processed'
      ? (d.processedFile || null)
      : (d.originalFile || d.fileData || null);

    /* -- Backend fallback: file blob not in memory (e.g. after page refresh) -- */
    if (!source) {
      if (btnEl) btnEl.textContent = 'Fetching…';
      const docId = d.internalId || d.id;

      if (fileType === 'processed') {
        /* Processed file: use the existing download endpoint (Released only) */
        const result = await apiDownloadDocument(docId);
        if (result && !result._error && result.fileData) {
          source = result.fileData;
          d.processedFile    = source;
          d.processedFileExt = result.fileExt || d.processedFileExt || '';
        }
      } else {
        /* Original file: use the new protected endpoint (no status restriction) */
        const result = await apiGetOriginalFile(docId);
        if (result && !result._error && result.fileData) {
          source = result.fileData;
          d.originalFile    = source;
          d.originalFileExt = result.fileExt || d.originalFileExt || d.fileExt || '';
        }
      }
    }

    if (!source) {
      toast(fileType === 'processed'
        ? 'No processed file yet. Admin must upload the final file.'
        : 'No file attached to this document.');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = origText; }
      return;
    }

    const result = decryptFile(source);
    if (!result) throw new Error('Decryption returned null');

    const { dataURI, ext } = result;
    const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(ext);
    const isPDF   = ext.toLowerCase() === '.pdf';

    /* Populate modal header */
    const docnameEl = document.getElementById('file-modal-docname');
    if (docnameEl) docnameEl.textContent =
      d.name + ' - ' + (fileType === 'processed' ? 'Final / Processed File' : 'Original File');

    const statusBadgeEl = document.getElementById('file-modal-status-badge');
    if (statusBadgeEl) statusBadgeEl.innerHTML = statusBadge(d.status);

    const filenameEl = document.getElementById('file-modal-filename');
    if (filenameEl) filenameEl.textContent = d.name + (ext || '');

    /* Build or replace preview area */
    let previewEl = document.getElementById('file-modal-preview');
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.id = 'file-modal-preview';
      if (filenameEl) filenameEl.insertAdjacentElement('afterend', previewEl);
    }
    previewEl.style.cssText = 'margin-bottom:20px;border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:500px;';

    if (isPDF) {
      previewEl.innerHTML = `<iframe src="${dataURI}" style="width:100%;height:500px;border:none;display:block;" title="PDF Preview"></iframe>`;
    } else if (isImage) {
      previewEl.innerHTML = `<img src="${dataURI}" style="max-width:100%;max-height:480px;display:block;margin:0 auto;object-fit:contain;" alt="File Preview">`;
    } else {
      previewEl.innerHTML = `
        <div style="padding:36px 24px;text-align:center;color:var(--muted);font-size:13px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round" stroke-linejoin="round"
            style="margin-bottom:12px;opacity:.4;display:block;margin-left:auto;margin-right:auto;">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <p style="margin:0 0 6px;font-weight:600;color:var(--text);">Preview unavailable</p>
          <p style="margin:0;font-size:12px;">File type <strong>${ext || 'unknown'}</strong> cannot be previewed in-browser.<br>Use the Download button below.</p>
        </div>`;
    }

    /* Wire download button */
    const dlBtn = document.getElementById('file-modal-dl-btn');
    if (dlBtn) {
      dlBtn.style.display = 'inline-flex';
      dlBtn.onclick = function() {
        const fname = d.name.replace(/[^a-z0-9_\-]/gi, '_') + (ext.startsWith('.') ? ext : (ext ? '.' + ext : ''));
        const a = document.createElement('a');
        a.href = dataURI;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast('Download started.');
      };
    }

    openModal('file-modal');

  } catch (err) {
    console.error('[viewFile]', err);
    toast('Could not open file. It may be corrupted or missing.');
  }

  if (btnEl) { btnEl.disabled = false; btnEl.textContent = origText; }
}

/* ========================================================
   DOCUMENT ID SYSTEM
======================================================== */

function generateULID() {
  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const t = Date.now();
  let timeStr = '';
  let tmp = t;
  for (let i = 9; i >= 0; i--) {
    timeStr = CROCKFORD[tmp % 32] + timeStr;
    tmp = Math.floor(tmp / 32);
  }
  let randStr = '';
  for (let i = 0; i < 16; i++) {
    randStr += CROCKFORD[Math.floor(Math.random() * 32)];
  }
  return timeStr + randStr;
}

function genDisplayId() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const dateStr = '' + yyyy + mm + dd;

  const counterKey = 'cit_doccount_' + dateStr;
  let counter = 0;
  try { counter = parseInt(localStorage.getItem(counterKey) || '0', 10); } catch(e) {}
  counter++;
  try { localStorage.setItem(counterKey, String(counter)); } catch(e) {}

  return 'DOC-' + dateStr + '-' + String(counter).padStart(4, '0');
}

function genVerifyCode(displayId, internalId) {
  const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const str = displayId + ':' + internalId;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (Math.imul(hash, 16777619)) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += CROCKFORD[hash % 32];
    hash = Math.floor(hash / 32);
  }
  return code;
}

function genDocIds() {
  const internalId = generateULID();
  const displayId  = genDisplayId();
  const verifyCode = genVerifyCode(displayId, internalId);
  return {
    internalId,
    displayId,
    verifyCode,
    fullDisplayId: displayId + '-' + verifyCode
  };
}

function findDoc(query) {
  if (!query) return null;
  const q = query.toUpperCase();
  return docs.find(d =>
    d.internalId === q ||
    (d.displayId  && d.displayId.toUpperCase()  === q) ||
    (d.fullDisplayId && d.fullDisplayId.toUpperCase() === q) ||
    d.id === q
  ) || null;
}

/* ========================================================
   CONSTANTS & GLOBAL STATE
======================================================== */
const KEY = 'Group6CITKey2024';

let accounts      = [];
let docs          = [];
let notifications = {};
let activityLogs  = {};
let movementLogs  = [];
let currentUser   = null;
let updateDocId   = null;
let _uvCurrentUid = null;

const statusColorMap = {
  Released:'#22c55e', Rejected:'#ef4444', Approved:'#16a34a',
  Signed:'#16a34a', Processing:'#f59e0b', Pending:'#f59e0b',
  'For Approval':'#3b82f6', Received:'#64748b'
};

const docOfficeMap = {
  Academic:'Office of the Registrar',
  Laboratory:'Laboratory Office',
  Administrative:'Administrative Office',
  Financial:'Accounting Office',
  Medical:'Medical Office',
  Other:'Document Control Office'
};

/* ========================================================
   HELPERS
======================================================== */
const genId  = () => 'DOC-' + Date.now().toString(36).toUpperCase().slice(-5);
const genUID = () => 'USR-' + Date.now().toString(36).toUpperCase();
const nowStr = () => new Date().toLocaleString('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: true
});
const colors = ['#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#f87171','#fbbf24'];
function avatarColor(idx){ return colors[idx % colors.length]; }

const badgeMap = {Received:'received',Processing:'processing','For Approval':'forapproval',Approved:'approved',Released:'released',Rejected:'rejected',Pending:'pending',Signed:'signed'};
function statusBadge(s){ return `<span class="badge badge-${badgeMap[s]||'received'}">${s}</span>`; }
function prioBadge(p){ return `<span class="prio prio-${(p||'Normal').toLowerCase()}">${p||'Normal'}</span>`; }
function initials(name){ return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

function statusColor(s){ return statusColorMap[s] || '#94a3b8'; }
function docOffice(type){ return docOfficeMap[type] || 'Document Control Office'; }

/* ========================================================
   STORAGE
======================================================== */
function save(){
  const docsLite = docs.map(d => {
    const c = Object.assign({}, d);
    delete c.fileData;
    delete c.originalFile;
    delete c.processedFile;
    return c;
  });
  try{ localStorage.setItem('cit_accounts',  JSON.stringify(accounts));  }catch(e){}
  try{ localStorage.setItem('cit_docs2',     JSON.stringify(docsLite));  }catch(e){}
  try{ localStorage.setItem('cit_notifs',    JSON.stringify(notifications)); }catch(e){}
  try{ localStorage.setItem('cit_actlogs',   JSON.stringify(activityLogs)); }catch(e){}
  try{ localStorage.setItem('cit_movements', JSON.stringify(movementLogs)); }catch(e){}
  docs.forEach(d => {
    const key = d.internalId || d.id;
    if(d.originalFile || d.fileData){
      try{
        const fileObj = {data: d.originalFile||d.fileData, ext: d.originalFileExt||d.fileExt||''};
        localStorage.setItem('cit_origfile_'+key, JSON.stringify(fileObj));
      }catch(e){
        console.error('[save] Could not save original file for', key, ':', e.message);
      }
    }
    if(d.processedFile){
      try{ localStorage.setItem('cit_procfile_'+key, JSON.stringify({data: d.processedFile, ext: d.processedFileExt||'', by: d.processedBy||'', at: d.processedAt||''})); }catch(e){ console.warn('Could not save processed file for', key); }
    }
    if(d.fileData){
      try{ localStorage.setItem('cit_file_'+key, JSON.stringify({data:d.fileData,ext:d.fileExt||''})); }catch(e){}
    }
  });
}

function load(){
  try{ const s=localStorage.getItem('cit_accounts');  if(s) accounts=JSON.parse(s);      }catch(e){}
  try{ const s=localStorage.getItem('cit_docs2');     if(s) docs=JSON.parse(s);          }catch(e){}
  try{ const s=localStorage.getItem('cit_notifs');    if(s) notifications=JSON.parse(s); }catch(e){}
  try{ const s=localStorage.getItem('cit_actlogs');   if(s) activityLogs=JSON.parse(s);  }catch(e){}
  try{ const s=localStorage.getItem('cit_movements'); if(s) movementLogs=JSON.parse(s);  }catch(e){}
  docs.forEach(d => {
    const key = d.internalId || d.id;
    try{
      const raw=localStorage.getItem('cit_origfile_'+key);
      if(raw){ const p=JSON.parse(raw); d.originalFile=p.data; d.originalFileExt=p.ext||d.fileExt||''; }
    }catch(e){ console.error('[load] Error loading original file for', key, ':', e.message); }
    try{
      const raw=localStorage.getItem('cit_procfile_'+key);
      if(raw){ const p=JSON.parse(raw); d.processedFile=p.data; d.processedFileExt=p.ext||''; d.processedBy=p.by||''; d.processedAt=p.at||''; }
    }catch(e){}
    try{
      const raw=localStorage.getItem('cit_file_'+key);
      if(raw && !d.originalFile){ const p=JSON.parse(raw); d.fileData=p.data; d.originalFile=p.data; d.originalFileExt=p.ext||d.fileExt||''; }
    }catch(e){}
  });
}

function logActivity(userId, message, color){
  if(!activityLogs[userId]) activityLogs[userId]=[];
  activityLogs[userId].push({msg:message, date:nowStr(), color:color||'#94a3b8'});
  if(activityLogs[userId].length>100) activityLogs[userId]=activityLogs[userId].slice(-100);
  save();
}

/* ========================================================
   NAVIGATION
======================================================== */
function showPage(id, btn){
  document.querySelectorAll('#app-view .page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const page = document.getElementById('page-'+id);
  if(page) page.classList.add('active');
  if(btn)  btn.classList.add('active');
  if(id==='vault')     renderVault();
  if(id==='users')     renderUsers();
  if(id==='actlogs')   renderActivityLogs();
  if(id==='movements') renderMovementLogs();
  if(id==='scanlogs')  renderScanLogs();
}

/* ========================================================
   RENDER ALL
======================================================== */
function renderAll(){ renderStats(); renderDash(); renderVault(); renderNotifCount(); }

/* Stats */
function renderStats(){
  const isAdmin = currentUser.role==='admin';
  const myDocs  = isAdmin ? docs : docs.filter(d=>d.ownerId===currentUser.id);
  const total   = myDocs.length;
  const released= myDocs.filter(d=>d.status==='Released').length;
  const pending = myDocs.filter(d=>['Received','Processing','For Approval','Pending'].includes(d.status)).length;
  const rejected= myDocs.filter(d=>d.status==='Rejected').length;
  document.getElementById('stats-row').innerHTML=`
    <div class="stat-card">
      <div class="stat-card-label">${isAdmin?'Total Docs':'My Docs'}</div>
      <div class="stat-card-num">${total}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-label">Released</div>
      <div class="stat-card-num green">${released}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-label">In Progress</div>
      <div class="stat-card-num yellow">${pending}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-label">Rejected</div>
      <div class="stat-card-num red">${rejected}</div>
    </div>`;
  document.getElementById('dash-title').textContent    = isAdmin?'Admin Dashboard':'My Dashboard';
  document.getElementById('dash-subtitle').textContent = isAdmin?'':`Welcome back, ${currentUser.name||currentUser.username}`;
}

/* Dashboard */
function renderDash(){
  const isAdmin=currentUser.role==='admin';
  const myDocs=isAdmin?docs:docs.filter(d=>d.ownerId===currentUser.id);
  const rows=[...myDocs].reverse().slice(0,6);
  const tb=document.getElementById('dash-tbody');
  if(!rows.length){tb.innerHTML=`<tr><td colspan="4"><div class="empty-msg">No documents yet.</div></td></tr>`;}
  else tb.innerHTML=rows.map(d=>`<tr>
    <td class="doc-id-cell" title="${d.internalId||d.id}">${d.fullDisplayId||d.displayId||d.id}</td>
    <td class="doc-name-cell">${d.name}${isAdmin?`<br><span style="font-size:11px;color:var(--muted);font-weight:400">by ${d.ownerName}</span>`:''}</td>
    <td>${statusBadge(d.status)}</td>
    <td>${dashActions(d)}</td>
  </tr>`).join('');

  const al=document.getElementById('activity-list');
  document.getElementById('my-activity-title').textContent=isAdmin?'System Activity (All Users)':'My Recent Activity';
  let acts;
  if(isAdmin){
    acts=[];
    Object.entries(activityLogs).forEach(([uid,logs])=>{
      const acc=accounts.find(a=>a.id===uid);
      logs.forEach(l=>acts.push({...l, uname:(acc?acc.username:'unknown')}));
    });
    acts.sort((a,b)=>new Date(b.date)-new Date(a.date));
    acts=acts.slice(0,8);
  } else { acts=[...(activityLogs[currentUser.id]||[])].reverse().slice(0,8); }
  if(!acts.length){al.innerHTML=`<p style="font-size:13px;color:var(--muted)">No recent activity.</p>`;return;}
  al.innerHTML=acts.map(a=>`
    <div class="activity-item">
      <div>
        <div class="activity-text">${isAdmin&&a.uname?`<strong>@${a.uname}</strong>: `:''}${a.msg}</div>
        <div class="activity-time">${a.date}</div>
      </div>
    </div>`).join('');
}

function dashActions(d){
  const isAdmin=currentUser.role==='admin';
  const isOwner=d.ownerId===currentUser.id;
  const docKey = d.internalId || d.id;
  const hasProcessed = docHasProcessedFile(d);
  let menuItems='';

  if(hasProcessed && d.status==='Released'){
    menuItems+=`<button class="dropdown-item" onclick="downloadDocFile('${docKey}', this)"> Download File</button>`;
  } else if(d.status==='Released' && !hasProcessed){
    menuItems+=`<button class="dropdown-item" disabled title="Released but no processed file attached yet">No File</button>`;
  } else if(docHasOriginalFile(d)){
    menuItems+=`<button class="dropdown-item" style="color:#3b82f6" onclick="closeAllActionMenus(); viewFile('${docKey}','original',this)">File Attached</button>`;
  }

  if(isAdmin){
    menuItems+=`<button class="dropdown-item" onclick="closeAllActionMenus(); openUpdate('${docKey}')">Update</button>`;
    menuItems+=`<button class="dropdown-item" onclick="closeAllActionMenus(); openQR('${docKey}')">QR</button>`;
    menuItems+=`<button class="dropdown-item" onclick="closeAllActionMenus(); openHistory('${docKey}')">History</button>`;
    menuItems+=`<button class="dropdown-item danger" onclick="closeAllActionMenus(); deleteDoc('${docKey}')">Delete</button>`;
  } else if(isOwner){
    menuItems+=`<button class="dropdown-item" onclick="closeAllActionMenus(); openQR('${docKey}')">QR</button>`;
    menuItems+=`<button class="dropdown-item" onclick="closeAllActionMenus(); openHistory('${docKey}')">History</button>`;
    menuItems+=`<button class="dropdown-item danger" onclick="closeAllActionMenus(); deleteDoc('${docKey}')">Delete</button>`;
  }

  return `
    <div class="dash-actions">
      <button class="btn btn-sm btn-ghost action-toggle" onclick="toggleActionMenu('${docKey}', event)">Actions</button>
      <div class="action-menu" id="action-menu-${docKey}" onclick="event.stopPropagation()">${menuItems}</div>
    </div>
  `;
}

function toggleActionMenu(docKey, event){
  event.stopPropagation();
  const menu = document.getElementById(`action-menu-${docKey}`);
  const button = event.currentTarget;
  if(!menu || !button) return;
  const isOpen = menu.classList.contains('show');
  closeAllActionMenus();
  if(!isOpen){
    const rect = button.getBoundingClientRect();
    menu.style.left = '0';
    menu.style.top = '0';
    menu.style.visibility = 'hidden';
    menu.classList.add('show');
    const menuRect = menu.getBoundingClientRect();
    let left = rect.left;
    if(left + menuRect.width > window.innerWidth - 12){
      left = Math.max(12, window.innerWidth - menuRect.width - 12);
    }
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - menuRect.height - 12)}px`;
    menu.style.visibility = '';
  }
}

document.addEventListener('click', (event)=>{
  const target = event.target;
  if(target.closest('.action-menu') || target.closest('.action-toggle')) return;
  closeAllActionMenus();
});

function closeAllActionMenus(){
  document.querySelectorAll('.action-menu.show').forEach(menu=>menu.classList.remove('show'));
}

function downloadDocFile(docKey, btnEl) {
  const d = docs.find(x => (x.internalId||x.id) === docKey);
  if (!d) { toast('Document not found.'); return; }
  /* NOTE: decryptAndDownload handles the Released check and backend fallback */
  decryptAndDownload(docKey, btnEl || null);
}

/* ========================================================
   VAULT - with clickable file badges
======================================================== */
function renderVault(){
  const isAdmin=currentUser.role==='admin';
  const term=(document.getElementById('vault-search')?.value||'').toLowerCase();
  const userFilter=document.getElementById('vault-user-filter')?.value||'';
  const uf=document.getElementById('vault-user-filter');
  if(uf){
    uf.style.display=isAdmin?'':'none';
    if(isAdmin){
      const opts=accounts.filter(a=>a.role!=='admin').map(a=>`<option value="${a.id}">${a.name||a.username}</option>`).join('');
      uf.innerHTML='<option value="">All Users</option>'+opts;
      uf.value=userFilter;
    }
  }
  let rows=isAdmin?docs:docs.filter(d=>d.ownerId===currentUser.id);
  if(isAdmin&&userFilter) rows=rows.filter(d=>d.ownerId===userFilter);
  if(term) rows=rows.filter(d=>{
    const disp=(d.fullDisplayId||d.displayId||d.id||'').toLowerCase();
    return disp.includes(term)||
      d.name.toLowerCase().includes(term)||
      (d.by||'').toLowerCase().includes(term)||
      (d.ownerName||'').toLowerCase().includes(term);
  });
  const tb=document.getElementById('vault-tbody');
  if(!rows.length){tb.innerHTML=`<tr><td colspan="10"><div class="empty-msg">No documents found.</div></td></tr>`;return;}
  tb.innerHTML=rows.map(d=>{
    const lastLoc=getLatestLocation(d);
    const locHtml=lastLoc.location?`<span class="loc-badge">${lastLoc.location}</span>`:`<span style="font-size:11px;color:#94a3b8">-</span>`;
    const docKey = d.internalId || d.id;
    const hasOrig = docHasOriginalFile(d);
    const hasProc = docHasProcessedFile(d);
    const canView = isAdmin || d.ownerId === currentUser.id;

    /* -- File badges are now clickable buttons -- */
    const fileHtml = hasProc
      ? `<button
           onclick="viewFile('${docKey}','processed',this)"
           title="Click to view Final/Processed file"
           style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;
                  color:#22c55e;padding:2px 8px;background:rgba(34,197,94,.1);
                  border:1px solid rgba(34,197,94,.25);border-radius:20px;
                  cursor:pointer;font-family:var(--sans);transition:opacity .15s"
           onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'">
           <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
             <polyline points="14 2 14 8 20 8"/>
           </svg>Final
         </button>`
      : hasOrig && canView
      ? `<button
           onclick="viewFile('${docKey}','original',this)"
           title="Click to view Original file"
           style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;
                  color:#60a5fa;padding:2px 8px;background:rgba(96,165,250,.1);
                  border:1px solid rgba(96,165,250,.25);border-radius:20px;
                  cursor:pointer;font-family:var(--sans);transition:opacity .15s"
           onmouseover="this.style.opacity='.75'" onmouseout="this.style.opacity='1'">
           <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
             <polyline points="14 2 14 8 20 8"/>
           </svg>Original
         </button>`
      : `<span style="font-size:11px;color:#94a3b8">-</span>`;

    return `<tr>
      <td class="doc-id-cell" title="Internal: ${d.internalId||d.id}">${d.fullDisplayId||d.displayId||d.id}</td>
      <td class="doc-name-cell">${d.name}${isAdmin?`<br><span style="font-size:11px;color:var(--muted);font-weight:400"> ${d.ownerName}</span>`:''}</td>
      <td style="font-size:13px">${d.by}</td>
      <td class="enc-cell" title="${d.enc}">${d.enc.slice(0,14)}…</td>
      <td class="dec-cell">${IDEA.decrypt(d.enc,KEY)}</td>
      <td>${locHtml}</td>
      <td>${fileHtml}</td>
      <td>${prioBadge(d.priority)}</td>
      <td>${statusBadge(d.status)}</td>
      <td style="white-space:nowrap">${dashActions(d)}</td>
    </tr>`;
  }).join('');
}

function getLatestLocation(d){
  if(!d.history||!d.history.length) return {location:'',handler:''};
  for(let i=d.history.length-1;i>=0;i--){
    const h=d.history[i];
    if(h.location||h.handler) return {location:h.location||'',handler:h.handler||''};
  }
  return {location:'',handler:''};
}

/* User Management */
function renderUsers(){
  const ul=document.getElementById('users-list');
  const users=accounts.filter(a=>a.role!=='admin');
  if(!users.length){ul.innerHTML=`<p style="font-size:13px;color:var(--muted)">No registered users yet.</p>`;return;}
  ul.innerHTML=users.map((u,i)=>{
    const cnt=docs.filter(d=>d.ownerId===u.id).length;
    const logCnt=(activityLogs[u.id]||[]).length;
    return `<div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)">
      <div class="user-avatar" style="background:${u.color||avatarColor(i)}">${initials(u.name||u.username)}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:14px">${u.name||u.username}</div>
        <div style="font-size:12px;color:var(--muted)">@${u.username} &nbsp;-&nbsp; ${cnt} doc${cnt!==1?'s':''} &nbsp;-&nbsp; ${logCnt} activities</div>
      </div>
      <button class="btn btn-sm btn-blue" onclick="openUserVault('${u.id}')">View Docs</button>
    </div>`;
  }).join('');
}

function openUserVault(uid){
  const u=accounts.find(a=>a.id===uid);
  if(!u) return;
  _uvCurrentUid=uid;
  document.getElementById('uv-title').textContent=`${u.name||u.username}'s Documents`;
  document.getElementById('uv-subtitle').textContent=`@${u.username}`;
  const searchEl=document.getElementById('uv-search');
  if(searchEl) searchEl.value='';
  switchUVTab('docs');
  openModal('user-vault-modal');
}

function switchUVTab(tab){
  const isDocs=tab==='docs';
  document.getElementById('uv-tab-docs').style.borderBottomColor=isDocs?'var(--accent)':'transparent';
  document.getElementById('uv-tab-docs').style.color=isDocs?'var(--text)':'var(--muted)';
  document.getElementById('uv-tab-logs').style.borderBottomColor=isDocs?'transparent':'var(--accent)';
  document.getElementById('uv-tab-logs').style.color=isDocs?'var(--muted)':'var(--text)';
  document.getElementById('uv-docs-panel').style.display=isDocs?'':'none';
  document.getElementById('uv-logs-panel').style.display=isDocs?'none':'';
  if(isDocs) renderUVDocs();
  else renderUVLogs();
}

function renderUVDocs(){
  /* Build a set of all ID forms for this user.
     The mismatch: _uvCurrentUid = USR-xxx (userId field from backend user list),
     but doc.ownerId = MongoDB _id string (set at registration via currentUser.id
     which equals apiUser._id in _mapBackendUser). We must check both. */
  var _uvUser = accounts.find(function(a){
    return a.id === _uvCurrentUid || a.userId === _uvCurrentUid || String(a._id||'') === _uvCurrentUid;
  });
  var _uvIds = [_uvCurrentUid];
  if (_uvUser) {
    if (_uvUser.id     && _uvIds.indexOf(_uvUser.id)          === -1) _uvIds.push(_uvUser.id);
    if (_uvUser.userId && _uvIds.indexOf(_uvUser.userId)      === -1) _uvIds.push(_uvUser.userId);
    if (_uvUser._id    && _uvIds.indexOf(String(_uvUser._id)) === -1) _uvIds.push(String(_uvUser._id));
  }
  /* ISSUE 2 FIX: doc.ownerId is set to the MongoDB _id at registration time
     (currentUser.id = apiUser._id from _mapBackendUser), but _uvCurrentUid is
     the "USR-xxx" userId. Look up _backendUsers to get the MongoDB _id and add
     it to _uvIds so the filter below actually finds matching documents. */
  if (typeof _backendUsers !== 'undefined' && _backendUsers) {
    var _bu = _backendUsers.find(function(u) {
      return u.userId === _uvCurrentUid ||
             String(u._id || '') === _uvCurrentUid ||
             (_uvUser && u.username === _uvUser.username);
    });
    if (_bu) {
      var _buMongoId = String(_bu._id || '');
      if (_buMongoId && _uvIds.indexOf(_buMongoId) === -1) _uvIds.push(_buMongoId);
      if (_bu.userId  && _uvIds.indexOf(_bu.userId) === -1) _uvIds.push(_bu.userId);
    }
  }
  const term=(document.getElementById('uv-search')?.value||'').toLowerCase();
  let userDocs=docs.filter(d=>_uvIds.indexOf(d.ownerId) !== -1);
  if(term){
    userDocs=userDocs.filter(d=>
      (d.fullDisplayId||d.displayId||d.id||'').toLowerCase().includes(term)||
      (d.name||'').toLowerCase().includes(term)||
      (d.status||'').toLowerCase().includes(term)||
      (d.type||'').toLowerCase().includes(term)
    );
  }
  const tb=document.getElementById('uv-tbody');
  if(!docs.filter(d=>_uvIds.indexOf(d.ownerId) !== -1).length){
    tb.innerHTML=`<tr><td colspan="7"><div class="empty-msg">No documents.</div></td></tr>`;return;
  }
  if(!userDocs.length){
    tb.innerHTML=`<tr><td colspan="7"><div class="empty-msg">No documents match your search.</div></td></tr>`;return;
  }
  tb.innerHTML=userDocs.map(d=>`<tr>
    <td class="doc-id-cell" title="${d.internalId||d.id}">${d.fullDisplayId||d.displayId||d.id}</td>
    <td>${d.name}</td><td>${d.type}</td>
    <td>${prioBadge(d.priority)}</td><td>${statusBadge(d.status)}</td>
    <td style="font-size:12px;color:var(--muted)">${d.date}</td>
    <td><button class="btn btn-sm btn-orange" onclick="closeModal('user-vault-modal');setTimeout(()=>openHistory('${d.internalId||d.id}'),120)">History</button></td>
  </tr>`).join('');
}

function renderUVLogs(){
  /* ISSUE 2 FIX: activityLogs is keyed by currentUser.id = MongoDB _id, but
     _uvCurrentUid is "USR-xxx". Build the same full ID set as renderUVDocs
     so we find logs regardless of which ID format was used as the key. */
  var _uvUser2 = accounts.find(function(a){
    return a.id === _uvCurrentUid || a.userId === _uvCurrentUid || String(a._id||'') === _uvCurrentUid;
  });
  var _uvLogIds = [_uvCurrentUid];
  if (_uvUser2) {
    if (_uvUser2.id     && _uvLogIds.indexOf(_uvUser2.id)          === -1) _uvLogIds.push(_uvUser2.id);
    if (_uvUser2.userId && _uvLogIds.indexOf(_uvUser2.userId)      === -1) _uvLogIds.push(_uvUser2.userId);
    if (_uvUser2._id    && _uvLogIds.indexOf(String(_uvUser2._id)) === -1) _uvLogIds.push(String(_uvUser2._id));
  }
  if (typeof _backendUsers !== 'undefined' && _backendUsers) {
    var _bu2 = _backendUsers.find(function(u) {
      return u.userId === _uvCurrentUid ||
             String(u._id || '') === _uvCurrentUid ||
             (_uvUser2 && u.username === _uvUser2.username);
    });
    if (_bu2) {
      var _buId2 = String(_bu2._id || '');
      if (_buId2 && _uvLogIds.indexOf(_buId2) === -1) _uvLogIds.push(_buId2);
      if (_bu2.userId && _uvLogIds.indexOf(_bu2.userId) === -1) _uvLogIds.push(_bu2.userId);
    }
  }
  /* Merge logs from all matching ID keys */
  var mergedLogs = [];
  _uvLogIds.forEach(function(id) {
    var l = activityLogs[id];
    if (l && l.length) mergedLogs = mergedLogs.concat(l);
  });
  const logs = mergedLogs.slice().sort(function(a,b){ return new Date(b.date)-new Date(a.date); });
  const body=document.getElementById('uv-logs-body');
  if(!logs.length){body.innerHTML='<p style="font-size:13px;color:var(--muted)">No activity yet.</p>';return;}
  body.innerHTML=logs.map(l=>`<div class="activity-item"><div><div class="activity-text">${l.msg}</div><div class="activity-time">${l.date}</div></div></div>`).join('');
}

/* Activity Logs */
function renderActivityLogs(){
  const body=document.getElementById('actlogs-body');
  let all=[];
  Object.entries(activityLogs).forEach(([uid,logs])=>{
    /* uid is stored as currentUser.id = MongoDB _id string.
       accounts[] entries merged from backend have a.id = USR-xxx (userId).
       Must check both fields to resolve the name correctly. */
    let acc=accounts.find(a=>a.id===uid||a.userId===uid||String(a._id||'')===uid);
    /* ISSUE 3 FIX: if not found in accounts[], fall back to _backendUsers which
       has the MongoDB _id as u._id. Without this, uid (a 24-char hex string)
       is displayed raw, which looks like "encrypted text" in the activity log. */
    if (!acc && typeof _backendUsers !== 'undefined' && _backendUsers) {
      const bu = _backendUsers.find(u => u.userId===uid || String(u._id||'')===uid);
      if (bu) acc = bu;
    }
    let uname = acc ? (acc.username || acc.name || uid) : uid;
    /* Safety net: if uname is still a raw MongoDB ObjectId (24 hex chars), show 'unknown' */
    if (/^[a-f0-9]{24}$/.test(uname)) uname = 'unknown';
    logs.forEach(l=>all.push({...l,uname}));
  });
  all.sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!all.length){body.innerHTML='<p style="font-size:13px;color:var(--muted)">No activity yet.</p>';return;}
  body.innerHTML=all.map(a=>`<div class="activity-item"><div><div class="activity-text"><strong>@${a.uname}</strong>: ${a.msg}</div><div class="activity-time">${a.date}</div></div></div>`).join('');
}

function clearActivityLogs(){
  if(!confirm('Clear ALL activity logs? This cannot be undone.')) return;
  Object.keys(activityLogs).forEach(k=>activityLogs[k]=[]);
  save(); renderActivityLogs(); toast('Activity logs cleared.');
}

/* ========================================================
   DOCUMENT CRUD
======================================================== */
let _newFileData = null;
let _newFileExt  = null;
let _newFileReady = false;

function previewFile(input){
  _newFileData = null;
  _newFileExt  = null;
  _newFileReady = false;
  const prev=document.getElementById('file-preview');
  if(!input.files||!input.files[0]){prev.style.display='none'; return;}
  const file=input.files[0];
  if(file.size>5*1024*1024){toast('File is too large. Max 5 MB.');input.value='';prev.style.display='none'; return;}
  const ext='.'+file.name.split('.').pop().toLowerCase();
  const reader=new FileReader();
  reader.onload=function(e){
    _newFileData=e.target.result;
    _newFileExt=ext;
    _newFileReady=true;
    document.getElementById('file-preview-name').textContent=file.name;
    document.getElementById('file-preview-size').textContent='('+Math.round(file.size/1024)+' KB)';
    var stateEl=document.getElementById('file-upload-state'); if(stateEl) stateEl.textContent=file.name;
    prev.style.display='flex';
  };
  reader.onerror=function(){
    toast('Error reading file. Please try again.');
    _newFileData=null;
    _newFileExt=null;
    _newFileReady=false;
    prev.style.display='none';
    input.value='';
  };
  reader.readAsDataURL(file);
}

async function addDocument(){
  const name    = document.getElementById('new-name').value.trim();
  const type    = document.getElementById('new-type').value;
  const by      = document.getElementById('new-by').value.trim();
  const purpose = document.getElementById('new-purpose').value.trim();
  const priority= document.getElementById('new-priority').value || 'Normal';
  const due     = document.getElementById('new-due').value;
  const fileInput = document.getElementById('fileUpload');

  if(!name||!type||!by||!purpose){toast('Please fill in all required fields.');return;}

  if(fileInput.files && fileInput.files[0] && !_newFileReady){
    toast('Please wait for file to finish loading before saving...');
    return;
  }

  const btn=document.getElementById('save-btn');
  btn.disabled=true; btn.textContent='Encrypting…';

  const enc  = IDEA.encrypt(name, KEY);
  const date = nowStr();

  let encryptedFileData = null;
  let storedFileExt     = null;
  if (_newFileData && _newFileReady) {
    try {
      encryptedFileData = encryptFile(_newFileData, _newFileExt);
      storedFileExt     = _newFileExt;
    } catch(e) {
      console.error('[addDocument] File encryption failed:', e);
      toast('File encryption failed. Document saved without attachment.');
    }
  }

  const historyEntry = {
    action: 'Status Update', status: 'Received', date,
    note: 'Document submitted. Name encrypted with IDEA-128.' +
          (encryptedFileData ? ' Original file encrypted with IDEA-128 at rest.' : ''),
    by: currentUser.username, location: '', handler: ''
  };

  const ids = genDocIds();

  const doc = {
    id:              ids.internalId,
    internalId:      ids.internalId,
    displayId:       ids.displayId,
    verifyCode:      ids.verifyCode,
    fullDisplayId:   ids.fullDisplayId,
    name, type, by, purpose, priority,
    due:             due || null,
    status:          'Received',
    enc,
    ownerId:         currentUser.id || currentUser.userId,
    ownerName:       currentUser.username,
    fileData:        encryptedFileData,
    originalFile:    encryptedFileData,
    originalFileExt: storedFileExt,
    fileEncrypted:   !!encryptedFileData,
    fileExt:         storedFileExt,
    processedFile:    null,
    processedFileExt: null,
    processedBy:      null,
    processedAt:      null,
    date,
    history: [historyEntry]
  };

  if (currentUser._backendMode && currentUser.token) {
    btn.textContent = 'Saving to server…';
    try {
      const jsonPayload = {
        name, type, by, purpose, priority,
        due:       due || null,
        enc,
        ownerId:   currentUser.id || currentUser.userId,
        ownerName: currentUser.username,
        status:    'Received',
        date,
        history:   [historyEntry],
        hasOriginalFile: !!encryptedFileData,
        fileExt:   storedFileExt
      };

      let result;

      if (encryptedFileData) {
        // -- FIX: use FormData so large files bypass Express body-limit --
        result = await apiUploadDocumentWithFile(
          jsonPayload,
          encryptedFileData,   // already IDEA-encrypted base64 JSON string
          storedFileExt,
          currentUser.token
        );
      } else {
        // No file - plain JSON is fine
        result = await apiRegisterDocument(jsonPayload, currentUser.token);
      }

      if (result && result.internalId) {
        // -- FIX: backend may assign a different internalId; update doc and
        //    immediately persist the file under the FINAL key so localStorage
        //    never ends up with an orphaned / mismatched key --
        const oldKey = doc.internalId;
        doc.internalId    = result.internalId;
        doc.id            = result.internalId;
        doc.displayId     = result.displayId     || doc.displayId;
        doc.verifyCode    = result.verifyCode    || doc.verifyCode;
        doc.fullDisplayId = result.fullDisplayId || doc.fullDisplayId;
        doc.qrCode        = result.qrCode        || null;
        doc._backendSynced = true;

        // Clean up old key if it changed
        if (oldKey !== result.internalId) {
          try { localStorage.removeItem('cit_origfile_' + oldKey); } catch(_){}
          try { localStorage.removeItem('cit_file_'     + oldKey); } catch(_){}
        }
      } else if (result && result._error) {
        console.warn('[addDocument] Backend error:', result.message);
        toast('Server error: ' + (result.message || 'Could not save to server.') + ' Saved locally.');
      } else if (result === null) {
        toast('Server unreachable - saved locally only.');
      }
    } catch(e) {
      console.error('[addDocument] API call failed:', e);
      toast('Server error. Document saved locally.');
    }
  }

  // -- FIX: force-save file under the FINAL internalId BEFORE save() runs,
  //    so there is never a window where the key is wrong --
  if (encryptedFileData) {
    const finalKey = doc.internalId || doc.id;
    try {
      localStorage.setItem('cit_origfile_' + finalKey,
        JSON.stringify({ data: encryptedFileData, ext: storedFileExt || '' }));
      // Also keep the legacy key for backward compat with load()
      localStorage.setItem('cit_file_' + finalKey,
        JSON.stringify({ data: encryptedFileData, ext: storedFileExt || '' }));
    } catch(e) {
      console.warn('[addDocument] Could not persist file to localStorage:', e.message);
    }
  }

  docs.push(doc);
  logActivity(currentUser.id, `Registered "${name}" (${doc.fullDisplayId})`, '#4ade80');
  save();

  btn.disabled=false; btn.textContent='Encrypt & Save';
  _newFileData=null; _newFileExt=null; _newFileReady=false;
  document.getElementById('fileUpload').value='';
  document.getElementById('file-preview').style.display='none';

  showReceipt(doc);
  renderAll();
}

function showEncryptOverlay(hasFile, cb){
  if (typeof cb === 'function') cb();
}

function showReceipt(doc){
  document.getElementById('register-workflow').style.display='none';
  document.getElementById('register-card').style.display='none';
  document.getElementById('register-receipt').style.display='';
  document.getElementById('receipt-id').textContent      = doc.fullDisplayId || doc.displayId || doc.id;
  document.getElementById('receipt-name').textContent    = doc.name;
  document.getElementById('receipt-type').textContent    = doc.type;
  document.getElementById('receipt-by').textContent      = doc.by;
  document.getElementById('receipt-purpose').textContent = doc.purpose;
  document.getElementById('receipt-priority').textContent= doc.priority;
  document.getElementById('receipt-date').textContent    = doc.date;
  document.getElementById('receipt-status').textContent  = doc.status;
  document.getElementById('receipt-file').textContent    = doc.originalFile || doc.fileData
    ? doc.name+(doc.originalFileExt||doc.fileExt||'') + ' [Original - IDEA-128 encrypted]'
    : 'None';
  const encProof=document.getElementById('receipt-enc-proof');
  encProof.textContent=[
    'Key    : '+KEY,
    'IDEA   : '+doc.enc.slice(0,32)+'…',
    'ID     : '+doc.fullDisplayId,
    'Verify : '+doc.verifyCode,
    (doc.originalFile||doc.fileData) ? 'File   : Original uploaded - IDEA-128 encrypted at rest' : 'File   : No attachment',
    'Final  : Awaiting admin upload (required for Release)'
  ].join('\n');
  if(doc.originalFile || doc.fileData){
    document.getElementById('receipt-file-notice').style.display='';
    document.getElementById('receipt-file-notice').innerHTML = '<strong>Original file submitted and secured.</strong> The admin will upload the final/processed version. Only the <strong>Final File</strong> is downloadable once status is <strong>Released</strong>.';
  }
  buildReceiptQR(doc);
  document.getElementById('receipt-card').scrollIntoView({behavior:'smooth', block:'start'});
}

function registerAnother(){
  document.getElementById('register-workflow').style.display='';
  document.getElementById('register-card').style.display='';
  document.getElementById('register-receipt').style.display='none';
  ['new-name','new-by','new-purpose','new-due'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('new-type').value='';
  document.getElementById('new-priority').value='Normal';
  document.getElementById('file-preview').style.display='none';
  document.getElementById('fileUpload').value='';
  _newFileData=null; _newFileExt=null; _newFileReady=false;
}

async function deleteDoc(docKey){
  const d = docs.find(x => (x.internalId||x.id) === docKey);
  if(!d || !confirm(`Delete "${d.name}"? This cannot be undone.`)) return;

  if (currentUser && currentUser._backendMode && currentUser.token) {
    try {
      const result = await apiDeleteDocument(docKey, currentUser.token);
      if (result && result._error) {
        console.warn('[deleteDoc] Backend delete failed:', result.message);
      }
    } catch(e) {
      console.error('[deleteDoc] API error:', e);
    }
  }

  docs = docs.filter(x => (x.internalId||x.id) !== docKey);
  try{ localStorage.removeItem('cit_file_'+docKey); }catch(e){}
  try{ localStorage.removeItem('cit_origfile_'+docKey); }catch(e){}
  try{ localStorage.removeItem('cit_procfile_'+docKey); }catch(e){}
  logActivity(currentUser.id, `Deleted "${d.name}"`, '#ef4444');
  save(); renderAll(); toast(`Document "${d.name}" deleted.`);
}

/* ========================================================
   UPDATE STATUS MODAL
======================================================== */
function openUpdate(docKey){
  const d=docs.find(x=>(x.internalId||x.id)===docKey);
  if(!d)return;
  updateDocId=docKey;
  document.getElementById('upd-id').value   = d.fullDisplayId||d.displayId||d.id;
  document.getElementById('upd-name').value = d.name;
  document.getElementById('upd-status').value = d.status;
  document.getElementById('upd-note').value = '';
  document.getElementById('upd-location').value = '';
  document.getElementById('upd-handler').value  = '';
  document.getElementById('upd-processed-file').value = '';
  document.getElementById('upd-file-preview').style.display = 'none';
  document.getElementById('upd-release-warning').style.display = 'none';
  _updProcessedFileData = null;
  _updProcessedFileExt  = null;
  const existingEl = document.getElementById('upd-file-existing');
  if(d.processedFile){
    existingEl.style.display = 'flex';
    document.getElementById('upd-file-existing-label').textContent =
      'Processed file already attached' + (d.processedBy ? ' by ' + d.processedBy : '') + (d.processedAt ? ' - ' + d.processedAt : '');
    document.getElementById('upd-file-action-label').textContent = 'Replace Processed File (optional)';
  } else {
    existingEl.style.display = 'none';
    document.getElementById('upd-file-action-label').textContent = 'Upload Processed';
  }
  onUpdateStatusChange(d.status);
  openModal('update-modal');
}

let _updProcessedFileData = null;
let _updProcessedFileExt  = null;

function previewProcessedFile(input){
  const prev = document.getElementById('upd-file-preview');
  if(!input.files||!input.files[0]){
    if(prev) prev.style.display='none';
    return;
  }
  const file = input.files[0];
  if(file.size > 5*1024*1024){
    toast('File is too large. Max 5 MB.');
    input.value='';
    if(prev) prev.style.display='none';
    return;
  }
  const ext = '.'+file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();
  reader.onload = function(e){
    _updProcessedFileData = e.target.result;
    _updProcessedFileExt  = ext;
    const nameEl = document.getElementById('upd-file-preview-name');
    const sizeEl = document.getElementById('upd-file-preview-size');
    const stateEl = document.getElementById('upd-file-upload-state');
    if(nameEl) nameEl.textContent = file.name;
    if(sizeEl) sizeEl.textContent = '('+Math.round(file.size/1024)+' KB)';
    if(stateEl) stateEl.textContent = file.name;
    if(prev){
      prev.style.display = 'flex';
      prev.classList.add('show');
    }
    const warnEl = document.getElementById('upd-release-warning');
    if(warnEl) warnEl.style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function onUpdateStatusChange(status){
  const warn = document.getElementById('upd-release-warning');
  if(!warn) return;
  const d = docs.find(x=>(x.internalId||x.id)===updateDocId);
  const hasExisting = d && d.processedFile;
  if(status === 'Released' && !hasExisting && !_updProcessedFileData){
    warn.style.display = 'block';
  } else {
    warn.style.display = 'none';
  }
}

async function applyUpdate(){
  const d=docs.find(x=>(x.internalId||x.id)===updateDocId);
  if(!d)return;
  const newStatus = document.getElementById('upd-status').value;
  const note      = document.getElementById('upd-note').value.trim();
  const location  = document.getElementById('upd-location').value.trim();
  const handler   = document.getElementById('upd-handler').value.trim();

  if(newStatus === 'Released' && !d.processedFile && !_updProcessedFileData){
    document.getElementById('upd-release-warning').style.display = 'block';
    toast('Please upload the final/processed file before setting status to Released.');
    return;
  }

  let encFile = null;
  if(_updProcessedFileData){
    try{
      encFile = encryptFile(_updProcessedFileData, _updProcessedFileExt);
      d.processedFile    = encFile;
      d.processedFileExt = _updProcessedFileExt;
      d.processedBy      = currentUser.username;
      d.processedAt      = nowStr();
    } catch(e){
      console.error('[applyUpdate] Processed file encryption failed:', e);
      toast('File encryption failed. Please try again.');
      return;
    }
  }

  d.status=newStatus;
  if(!d.history) d.history=[];
  const histEntry = {
    action:'Status Update', status:newStatus, date:nowStr(),
    note: note + (_updProcessedFileData ? ' [Processed file attached]' : ''),
    by:currentUser.username, location, handler,
    hasProcessedFile: !!(d.processedFile)
  };
  d.history.push(histEntry);

  if (currentUser._backendMode && currentUser.token) {
    try {
      const jsonPayload = {
        status:           newStatus,
        note:             histEntry.note,
        location,
        handler,
        by:               currentUser.username,
        hasProcessedFile: !!(d.processedFile),
        processedFileExt: encFile ? _updProcessedFileExt : undefined
      };

      let result;
      if (encFile) {
        // -- FIX: use FormData for processed file to bypass body-parser limit --
        result = await apiUpdateStatusWithFile(
          d.internalId || d.id,
          jsonPayload,
          encFile,
          _updProcessedFileExt,
          currentUser.token
        );
      } else {
        result = await apiUpdateDocumentStatus(d.internalId || d.id, jsonPayload, currentUser.token);
      }

      if (result && result._error) {
        if (result.status === 404) {
          console.info('[applyUpdate] Doc not in backend yet, updated locally only.');
        } else {
          console.warn('[applyUpdate] Backend error:', result.message);
          toast('Status updated locally. Backend sync failed: ' + result.message);
        }
      }
    } catch(e) {
      console.error('[applyUpdate] API error:', e);
      toast('Status updated locally. Could not reach server.');
    }
  }

  // -- FIX: force-save processed file under the correct key immediately --
  if (encFile) {
    const key = d.internalId || d.id;
    try {
      localStorage.setItem('cit_procfile_' + key, JSON.stringify({
        data: encFile,
        ext:  _updProcessedFileExt || '',
        by:   currentUser.username,
        at:   d.processedAt || ''
      }));
    } catch(e) { console.warn('[applyUpdate] Could not persist processed file:', e.message); }
  }

  addNotification(d.ownerId,
    `Your document "${d.name}" status changed to <strong>${newStatus}</strong>` +
    (_updProcessedFileData ? ' - <strong>Final file attached</strong>' : '') +
    (location?' - '+location:'')+(handler?' - '+handler:'')+(note?' - '+note:''),
    d.internalId||d.id);
  logActivity(currentUser.id,
    `Updated "${d.name}" to ${newStatus}${_updProcessedFileData?' + processed file':''}${location?' @ '+location:''}${handler?' ('+handler+')':''}`,
    statusColor(newStatus));
  if(d.ownerId!==currentUser.id){
    logActivity(d.ownerId, `Document "${d.name}" status changed to ${newStatus}`, statusColor(newStatus));
  }
  _updProcessedFileData = null;
  _updProcessedFileExt  = null;
  save();renderAll();closeModal('update-modal');
  toast(`Status updated to "${newStatus}"${d.processedFile?' - Final file stored.':''}`);
}

/* ========================================================
   MOVEMENT LOGS
======================================================== */
function logMovement(documentId, handledBy, location){
  const entry={
    documentId, handledBy, location,
    action:'Movement',
    timestamp:   new Date().toISOString(),
    displayDate: nowStr()
  };
  movementLogs.push(entry);
  if(movementLogs.length>500) movementLogs=movementLogs.slice(-500);
  save();
  const d = docs.find(x=>(x.internalId||x.id)===documentId);
  if(currentUser){ logActivity(currentUser.id,`Movement logged for "${d?.name||documentId}" at ${location}`,'#f59e0b'); }
}

/* ── Movement log in-memory cache (populated from backend) ── */
let _movementLogsCache = [];

async function renderMovementLogs(){
  const term=(document.getElementById('movement-search')?.value||'').toLowerCase();
  const tb=document.getElementById('movement-tbody');
  if(!tb) return;

  /* Render whatever we have immediately (fast local paint) */
  _renderMovementLogsTable(term);

  /* Then fetch fresh data from backend */
  const token = (typeof getSavedToken === 'function') ? getSavedToken() : null;
  if(token && typeof apiGetAllMovementLogs === 'function'){
    try{
      const result = await apiGetAllMovementLogs(token);
      if(Array.isArray(result)){
        _movementLogsCache = result;
        /* Also merge into legacy movementLogs so history modal stays in sync */
        result.forEach(function(s){
          const key = (s.documentId||'') + '|' + (s.timestamp||s.displayDate||'');
          const exists = movementLogs.some(function(m){
            return ((m.documentId||'')+'|'+(m.timestamp||m.displayDate||'')) === key;
          });
          if(!exists){
            movementLogs.push({
              documentId:  s.documentId,
              handledBy:   s.handledBy,
              location:    s.location,
              action:      'Movement',
              timestamp:   s.timestamp,
              displayDate: s.displayDate || s.timestamp,
            });
          }
        });
        _renderMovementLogsTable(term);
        _renderMovementLogsStats();
      }
    } catch(e){
      console.warn('[renderMovementLogs] fetch failed:', e);
    }
  }
}

function _renderMovementLogsStats(){
  const statEl=document.getElementById('movement-stats-row');
  if(!statEl) return;
  const allLogs = _movementLogsCache.length ? _movementLogsCache : movementLogs;
  const totalMoves    = allLogs.length;
  const uniqueHandlers= new Set(allLogs.map(function(m){ return m.handledBy||m.handler||''; })).size;
  const uniqueDocs    = new Set(allLogs.map(function(m){ return m.documentId; })).size;
  statEl.innerHTML=
    '<div class="stat-card"><div class="stat-card-label">Total Movements</div><div class="stat-card-num blue">'+totalMoves+'</div></div>'+
    '<div class="stat-card"><div class="stat-card-label">Unique Handlers</div><div class="stat-card-num green">'+uniqueHandlers+'</div></div>'+
    '<div class="stat-card"><div class="stat-card-label">Docs Tracked</div><div class="stat-card-num">'+uniqueDocs+'</div></div>';
}

function _renderMovementLogsTable(term){
  const tb=document.getElementById('movement-tbody');
  if(!tb) return;

  /* Prefer backend cache; fall back to localStorage array */
  let source = _movementLogsCache.length ? _movementLogsCache : movementLogs;
  let entries=[...source].reverse();
  if(term) entries=entries.filter(function(m){
    return (m.documentId||'').toLowerCase().includes(term)||
      (m.handledBy||m.handler||'').toLowerCase().includes(term)||
      (m.location||'').toLowerCase().includes(term)||
      (m.documentName||'').toLowerCase().includes(term);
  });

  /* Refresh stats whenever table is painted */
  _renderMovementLogsStats();

  if(!entries.length){
    tb.innerHTML='<tr><td colspan="6"><div class="empty-msg">No movement logs yet. Movement entries are auto-created on document registration and status updates.</div></td></tr>';
    return;
  }
  tb.innerHTML=entries.map(function(m){
    const doc=docs.find(function(d){ return (d.internalId||d.id)===m.documentId; });
    const docName= m.documentName || (doc ? doc.name : '<span style="color:var(--muted);font-style:italic">Unknown</span>');
    const dispId = m.displayId || (doc ? (doc.fullDisplayId||doc.displayId||doc.id) : m.documentId);
    return '<tr>'+
      '<td style="font-size:11px;font-family:\'DM Mono\',monospace;color:var(--muted)">'+(m.displayDate||m.timestamp||'-')+'</td>'+
      '<td class="doc-id-cell">'+dispId+'</td>'+
      '<td class="doc-name-cell">'+docName+'</td>'+
      '<td style="font-size:13px;font-weight:500">'+(m.handledBy||m.handler||'-')+'</td>'+
      '<td><span style="font-size:12px;color:#16a34a">'+(m.location||'-')+'</span></td>'+
      '<td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:20px;font-size:11px;font-weight:700;color:#92400e">'+(m.action||'Movement')+'</span></td>'+
    '</tr>';
  }).join('');
}

function clearMovementLogs(){
  if(!confirm('Clear ALL movement logs? This cannot be undone.'))return;
  movementLogs=[];save();renderMovementLogs();toast('Movement logs cleared.');
}

/* ==================================================================
   SCAN LOGS (Admin only - auto-generated QR scan events)
   Separate from movement logs. Source: scan_logs MongoDB collection.
================================================================== */
let _scanLogsCache = [];

async function renderScanLogs(){
  const term=(document.getElementById('scanlogs-search')?.value||'').toLowerCase();
  const tb=document.getElementById('scanlogs-tbody');
  if(!tb) return;

  _renderScanLogsTable(term);

  const token = (typeof getSavedToken === 'function') ? getSavedToken() : null;
  if(token && typeof apiGetAllScanLogs === 'function'){
    try{
      const result = await apiGetAllScanLogs(token);
      if(Array.isArray(result)){
        _scanLogsCache = result;
        _renderScanLogsTable(term);
        _renderScanLogsStats();
      }
    } catch(e){
      console.warn('[renderScanLogs] fetch failed:', e);
    }
  }
}

function _renderScanLogsStats(){
  const statEl = document.getElementById('scanlogs-stats-row');
  if(!statEl) return;
  const total = _scanLogsCache.length;
  const uniqueDocs = new Set(_scanLogsCache.map(s => s.documentId)).size;
  const todayStr = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
  const todayCount = _scanLogsCache.filter(function(s){
    if(!s.timestamp) return false;
    return new Date(s.timestamp).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) === todayStr;
  }).length;
  statEl.innerHTML =
    '<div class="stat-card"><div class="stat-card-label">Total Scans</div><div class="stat-card-num blue">'+total+'</div></div>' +
    '<div class="stat-card"><div class="stat-card-label">Docs Scanned</div><div class="stat-card-num green">'+uniqueDocs+'</div></div>' +
    '<div class="stat-card"><div class="stat-card-label">Scans Today</div><div class="stat-card-num">'+todayCount+'</div></div>';
}

function _renderScanLogsTable(term){
  const tb = document.getElementById('scanlogs-tbody');
  if(!tb) return;
  let entries = [..._scanLogsCache];
  if(term) entries = entries.filter(function(s){
    return (s.documentId||'').toLowerCase().includes(term)||
      (s.displayId||'').toLowerCase().includes(term)||
      (s.documentName||'').toLowerCase().includes(term)||
      (s.location||'').toLowerCase().includes(term)||
      (s.handledBy||'').toLowerCase().includes(term);
  });
  if(!entries.length){
    tb.innerHTML = '<tr><td colspan="6"><div class="empty-msg">No QR scan events found. Scans are auto-logged when a QR code is scanned from any device.</div></td></tr>';
    return;
  }
  tb.innerHTML = entries.map(function(s){
    const doc = docs.find(function(d){ return (d.internalId||d.id) === s.documentId; });
    const dispId = s.displayId || (doc ? (doc.fullDisplayId||doc.displayId||doc.id) : s.documentId);
    const docName = s.documentName || (doc ? doc.name : '<span style="color:var(--muted);font-style:italic">Unknown</span>');
    const displayTime = s.displayDate || s.timestamp || '-';
    const statusLabel = s.docStatus || '';
    const statusHtml = statusLabel
      ? '<span class="badge badge-'+statusLabel.toLowerCase().replace(/\s+/g,'')+'" >'+statusLabel+'</span>'
      : '<span style="color:var(--muted)">-</span>';
    return '<tr>' +
      '<td style="font-size:11px;font-family:DM Mono,monospace;color:var(--muted);white-space:nowrap">'+displayTime+'</td>' +
      '<td class="doc-id-cell" title="'+s.documentId+'">'+dispId+'</td>' +
      '<td class="doc-name-cell">'+docName+'</td>' +
      '<td style="font-size:12px">'+(s.location||'-')+'</td>' +
      '<td>'+statusHtml+'</td>' +
      '<td style="font-size:11px;color:var(--muted)">'+(s.note||'Auto-logged')+'</td>' +
      '</tr>';
  }).join('');
}

async function refreshScanLogs(){
  toast('Refreshing scan logs...');
  await renderScanLogs();
  toast('Scan logs refreshed.');
}

/* ========================================================
   SCAN RESULT
======================================================== */
function renderScanResult(d){
  const sc=statusColorMap[d.status]||'#64748b';
  const office=docOffice(d.type);
  const workflow=['Received','Processing','For Approval','Approved','Released'];
  const curIdx=workflow.indexOf(d.status);
  const isRejected=d.status==='Rejected';
  const isReleased=d.status==='Released';
  const lastLoc=getLatestLocation(d);

  const wfDots=isRejected
    ?`<div style="text-align:center;padding:16px 0;color:#f87171;font-size:13px;font-weight:600">Document Rejected</div>`
    :workflow.map((s,i)=>{
        const done=curIdx>i,curr=curIdx===i;
        const bg=curr?sc:done?'#22c55e22':'rgba(255,255,255,.04)';
        const bc=curr?sc:done?'#22c55e55':'rgba(255,255,255,.08)';
        const tc=curr?'#fff':done?'#22c55e':'rgba(255,255,255,.2)';
        const icon=done?'OK':curr?'*':i+1;
        return `${i>0?`<div style="flex:1;height:2px;background:${done?'#22c55e33':'rgba(255,255,255,.06)'};margin-top:13px;min-width:8px"></div>`:''}<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:44px"><div style="width:26px;height:26px;border-radius:50%;background:${bg};border:2px solid ${bc};color:${tc};display:grid;place-items:center;font-size:11px;font-weight:700${curr?';box-shadow:0 0 10px '+sc+'66':''}">${icon}</div><span style="font-size:9px;color:${done||curr?tc:'rgba(255,255,255,.2)'};font-weight:${curr?700:500};white-space:nowrap;text-align:center">${s}</span></div>`;
      }).join('');

  const relEntry=[...(d.history||[])].reverse().find(h=>h.status==='Released');
  const statusEntries=[...(d.history||[])].filter(h=>h.action==='Status Update'||h.action==='Movement'||!h.action).map(h=>({_type:h.action==='Movement'?'movement':'status',status:h.status||'',by:h.by||'-',date:h.date||'',location:h.location||'',handler:h.handler||'',note:h.note||''}));
  const scanMovements=movementLogs.filter(m=>m.documentId===(d.internalId||d.id)).map(m=>({_type:'movement',status:'',by:m.handledBy||'-',date:m.displayDate||m.timestamp,location:m.location||'',handler:'',note:''}));
  const allHist=[...statusEntries,...scanMovements].sort((a,b)=>{const da=new Date(a.date),db=new Date(b.date);if(isNaN(da)||isNaN(db))return 0;return da-db;});
  const hist=[...allHist].reverse();

  const histHtml=hist.length===0?'<p style="font-size:12px;color:rgba(255,255,255,.3)">No history recorded.</p>'
    :hist.map(h=>{
        const isMovement=h._type==='movement';
        const dc=statusColorMap[h.status]||'#4ade80';
        const aLabel=isMovement?'Movement':'Status Update';
        const aBg=isMovement?'rgba(245,158,11,.12)':'rgba(59,130,246,.12)';
        const aColor=isMovement?'#f59e0b':'#93c5fd';
        const aBorder=isMovement?'rgba(245,158,11,.25)':'rgba(59,130,246,.25)';
        return `<div style="display:flex;gap:10px;margin-bottom:14px;align-items:flex-start">
          <div style="width:10px;height:10px;border-radius:50%;background:${isMovement?'#f59e0b':dc};flex-shrink:0;margin-top:4px"></div>
          <div style="flex:1">
            <div style="display:inline-flex;align-items:center;padding:2px 8px;background:${aBg};border:1px solid ${aBorder};border-radius:20px;font-size:9px;font-weight:700;color:${aColor};letter-spacing:.4px;text-transform:uppercase;margin-bottom:4px">${aLabel}</div>
            <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.85)">${isMovement?'Handled by '+h.by:(h.status||'-')}</div>
            <div style="font-size:10px;color:rgba(255,255,255,.35);margin-top:2px">${isMovement?'':('By '+h.by+' - ')}${h.date}</div>
            ${h.location?`<div style="font-size:10px;color:rgba(74,222,128,.6);margin-top:2px">${h.location}${h.handler?' - '+h.handler:''}</div>`:''}
            ${h.note?`<div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:4px;padding:6px 10px;background:rgba(255,255,255,.04);border-radius:5px;font-style:italic">"${h.note}"</div>`:''}
          </div>
        </div>`;
      }).join('');

  const encAuditHtml=(d.history||[]).map(h=>{
    const entry=`${h.date}|${h.by}|${h.action||'Status Update'}|${h.status||''}|${h.location||''}|${h.handler||''}|${h.note||''}`;
    const cipher=IDEA.encrypt(entry,KEY);
    return `<div style="background:rgba(0,0,0,.25);border:1px solid rgba(74,222,128,.08);border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="font-family:'DM Mono',monospace;font-size:10px;color:rgba(74,222,128,.5);word-break:break-all;line-height:1.6">${cipher}</div>
      <div style="font-size:10px;color:rgba(255,255,255,.2);margin-top:5px">${h.date} - ${h.action||'Status Update'} - IDEA-128</div>
    </div>`;
  }).join('');

  const hasOriginal  = docHasOriginalFile(d);
  const hasProcessed = docHasProcessedFile(d);
  let fileSection = '';

  if (hasOriginal || hasProcessed) {
    fileSection = `<div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.06)">
      <div style="font-size:9px;font-weight:700;color:rgba(74,222,128,.35);letter-spacing:.8px;text-transform:uppercase;margin-bottom:12px">Document Files - IDEA-128 Encrypted at Rest</div>`;

    if (hasOriginal) {
      fileSection += `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;margin-bottom:10px">
          <div style="width:32px;height:32px;background:rgba(255,255,255,.05);border-radius:7px;display:grid;place-items:center;flex-shrink:0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.6)">Original File <span style="font-weight:400;font-size:10px;color:rgba(255,255,255,.3)">(Submitted by user)</span></div>
            <div style="font-size:10px;color:rgba(255,255,255,.25);margin-top:2px">IDEA-128 encrypted - Reference copy - Not downloadable</div>
          </div>
          <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,.3);padding:2px 8px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px">Reference</span>
        </div>`;
    }

    if (hasProcessed && isReleased) {
      fileSection += `
        <div style="margin-top:10px;text-align:center;padding:16px 0">
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:8px;margin-bottom:16px">
            <div style="width:32px;height:32px;background:rgba(34,197,94,.15);border-radius:7px;display:grid;place-items:center;flex-shrink:0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div style="flex:1;text-align:left">
              <div style="font-size:12px;font-weight:700;color:#22c55e">Final File <span style="font-weight:400;font-size:10px">(Admin-approved)</span></div>
              <div style="font-size:10px;color:rgba(74,222,128,.5);margin-top:1px">Processed by ${d.processedBy||'Admin'}${d.processedAt?' - '+d.processedAt:''}</div>
            </div>
            <span style="font-size:9px;font-weight:700;color:#22c55e;padding:2px 8px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:20px">Released OK</span>
          </div>
          <button onclick="decryptAndDownload('${d.internalId||d.id}',this)"
             style="display:inline-flex;align-items:center;gap:8px;padding:12px 28px;background:#22c55e;color:#0d1117;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .15s">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download File
          </button>
          <p style="font-size:10px;color:rgba(255,255,255,.2);margin-top:10px">Decrypted locally using IDEA-128 on authorized download</p>
        </div>`;
    } else if (hasProcessed && !isReleased) {
      fileSection += `
        <div style="margin-top:10px;padding:14px;background:rgba(34,197,94,.05);border:1px solid rgba(34,197,94,.15);border-radius:8px;text-align:center">
          <p style="font-size:12px;font-weight:600;color:rgba(74,222,128,.7);margin-bottom:4px">Final File Attached - Awaiting Release</p>
          <p style="font-size:11px;color:rgba(255,255,255,.3)">Admin has uploaded the processed file. Download available once status is <strong style="color:rgba(74,222,128,.6)">Released</strong>.</p>
        </div>`;
    } else {
      fileSection += `
        <div style="margin-top:10px;text-align:center;padding:16px 0">
          <div style="width:44px;height:44px;margin:0 auto 12px;background:rgba(255,255,255,.04);border:2px solid rgba(255,255,255,.08);border-radius:50%;display:grid;place-items:center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <p style="font-size:12px;color:rgba(255,255,255,.5);font-weight:600;margin-bottom:5px">Final File Pending</p>
          <p style="font-size:11px;color:rgba(255,255,255,.3);line-height:1.6">Admin will upload the processed file before releasing. Available once status reaches <strong style="color:rgba(74,222,128,.7)">Released</strong>.</p>
          <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px;font-size:11px;color:rgba(255,255,255,.35);margin-top:12px">
            Current: <strong style="color:${sc};margin-left:4px">${d.status}</strong>
          </div>
        </div>`;
    }

    fileSection += '</div>';
  }

  document.getElementById('scan-result-body').innerHTML=`
    <div style="background:radial-gradient(ellipse at 50% 0%,#1a3d22,#0d1a10 70%);padding:22px 20px 18px;text-align:center;border-bottom:1px solid rgba(255,255,255,.06)">
      <div style="font-size:20px;font-weight:700;color:#e6edf3;margin-bottom:3px">${d.name}</div>
      <div style="font-size:11px;color:rgba(255,255,255,.35);font-family:'DM Mono',monospace;margin-bottom:12px">${d.fullDisplayId||d.displayId||d.id} - ${d.type}</div>
      <div style="display:inline-flex;align-items:center;gap:7px;padding:7px 16px;border-radius:99px;font-size:13px;font-weight:700;background:${sc}22;border:1px solid ${sc}55;color:${sc}">
        <span style="width:7px;height:7px;border-radius:50%;background:${sc}"></span>${d.status}
      </div>
    </div>
    ${lastLoc.location||lastLoc.handler?`
    <div style="padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(74,222,128,.04);display:flex;gap:16px;flex-wrap:wrap">
      ${lastLoc.location?`<div style="display:flex;align-items:center;gap:6px;font-size:12px"><span style="color:rgba(74,222,128,.5)">Location</span><span style="color:rgba(255,255,255,.8);font-weight:600">${lastLoc.location}</span></div>`:''}
      ${lastLoc.handler?`<div style="display:flex;align-items:center;gap:6px;font-size:12px"><span style="color:rgba(74,222,128,.5)">Handled By</span><span style="color:rgba(255,255,255,.8);font-weight:600">${lastLoc.handler}</span></div>`:''}
    </div>`:``}
    <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.06)">
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-bottom:16px">${wfDots}</div>
      ${[['Submitted By',d.by],['Purpose',d.purpose],['Assigned Office',office],['Priority',d.priority||'Normal'],['Date Filed',d.date],['Release Date',relEntry?`<span style="color:#4ade80">${relEntry.date}</span>`:'<span style="color:rgba(255,255,255,.25)">Pending</span>']].map(([l,v])=>`
        <div style="display:flex;gap:10px;margin-bottom:9px;font-size:12px">
          <span style="color:rgba(255,255,255,.3);width:96px;flex-shrink:0">${l}</span>
          <span style="color:rgba(255,255,255,.8)">${v}</span>
        </div>`).join('')}
    </div>
    <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.06)">
      <div style="font-size:9px;font-weight:700;color:rgba(255,255,255,.25);letter-spacing:.8px;text-transform:uppercase;margin-bottom:12px">Status History</div>
      ${histHtml}
    </div>
    ${fileSection}
    <div style="padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.06)">
      <div style="font-size:9px;font-weight:700;color:rgba(74,222,128,.35);letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px">Full Audit Trail (IDEA Encrypted)</div>
      ${encAuditHtml||'<p style="font-size:11px;color:rgba(255,255,255,.2)">No audit entries.</p>'}
    </div>
    <div style="padding:16px 18px">
      <div style="font-size:9px;font-weight:700;color:rgba(74,222,128,.35);letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px">IDEA Encryption Proof</div>
      <div style="background:rgba(0,0,0,.3);border:1px solid rgba(74,222,128,.1);border-radius:8px;padding:12px 14px">
        ${[['Key','Group6CITKey2024'],['Algorithm','IDEA - 128-bit - 8 Rounds'],['Encrypted',d.enc.slice(0,28)+'…'],['Decrypted',IDEA.decrypt(d.enc,KEY)]].map(([l,v])=>`
          <div style="display:flex;gap:8px;margin-bottom:7px;font-size:10px;font-family:'DM Mono',monospace">
            <span style="color:rgba(74,222,128,.35);width:68px;flex-shrink:0">${l}</span>
            <span style="color:rgba(74,222,128,.7);word-break:break-all">${v}</span>
          </div>`).join('')}
      </div>
      <p style="font-size:10px;color:rgba(255,255,255,.2);text-align:center;margin-top:16px">CIT Document Tracker - IDEA Encryption - Group 6</p>
    </div>`;
}

/* ========================================================
   HISTORY MODAL
======================================================== */
function openHistory(docKey){
  const d=docs.find(x=>(x.internalId||x.id)===docKey);
  if(!d)return;
  document.getElementById('hist-name').textContent=d.name;
  document.getElementById('hist-id').textContent=d.fullDisplayId||d.displayId||d.id;

  const hasOrig = docHasOriginalFile(d);
  const hasProc = docHasProcessedFile(d);
  const fileEl  = document.getElementById('hist-file-section');
  if(fileEl){
    if(!hasOrig && !hasProc){
      fileEl.innerHTML = '';
    } else {
      const sc = statusColorMap[d.status] || '#64748b';
      let fHtml = `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:4px">
        <div style="padding:8px 14px;background:var(--surface);border-bottom:1px solid var(--border);font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.6px">Attached Files</div>`;

      if(hasOrig){
        fHtml += `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px${hasProc?';border-bottom:1px solid var(--border)':''}">
          <div style="width:32px;height:32px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:7px;display:grid;place-items:center;flex-shrink:0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text)">Original File <span style="font-size:10px;font-weight:400;color:var(--muted)">(submitted at registration)</span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">Encrypted with IDEA-128 - Stored securely - Reference copy</div>
          </div>
          <button onclick="closeModal('history-modal');viewFile('${d.internalId||d.id}','original',this)"
            style="padding:5px 12px;background:#eff6ff;color:#3b82f6;border:1px solid #bfdbfe;border-radius:7px;font-family:var(--sans);font-size:12px;font-weight:700;cursor:pointer;">
            View
          </button>
        </div>`;
      }

      if(hasProc){
        const isReleased = d.status === 'Released';
        fHtml += `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px">
          <div style="width:32px;height:32px;background:${isReleased?'#f0fdf4':'#f8fafc'};border:1px solid ${isReleased?'#bbf7d0':'var(--border)'};border-radius:7px;display:grid;place-items:center;flex-shrink:0">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${isReleased?'#16a34a':'#94a3b8'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:600;color:var(--text)">Final File <span style="font-size:10px;font-weight:400;color:var(--muted)">(processed by ${d.processedBy||'admin'})</span></div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">${isReleased ? 'Ready to view & download' : 'Awaiting release'} - IDEA-128 encrypted</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button onclick="closeModal('history-modal');viewFile('${d.internalId||d.id}','processed',this)"
              style="padding:5px 12px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:7px;font-family:var(--sans);font-size:12px;font-weight:700;cursor:pointer;">
              View
            </button>
            ${isReleased
              ? `<button onclick="closeModal('history-modal');decryptAndDownload('${d.internalId||d.id}',this)"
                  style="padding:5px 12px;background:#16a34a;color:#fff;border:none;border-radius:7px;font-family:var(--sans);font-size:12px;font-weight:700;cursor:pointer">
                  Download
                 </button>`
              : `<span style="font-size:10px;font-weight:700;color:${sc};padding:3px 10px;background:${sc}18;border:1px solid ${sc}44;border-radius:20px;display:inline-flex;align-items:center">${d.status}</span>`
            }
          </div>
        </div>`;
      } else if(hasOrig){
        fHtml += `<div style="padding:8px 14px;background:#fffbeb;border-top:1px solid #fde68a">
          <p style="font-size:11px;color:#92400e;margin:0">
            <strong>Waiting for admin</strong> to upload the final/processed version before this document can be released.
            Current status: <strong style="color:${sc}">${d.status}</strong>
          </p>
        </div>`;
      }

      fHtml += '</div>';
      fileEl.innerHTML = fHtml;
    }
  }

  const tl=document.getElementById('hist-timeline');
  const statusEntries=(d.history||[]).filter(h=>h.action==='Status Update'||h.action==='Movement'||!h.action).map(h=>({type:h.action==='Movement'?'movement':'status',action:h.action||'Status Update',status:h.status||'',by:h.by||'-',date:h.date||'',location:h.location||'',handler:h.handler||'',note:h.note||''}));
  const scanEntries=movementLogs.filter(m=>m.documentId===(d.internalId||d.id)).map(m=>({type:'movement',action:'Movement',status:'',by:m.handledBy||'-',date:m.displayDate||m.timestamp,location:m.location||'',handler:'',note:''}));
  const allEntries=[...statusEntries,...scanEntries].sort((a,b)=>{const da=new Date(a.date),db=new Date(b.date);if(isNaN(da)||isNaN(db))return 0;return da-db;});
  if(!allEntries.length){tl.innerHTML='<p style="font-size:13px;color:var(--muted)">No history yet.</p>';}
  else tl.innerHTML=allEntries.map((e,i)=>{
    const isScan=e.type==='movement';
    const actionClass=isScan?'hist-action-movement':'hist-action-status';
    const actionLabel=isScan?'Movement':'Status Update';
    return `<div class="hist-entry">
      <div class="hist-entry-content">
        <div class="hist-entry-action ${actionClass}">${actionLabel}</div>
        <div class="hist-entry-title">${isScan?`Handled by <strong>${e.by}</strong>`:`Status &rarr; ${statusBadge(e.status)}`}</div>
        <div class="hist-entry-meta">${isScan?'':'By '+e.by+' &nbsp;-&nbsp; '}${e.date}</div>
        ${e.location?`<div class="hist-entry-loc">${e.location}${e.handler?' &nbsp;-&nbsp; '+e.handler:''}</div>`:''}
        ${!isScan&&e.handler&&!e.location?`<div class="hist-entry-loc">${e.handler}</div>`:''}
        ${e.note?`<div class="hist-entry-note">"${e.note}"</div>`:''}
      </div>
    </div>`;
  }).join('');
  openModal('history-modal');
}

/* ========================================================
   NOTIFICATIONS  — backend-driven, no localStorage
======================================================== */

/* In-memory cache of notifications fetched from backend */
let _notifsCache = [];

/* addNotification is kept as a no-op shim so legacy calls
   inside applyUpdate / logMovement don't throw errors.
   Real notifications are now created by the backend. */
function addNotification(userId, msg, documentId){ /* no-op: backend creates notifications */ }

async function _fetchNotifications(){
  if(!currentUser || !currentUser.token) return;
  try{
    const result = await apiGetNotifications(currentUser.token);
    if(Array.isArray(result)){
      _notifsCache = result;
    }
  } catch(e){
    console.warn('[_fetchNotifications]', e);
  }
}

async function renderNotifCount(){
  if(!currentUser) return;
  /* Fetch fresh count from backend */
  await _fetchNotifications();
  const unread = _notifsCache.filter(function(n){ return !n.read; }).length;
  const el = document.getElementById('notif-count');
  if(!el) return;
  if(unread){ el.textContent = unread; el.style.display = ''; }
  else el.style.display = 'none';
}

async function openNotifModal(){
  /* Fetch fresh list from backend before opening */
  await _fetchNotifications();

  const nl = document.getElementById('notif-list');
  if(!nl) return;

  if(!_notifsCache.length){
    nl.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:8px 0">No notifications.</p>';
  } else {
    nl.innerHTML = _notifsCache.map(function(n){
      return '<div class="notif-item '+(n.read?'read':'')+'" onclick="handleNotifClick(\''+n.id+'\')">'+
        '<div class="notif-item-dot"></div>'+
        '<div>'+
          '<div class="notif-item-text">'+n.msg+'</div>'+
          '<div class="notif-item-time">'+n.date+'</div>'+
          (n.documentId ? '<div class="notif-item-link">→ View Document</div>' : '')+
        '</div>'+
      '</div>';
    }).join('');
  }

  openModal('notif-modal');
  /* Mark all as read on the backend after a short delay */
  setTimeout(markAllRead, 1500);
}

async function handleNotifClick(id){
  /* Mark single notification read locally */
  const n = _notifsCache.find(function(x){ return x.id === id; });
  if(!n) return;
  n.read = true;
  renderNotifCount();
  if(n.documentId){ openDocumentFromNotif(n.documentId); }
}

async function markAllRead(){
  if(!currentUser || !currentUser.token) return;
  try{
    await apiMarkNotificationsRead(currentUser.token);
    _notifsCache.forEach(function(n){ n.read = true; });
  } catch(e){ console.warn('[markAllRead]', e); }
  const el = document.getElementById('notif-count');
  if(el) el.style.display = 'none';
  document.querySelectorAll('.notif-item').forEach(function(el){ el.classList.add('read'); });
}
function openDocumentFromNotif(documentId){
  const doc=docs.find(d=>(d.internalId||d.id)===documentId);
  if(!doc){toast('Document not found.');return;}
  closeModal('notif-modal');
  showPage('vault',document.getElementById('nav-vault'));
  setTimeout(()=>openHistory(documentId),150);
}

/* ========================================================
   SETTINGS
======================================================== */
function changePassword(){
  const cur=document.getElementById('cur-pass').value;
  const np=document.getElementById('new-pass').value;
  const conf=document.getElementById('conf-pass').value;
  if(!cur||!np||!conf){toast('Please fill all password fields.');return;}
  if(currentUser.password!==cur){toast('Current password is incorrect.');return;}
  if(np.length<4){toast('New password must be at least 4 characters.');return;}
  if(np!==conf){toast('New passwords do not match.');return;}
  currentUser.password=np;
  const acc=accounts.find(a=>a.id===currentUser.id);
  if(acc) acc.password=np;
  logActivity(currentUser.id,'Password changed','#f59e0b');
  save();
  ['cur-pass','new-pass','conf-pass'].forEach(id=>document.getElementById(id).value='');
  toast('Password updated. Signing out…');
  setTimeout(()=>logout(),1500);
}

/* ========================================================
   IDEA DEMO
======================================================== */
function runDemo(){
  const key=document.getElementById('demo-key').value||KEY;
  const msg=document.getElementById('demo-msg').value||'Hello CIT!';
  const enc=IDEA.encrypt(msg,key), dec=IDEA.decrypt(enc,key);
  document.getElementById('d-orig').textContent=msg;
  document.getElementById('d-enc').textContent=enc;
  document.getElementById('d-dec').textContent=dec;
  document.getElementById('demo-result').style.display='block';
  toast('Encryption demo complete.');
}

/* ========================================================
   MODAL HELPERS
======================================================== */
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  /* Clean up dynamic preview so it doesn't flash stale content next open */
  if(id === 'file-modal'){
    const prev = document.getElementById('file-modal-preview');
    if(prev) prev.remove();
    const dlBtn = document.getElementById('file-modal-dl-btn');
    if(dlBtn){ dlBtn.style.display='none'; dlBtn.onclick=null; }
  }
}
document.querySelectorAll('.overlay').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('open');}));

/* ========================================================
   TOAST
======================================================== */
let toastTimer;
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

/* ========================================================
   INIT
======================================================== */
load();

const styleEl=document.createElement('style');
styleEl.textContent='@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}';
document.head.appendChild(styleEl);

const notifBtn=document.getElementById('notif-btn');
if(notifBtn) notifBtn.onclick = function(){ openNotifModal(); };

/* ── _updateTopNavForLoggedIn ──────────────────────────────────────────
   Called on the public tracking page (?track=xxx) when a user is already
   logged in (session restored from localStorage) or has just signed in.
   enterApp() is NOT called on the track page (it would switch to app view),
   so we update only the topnav to show who is logged in and provide a
   Sign Out button. This runs on both desktop and mobile.
──────────────────────────────────────────────────────────────────────── */
function _updateTopNavForLoggedIn() {
  if (!currentUser) return;
  var navRight = document.getElementById('nav-right');
  if (!navRight) return;
  var color   = currentUser.color || '#4ade80';
  var label   = currentUser.name  || currentUser.username || 'User';
  var initStr = initials(label);
  navRight.innerHTML =
    '<div style="display:flex;align-items:center;gap:8px">' +
      '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';' +
        'display:grid;place-items:center;font-size:11px;font-weight:700;color:#0d1117;' +
        'flex-shrink:0">' + initStr + '</div>' +
      '<span style="font-size:13px;color:rgba(255,255,255,.78);font-weight:500;' +
        'max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + label + '</span>' +
      '<button class="btn-signin" onclick="logout()" ' +
        'style="padding:5px 12px;font-size:12px">Sign Out</button>' +
    '</div>';
}

async function _appInit() {
  /*
   * FIX (Issue 2 — Auth persistence):
   * tryRestoreSession() MUST be called before initTrackingPage() so that
   * currentUser is populated when the ?track= page is loaded.
   * Previously, _appInit returned early from initTrackingPage() without
   * ever calling tryRestoreSession(), so currentUser was always null on the
   * public tracking page — breaking server-side ownership checks and the
   * admin panel on the track card.
   */
  await tryRestoreSession();

  if(initTrackingPage()){
    /* Session is restored and we are on the public ?track= page.
       enterApp() is deliberately NOT called here (it would hide the public view).
       Instead, update only the topnav to reflect the logged-in user.
       This fixes the "Sign In buttons still visible after login" bug on both
       desktop and mobile browsers. */
    if (currentUser) _updateTopNavForLoggedIn();
    return;
  }

  if(!accounts.find(a=>a.role==='admin')){
    const adminAcc={id:'USR-ADMIN0',username:'admin',name:'System Admin',password:'admin1234',role:'admin',color:'#fb923c',created:nowStr()};
    accounts.unshift(adminAcc);
    notifications['USR-ADMIN0']=[];
    activityLogs['USR-ADMIN0']=[];
    save();
  }

  /* tryRestoreSession() was already called above — use currentUser directly */
  const restored = !!currentUser;

  if(restored && currentUser){
    const token = getSavedToken();

    if(token && currentUser._backendMode){
      const isAdmin   = currentUser.role === 'admin';
      const ownerId   = currentUser.id || currentUser.userId;
      const backendDocs = await apiGetAllDocuments(token, isAdmin ? null : ownerId, currentUser.role);

      if(Array.isArray(backendDocs)){
        backendDocs.forEach(bd => {
          const localIdx = docs.findIndex(d => (d.internalId||d.id) === bd.internalId);
          if(localIdx >= 0){
            const local = docs[localIdx];

            // -- FIX: determine file presence from LOCAL state first.
            //    The backend list endpoint never returns raw fileData (too large),
            //    so we MUST trust what is already in localStorage / memory.
            const hasLocalOrig = !!(local.originalFile || local.fileData);
            const hasLocalProc = !!(local.processedFile);

            docs[localIdx] = {
              ...bd,
              id:               bd.internalId,
              // Always prefer locally-cached file blobs over backend (backend won't send them)
              originalFile:     local.originalFile    || bd.originalFile    || null,
              processedFile:    local.processedFile   || bd.processedFile   || null,
              fileData:         local.fileData        || bd.fileData        || null,
              originalFileExt:  local.originalFileExt || bd.originalFileExt || null,
              processedFileExt: local.processedFileExt|| bd.processedFileExt|| null,
              processedBy:      bd.processedBy        || local.processedBy  || null,
              processedAt:      bd.processedAt        || local.processedAt  || null,
              // -- KEY FIX: once we know a file exists locally, never downgrade to false --
              hasOriginalFile:  hasLocalOrig
                                  ? true
                                  : (bd.hasOriginalFile ?? local.hasOriginalFile ?? false),
              hasProcessedFile: hasLocalProc
                                  ? true
                                  : (bd.hasProcessedFile ?? local.hasProcessedFile ?? false),
            };
          } else {
            docs.push({ ...bd, id: bd.internalId });
          }
        });
        const backendIds = new Set(backendDocs.map(d => d.internalId));
        docs = docs.filter(d => !d._backendSynced || backendIds.has(d.internalId||d.id));
        save();
      }

      /* Fetch admin movement logs from backend so Movement Logs page
         shows entries from ALL sessions/devices */
      if (isAdmin) {
        try {
          const backendMovements = await apiGetAllMovementLogs(token);
          if (Array.isArray(backendMovements) && backendMovements.length > 0) {
            const localKeys = new Set(
              movementLogs.map(m => (m.documentId || '') + '|' + (m.timestamp || m.displayDate || ''))
            );
            backendMovements.forEach(s => {
              const key = (s.documentId || '') + '|' + (s.timestamp || s.displayDate || '');
              if (!localKeys.has(key)) {
                movementLogs.push({
                  documentId:  s.documentId,
                  handledBy:   s.handledBy,
                  location:    s.location,
                  action:      'Movement',
                  timestamp:   s.timestamp,
                  displayDate: s.displayDate || s.timestamp,
                });
                localKeys.add(key);
              }
            });
            movementLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            save();
          }
        } catch(e) {
          console.warn('[_appInit] Could not fetch backend movement logs:', e);
        }
      }
    } else if(!token) {
      _seedDemoDocsIfEmpty();
    }

    enterApp();
    return;
  }

  _seedDemoDocsIfEmpty();
}

function _seedDemoDocsIfEmpty(){
  if(docs.length > 0) return;
  let demoUser=accounts.find(a=>a.role==='user');
  if(!demoUser){
    demoUser={id:genUID(),username:'juandelacruz',name:'Juan dela Cruz',password:'pass1234',role:'user',color:'#60a5fa',created:nowStr()};
    accounts.push(demoUser);
    notifications[demoUser.id]=[];
    activityLogs[demoUser.id]=[];
  }
  const seedDocs=[
    ['Enrollment Form','Academic','Juan dela Cruz','2nd Semester Enrollment','Processing','Normal','Registrar\'s Office','Staff A'],
    ['Laboratory Request','Laboratory','Maria Santos','Lab Equipment Request','For Approval','High','Dean\'s Office','Prof. B'],
    ['Certificate of Registration','Academic','Pedro Reyes','COR for Scholarship','Released','Normal','Document Control Office',''],
    ['Leave of Absence Form','Administrative','Ana Reyes','Medical Reason','Approved','Low','Administrative Office','Staff C'],
    ['Scholarship Application','Financial','Carlos Tan','Merit Scholarship','Pending','Urgent','Accounting Office','Staff D'],
  ];
  seedDocs.forEach(([name,type,by,purpose,status,priority,location,handler])=>{
    const ids=genDocIds();
    const enc=IDEA.encrypt(name,KEY);
    docs.push({
      id:ids.internalId,internalId:ids.internalId,displayId:ids.displayId,
      verifyCode:ids.verifyCode,fullDisplayId:ids.fullDisplayId,
      name,type,by,purpose,date:nowStr(),status,enc,
      ownerId:demoUser.id,ownerName:demoUser.username,
      priority,due:null,originalFile:null,processedFile:null,
      history:[{action:'Status Update',status,date:nowStr(),note:'Initial seed',by:'system',location,handler}]
    });
  });
  logActivity(demoUser.id,'System initialized with demo documents','#4ade80');
  save();
}

_appInit();
/* ================================================================
   FEATURE 1 — GLOBAL SEARCH
   Searches docs by ID, name, status, type. Dropdown results.
   Click → opens document history modal via vault page.
================================================================ */
function initGlobalSearch() {
  const input = document.getElementById('global-search-input');
  if (!input) return;
  input.addEventListener('input', _debounceSearch);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { closeSearchResults(); input.blur(); }
    if (e.key === 'Enter') {
      const first = document.querySelector('.gsearch-item');
      if (first) first.click();
    }
  });
  document.addEventListener('click', function(e) {
    if (!e.target.closest('#global-search-wrap')) closeSearchResults();
  });
}

let _gsearchTimer = null;
function _debounceSearch() {
  clearTimeout(_gsearchTimer);
  _gsearchTimer = setTimeout(doGlobalSearch, 180);
}

function doGlobalSearch() {
  const q = (document.getElementById('global-search-input')?.value || '').trim().toLowerCase();
  const resultsEl = document.getElementById('global-search-results');
  if (!resultsEl) return;
  if (!q || q.length < 1) { closeSearchResults(); return; }

  const isAdmin = currentUser && currentUser.role === 'admin';
  const pool = isAdmin ? docs : docs.filter(function(d){ return d.ownerId === currentUser.id; });

  const matches = pool.filter(function(d) {
    return (d.fullDisplayId || d.displayId || d.id || '').toLowerCase().includes(q) ||
           (d.name   || '').toLowerCase().includes(q) ||
           (d.status || '').toLowerCase().includes(q) ||
           (d.type   || '').toLowerCase().includes(q) ||
           (d.by     || '').toLowerCase().includes(q);
  }).slice(0, 8);

  if (!matches.length) {
    resultsEl.innerHTML = '<div class="gsearch-empty">No results found for "' + q + '"</div>';
    resultsEl.classList.add('open');
    return;
  }

  resultsEl.innerHTML = matches.map(function(d) {
    const docKey = d.internalId || d.id;
    return '<div class="gsearch-item" onclick="openSearchResult(\'' + docKey + '\')">' +
      '<div class="gsearch-item-icon">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
      '</div>' +
      '<div class="gsearch-item-info">' +
        '<div class="gsearch-item-name">' + d.name + '</div>' +
        '<div class="gsearch-item-meta">' + (d.fullDisplayId || d.displayId || d.id) + ' &nbsp;·&nbsp; ' + (d.type || '') + (isAdmin ? ' &nbsp;·&nbsp; ' + (d.ownerName || '') : '') + '</div>' +
      '</div>' +
      statusBadge(d.status) +
    '</div>';
  }).join('');
  resultsEl.classList.add('open');
}

function closeSearchResults() {
  const el = document.getElementById('global-search-results');
  if (el) el.classList.remove('open');
}

function openSearchResult(docKey) {
  closeSearchResults();
  const inp = document.getElementById('global-search-input');
  if (inp) inp.value = '';
  closeAllActionMenus();
  showPage('vault', document.getElementById('nav-vault'));
  setTimeout(function(){ openHistory(docKey); }, 160);
}

/* ================================================================
   FEATURE 2 — USER OVERVIEW PANEL  (admin only)
   Shows totals, active count, recently added users.
================================================================ */
function renderUserOverview() {
  const el   = document.getElementById('user-overview-body');
  const card = document.getElementById('card-user-overview');
  if (!el || !card) return;

  const isAdmin = currentUser && currentUser.role === 'admin';
  card.style.display = isAdmin ? '' : 'none';
  if (!isAdmin) return;

  const users = accounts.filter(function(a){ return a.role !== 'admin'; });
  const total = users.length;

  // Active = logged an activity in the last 7 days
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const active = users.filter(function(u) {
    var logs = activityLogs[u.id] || [];
    return logs.some(function(l) {
      try { return (nowMs - new Date(l.date).getTime()) < sevenDaysMs; } catch(e){ return false; }
    });
  }).length;

  // New = created this calendar month
  const now = new Date();
  const newThisMonth = users.filter(function(u) {
    if (!u.created) return false;
    try {
      var d = new Date(u.created);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    } catch(e){ return false; }
  }).length;

  const recentUsers = users.slice().reverse().slice(0, 5);

  el.innerHTML =
    '<div class="user-ov-stats">' +
      '<div class="user-ov-stat"><div class="user-ov-stat-num">' + total + '</div><div class="user-ov-stat-label">TOTAL</div></div>' +
      '<div class="user-ov-stat"><div class="user-ov-stat-num" style="color:#4ade80">' + active + '</div><div class="user-ov-stat-label">ACTIVE</div></div>' +
      '<div class="user-ov-stat"><div class="user-ov-stat-num" style="color:#60a5fa">' + newThisMonth + '</div><div class="user-ov-stat-label">NEW</div></div>' +
    '</div>' +
    (recentUsers.length ?
      '<div class="user-ov-section-label">RECENTLY ADDED</div>' +
      '<div class="user-ov-list">' +
        recentUsers.map(function(u, i) {
          return '<div class="user-ov-item">' +
            '<div class="user-avatar" style="background:' + (u.color || avatarColor(i)) + ';width:32px;height:32px;min-width:32px;font-size:11px">' + initials(u.name || u.username) + '</div>' +
            '<div class="user-ov-info">' +
              '<div class="user-ov-name">' + (u.name || u.username) + '</div>' +
              '<div class="user-ov-meta">' + (u.created || '-') + '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>'
    : '<p style="font-size:13px;color:var(--muted);padding:12px 0">No users registered yet.</p>');
}

/* ================================================================
   FEATURE 3 — PENDING / URGENT DOCUMENTS SECTION
   Detects stuck docs by checking last history entry date.
   Warning (yellow) = 1–2 days.  Urgent (red) = 3+ days.
================================================================ */
function _getDocLastUpdated(doc) {
  if (doc.history && doc.history.length) {
    var latest = null;
    doc.history.forEach(function(h) {
      if (!h.date) return;
      try {
        var d = new Date(h.date);
        if (!isNaN(d) && (!latest || d > latest)) latest = d;
      } catch(e){}
    });
    if (latest) return latest;
  }
  if (doc.date) { try { var d2 = new Date(doc.date); if (!isNaN(d2)) return d2; } catch(e){} }
  return null;
}

function renderUrgentDocs() {
  var el = document.getElementById('urgent-docs-list');
  if (!el) return;

  var isAdmin = currentUser && currentUser.role === 'admin';
  var pool = isAdmin ? docs : docs.filter(function(d){ return d.ownerId === currentUser.id; });

  var staluses = ['Pending', 'Processing', 'Received', 'For Approval'];
  var nowMs = Date.now();

  var urgentDocs = pool
    .filter(function(d){ return staluses.includes(d.status); })
    .map(function(d) {
      var last = _getDocLastUpdated(d);
      var daysAgo = last ? Math.floor((nowMs - last.getTime()) / 86400000) : 0;
      return { doc: d, daysAgo: daysAgo, lastDate: last };
    })
    .filter(function(x){ return x.daysAgo >= 1; })
    .sort(function(a, b){ return b.daysAgo - a.daysAgo; })
    .slice(0, 5);

  if (!urgentDocs.length) {
    el.innerHTML =
      '<div class="urgent-empty">' +
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 8px;opacity:.3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        '<p>No delayed documents. All caught up!</p>' +
      '</div>';
    return;
  }

  el.innerHTML = urgentDocs.map(function(x) {
    var d = x.doc;
    var isUrgent = x.daysAgo >= 3;
    var docKey = d.internalId || d.id;
    var lastStr = x.lastDate ? x.lastDate.toLocaleDateString('en-PH', {month:'short',day:'numeric'}) : '-';
    var sc = statusColorMap[d.status] || '#64748b';
    return '<div class="urgent-doc-item ' + (isUrgent ? 'urgent-red' : 'urgent-yellow') + '">' +
      '<div class="urgent-doc-main">' +
        '<div class="urgent-doc-name">' + d.name + '</div>' +
        '<div class="urgent-doc-id">' + (d.fullDisplayId || d.displayId || d.id) + '</div>' +
        '<div class="urgent-doc-meta">' +
          statusBadge(d.status) +
          '<span class="urgent-since">No movement since ' + lastStr + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="urgent-doc-right">' +
        '<span class="urgent-days ' + (isUrgent ? 'urgent-days-red' : 'urgent-days-yellow') + '">' + x.daysAgo + ' day' + (x.daysAgo !== 1 ? 's' : '') + '</span>' +
        '<button class="btn btn-sm btn-ghost" style="font-size:11px;padding:3px 10px;margin-top:4px" ' +
          'onclick="closeAllActionMenus();showPage(\'vault\',document.getElementById(\'nav-vault\'));setTimeout(function(){openHistory(\'' + docKey + '\')},160)">View</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* ================================================================
   HOOK INTO EXISTING renderAll + enterApp
   Non-destructive override — calls new features after the originals.
================================================================ */
(function() {
  var _origRenderAll = renderAll;
  renderAll = function() {
    _origRenderAll.apply(this, arguments);
    if (currentUser) { renderUserOverview(); renderUrgentDocs(); }
  };

  var _origEnterApp = enterApp;
  enterApp = function() {
    _origEnterApp.apply(this, arguments);
    setTimeout(initGlobalSearch, 50);
  };
})();

/* ================================================================
   PATCH 2 — Fix all issues from user feedback:
   1. Stats cards: add date range + real % change badges
   2. Admin right card: swap "System Activity" → Pending/Urgent
   3. User Overview: accurate active count (has ever logged in)
   4. Pending/Urgent: admin only, hidden from regular users
   5. dash-grid-2: admin = User Overview only; user = hidden
================================================================ */

/* ── Date helpers ── */
function _ordinal(n) {
  var s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}
function _statDateRange() {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var now = new Date();
  return 'From Jan 1st \u2013 ' + months[now.getMonth()] + ' ' + _ordinal(now.getDate());
}

/* ── % change: this month count vs last month count ── */
function _countInMonth(pool, m, y, statusFilter) {
  return pool.filter(function(d) {
    var raw = d.date || d.createdAt || '';
    var dt; try { dt = new Date(raw); } catch(e) { return false; }
    if (isNaN(dt)) return false;
    var ok = dt.getMonth() === m && dt.getFullYear() === y;
    if (!ok) return false;
    if (statusFilter) return statusFilter.includes(d.status);
    return true;
  }).length;
}
function _pctChange(pool, statusFilter) {
  var now = new Date();
  var tm = now.getMonth(), ty = now.getFullYear();
  var lm = tm === 0 ? 11 : tm - 1;
  var ly = tm === 0 ? ty - 1 : ty;
  var cur  = _countInMonth(pool, tm, ty, statusFilter);
  var prev = _countInMonth(pool, lm, ly, statusFilter);
  if (prev === 0 && cur === 0) return null;
  if (prev === 0) return { pct: '100.0', up: true };
  var p = ((cur - prev) / prev * 100).toFixed(1);
  return { pct: Math.abs(parseFloat(p)).toFixed(1), up: parseFloat(p) >= 0 };
}
function _pctChangeUsers() {
  var now = new Date();
  var tm = now.getMonth(), ty = now.getFullYear();
  var lm = tm === 0 ? 11 : tm - 1, ly = tm === 0 ? ty - 1 : ty;
  var users = accounts.filter(function(a){ return a.role !== 'admin'; });
  function cnt(m, y) {
    return users.filter(function(u) {
      if (!u.created) return false;
      var d; try { d = new Date(u.created); } catch(e){ return false; }
      return !isNaN(d) && d.getMonth() === m && d.getFullYear() === y;
    }).length;
  }
  var cur = cnt(tm,ty), prev = cnt(lm,ly);
  if (prev===0 && cur===0) return null;
  if (prev===0) return { pct:'100.0', up:true };
  var p = ((cur-prev)/prev*100).toFixed(1);
  return { pct: Math.abs(parseFloat(p)).toFixed(1), up: parseFloat(p)>=0 };
}
function _pctBadge(r) {
  if (!r) return '';
  return '<span class="stat-pct-badge ' + (r.up ? 'stat-pct-up' : 'stat-pct-down') + '">' +
    (r.up ? '\u2197' : '\u2198') + ' ' + r.pct + '%</span>';
}

/* ── 1. Override renderStats with date range + % badges ── */
function renderStats() {
  var isAdmin = currentUser.role === 'admin';
  var myDocs  = isAdmin ? docs : docs.filter(function(d){ return d.ownerId === currentUser.id; });
  var total    = myDocs.length;
  var released = myDocs.filter(function(d){ return d.status === 'Released'; }).length;
  var pending  = myDocs.filter(function(d){ return ['Received','Processing','For Approval','Pending'].includes(d.status); }).length;
  var rejected = myDocs.filter(function(d){ return d.status === 'Rejected'; }).length;

  var dr = _statDateRange();
  var totalBadge    = _pctBadge(_pctChange(myDocs, null));
  var relBadge      = _pctBadge(_pctChange(myDocs, ['Released']));
  var pendBadge     = _pctBadge(_pctChange(myDocs, ['Received','Processing','For Approval','Pending']));
  var rejBadge      = _pctBadge(_pctChange(myDocs, ['Rejected']));
  var usersBadge    = isAdmin ? _pctBadge(_pctChangeUsers()) : '';
  var totalUsers    = accounts.filter(function(a){ return a.role !== 'admin'; }).length;

  document.getElementById('stats-row').innerHTML = isAdmin
    ? '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Total Documents</span>' + totalBadge + '</div><div class="stat-card-num">' + total + '</div><div class="stat-card-sub">' + dr + '</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Released</span>' + relBadge + '</div><div class="stat-card-num green">' + released + '</div><div class="stat-card-sub">' + dr + '</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Pending / Stuck</span>' + pendBadge + '</div><div class="stat-card-num yellow">' + pending + '</div><div class="stat-card-sub">Needs attention</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Total Users</span>' + usersBadge + '</div><div class="stat-card-num">' + totalUsers + '</div><div class="stat-card-sub">Active accounts</div></div>'
    : '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">My Docs</span>' + totalBadge + '</div><div class="stat-card-num">' + total + '</div><div class="stat-card-sub">' + dr + '</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Released</span>' + relBadge + '</div><div class="stat-card-num green">' + released + '</div><div class="stat-card-sub">' + dr + '</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">In Progress</span>' + pendBadge + '</div><div class="stat-card-num yellow">' + pending + '</div><div class="stat-card-sub">Needs attention</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Rejected</span>' + rejBadge + '</div><div class="stat-card-num red">' + rejected + '</div><div class="stat-card-sub">' + dr + '</div></div>';

  document.getElementById('dash-title').textContent    = isAdmin ? 'Admin Dashboard' : 'My Dashboard';
  document.getElementById('dash-subtitle').textContent = isAdmin
    ? 'Welcome back, Admin! Here\'s what\'s happening today.'
    : 'Welcome back, ' + (currentUser.name || currentUser.username);
}

/* ── 2. Swap right card to Pending/Urgent for admin ── */
function _renderUrgentInDashCard() {
  var titleEl = document.getElementById('my-activity-title');
  if (titleEl) titleEl.textContent = 'Pending / Urgent Docs';

  var listEl = document.getElementById('activity-list');
  if (!listEl) return;

  var staluses = ['Pending','Processing','Received','For Approval'];
  var nowMs = Date.now();
  var pool = docs;

  var urgentDocs = pool
    .filter(function(d){ return staluses.includes(d.status); })
    .map(function(d) {
      var last = _getDocLastUpdated(d);
      var daysAgo = last ? Math.floor((nowMs - last.getTime()) / 86400000) : 0;
      return { doc: d, daysAgo: daysAgo, last: last };
    })
    .filter(function(x){ return x.daysAgo >= 1; })
    .sort(function(a,b){ return b.daysAgo - a.daysAgo; })
    .slice(0, 6);

  if (!urgentDocs.length) {
    listEl.style.padding = '';
    listEl.innerHTML = '<div class="urgent-empty" style="padding:20px 0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 8px;opacity:.3"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><p>No delayed documents!</p></div>';
    return;
  }

  listEl.style.padding = '0';
  listEl.innerHTML = urgentDocs.map(function(x) {
    var d = x.doc;
    var isUrgent = x.daysAgo >= 3;
    var docKey = d.internalId || d.id;
    var lastStr = x.last ? x.last.toLocaleDateString('en-PH',{month:'short',day:'numeric'}) : '-';
    return '<div class="urgent-doc-item ' + (isUrgent?'urgent-red':'urgent-yellow') + '">' +
      '<div class="urgent-doc-main">' +
        '<div class="urgent-doc-name">' + d.name + '</div>' +
        '<div class="urgent-doc-id">' + (d.fullDisplayId||d.displayId||d.id) + '</div>' +
        '<div class="urgent-doc-meta">' + statusBadge(d.status) +
          '<span class="urgent-since">Since ' + lastStr + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="urgent-doc-right">' +
        '<span class="urgent-days ' + (isUrgent?'urgent-days-red':'urgent-days-yellow') + '">' + x.daysAgo + 'd</span>' +
        '<button class="btn btn-sm btn-ghost" style="font-size:11px;padding:3px 10px;margin-top:4px" ' +
          'onclick="closeAllActionMenus();showPage(\'vault\',document.getElementById(\'nav-vault\'));setTimeout(function(){openHistory(\'' + docKey + '\')},160)">View</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

/* ── 3. Fixed renderUserOverview — accurate active count ── */
function renderUserOverview() {
  var el   = document.getElementById('user-overview-body');
  var card = document.getElementById('card-user-overview');
  if (!el || !card) return;

  var isAdmin = currentUser && currentUser.role === 'admin';
  card.style.display = isAdmin ? '' : 'none';
  if (!isAdmin) return;

  var users = accounts.filter(function(a){ return a.role !== 'admin'; });
  var total = users.length;

  /* Active = user has at least one activity log entry (has ever logged in/acted) */
  var active = users.filter(function(u) {
    var logs = activityLogs[u.id] || [];
    return logs.length > 0;
  }).length;

  /* New = created this calendar month */
  var now = new Date();
  var newThisMonth = users.filter(function(u) {
    if (!u.created) return false;
    try { var d = new Date(u.created); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); } catch(e){ return false; }
  }).length;

  var recentUsers = users.slice().reverse().slice(0, 5);

  el.innerHTML =
    '<div class="user-ov-stats">' +
      '<div class="user-ov-stat"><div class="user-ov-stat-num">' + total + '</div><div class="user-ov-stat-label">TOTAL</div></div>' +
      '<div class="user-ov-stat"><div class="user-ov-stat-num" style="color:#4ade80">' + active + '</div><div class="user-ov-stat-label">ACTIVE</div></div>' +
      '<div class="user-ov-stat"><div class="user-ov-stat-num" style="color:#60a5fa">' + newThisMonth + '</div><div class="user-ov-stat-label">NEW</div></div>' +
    '</div>' +
    (recentUsers.length
      ? '<div class="user-ov-section-label">RECENTLY ADDED</div>' +
        '<div class="user-ov-list">' +
          recentUsers.map(function(u,i){
            return '<div class="user-ov-item">' +
              '<div class="user-avatar" style="background:'+(u.color||avatarColor(i))+';width:32px;height:32px;min-width:32px;font-size:11px">'+initials(u.name||u.username)+'</div>' +
              '<div class="user-ov-info">' +
                '<div class="user-ov-name">'+(u.name||u.username)+'</div>' +
                '<div class="user-ov-meta">'+(u.created||'-')+'</div>' +
              '</div></div>';
          }).join('') +
        '</div>'
      : '<p style="font-size:13px;color:var(--muted);padding:12px 0">No users registered yet.</p>');
}

/* ── 4. renderUrgentDocs: now admin-only, renders into dash-grid-2 left card ── */
function renderUrgentDocs() {
  var el = document.getElementById('urgent-docs-list');
  if (!el) return;
  /* Hide card for non-admins */
  var card = document.getElementById('card-urgent-docs');
  if (card) card.style.display = (currentUser && currentUser.role === 'admin') ? 'none' : 'none';
  /* Urgent is now rendered in the dash-grid right card for admin via _renderUrgentInDashCard */
}

/* ── 5. dash-grid-2 visibility: admin = User Overview only; user = hidden ── */
function _updateDashGrid2() {
  var grid2 = document.getElementById('dash-grid-2');
  if (!grid2) return;
  var isAdmin = currentUser && currentUser.role === 'admin';
  /* Hide the urgent-docs card (it's now in the main dash-grid right card for admin) */
  var urgentCard = document.getElementById('card-urgent-docs');
  if (urgentCard) urgentCard.style.display = 'none';
  /* Show grid2 only for admin (for User Overview) */
  grid2.style.display = isAdmin ? '' : 'none';
  /* Make grid2 single-column since only User Overview is visible */
  if (isAdmin) grid2.style.gridTemplateColumns = '1fr';
}

/* ── Final override: wire everything together ── */
(function() {
  var _prev_renderAll = renderAll;
  renderAll = function() {
    _prev_renderAll.apply(this, arguments);
    if (!currentUser) return;
    if (currentUser.role === 'admin') _renderUrgentInDashCard();
    renderUserOverview();
    renderUrgentDocs();
    _updateDashGrid2();
  };
})();

/* ================================================================
   PATCH 3 — Use real backend data. No localStorage guessing.
   - apiGetUsers() fetches real users + lastLogin + docCount from MongoDB
   - % badges hidden when no previous-month data exists (prev=0 → null)
   - Active users = users with lastLogin !== null (actually logged in)
   - All stats sourced from backend-synced `docs` array (createdAt field)
================================================================ */

/* Cache for backend users so we don't re-fetch on every renderAll */
let _backendUsers = null;
let _backendUsersFetching = false;

async function _fetchBackendUsers(force) {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (!currentUser.token && !getSavedToken()) return;
  if (_backendUsersFetching) return;
  if (_backendUsers && !force) return;
  _backendUsersFetching = true;
  try {
    const result = await apiGetUsers(currentUser.token || getSavedToken());
    if (Array.isArray(result)) {
      _backendUsers = result;
    }
  } catch(e) {
    console.warn('[_fetchBackendUsers]', e);
  }
  _backendUsersFetching = false;
}

/* ── Fixed % change: return null when no previous period exists ── */
function _pctChange(pool, statusFilter) {
  var now = new Date();
  var tm = now.getMonth(), ty = now.getFullYear();
  var lm = tm === 0 ? 11 : tm - 1;
  var ly = tm === 0 ? ty - 1 : ty;
  var cur  = _countInMonth(pool, tm, ty, statusFilter);
  var prev = _countInMonth(pool, lm, ly, statusFilter);
  if (prev === 0) return null; /* no basis for comparison — show nothing */
  var p = ((cur - prev) / prev * 100).toFixed(1);
  return { pct: Math.abs(parseFloat(p)).toFixed(1), up: parseFloat(p) >= 0 };
}

function _pctChangeUsers(userList) {
  if (!userList || !userList.length) return null;
  var now = new Date();
  var tm = now.getMonth(), ty = now.getFullYear();
  var lm = tm === 0 ? 11 : tm - 1, ly = tm === 0 ? ty - 1 : ty;
  function cnt(m, y) {
    return userList.filter(function(u) {
      var d; try { d = new Date(u.createdAt); } catch(e){ return false; }
      return !isNaN(d) && d.getMonth() === m && d.getFullYear() === y;
    }).length;
  }
  var cur = cnt(tm,ty), prev = cnt(lm,ly);
  if (prev === 0) return null;
  var p = ((cur-prev)/prev*100).toFixed(1);
  return { pct: Math.abs(parseFloat(p)).toFixed(1), up: parseFloat(p) >= 0 };
}

/* ── renderStats using real docs + real backend users ── */
function renderStats() {
  var isAdmin = currentUser.role === 'admin';
  var myDocs  = isAdmin ? docs : docs.filter(function(d){ return d.ownerId === currentUser.id || d.ownerId === currentUser.userId; });

  var total    = myDocs.length;
  var released = myDocs.filter(function(d){ return d.status === 'Released'; }).length;
  var pending  = myDocs.filter(function(d){ return ['Received','Processing','For Approval','Pending'].includes(d.status); }).length;
  var rejected = myDocs.filter(function(d){ return d.status === 'Rejected'; }).length;

  var dr = _statDateRange();

  var totalBadge = _pctBadge(_pctChange(myDocs, null));
  var relBadge   = _pctBadge(_pctChange(myDocs, ['Released']));
  var pendBadge  = _pctBadge(_pctChange(myDocs, ['Received','Processing','For Approval','Pending']));
  var rejBadge   = _pctBadge(_pctChange(myDocs, ['Rejected']));

  var totalUsers = 0;
  var usersBadge = '';
  if (isAdmin && _backendUsers) {
    totalUsers = _backendUsers.length;
    usersBadge = _pctBadge(_pctChangeUsers(_backendUsers));
  } else if (isAdmin) {
    totalUsers = accounts.filter(function(a){ return a.role !== 'admin'; }).length;
  }

  document.getElementById('stats-row').innerHTML = isAdmin
    ? '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Total Documents</span>' + totalBadge + '</div><div class="stat-card-num">' + total + '</div><div class="stat-card-sub">' + dr + '</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Released</span>' + relBadge + '</div><div class="stat-card-num green">' + released + '</div><div class="stat-card-sub">' + dr + '</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Pending / Stuck</span>' + pendBadge + '</div><div class="stat-card-num yellow">' + pending + '</div><div class="stat-card-sub">Needs attention</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Total Users</span>' + usersBadge + '</div><div class="stat-card-num">' + totalUsers + '</div><div class="stat-card-sub">Active accounts</div></div>'
    : '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">My Docs</span>' + totalBadge + '</div><div class="stat-card-num">' + total + '</div><div class="stat-card-sub">' + dr + '</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Released</span>' + relBadge + '</div><div class="stat-card-num green">' + released + '</div><div class="stat-card-sub">' + dr + '</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">In Progress</span>' + pendBadge + '</div><div class="stat-card-num yellow">' + pending + '</div><div class="stat-card-sub">Needs attention</div></div>' +
      '<div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">Rejected</span>' + rejBadge + '</div><div class="stat-card-num red">' + rejected + '</div><div class="stat-card-sub">' + dr + '</div></div>';

  document.getElementById('dash-title').textContent    = isAdmin ? 'Admin Dashboard' : 'My Dashboard';
  document.getElementById('dash-subtitle').textContent = isAdmin
    ? 'Welcome back, Admin! Here\'s what\'s happening today.'
    : 'Welcome back, ' + (currentUser.name || currentUser.username);
}

/* ── renderUserOverview using real backend users ── */
function renderUserOverview() {
  var el   = document.getElementById('user-overview-body');
  var card = document.getElementById('card-user-overview');
  if (!el || !card) return;
  var isAdmin = currentUser && currentUser.role === 'admin';
  card.style.display = isAdmin ? '' : 'none';
  if (!isAdmin) return;

  var users = _backendUsers;
  if (!users) {
    /* Backend data not loaded yet — show loading state */
    el.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:16px 0;text-align:center">Loading users…</p>';
    return;
  }
  if (!users.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:16px 0">No users registered yet.</p>';
    return;
  }

  var total = users.length;

  /*
   * ACTIVE = user has lastLogin !== null in MongoDB.
   * This is set by the backend every time the user logs in.
   * No guessing, no localStorage, pure backend data.
   */
  var active = users.filter(function(u){ return !!u.lastLogin; }).length;

  /* NEW = registered this calendar month per MongoDB createdAt */
  var now = new Date();
  var newThisMonth = users.filter(function(u) {
    if (!u.createdAt) return false;
    var d = new Date(u.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  var recentUsers = users.slice(0, 5); /* already sorted createdAt desc from backend */

  function _fmtDate(isoStr) {
    if (!isoStr) return '-';
    try {
      return new Date(isoStr).toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch(e){ return isoStr; }
  }

  el.innerHTML =
    '<div class="user-ov-stats">' +
      '<div class="user-ov-stat"><div class="user-ov-stat-num">' + total + '</div><div class="user-ov-stat-label">TOTAL</div></div>' +
      '<div class="user-ov-stat">' +
        '<div class="user-ov-stat-num" style="color:#4ade80">' + active + '</div>' +
        '<div class="user-ov-stat-label">ACTIVE</div>' +
        '<div class="user-ov-stat-hint">logged in</div>' +
      '</div>' +
      '<div class="user-ov-stat">' +
        '<div class="user-ov-stat-num" style="color:#60a5fa">' + newThisMonth + '</div>' +
        '<div class="user-ov-stat-label">NEW</div>' +
        '<div class="user-ov-stat-hint">this month</div>' +
      '</div>' +
    '</div>' +
    '<div class="user-ov-section-label">RECENTLY ADDED</div>' +
    '<div class="user-ov-list">' +
      recentUsers.map(function(u, i) {
        var colors = ['#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399'];
        var bg = u.color || colors[i % colors.length];
        var hasLoggedIn = !!u.lastLogin;
        return '<div class="user-ov-item">' +
          '<div class="user-avatar" style="background:' + bg + ';width:32px;height:32px;min-width:32px;font-size:11px">' +
            initials(u.name || u.username) +
          '</div>' +
          '<div class="user-ov-info">' +
            '<div class="user-ov-name">' + (u.name || u.username) +
              (hasLoggedIn ? '<span class="user-ov-active-dot" title="Has logged in"></span>' : '') +
            '</div>' +
            '<div class="user-ov-meta">' +
              _fmtDate(u.createdAt) +
              (u.docCount ? ' &nbsp;&middot;&nbsp; ' + u.docCount + ' doc' + (u.docCount !== 1 ? 's' : '') : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
}

/* ── Wire: fetch backend users then render dashboard ── */
(function() {
  var _prev_renderAll3 = renderAll;
  renderAll = function() {
    _prev_renderAll3.apply(this, arguments);
    if (!currentUser) return;
    renderUserOverview();
    _updateDashGrid2();
  };

  var _prev_enterApp3 = enterApp;
  enterApp = function() {
    _prev_enterApp3.apply(this, arguments);
    /* Fetch real users from backend immediately on login */
    if (currentUser && currentUser.role === 'admin' && (currentUser.token || getSavedToken())) {
      _fetchBackendUsers(true).then(function() {
        renderUserOverview();
        renderStats();
      });
    }
  };
})();

/* ================================================================
   PATCH 4 — Restore System Activity panel + fix layout
   Layout (admin):
     Row 1: Recent Documents  |  Pending/Urgent Docs
     Row 2: User Overview     |  System Activity (All Users)
   Layout (user):
     Row 1: Recent Documents  |  My Recent Activity
     Row 2: hidden
================================================================ */

/* ── Render System Activity card (admin only, dash-grid-2 right) ── */
function renderSystemActivity() {
  var card = document.getElementById('card-system-activity');
  var list = document.getElementById('system-activity-list');
  if (!card || !list) return;

  var isAdmin = currentUser && currentUser.role === 'admin';
  card.style.display = isAdmin ? '' : 'none';
  if (!isAdmin) return;

  /* Collect all activity logs across all users, newest first */
  var all = [];
  Object.entries(activityLogs).forEach(function(pair) {
    var uid  = pair[0];
    var logs = pair[1];
    /* Search accounts by id, userId, or _id string */
    var acc = accounts.find(function(a) {
      return a.id === uid || a.userId === uid || String(a._id || '') === uid;
    });
    /* Also check _backendUsers if not found in accounts */
    if (!acc && _backendUsers) {
      var bu = _backendUsers.find(function(u) {
        return u.userId === uid || String(u._id || '') === uid;
      });
      if (bu) acc = bu;
    }
    var uname = acc ? (acc.username || acc.name || uid) : uid;
    /* If uname still looks like a MongoDB _id (24 hex chars), show 'unknown' */
    if (/^[a-f0-9]{24}$/.test(uname)) uname = 'unknown';
    logs.forEach(function(l) {
      all.push({ msg: l.msg, date: l.date, color: l.color, uname: uname });
    });
  });
  all.sort(function(a, b){ return new Date(b.date) - new Date(a.date); });
  all = all.slice(0, 8);

  if (!all.length) {
    list.innerHTML = '<p style="font-size:13px;color:var(--muted)">No recent activity.</p>';
    return;
  }

  /* Map activity message → label + color for badge */
  function _actBadge(msg) {
    var m = (msg || '').toLowerCase();
    if (m.indexOf('logged in')  !== -1) return { label: 'Login',         color: '#4ade80', bg: 'rgba(74,222,128,.1)' };
    if (m.indexOf('logged out') !== -1) return { label: 'Logout',        color: '#94a3b8', bg: 'rgba(148,163,184,.1)' };
    if (m.indexOf('registered') !== -1 || m.indexOf('uploaded') !== -1 || m.indexOf('upload') !== -1)
                                         return { label: 'Upload',        color: '#60a5fa', bg: 'rgba(96,165,250,.1)' };
    if (m.indexOf('status') !== -1 || m.indexOf('updated') !== -1)
                                         return { label: 'Status Update', color: '#f59e0b', bg: 'rgba(245,158,11,.1)' };
    if (m.indexOf('deleted') !== -1)     return { label: 'Delete',        color: '#ef4444', bg: 'rgba(239,68,68,.1)' };
    if (m.indexOf('movement') !== -1)    return { label: 'Movement',      color: '#a78bfa', bg: 'rgba(167,139,250,.1)' };
    if (m.indexOf('account') !== -1)     return { label: 'Register',      color: '#34d399', bg: 'rgba(52,211,153,.1)' };
    return { label: 'Activity', color: '#94a3b8', bg: 'rgba(148,163,184,.1)' };
  }

  list.innerHTML = all.map(function(a) {
    var badge = _actBadge(a.msg);
    return '<div class="sysact-item">' +
      '<div class="sysact-left">' +
        '<div class="sysact-user"><strong>' + a.uname + '</strong> ' + a.msg + '</div>' +
        '<div class="sysact-time">' + a.date + '</div>' +
      '</div>' +
      '<span class="sysact-badge" style="color:' + badge.color + ';background:' + badge.bg + '">' + badge.label + '</span>' +
    '</div>';
  }).join('');
}

/* ── Override _updateDashGrid2: admin sees row2, user hides it ── */
function _updateDashGrid2() {
  var grid2 = document.getElementById('dash-grid-2');
  if (!grid2) return;
  var isAdmin = currentUser && currentUser.role === 'admin';
  grid2.style.display      = isAdmin ? '' : 'none';
  grid2.style.gridTemplateColumns = isAdmin ? '1fr 1fr' : '1fr';
  var urgentCard = document.getElementById('card-urgent-docs');
  if (urgentCard) urgentCard.style.display = 'none'; /* urgent is in dash-grid right card */
}

/* ── Wire renderSystemActivity into renderAll ── */
(function() {
  var _prev4 = renderAll;
  renderAll = function() {
    _prev4.apply(this, arguments);
    if (currentUser) renderSystemActivity();
  };
})();

/* ================================================================
   PATCH 5 — Fix dash-grid-2 always rendering as 2 columns side by side
================================================================ */
function _updateDashGrid2() {
  var grid2 = document.getElementById('dash-grid-2');
  if (!grid2) return;
  var isAdmin = currentUser && currentUser.role === 'admin';
  /* Just show/hide — columns are already set in HTML as 1fr 1fr */
  grid2.style.display = isAdmin ? 'grid' : 'none';
  /* Urgent card in dash-grid-2 is unused — hide it */
  var urgentCard = document.getElementById('card-urgent-docs');
  if (urgentCard) urgentCard.style.display = 'none';
}

/* ================================================================
   PATCH 6 — Real-time sync: polling + backend-driven renderUsers
   
   Strategy:
   - Poll every 30s: fetch fresh users + docs from backend
   - On tab focus (visibilitychange): immediate re-fetch
   - renderUsers() now reads from _backendUsers (real MongoDB data)
   - After every user fetch, merge into accounts[] so openUserVault works
   - After every doc fetch, update docs[] so all existing functions work
================================================================ */

/* ── Merge backend users into accounts[] so existing functions keep working ── */
function _mergeBackendUsersIntoAccounts(backendUsers) {
  if (!Array.isArray(backendUsers)) return;
  backendUsers.forEach(function(bu) {
    var idx = accounts.findIndex(function(a) {
      return a.username === bu.username || a.id === bu.userId || a.id === String(bu._id);
    });
    var merged = {
      id:        bu.userId || String(bu._id),
      userId:    bu.userId,
      username:  bu.username,
      name:      bu.name,
      role:      bu.role || 'user',
      color:     bu.color || '#4ade80',
      created:   bu.createdAt,
      lastLogin: bu.lastLogin || null,
      docCount:  bu.docCount || 0,
    };
    if (idx >= 0) {
      accounts[idx] = Object.assign(accounts[idx], merged);
    } else {
      accounts.push(merged);
    }
  });
}

/* ── renderUsers: reads from _backendUsers (real data), falls back to accounts ── */
function renderUsers() {
  var ul = document.getElementById('users-list');
  if (!ul) return;

  var source = _backendUsers;

  if (!source) {
    /* Not loaded yet — show spinner and trigger fetch */
    ul.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:16px 0">Loading users from server…</p>';
    _fetchBackendUsers(true).then(function() {
      renderUsers();
    });
    return;
  }

  if (!source.length) {
    ul.innerHTML = '<p style="font-size:13px;color:var(--muted)">No registered users yet.</p>';
    return;
  }

  function _fmtDate(iso) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch(e) { return iso; }
  }

  ul.innerHTML = source.map(function(u, i) {
    var colors  = ['#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#f87171','#fbbf24'];
    var bg      = u.color || colors[i % colors.length];
    var uid     = u.userId || String(u._id || '');
    var docCnt  = u.docCount || 0;
    var lastLogin = u.lastLogin
      ? '<span style="color:#4ade80;font-size:11px">&#9679; Active &nbsp;&middot;&nbsp; Last login: ' + _fmtDate(u.lastLogin) + '</span>'
      : '<span style="color:var(--muted);font-size:11px">&#9675; Never logged in</span>';
    return '<div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)">' +
      '<div class="user-avatar" style="background:' + bg + '">' + initials(u.name || u.username) + '</div>' +
      '<div style="flex:1">' +
        '<div style="font-weight:600;font-size:14px">' + (u.name || u.username) + '</div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:2px">' +
          '@' + u.username + ' &nbsp;&middot;&nbsp; ' +
          docCnt + ' doc' + (docCnt !== 1 ? 's' : '') + ' &nbsp;&middot;&nbsp; Joined ' + _fmtDate(u.createdAt) +
        '</div>' +
        '<div style="margin-top:3px">' + lastLogin + '</div>' +
      '</div>' +
      '<button class="btn btn-sm btn-blue" onclick="openUserVaultById(\'' + uid + '\',\'' + (u.username||'') + '\',\'' + (u.name||'') + '\')">View Docs</button>' +
    '</div>';
  }).join('');
}

/* ── openUserVaultById: works with backend users (no accounts[] dependency) ── */
function openUserVaultById(uid, username, name) {
  /* Try accounts[] first, then build a minimal object from params */
  var u = accounts.find(function(a) {
    return a.id === uid || a.userId === uid || a.username === username;
  });
  if (!u) {
    u = { id: uid, userId: uid, username: username, name: name };
    accounts.push(u);
  }
  _uvCurrentUid = u.id || uid;
  document.getElementById('uv-title').textContent    = (u.name || name || username) + "'s Documents";
  document.getElementById('uv-subtitle').textContent = '@' + (u.username || username);
  var searchEl = document.getElementById('uv-search');
  if (searchEl) searchEl.value = '';
  switchUVTab('docs');
  openModal('user-vault-modal');
}

/* ── Sync fresh docs from backend into docs[] ── */
async function _syncDocsFromBackend() {
  if (!currentUser || !currentUser.token) return;
  try {
    var token   = currentUser.token || getSavedToken();
    var isAdmin = currentUser.role === 'admin';
    var ownerId = isAdmin ? null : (currentUser.id || currentUser.userId);
    var result  = await apiGetAllDocuments(token, ownerId, currentUser.role);
    if (!Array.isArray(result)) return;

    result.forEach(function(bd) {
      var idx = docs.findIndex(function(d) { return (d.internalId || d.id) === bd.internalId; });
      if (idx >= 0) {
        var local = docs[idx];
        docs[idx] = Object.assign({}, bd, {
          id:               bd.internalId,
          originalFile:     local.originalFile    || bd.originalFile    || null,
          processedFile:    local.processedFile   || bd.processedFile   || null,
          fileData:         local.fileData        || bd.fileData        || null,
          originalFileExt:  local.originalFileExt || bd.originalFileExt || null,
          processedFileExt: local.processedFileExt|| bd.processedFileExt|| null,
          hasOriginalFile:  local.originalFile ? true : (bd.hasOriginalFile || false),
          hasProcessedFile: local.processedFile ? true : (bd.hasProcessedFile || false),
        });
      } else {
        docs.push(Object.assign({}, bd, { id: bd.internalId }));
      }
    });
    /* Remove local-only docs that were deleted from backend */
    var backendIds = new Set(result.map(function(d) { return d.internalId; }));
    docs = docs.filter(function(d) {
      return !d._backendSynced || backendIds.has(d.internalId || d.id);
    });
  } catch(e) {
    console.warn('[_syncDocsFromBackend]', e);
  }
}

/* ── Master refresh: fetch users + docs, then re-render everything ── */
var _polling = false;
async function _fullRefresh(silent) {
  if (!currentUser || !currentUser.token) return;
  if (_polling) return;
  _polling = true;
  try {
    /* Parallel fetch */
    await Promise.all([
      _fetchBackendUsers(true),
      _syncDocsFromBackend(),
    ]);
    /* Merge into accounts so legacy functions work */
    if (_backendUsers) _mergeBackendUsersIntoAccounts(_backendUsers);
    /* Re-render everything */
    renderAll();
    /* If user management page is open, refresh it */
    var usersPage = document.getElementById('page-users');
    if (usersPage && usersPage.classList.contains('active')) renderUsers();
    /* Refresh notification badge on every poll */
    renderNotifCount();
    if (!silent) console.info('[Poll] Dashboard synced at', new Date().toLocaleTimeString());
  } catch(e) {
    console.warn('[_fullRefresh]', e);
  }
  _polling = false;
}

/* ── Start polling (30s interval) ── */
var _pollTimer = null;
function _startPolling() {
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(function() {
    _fullRefresh(true);
  }, 30000); /* every 30 seconds */
}

function _stopPolling() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

/* ── On tab focus: immediate refresh ── */
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible' && currentUser && currentUser.token) {
    _fullRefresh(true);
  }
});

/* ── Wire into enterApp + logout ── */
(function() {
  var _prevEnter = enterApp;
  enterApp = function() {
    _prevEnter.apply(this, arguments);
    /* Initial full refresh then start polling */
    _fullRefresh(true).then(function() { _startPolling(); });
  };

  var _prevLogout = logout;
  logout = function() {
    _stopPolling();
    _backendUsers = null;
    _prevLogout.apply(this, arguments);
  };
})();

/* ================================================================
   PATCH 7 — Heartbeat-based accurate "Active" users
   
   How it works:
   - Every logged-in user pings POST /api/auth/heartbeat every 2 min
   - Backend sets user.lastSeen = now() on each ping
   - On logout: heartbeat stops → lastSeen goes stale naturally
   - Admin's GET /api/auth/users returns lastSeen for all users
   - ACTIVE = lastSeen within last 5 minutes (real online status)
   - If lastSeen is null/stale → user is offline
================================================================ */

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;  /* 2 minutes */
const ACTIVE_THRESHOLD_MS   = 5 * 60 * 1000;  /* 5 minutes = considered online */

let _heartbeatTimer = null;

function _isUserOnline(lastSeen) {
  if (!lastSeen) return false;
  try {
    return (Date.now() - new Date(lastSeen).getTime()) < ACTIVE_THRESHOLD_MS;
  } catch(e) { return false; }
}

async function _sendHeartbeat() {
  if (!currentUser || !currentUser.token) return;
  try {
    await apiHeartbeat(currentUser.token);
  } catch(e) {
    console.warn('[heartbeat] failed:', e);
  }
}

function _startHeartbeat() {
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  /* Send immediately on login so lastSeen is set right away */
  _sendHeartbeat();
  _heartbeatTimer = setInterval(_sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function _stopHeartbeat() {
  if (_heartbeatTimer) { clearInterval(_heartbeatTimer); _heartbeatTimer = null; }
}

/* ── Override renderUserOverview with accurate online status ── */
function renderUserOverview() {
  var el   = document.getElementById('user-overview-body');
  var card = document.getElementById('card-user-overview');
  if (!el || !card) return;

  var isAdmin = currentUser && currentUser.role === 'admin';
  card.style.display = isAdmin ? '' : 'none';
  if (!isAdmin) return;

  var users = _backendUsers;
  if (!users) {
    el.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:16px 0;text-align:center">Loading…</p>';
    return;
  }
  if (!users.length) {
    el.innerHTML = '<p style="font-size:13px;color:var(--muted);padding:16px 0">No users registered yet.</p>';
    return;
  }

  var total = users.length;

  /* ACTIVE = lastSeen within last 5 minutes (heartbeat-based) */
  var active = users.filter(function(u) { return _isUserOnline(u.lastSeen); }).length;

  /* NEW = registered this calendar month */
  var now = new Date();
  var newThisMonth = users.filter(function(u) {
    if (!u.createdAt) return false;
    var d = new Date(u.createdAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  function _fmtDate(iso) {
    if (!iso) return '-';
    try {
      return new Date(iso).toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch(e) { return iso; }
  }

  var recentUsers = users.slice(0, 5);

  el.innerHTML =
    '<div class="user-ov-stats">' +
      '<div class="user-ov-stat"><div class="user-ov-stat-num">' + total + '</div><div class="user-ov-stat-label">TOTAL</div></div>' +
      '<div class="user-ov-stat">' +
        '<div class="user-ov-stat-num" style="color:#4ade80">' + active + '</div>' +
        '<div class="user-ov-stat-label">ACTIVE</div>' +
        '<div class="user-ov-stat-hint">online now</div>' +
      '</div>' +
      '<div class="user-ov-stat">' +
        '<div class="user-ov-stat-num" style="color:#60a5fa">' + newThisMonth + '</div>' +
        '<div class="user-ov-stat-label">NEW</div>' +
        '<div class="user-ov-stat-hint">this month</div>' +
      '</div>' +
    '</div>' +
    '<div class="user-ov-section-label">RECENTLY ADDED</div>' +
    '<div class="user-ov-list">' +
      recentUsers.map(function(u, i) {
        var colors  = ['#4ade80','#60a5fa','#f472b6','#fb923c','#a78bfa','#34d399','#f87171','#fbbf24'];
        var bg      = u.color || colors[i % colors.length];
        var online  = _isUserOnline(u.lastSeen);
        return '<div class="user-ov-item">' +
          '<div style="position:relative;flex-shrink:0">' +
            '<div class="user-avatar" style="background:' + bg + ';width:32px;height:32px;min-width:32px;font-size:11px">' + initials(u.name || u.username) + '</div>' +
            (online ? '<span style="position:absolute;bottom:0;right:0;width:9px;height:9px;background:#4ade80;border:2px solid var(--card);border-radius:50%"></span>' : '') +
          '</div>' +
          '<div class="user-ov-info">' +
            '<div class="user-ov-name">' + (u.name || u.username) + '</div>' +
            '<div class="user-ov-meta">' +
              _fmtDate(u.createdAt) +
              (u.docCount ? ' &nbsp;&middot;&nbsp; ' + u.docCount + ' doc' + (u.docCount !== 1 ? 's' : '') : '') +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('') +
    '</div>';
}

/* ── Wire heartbeat into enterApp / logout ── */
(function() {
  var _prevEnter7 = enterApp;
  enterApp = function() {
    _prevEnter7.apply(this, arguments);
    _startHeartbeat();
  };

  var _prevLogout7 = logout;
  logout = function() {
    _stopHeartbeat();
    _prevLogout7.apply(this, arguments);
  };
})();