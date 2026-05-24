/**
 * Precedents dashboard views — search list + detail.
 */

import { escapeHtml } from './render.js';
import type { Precedent } from '../precedents/index.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;--accent:#7aa2f7;--green:#6dd29b;--red:#f07178}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
nav a.active,nav a:hover{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:1100px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
.card{background:var(--panel);padding:16px 20px;border-radius:8px;margin-bottom:16px}
label{display:block;margin:8px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
input,select{background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:8px 10px;font:inherit;width:100%}
button{background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer;margin-top:12px}
table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #2a2f3a}
th{background:var(--panel-2);color:var(--muted);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--panel-2);color:var(--muted);font-size:11px;margin-right:4px}
.muted{color:var(--muted)}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
pre.body{background:var(--panel-2);padding:12px;border-radius:6px;white-space:pre-wrap;font-family:'Georgia',serif;font-size:14px;line-height:1.6}
`;

function shell(currentEmail: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Precedents — Legal Overseer</title><style>${STYLE}</style></head>
<body><header>
  <h1 style="font-size:16px;margin:0">Legal Overseer</h1>
  <nav>
    <a href="/">Matters</a>
    <a href="/review">Review queue</a>
    <a href="/calendar">Deadlines</a>
    <a href="/billing">Billing</a>
    <a href="/upload">Upload</a>
    <a href="/templates">Templates</a>
    <a href="/precedents" class="active">Precedents</a>
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>${body}</main></body></html>`;
}

export function renderPrecedentsList(opts: {
  currentEmail: string;
  results: Precedent[];
  query: string;
  matterType: string;
  documentType: string;
}): string {
  const rows = opts.results.length
    ? opts.results.map((p) => `<tr>
        <td><a href="/precedents/${escapeHtml(p.id)}">${escapeHtml(p.title)}</a></td>
        <td><span class="pill">${escapeHtml(p.category)}</span></td>
        <td>${escapeHtml(p.matter_type ?? '—')}</td>
        <td>${escapeHtml(p.document_type ?? '—')}</td>
        <td>${escapeHtml(p.added_by ?? '—')}</td>
        <td class="muted">${escapeHtml(p.created_at)}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="muted">No precedents match. Approve a draft on /review and click "Add to precedent library" to start your collection.</td></tr>`;

  const body = `
    <h2>Search precedents</h2>
    <div class="card">
      <form method="get" action="/precedents" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;align-items:end">
        <div><label>Free-text</label><input name="q" value="${escapeHtml(opts.query)}" placeholder="search title + body"></div>
        <div><label>Matter type</label><input name="matter_type" value="${escapeHtml(opts.matterType)}" placeholder="e.g. commercial"></div>
        <div><label>Document type</label><input name="document_type" value="${escapeHtml(opts.documentType)}" placeholder="e.g. letter"></div>
        <div><button type="submit">Search</button></div>
      </form>
    </div>

    <h2>Results (${opts.results.length})</h2>
    <table>
      <thead><tr><th>Title</th><th>Category</th><th>Matter type</th><th>Document type</th><th>Added by</th><th>When</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  return shell(opts.currentEmail, body);
}

export function renderPrecedentDetail(opts: { currentEmail: string; precedent: Precedent }): string {
  const p = opts.precedent;
  const body = `
    <p><a href="/precedents">← back to precedents</a></p>
    <h2>${escapeHtml(p.title)}</h2>
    <p>
      <span class="pill">${escapeHtml(p.category)}</span>
      ${p.matter_type ? `<span class="pill">matter: ${escapeHtml(p.matter_type)}</span>` : ''}
      ${p.document_type ? `<span class="pill">document: ${escapeHtml(p.document_type)}</span>` : ''}
      ${p.practice_area ? `<span class="pill">practice: ${escapeHtml(p.practice_area)}</span>` : ''}
    </p>
    <p class="muted">Added by ${escapeHtml(p.added_by ?? '—')} on ${escapeHtml(p.created_at)}.${p.source_review_id ? ` Sourced from review <a href="/review/${escapeHtml(p.source_review_id)}">${escapeHtml(p.source_review_id.slice(0, 8))}</a>.` : ''}</p>
    <h2>Body</h2>
    <pre class="body">${escapeHtml(p.body_markdown)}</pre>
  `;
  return shell(opts.currentEmail, body);
}

export function renderPrecedentOfferForm(opts: {
  currentEmail: string;
  reviewId: string;
  defaultTitle: string;
  defaultCategory: string;
  defaultMatterType: string | null;
  defaultDocumentType: string | null;
  bodyMarkdown: string;
}): string {
  const cats = ['letter', 'memo', 'contract', 'court_document', 'nda', 'retainer', 'demand_letter', 'correspondence', 'other'];
  const body = `
    <h2>Offer this approved document as a firm precedent</h2>
    <div class="card">
      <p class="muted">Approved drafts can be saved to the firm's precedent library so future drafts of the same kind start from your own work, not a generic template.</p>
      <form method="post" action="/precedents/from-review/${escapeHtml(opts.reviewId)}">
        <label>Title</label>
        <input name="title" value="${escapeHtml(opts.defaultTitle)}" required>
        <label>Category</label>
        <select name="category">
          ${cats.map((c) => `<option value="${c}"${c === opts.defaultCategory ? ' selected' : ''}>${c}</option>`).join('')}
        </select>
        <label>Matter type (optional)</label>
        <input name="matter_type" value="${escapeHtml(opts.defaultMatterType ?? '')}">
        <label>Document type (optional)</label>
        <input name="document_type" value="${escapeHtml(opts.defaultDocumentType ?? '')}">
        <label>Tags (comma-separated)</label>
        <input name="tags">
        <button type="submit">Add to precedent library</button>
      </form>
    </div>
  `;
  return shell(opts.currentEmail, body);
}
