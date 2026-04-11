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
    let fileSource = d.processedFile || d.fileData || d.originalFile;

    if (!fileSource) {
      if (btnEl) btnEl.textContent = 'Downloading…';
      const backendResult = await apiDownloadDocument(docKey);

      if (!backendResult || backendResult._error) {
        _dlToast(backendResult?.message || 'No processed file available yet. Ask admin to upload the final file.');
        if (btnEl) { btnEl.disabled = false; btnEl.textContent = origText; }
        return;
      }

      fileSource = backendResult.fileData;
      if (fileSource) {
        d.processedFile    = fileSource;
        d.processedFileExt = backendResult.fileExt || d.processedFileExt || '';
      }
    }

    if (!fileSource) {
      _dlToast('No processed file has been attached by admin yet.');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = origText; }
      return;
    }

    if (btnEl) btnEl.textContent = 'Decrypting…';
    await new Promise(r => setTimeout(r, 40));

    const result = decryptFile(fileSource);
    if (!result) throw new Error('Decryption returned null');

    const ext  = result.ext || d.processedFileExt || d.fileExt || '';
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
      <div class="activity-dot" style="background:${a.color||'#94a3b8'}"></div>
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
    menuItems+=`<button class="dropdown-item" onclick="downloadDocFile('${docKey}', this)">⬇ Download Final</button>`;
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
  const userDocs=docs.filter(d=>d.ownerId===_uvCurrentUid);
  const tb=document.getElementById('uv-tbody');
  if(!userDocs.length){tb.innerHTML=`<tr><td colspan="7"><div class="empty-msg">No documents.</div></td></tr>`;return;}
  tb.innerHTML=userDocs.map(d=>`<tr>
    <td class="doc-id-cell" title="${d.internalId||d.id}">${d.fullDisplayId||d.displayId||d.id}</td>
    <td>${d.name}</td><td>${d.type}</td>
    <td>${prioBadge(d.priority)}</td><td>${statusBadge(d.status)}</td>
    <td style="font-size:12px;color:var(--muted)">${d.date}</td>
    <td><button class="btn btn-sm btn-orange" onclick="closeModal('user-vault-modal');setTimeout(()=>openHistory('${d.internalId||d.id}'),120)">History</button></td>
  </tr>`).join('');
}

function renderUVLogs(){
  const logs=(activityLogs[_uvCurrentUid]||[]).slice().reverse();
  const body=document.getElementById('uv-logs-body');
  if(!logs.length){body.innerHTML='<p style="font-size:13px;color:var(--muted)">No activity yet.</p>';return;}
  body.innerHTML=logs.map(l=>`<div class="activity-item"><div class="activity-dot" style="background:${l.color||'#94a3b8'}"></div><div><div class="activity-text">${l.msg}</div><div class="activity-time">${l.date}</div></div></div>`).join('');
}

/* Activity Logs */
function renderActivityLogs(){
  const body=document.getElementById('actlogs-body');
  let all=[];
  Object.entries(activityLogs).forEach(([uid,logs])=>{
    const acc=accounts.find(a=>a.id===uid);
    logs.forEach(l=>all.push({...l,uname:(acc?acc.username:uid)}));
  });
  all.sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!all.length){body.innerHTML='<p style="font-size:13px;color:var(--muted)">No activity yet.</p>';return;}
  body.innerHTML=all.map(a=>`<div class="activity-item"><div class="activity-dot" style="background:${a.color||'#94a3b8'}"></div><div><div class="activity-text"><strong>@${a.uname}</strong>: ${a.msg}</div><div class="activity-time">${a.date}</div></div></div>`).join('');
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

function renderMovementLogs(){
  const term=(document.getElementById('movement-search')?.value||'').toLowerCase();
  let entries=[...movementLogs].reverse();
  if(term) entries=entries.filter(m=>
    (m.documentId||'').toLowerCase().includes(term)||
    (m.handledBy||'').toLowerCase().includes(term)||
    (m.location||'').toLowerCase().includes(term)
  );
  const statEl=document.getElementById('movement-stats-row');
  if(statEl){
    const totalMoves=movementLogs.length;
    const uniqueHandlers=new Set(movementLogs.map(m=>m.handledBy)).size;
    const uniqueDocs=new Set(movementLogs.map(m=>m.documentId)).size;
    statEl.innerHTML=`
      <div class="stat-card"><div class="stat-card-label">Total Movements</div><div class="stat-card-num blue">${totalMoves}</div></div>
      <div class="stat-card"><div class="stat-card-label">Unique Handlers</div><div class="stat-card-num green">${uniqueHandlers}</div></div>
      <div class="stat-card"><div class="stat-card-label">Docs Tracked</div><div class="stat-card-num">${uniqueDocs}</div></div>`;
  }
  const tb=document.getElementById('movement-tbody');
  if(!entries.length){tb.innerHTML=`<tr><td colspan="6"><div class="empty-msg">No movement logs yet. Admin movements are logged here when QR scans are confirmed.</div></td></tr>`;return;}
  tb.innerHTML=entries.map(m=>{
    const doc=docs.find(d=>(d.internalId||d.id)===m.documentId);
    const docName=doc?doc.name:`<span style="color:var(--muted);font-style:italic">Unknown</span>`;
    const dispId = doc ? (doc.fullDisplayId||doc.displayId||doc.id) : m.documentId;
    return `<tr>
      <td style="font-size:11px;font-family:'DM Mono',monospace;color:var(--muted)">${m.displayDate||m.timestamp}</td>
      <td class="doc-id-cell">${dispId}</td>
      <td class="doc-name-cell">${docName}</td>
      <td style="font-size:13px;font-weight:500">${m.handledBy||'-'}</td>
      <td><span style="font-size:12px;color:#16a34a">${m.location||'-'}</span></td>
      <td><span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;background:#fffbeb;border:1px solid #fde68a;border-radius:20px;font-size:11px;font-weight:700;color:#92400e">${m.action||'Movement'}</span></td>
    </tr>`;
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
  statEl.innerHTML =
    '<div class="stat-card"><div class="stat-card-label">Total Scans</div><div class="stat-card-num blue">'+total+'</div></div>' +
    '<div class="stat-card"><div class="stat-card-label">Docs Scanned</div><div class="stat-card-num green">'+uniqueDocs+'</div></div>' +
    '<div class="stat-card"><div class="stat-card-label">Collection</div><div class="stat-card-num">scan_logs</div></div>';
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
            Download Final File
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
    const iconClass=isScan?'movement':'status';
    const actionLabel=isScan?'Movement':'Status Update';
    const hasLine=i<allEntries.length-1;
    return `<div class="hist-entry">
      ${hasLine?'<div class="hist-entry-line"></div>':''}
      <div class="hist-icon-wrap ${iconClass}">${isScan?
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><line x1="21" y1="21" x2="21" y2="21"/></svg>':
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'}</div>
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
   NOTIFICATIONS
======================================================== */
function addNotification(userId,msg,documentId){
  if(!notifications[userId]) notifications[userId]=[];
  notifications[userId].push({id:Date.now(),msg,date:nowStr(),read:false,documentId:documentId||null});
  save();renderNotifCount();
}
function renderNotifCount(){
  if(!currentUser)return;
  const notifs=(notifications[currentUser.id]||[]).filter(n=>!n.read);
  const el=document.getElementById('notif-count');
  if(notifs.length){el.textContent=notifs.length;el.style.display='';}
  else el.style.display='none';
}
function openNotifModal(){
  const notifs=(notifications[currentUser.id]||[]).slice().reverse();
  const nl=document.getElementById('notif-list');
  if(!notifs.length){nl.innerHTML='<p style="font-size:13px;color:var(--muted);padding:8px 0">No notifications.</p>';}
  else nl.innerHTML=notifs.map(n=>`
    <div class="notif-item ${n.read?'read':''}" onclick="handleNotifClick(${n.id})">
      <div class="notif-item-dot"></div>
      <div>
        <div class="notif-item-text">${n.msg}</div>
        <div class="notif-item-time">${n.date}</div>
        ${n.documentId?`<div class="notif-item-link">-> View Document</div>`:''}
      </div>
    </div>`).join('');
  openModal('notif-modal');
  setTimeout(()=>markAllRead(),1500);
}
function handleNotifClick(id){
  const notifs=notifications[currentUser.id]||[];
  const n=notifs.find(n=>n.id===id);if(!n)return;
  n.read=true;save();renderNotifCount();
  if(n.documentId){ openDocumentFromNotif(n.documentId); }
}
function markAllRead(){
  (notifications[currentUser.id]||[]).forEach(n=>n.read=true);
  save();renderNotifCount();
  document.querySelectorAll('.notif-item').forEach(el=>el.classList.add('read'));
  const nc=document.getElementById('notif-count');
  if(nc) nc.style.display='none';
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
if(notifBtn) notifBtn.onclick=openNotifModal;

async function _appInit() {
  if(initTrackingPage()){ return; }

  if(!accounts.find(a=>a.role==='admin')){
    const adminAcc={id:'USR-ADMIN0',username:'admin',name:'System Admin',password:'admin1234',role:'admin',color:'#fb923c',created:nowStr()};
    accounts.unshift(adminAcc);
    notifications['USR-ADMIN0']=[];
    activityLogs['USR-ADMIN0']=[];
    save();
  }

  const restored = await tryRestoreSession();

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