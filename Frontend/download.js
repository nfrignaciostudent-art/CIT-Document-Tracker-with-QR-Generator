/* ══════════════════════════════════════════════════════════════════════
   download.js — File Download Logic
   CIT Document Tracker · Group 6

   Rule: Download button ONLY appears when document status === 'Released'
   Rule: No inline file preview (PDF embed / image preview removed)
   Rule: Clean, minimal download UI only
══════════════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════════════
   download.js — File Download Logic (Updated for Dual-File System)
   CIT Document Tracker · Group 6

   TWO FILE TYPES:
     originalFile  — uploaded by user at registration (reference copy)
     processedFile — uploaded by admin when approving/releasing (final copy)

   RULE: Only processedFile is downloadable, and ONLY when status === 'Released'
   RULE: Download button ONLY appears when processedFile exists AND status === 'Released'
   RULE: Show clear labels: "Original File (Submitted)" / "Final File (Approved)"
══════════════════════════════════════════════════════════════════════ */

/* Build the file section HTML for the PUBLIC tracking page */
function buildPublicFileSection(d) {
  const isReleased      = d.status === 'Released';
  const sc              = statusColorMap[d.status] || '#64748b';
  const hasOriginal     = (typeof docHasOriginalFile === 'function') ? docHasOriginalFile(d) : !!(d.fileData || d.originalFile || d.hasFile || d.hasOriginalFile);
  const hasProcessed    = (typeof docHasProcessedFile === 'function') ? docHasProcessedFile(d) : !!(d.processedFile || d.hasProcessedFile);
  const docKey          = d.internalId || d.id;
  const processedBy     = d.processedBy || 'Admin';
  const processedAt     = d.processedAt || '';

  // Nothing attached at all
  if (!hasOriginal && !hasProcessed) {
    return '<p style="font-size:13px;color:rgba(255,255,255,.3);text-align:center;padding:28px 0">No digital file attached to this document.</p>';
  }

  let html = '<div style="padding:4px 0">';

  /* ── Original File row (always shown if exists) ── */
  if (hasOriginal) {
    html += `
      <div style="display:flex;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,.06)">
        <div style="width:38px;height:38px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;display:grid;place-items:center;flex-shrink:0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.7);margin-bottom:2px">Original File (Submitted)</div>
          <div style="font-size:11px;color:rgba(255,255,255,.3)">Submitted by ${d.by || d.ownerName || 'user'} · IDEA-128 encrypted at rest · Not downloadable</div>
        </div>
        <div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.25);padding:3px 10px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px">Reference Only</div>
      </div>`;
  }

  /* ── Processed/Final File row ── */
  if (hasProcessed && isReleased) {
    /* Released + processed file = show download button */
    html += `
      <div style="padding:20px 18px">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px">
          <div style="width:38px;height:38px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);border-radius:8px;display:grid;place-items:center;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><polyline points="9 15 12 18 15 15"/><line x1="12" y1="18" x2="12" y2="12"/></svg>
          </div>
          <div style="flex:1">
            <div style="font-size:12px;font-weight:700;color:#22c55e;margin-bottom:2px">Final File (Approved)</div>
            <div style="font-size:11px;color:rgba(255,255,255,.35)">Processed by ${processedBy}${processedAt ? ' · ' + processedAt : ''} · IDEA-128 encrypted</div>
          </div>
          <div style="display:inline-flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#22c55e;padding:3px 10px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.25);border-radius:20px">
            <span style="width:5px;height:5px;border-radius:50%;background:#22c55e;display:inline-block"></span>Released
          </div>
        </div>
        <div style="text-align:center">
          <button onclick="decryptAndDownload('${docKey}',this)"
             style="display:inline-flex;align-items:center;gap:10px;padding:13px 32px;
                    background:#22c55e;color:#0d1117;border:none;border-radius:8px;
                    font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;
                    cursor:pointer;transition:opacity .15s"
             onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Final File
          </button>
          <p style="font-size:10px;color:rgba(255,255,255,.2);margin-top:10px">Decrypted locally with IDEA-128 · File never stored unencrypted on server</p>
        </div>
      </div>`;
  } else if (!hasProcessed && isReleased) {
    /* Released but no processed file yet (shouldn't happen with validation, but graceful fallback) */
    html += `
      <div style="text-align:center;padding:28px 18px">
        <p style="font-size:13px;color:rgba(255,255,255,.5);font-weight:600;margin-bottom:6px">Awaiting Final File</p>
        <p style="font-size:12px;color:rgba(255,255,255,.3);line-height:1.6">The admin has not yet uploaded the processed/final file.</p>
      </div>`;
  } else {
    /* Not yet released — file is locked */
    html += `
      <div style="text-align:center;padding:28px 18px">
        <div style="width:52px;height:52px;margin:0 auto 14px;background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.1);border-radius:50%;display:grid;place-items:center">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <p style="font-size:14px;color:rgba(255,255,255,.7);font-weight:600;margin-bottom:8px">Final File Pending</p>
        <p style="font-size:12px;color:rgba(255,255,255,.35);line-height:1.7;margin-bottom:16px">
          The admin will upload the final/processed version of this document.<br>
          It will be available for download once the status reaches
          <strong style="color:rgba(74,222,128,.8)">Released</strong>.
        </p>
        <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:20px;font-size:12px;color:rgba(255,255,255,.45)">
          Current status: <strong style="color:${sc};margin-left:4px">${d.status}</strong>
        </div>
      </div>`;
  }

  html += '</div>';
  return html;
}
