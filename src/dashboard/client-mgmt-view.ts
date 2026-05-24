/**
 * Client management dashboard view.
 *
 * Admin / lawyer view for managing client portal accounts and which
 * matters each client can see.
 */

import { escapeHtml } from './render.js';
import type { Matter } from '../db/repositories/matters.js';
import type { ClientUser } from '../client-portal/index.js';
import { listClientMatters } from '../client-portal/index.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;--accent:#7aa2f7;--green:#6dd29b;--red:#f07178}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
nav a.active,nav a:hover{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:1200px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
.card{background:var(--panel);padding:20px;border-radius:8px;margin-bottom:16px}
label{display:block;margin:8px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
input,select{background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:6px 8px;font:inherit;width:100%}
button{background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:6px 14px;font:inherit;font-weight:600;cursor:pointer;margin-left:8px}
table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #2a2f3a}
th{background:var(--panel-2);color:var(--muted);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--panel-2);color:var(--muted);font-size:11px;margin-right:4px}
.flash{padding:10px 14px;border-radius:6px;margin-bottom:12px;background:#1f3d2a;color:#b6f0ce;border-left:4px solid var(--green);font-size:13px}
.flash.error{background:#4a2027;color:#ffb8bf;border-left:4px solid var(--red)}
.muted{color:var(--muted)}
`;

export function renderClientMgmtPage(opts: {
  currentEmail: string;
  clients: ClientUser[];
  matters: Matter[];
  flash?: { kind: 'ok' | 'error'; msg: string };
}): string {
  const flashHtml = opts.flash ? `<div class="flash ${opts.flash.kind === 'error' ? 'error' : ''}">${escapeHtml(opts.flash.msg)}</div>` : '';
  const matterLookup = new Map(opts.matters.map((m) => [m.id, m]));

  const rows = opts.clients.map((c) => {
    const granted = listClientMatters(c.id)
      .map((mid) => matterLookup.get(mid))
      .filter((m): m is Matter => !!m);
    const matterPills = granted.length
      ? granted.map((m) => `<span class="pill">${escapeHtml(m.matter_number)}</span>`).join('')
      : '<span class="muted">none</span>';
    const matterOpts = opts.matters
      .map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.matter_number)} — ${escapeHtml(m.title)}</option>`)
      .join('');
    return `<tr>
      <td>${escapeHtml(c.full_name)}</td>
      <td>${escapeHtml(c.email)}</td>
      <td>${matterPills}</td>
      <td>${escapeHtml(c.last_login_at ?? '—')}</td>
      <td>
        <form method="post" action="/clients/${escapeHtml(c.id)}/grant-matter" style="display:inline-flex;gap:4px;align-items:center">
          <select name="matter_id" required style="max-width:240px"><option value="">grant matter…</option>${matterOpts}</select>
          <button type="submit">Grant</button>
        </form>
      </td>
    </tr>`;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Clients — Legal Overseer</title><style>${STYLE}</style></head>
<body><header>
  <h1 style="font-size:16px;margin:0">Legal Overseer</h1>
  <nav>
    <a href="/">Matters</a>
    <a href="/review">Review queue</a>
    <a href="/calendar">Deadlines</a>
    <a href="/billing">Billing</a>
    <a href="/upload">Upload</a>
    <a href="/templates">Templates</a>
    <a href="/precedents">Precedents</a>
    <a href="/clients" class="active">Clients</a>
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(opts.currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>
  ${flashHtml}
  <h2>Add client portal user</h2>
  <div class="card">
    <form method="post" action="/clients/create" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end">
      <div><label>Full name</label><input name="full_name" required></div>
      <div><label>Email</label><input name="email" type="email" required></div>
      <div><label>Initial password (≥12 chars)</label><input name="password" type="password" minlength="12" required></div>
      <div><button type="submit">Add</button></div>
    </form>
  </div>

  <h2>Client portal users</h2>
  <table>
    <thead><tr><th>Name</th><th>Email</th><th>Matters granted</th><th>Last login</th><th>Grant matter</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="muted">No client portal users yet.</td></tr>'}</tbody>
  </table>

  <p class="muted" style="margin-top:20px">Tip: document visibility is controlled per document on the matter detail page. Use the "Share with clients" toggle next to each document, or generate a 7-day share link.</p>
</main></body></html>`;
}
