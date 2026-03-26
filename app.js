// ══ IDEA ENCRYPTION ════════════════════════════════════════
const IDEA = (() => {
  // — Core operations —
  // Multiply mod 65537 (0 represents 2^16)
  function mu(a, b) {
    a &= 0xFFFF; b &= 0xFFFF;
    if (!a) a = 65536;
    if (!b) b = 65536;
    const r = Number(BigInt(a) * BigInt(b) % 65537n);
    return r === 65536 ? 0 : r;
  }
  // Multiplicative inverse mod 65537
  function mi(a) {
    if (!a) return 0; if (a === 1) return 1;
    let t = 0n, nt = 1n, r = 65537n, nr = BigInt(a);
    while (nr) { const q = r / nr; [t,nt] = [nt, t-q*nt]; [r,nr] = [nr, r%nr]; }
    return Number(t < 0n ? t + 65537n : t);
  }
  const ai = a => (65536 - a) & 0xFFFF;   // additive inverse mod 65536
  const ad = (a, b) => (a + b) & 0xFFFF;
  const xo = (a, b) => a ^ b;

  // — Key schedule —
  // Expand a 16-byte key into 52 uint16 subkeys using 25-bit left rotations
  function expandKey(keyStr) {
    const src = new TextEncoder().encode(keyStr.padEnd(16, '\0').slice(0, 16));
    const buf = new Uint8Array(16);
    buf.set(src);
    const sk = [];
    while (sk.length < 52) {
      for (let i = 0; i < 8 && sk.length < 52; i++)
        sk.push(((buf[i*2] << 8) | buf[i*2+1]) & 0xFFFF);
      // Rotate the 128-bit buffer left by 25 bits
      let v = 0n;
      for (let i = 0; i < 16; i++) v = (v << 8n) | BigInt(buf[i]);
      v = ((v << 25n) | (v >> 103n)) & ((1n << 128n) - 1n);
      for (let i = 15; i >= 0; i--) { buf[i] = Number(v & 0xFFn); v >>= 8n; }
    }
    return sk;
  }

  // Derive 52 decryption subkeys from encryption subkeys
  // Order: invert output transform, then go through rounds 8→1 with inverted round keys
  function decSubkeys(ek) {
    const dk = new Array(52).fill(0);
    let p = 0, q = 48;
    // Invert the output transform (ek[48..51])
    dk[p++] = mi(ek[q]);   dk[p++] = ai(ek[q+1]);
    dk[p++] = ai(ek[q+2]); dk[p++] = mi(ek[q+3]);
    // Walk backwards through rounds 8 down to 1
    for (let r = 7; r >= 0; r--) {
      q = r * 6;
      dk[p++] = ek[q+4]; dk[p++] = ek[q+5];   // MA-chain keys are reused as-is
      dk[p++] = mi(ek[q]);                      // mul inverse of round key 1
      if (r > 0) {
        dk[p++] = ai(ek[q+2]); dk[p++] = ai(ek[q+1]); // add keys SWAPPED for rounds 2-8
      } else {
        dk[p++] = ai(ek[q+1]); dk[p++] = ai(ek[q+2]); // no swap for round 1
      }
      dk[p++] = mi(ek[q+3]);                   // mul inverse of round key 4
    }
    return dk;
  }

  // — Block cipher (same function used for both encrypt and decrypt) —
  function block(w1, w2, w3, w4, sk) {
    let a = w1, b = w2, c = w3, d = w4;
    for (let r = 0; r < 8; r++) {
      const z = r * 6;
      const t1=mu(a,sk[z]), t2=ad(b,sk[z+1]), t3=ad(c,sk[z+2]), t4=mu(d,sk[z+3]);
      const t5=xo(t1,t3),  t6=xo(t2,t4);
      const t7=mu(t5,sk[z+4]), t8=ad(t6,t7), t9=mu(t8,sk[z+5]), t10=ad(t7,t9);
      const o1=xo(t1,t9), o2=xo(t2,t10), o3=xo(t3,t9), o4=xo(t4,t10);
      // Swap b and c between rounds (not after the last round)
      if (r < 7) { a=o1; b=o3; c=o2; d=o4; }
      else       { a=o1; b=o2; c=o3; d=o4; }
    }
    return [mu(a,sk[48]), ad(b,sk[49]), ad(c,sk[50]), mu(d,sk[51])];
  }

  // — Public API —
  function encrypt(text, keyStr) {
    const sk = expandKey(keyStr);
    const data = new TextEncoder().encode(text);
    const pad = 8 - (data.length % 8);
    const p = new Uint8Array(data.length + pad);
    p.set(data); p.fill(pad, data.length);   // PKCS#7 padding
    let hex = '';
    for (let i = 0; i < p.length; i += 8) {
      const [y1,y2,y3,y4] = block(
        (p[i]<<8)|p[i+1], (p[i+2]<<8)|p[i+3],
        (p[i+4]<<8)|p[i+5], (p[i+6]<<8)|p[i+7], sk);
      hex += y1.toString(16).padStart(4,'0') + y2.toString(16).padStart(4,'0') +
             y3.toString(16).padStart(4,'0') + y4.toString(16).padStart(4,'0');
    }
    return hex.toUpperCase();
  }

  function decrypt(hex, keyStr) {
    const dk = decSubkeys(expandKey(keyStr));
    const bytes = [];
    for (let i = 0; i < hex.length; i += 16) {
      const c = hex.slice(i, i+16);
      const [y1,y2,y3,y4] = block(
        parseInt(c.slice(0,4),16), parseInt(c.slice(4,8),16),
        parseInt(c.slice(8,12),16), parseInt(c.slice(12,16),16), dk);
      bytes.push((y1>>8)&0xFF, y1&0xFF, (y2>>8)&0xFF, y2&0xFF,
                 (y3>>8)&0xFF, y3&0xFF, (y4>>8)&0xFF, y4&0xFF);
    }
    const padLen = bytes[bytes.length - 1];
    return new TextDecoder().decode(new Uint8Array(bytes.slice(0, bytes.length - padLen)));
  }

  return { encrypt, decrypt };
})();

// ══ STATE ══════════════════════════════════════════════════
const KEY = "Group6CITKey2024";
let docs = [], adminPin = "1234", updateId = null;
const genId  = () => 'DOC-' + Date.now().toString(36).toUpperCase().slice(-5);
const nowStr = () => new Date().toLocaleString('en-PH');

// ══ LOCALSTORAGE ═══════════════════════════════════════════
function saveDocs()  { try { localStorage.setItem('cit_docs', JSON.stringify(docs)); } catch(e){} }
function savePin()   { try { localStorage.setItem('cit_pin',  adminPin); } catch(e){} }
function loadDocs()  {
  try { const s=localStorage.getItem('cit_docs'); if(s){ docs=JSON.parse(s); return true; } } catch(e){}
  return false;
}
function loadPin()   { try { const s=localStorage.getItem('cit_pin');  if(s) adminPin=s; } catch(e){} }

const badgeMap = {
  'Received':'received','Processing':'processing',
  'For Approval':'forapproval','Approved':'approved',
  'Released':'released','Rejected':'rejected'
};

function statusBadge(s) {
  return `<span class="badge badge-${badgeMap[s]||'received'}">${s}</span>`;
}

// ── Add ──
function addDocument() {
  const name=document.getElementById('new-name').value.trim(),
        type=document.getElementById('new-type').value,
        by=document.getElementById('new-by').value.trim(),
        purpose=document.getElementById('new-purpose').value.trim();
  if(!name||!type||!by||!purpose){toast("Please fill in all fields.");return;}
  docs.push({id:genId(),name,type,by,purpose,date:nowStr(),status:'Received',enc:IDEA.encrypt(name,KEY)});
  ['new-name','new-type','new-by','new-purpose'].forEach(id=>document.getElementById(id).value='');
  saveDocs(); renderAll(); toast("Document encrypted and saved!");
  showPage('vault', document.querySelector('[onclick*="vault"]'));
}

// ── Delete ──
function deleteDoc(id){
  if(!confirm("Delete this document?"))return;
  docs=docs.filter(d=>d.id!==id);
  saveDocs(); renderAll(); toast("Document removed.");
}

// ── Update ──
function openUpdate(id){
  updateId=id;
  document.getElementById('upd-id').value=id;
  document.getElementById('upd-note').value='';
  document.getElementById('update-modal').classList.add('open');
}
function applyUpdate(){
  const d=docs.find(d=>d.id===updateId);
  if(d) d.status=document.getElementById('upd-status').value;
  closeModal('update-modal'); saveDocs(); renderAll(); toast("Status updated!");
}

// ── QR ──
function openQR(id){
  const d=docs.find(d=>d.id===id);if(!d)return;
  document.getElementById('qr-name').textContent=d.name;
  document.getElementById('qr-status').textContent='Status: '+d.status+' · ID: '+d.id;
  document.getElementById('qr-wrap').innerHTML='';
  document.getElementById('qr-modal').classList.add('open');
  const txt=`CIT DOCUMENT\nID: ${d.id}\nName: ${d.name}\nType: ${d.type}\nBy: ${d.by}\nStatus: ${d.status}\nDate: ${d.date}\nGroup 6 - IDEA Encryption`;
  setTimeout(()=>new QRCode(document.getElementById('qr-wrap'),{text:txt,width:200,height:200,correctLevel:QRCode.CorrectLevel.H}),80);
}

function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.overlay').forEach(el=>el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('open');}));

// ── Render ──
function renderAll(){ renderStats(); renderDash(); renderVault(); }

function renderStats(){
  const total=docs.length,
        released=docs.filter(d=>d.status==='Released').length,
        pending=docs.filter(d=>['Received','Processing','For Approval'].includes(d.status)).length,
        rejected=docs.filter(d=>d.status==='Rejected').length;
  document.getElementById('stats-row').innerHTML=`
    <div class="stat"><div class="stat-label">Total</div><div class="stat-num">${total}</div></div>
    <div class="stat"><div class="stat-label">Released</div><div class="stat-num green">${released}</div></div>
    <div class="stat"><div class="stat-label">In Progress</div><div class="stat-num yellow">${pending}</div></div>
    <div class="stat"><div class="stat-label">Rejected</div><div class="stat-num red">${rejected}</div></div>
  `;
}

function docActions(id){
  return `<div style="display:flex;gap:6px;align-items:center;">
    <button class="btn btn-sm btn-blue" onclick="openUpdate('${id}')">Update</button>
    <button class="btn btn-sm btn-purple" onclick="openQR('${id}')">QR</button>
    <button class="btn btn-sm btn-red-soft" onclick="deleteDoc('${id}')">Delete</button>
  </div>`;
}

function renderDash(){
  const tb=document.getElementById('dash-tbody');
  const rows=[...docs].reverse().slice(0,8);
  if(!rows.length){tb.innerHTML=`<tr><td colspan="6"><div class="empty-msg">No documents yet.</div></td></tr>`;return;}
  tb.innerHTML=rows.map(d=>`<tr>
    <td class="doc-id-cell">${d.id}</td>
    <td class="doc-name-cell">${d.name}</td>
    <td style="color:var(--muted);font-size:12px">${d.type}</td>
    <td style="font-size:13px">${d.by}</td>
    <td>${statusBadge(d.status)}</td>
    <td style="white-space:nowrap;">${docActions(d.id)}</td>
  </tr>`).join('');
}

function renderVault(){
  const term=(document.getElementById('search-input')?.value||'').toLowerCase();
  const rows=docs.filter(d=>!term||d.id.toLowerCase().includes(term)||d.name.toLowerCase().includes(term)||d.by.toLowerCase().includes(term));
  const tb=document.getElementById('vault-tbody');
  if(!rows.length){tb.innerHTML=`<tr><td colspan="7"><div class="empty-msg">No documents found.</div></td></tr>`;return;}
  tb.innerHTML=rows.map(d=>`<tr>
    <td class="doc-id-cell">${d.id}</td>
    <td class="doc-name-cell">${d.name}</td>
    <td style="font-size:13px">${d.by}</td>
    <td class="enc-cell">${d.enc.slice(0,16)}…</td>
    <td class="dec-cell">${IDEA.decrypt(d.enc,KEY)}</td>
    <td>${statusBadge(d.status)}</td>
    <td style="white-space:nowrap;">${docActions(d.id)}</td>
  </tr>`).join('');
}

// ── Demo ──
function runDemo(){
  const key=document.getElementById('demo-key').value||KEY;
  const msg=document.getElementById('demo-msg').value||'Hello CIT!';
  const enc=IDEA.encrypt(msg,key), dec=IDEA.decrypt(enc,key);
  document.getElementById('d-orig').textContent=msg;
  document.getElementById('d-enc').textContent=enc;
  document.getElementById('d-dec').textContent=dec;
  document.getElementById('demo-result').style.display='block';
  toast("Encryption demo complete!");
}

// ── Navigation ──
function showPage(id, btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(btn) btn.classList.add('active');
}

// ── Lock ──
function lockApp(){
  document.getElementById('lock-screen').classList.add('show');
  document.getElementById('pin-input').value='';
  document.getElementById('pin-error').style.display='none';
}
function unlock(){
  if(document.getElementById('pin-input').value===adminPin){
    document.getElementById('lock-screen').classList.remove('show');
    document.getElementById('pin-error').style.display='none';
  } else {
    document.getElementById('pin-error').style.display='block';
    document.getElementById('pin-input').value='';
  }
}
function changePin(){
  const v=document.getElementById('new-pin').value.trim();
  if(!v||v.length<4){toast("PIN must be at least 4 characters.");return;}
  adminPin=v; document.getElementById('new-pin').value='';
  savePin(); toast("PIN updated successfully!");
}

// ── Toast ──
let toastTimer;
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),2800);
}

// ── Init ──
loadPin();
const hasSaved = loadDocs();
if(!hasSaved || docs.length === 0) {
  [['Enrollment Form','Academic','Juan dela Cruz','2nd Semester Enrollment','Processing'],
   ['Laboratory Request','Laboratory','Maria Santos','Lab Equipment Request','For Approval'],
   ['Certificate of Registration','Academic','Pedro Reyes','COR for Scholarship','Released']
  ].forEach(([name,type,by,purpose,status])=>{
    docs.push({id:genId(),name,type,by,purpose,date:nowStr(),status,enc:IDEA.encrypt(name,KEY)});
  });
  saveDocs();
}
renderAll();