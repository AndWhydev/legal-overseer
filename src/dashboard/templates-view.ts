/**
 * Templates dashboard view.
 *
 * Lists active templates by category, with an add-new form for
 * admins/lawyers and a per-template detail page for viewing the body
 * + version history.
 */

import { escapeHtml } from './render.js';
import type { DocumentTemplate, DocumentTemplateVersion, TemplateCategory } from '../templates/index.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;
      --accent:#7aa2f7;--green:#6dd29b;--amber:#e5b76a;--red:#f07178}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
header h1{font-size:16px;margin:0}
header nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
header nav a:hover,header nav a.active{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:1200px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
.card{background:var(--panel);padding:16px 20px;border-radius:8px;margin-bottom:16px}
label{display:block;margin:8px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
input,select,textarea{background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:6px 8px;font:inherit;font-family:inherit;width:100%}
textarea{min-height:140px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}
button{background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:8px 14px;font:inherit;font-weight:600;cursor:pointer}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--panel-2);color:var(--muted);font-size:11px;margin-right:4px}
.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #2a2f3a}
th{background:var(--panel-2);color:var(--muted);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
pre.body{background:var(--panel-2);padding:12px;border-radius:6px;white-space:pre-wrap;font-family:'Georgia',serif;font-size:14px;line-height:1.6}
.flash{padding:10px 14px;border-radius:6px;margin-bottom:12px;background:#1f3d2a;color:#b6f0ce;border-left:4px solid var(--green);font-size:13px}
.flash.error{background:#4a2027;color:#ffb8bf;border-left:4px solid var(--red)}
`;

const CATEGORIES: TemplateCategory[] = ['nda', 'retainer', 'demand_letter', 'court_document', 'contract', 'correspondence', 'other'];

function shell(body: string, currentEmail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Templates — Legal Overseer</title><style>${STYLE}</style></head>
<body><header>
  <h1>Legal Overseer</h1>
  <nav>
    <a href="/">Matters</a>
    <a href="/review">Review queue</a>
    <a href="/calendar">Deadlines</a>
    <a href="/billing">Billing</a>
    <a href="/upload">Upload</a>
    <a href="/templates" class="active">Templates</a>
    <a href="/precedents">Precedents</a>
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>${body}</main></body></html>`;
}

export function renderTemplatesList(opts: {
  templates: DocumentTemplate[];
  currentEmail: string;
  flash?: { kind: 'ok' | 'error'; msg: string };
}): string {
  const grouped = new Map<TemplateCategory, DocumentTemplate[]>();
  for (const t of opts.templates) {
    const arr = grouped.get(t.category) ?? [];
    arr.push(t);
    grouped.set(t.category, arr);
  }

  const sections = CATEGORIES
    .map((c) => {
      const items = grouped.get(c) ?? [];
      if (!items.length) return '';
      const rows = items.map((t) => `<tr>
        <td><a href="/templates/${escapeHtml(t.slug)}">${escapeHtml(t.title)}</a></td>
        <td><span class="pill">${escapeHtml(t.source)}</span></td>
        <td>${escapeHtml(t.description ?? '')}</td>
        <td class="muted">${escapeHtml(t.updated_at)}</td>
      </tr>`).join('');
      return `<h2>${c.replace(/_/g, ' ')}</h2>
        <table><thead><tr><th>Title</th><th>Source</th><th>Description</th><th>Updated</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('\n');

  const flashHtml = opts.flash ? `<div class="flash ${opts.flash.kind === 'error' ? 'error' : ''}">${escapeHtml(opts.flash.msg)}</div>` : '';

  const body = `
    ${flashHtml}
    <h2>Add template</h2>
    <div class="card">
      <form method="post" action="/templates/create">
        <label>Slug (URL-safe identifier)</label>
        <input name="slug" required pattern="[a-z0-9-]+">
        <label>Title</label>
        <input name="title" required>
        <label>Category</label>
        <select name="category">${CATEGORIES.map((c) => `<option value="${c}">${c.replace(/_/g, ' ')}</option>`).join('')}</select>
        <label>Description</label>
        <input name="description">
        <label>Body (Markdown)</label>
        <textarea name="body_markdown" required></textarea>
        <button type="submit" style="margin-top:12px">Add template</button>
      </form>
    </div>

    ${sections || '<p class="muted">No templates yet.</p>'}
  `;
  return shell(body, opts.currentEmail);
}

export function renderTemplateDetail(opts: {
  template: DocumentTemplate;
  versions: DocumentTemplateVersion[];
  currentEmail: string;
  flash?: { kind: 'ok' | 'error'; msg: string };
}): string {
  const flashHtml = opts.flash ? `<div class="flash ${opts.flash.kind === 'error' ? 'error' : ''}">${escapeHtml(opts.flash.msg)}</div>` : '';
  const verRows = opts.versions.map((v) => `<tr>
    <td>v${v.version}</td>
    <td class="muted">${escapeHtml(v.created_at)}</td>
    <td>${escapeHtml(v.author_email ?? '—')}</td>
    <td>${escapeHtml(v.change_note ?? '')}</td>
  </tr>`).join('');
  const body = `
    ${flashHtml}
    <p><a href="/templates">← all templates</a></p>
    <h2>${escapeHtml(opts.template.title)}</h2>
    <p>
      <span class="pill">${escapeHtml(opts.template.category)}</span>
      <span class="pill">${escapeHtml(opts.template.source)}</span>
      <span class="pill">slug: ${escapeHtml(opts.template.slug)}</span>
      <span class="pill">${opts.template.active ? 'active' : 'inactive'}</span>
    </p>
    <p class="muted">${escapeHtml(opts.template.description ?? '')}</p>

    <h2>Body</h2>
    <pre class="body">${escapeHtml(opts.template.body_markdown)}</pre>

    <h2>Update template</h2>
    <div class="card">
      <form method="post" action="/templates/${escapeHtml(opts.template.slug)}/update">
        <label>Title</label>
        <input name="title" value="${escapeHtml(opts.template.title)}" required>
        <label>Description</label>
        <input name="description" value="${escapeHtml(opts.template.description ?? '')}">
        <label>Body (Markdown)</label>
        <textarea name="body_markdown" required>${escapeHtml(opts.template.body_markdown)}</textarea>
        <label>Change note</label>
        <input name="change_note" placeholder="e.g. 'updated GST clause'">
        <button type="submit" style="margin-top:12px">Save new version</button>
      </form>
    </div>

    <h2>Version history</h2>
    <table><thead><tr><th>Version</th><th>When</th><th>Author</th><th>Note</th></tr></thead><tbody>${verRows || '<tr><td colspan="4" class="muted">No prior versions.</td></tr>'}</tbody></table>
  `;
  return shell(body, opts.currentEmail);
}
