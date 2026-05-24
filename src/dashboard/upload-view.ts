/**
 * Upload portal HTML.
 *
 * Single page with a drag-and-drop dropzone, a matter selector (or "new
 * matter") option, an extraction-progress strip, and a list of the
 * uploads completed in this session. The browser uploads to
 * POST /upload as multipart/form-data; the server replies with JSON.
 */

import { escapeHtml } from './render.js';
import type { Matter } from '../db/repositories/matters.js';
import type { StoredDocument } from '../uploads/index.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;
      --accent:#7aa2f7;--green:#6dd29b;--amber:#e5b76a;--red:#f07178}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
header h1{font-size:16px;margin:0}
header nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
header nav a:hover,header nav a.active{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:1100px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
.dropzone{border:2px dashed #2a4670;border-radius:12px;padding:48px 24px;text-align:center;background:var(--panel);cursor:pointer;transition:background .15s}
.dropzone.dragover{background:#1d2740;border-color:var(--accent)}
.dropzone .icon{font-size:32px;margin-bottom:8px;color:var(--accent)}
.dropzone p{margin:8px 0;color:var(--muted)}
.dropzone strong{color:var(--text)}
.card{background:var(--panel);padding:16px 20px;border-radius:8px;margin-bottom:16px}
label{display:block;margin:8px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
input,select{background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:6px 8px;font:inherit;min-width:240px}
button{background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer}
.progress{margin-top:12px}
.progress .row{display:grid;grid-template-columns:1fr 100px 1fr;gap:8px;padding:6px 8px;background:var(--panel-2);border-radius:4px;margin-bottom:4px;font-size:13px}
.progress .ok{color:var(--green)}
.progress .err{color:var(--red)}
.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #2a2f3a}
th{background:var(--panel-2);color:var(--muted);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--panel-2);color:var(--muted);font-size:11px}
.flash{padding:10px 14px;border-radius:6px;margin-bottom:12px;background:#1f3d2a;color:#b6f0ce;border-left:4px solid var(--green);font-size:13px}
.flash.error{background:#4a2027;color:#ffb8bf;border-left:4px solid var(--red)}
`;

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function renderUploadPage(opts: {
  currentEmail: string;
  matters: Matter[];
  recent: StoredDocument[];
  matterLookup: Map<string, Matter>;
  flash?: { kind: 'ok' | 'error'; msg: string };
}): string {
  const matterOptions = opts.matters
    .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.matter_number)} — ${escapeHtml(m.title)}</option>`)
    .join('');
  const flashHtml = opts.flash
    ? `<div class="flash ${opts.flash.kind === 'error' ? 'error' : ''}">${escapeHtml(opts.flash.msg)}</div>`
    : '';
  const recentRows = opts.recent.length
    ? opts.recent.map((d) => {
        const matter = opts.matterLookup.get(d.matterId);
        return `<tr>
          <td><a href="/matter/${escapeHtml(d.matterId)}/document/${escapeHtml(d.id)}">${escapeHtml(d.filename)}</a></td>
          <td>${matter ? `<a href="/matter/${escapeHtml(matter.id)}">${escapeHtml(matter.matter_number)}</a>` : '<span class="muted">—</span>'}</td>
          <td><span class="pill">${fmtBytes(d.sizeBytes)}</span></td>
          <td>${escapeHtml(String(d.extractedChars))} chars</td>
          <td class="muted">${escapeHtml(d.uploadedAt)}</td>
          <td class="muted">${escapeHtml(d.extractionNote)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="6" class="muted">No uploads yet in this session.</td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Upload — Legal Overseer</title><style>${STYLE}</style></head>
<body>
<header>
  <h1>Legal Overseer</h1>
  <nav>
    <a href="/">Matters</a>
    <a href="/review">Review queue</a>
    <a href="/calendar">Deadlines</a>
    <a href="/billing">Billing</a>
    <a href="/upload" class="active">Upload</a>
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(opts.currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>
  ${flashHtml}

  <h2>Upload document</h2>
  <div class="card">
    <label>Attach to matter</label>
    <select id="matter-select">
      <option value="">— Create a new matter from this document —</option>
      ${matterOptions}
    </select>

    <div id="dropzone" class="dropzone" style="margin-top:16px">
      <div class="icon">⬆</div>
      <p><strong>Drag &amp; drop files</strong> here, or click to choose</p>
      <p class="muted">PDF, DOCX, DOC, TXT — max 50 MB per file. Text is extracted locally before any AI call.</p>
      <input type="file" id="file-input" multiple accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden>
    </div>

    <div id="progress" class="progress"></div>
  </div>

  <h2>Recent uploads</h2>
  <table>
    <thead><tr><th>Filename</th><th>Matter</th><th>Size</th><th>Extracted</th><th>When</th><th>Extraction note</th></tr></thead>
    <tbody>${recentRows}</tbody>
  </table>
</main>

<script>
(function() {
  const dz = document.getElementById('dropzone');
  const input = document.getElementById('file-input');
  const progress = document.getElementById('progress');
  const matterSelect = document.getElementById('matter-select');

  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    if (e.dataTransfer && e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });
  input.addEventListener('change', () => {
    if (input.files && input.files.length) handleFiles(input.files);
  });

  function row(name, status, msg) {
    const div = document.createElement('div');
    div.className = 'row';
    div.innerHTML = '<div>' + escape(name) + '</div><div>' + status + '</div><div class="' + (status === 'done' ? 'ok' : status === 'failed' ? 'err' : 'muted') + '">' + escape(msg) + '</div>';
    progress.prepend(div);
    return div;
  }
  function escape(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  async function handleFiles(files) {
    for (const f of files) {
      const r = row(f.name, 'uploading…', '');
      const fd = new FormData();
      fd.append('file', f);
      if (matterSelect.value) fd.append('matter_id', matterSelect.value);
      try {
        const resp = await fetch('/upload', { method: 'POST', body: fd });
        const body = await resp.json();
        if (!resp.ok) throw new Error(body.error || 'upload failed');
        r.querySelector('div:nth-child(2)').textContent = 'done';
        r.querySelector('div:nth-child(3)').className = 'ok';
        r.querySelector('div:nth-child(3)').textContent = body.matter_number
          ? ('→ ' + body.matter_number + ' (' + body.extracted_chars + ' chars, ' + body.extraction_note + ')')
          : (body.extracted_chars + ' chars, ' + body.extraction_note);
      } catch (err) {
        r.querySelector('div:nth-child(2)').textContent = 'failed';
        r.querySelector('div:nth-child(3)').className = 'err';
        r.querySelector('div:nth-child(3)').textContent = err.message;
      }
    }
    setTimeout(() => location.reload(), 1500);
  }
})();
</script>
</body></html>`;
}
