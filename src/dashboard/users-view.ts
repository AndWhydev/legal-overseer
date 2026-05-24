/**
 * User-management view for admins.
 *
 * Lists every active user and provides forms to add a new user, change
 * a role, or suspend an account. Tier-limit enforcement lives in
 * src/licence/enforce — this view surfaces "X/Y seats used" so the
 * admin knows when an upgrade is needed.
 */

import { escapeHtml } from './render.js';
import { listUsers, type User } from '../users/index.js';
import { getUsageSnapshot } from '../licence/index.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;--accent:#7aa2f7;--green:#6dd29b;--amber:#e5b76a;--red:#f07178}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
header h1{font-size:16px;margin:0}
header nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
header nav a:hover,header nav a.active{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:1200px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #2a2f3a}
th{background:var(--panel-2);color:var(--muted);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--panel-2);color:var(--muted);font-size:11px}
.muted{color:var(--muted)}
.danger{color:var(--red)}
.warn{color:var(--amber)}
.good{color:var(--green)}
.card{background:var(--panel);padding:16px 20px;border-radius:6px;margin-bottom:16px}
label{display:block;margin:8px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
input,select{background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:6px 8px;font:inherit}
button{background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:6px 12px;font:inherit;font-weight:600;cursor:pointer;margin-left:8px}
button.danger{background:var(--red)}
button.secondary{background:var(--panel-2);color:var(--text)}
.flash{padding:10px 14px;border-radius:6px;margin-bottom:12px;background:#1f3d2a;color:#b6f0ce;border-left:4px solid var(--green);font-size:13px}
.flash.error{background:#4a2027;color:#ffb8bf;border-left:4px solid var(--red)}
form.inline{display:inline}
`;

function pct(n: number): string {
  if (n >= 100) return `<span class="danger">${n}%</span>`;
  if (n >= 80) return `<span class="warn">${n}%</span>`;
  return `${n}%`;
}

function userRow(u: User): string {
  return `<tr>
    <td>${escapeHtml(u.full_name)}</td>
    <td>${escapeHtml(u.email)}</td>
    <td><span class="pill">${escapeHtml(u.role)}</span></td>
    <td>${u.status === 'active' ? '<span class="good">active</span>' : `<span class="warn">${escapeHtml(u.status)}</span>`}</td>
    <td>${escapeHtml(u.last_login_at ?? '—')}</td>
    <td>
      <form class="inline" method="post" action="/users/${escapeHtml(u.id)}/role">
        <select name="role">
          ${['admin','lawyer','paralegal'].map(r => `<option value="${r}" ${r===u.role?'selected':''}>${r}</option>`).join('')}
        </select>
        <button type="submit">Save role</button>
      </form>
      ${u.status === 'active'
        ? `<form class="inline" method="post" action="/users/${escapeHtml(u.id)}/suspend"><button type="submit" class="danger">Suspend</button></form>`
        : `<form class="inline" method="post" action="/users/${escapeHtml(u.id)}/reactivate"><button type="submit" class="secondary">Reactivate</button></form>`}
    </td>
  </tr>`;
}

export function renderUsersPage(opts: { flash?: { kind: 'ok' | 'error'; msg: string }; currentEmail: string }): string {
  const users = listUsers();
  const usage = getUsageSnapshot();
  const flashHtml = opts.flash
    ? `<div class="flash ${opts.flash.kind === 'error' ? 'error' : ''}">${escapeHtml(opts.flash.msg)}</div>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Users — Legal Overseer</title><style>${STYLE}</style></head>
<body><header>
  <h1>Legal Overseer</h1>
  <nav>
    <a href="/">Matters</a>
    <a href="/review">Review queue</a>
    <a href="/calendar">Deadlines</a>
    <a href="/billing">Billing</a>
    <a href="/users" class="active">Users</a>
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(opts.currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>
  ${flashHtml}
  <div class="card">
    <strong>Plan:</strong> ${escapeHtml(usage.tierLabel)}
    &nbsp;·&nbsp; Lawyers: ${usage.users.current} / ${usage.users.limit === Number.MAX_SAFE_INTEGER ? '∞' : usage.users.limit} (${pct(usage.users.percent)})
    &nbsp;·&nbsp; Matters: ${usage.matters.current} / ${usage.matters.limit === Number.MAX_SAFE_INTEGER ? '∞' : usage.matters.limit} (${pct(usage.matters.percent)})
    ${usage.warnings.length ? `<div class="muted" style="margin-top:8px"><strong>Warning:</strong> ${escapeHtml(usage.warnings.join(' '))}</div>` : ''}
  </div>

  <h2>Add user</h2>
  <div class="card">
    <form method="post" action="/users/create" style="display:grid;grid-template-columns:1fr 1fr 160px 1fr auto;gap:8px;align-items:end">
      <div><label>Full name</label><input name="full_name" required></div>
      <div><label>Email</label><input name="email" type="email" required></div>
      <div><label>Role</label><select name="role"><option value="lawyer">lawyer</option><option value="paralegal">paralegal</option><option value="admin">admin</option></select></div>
      <div><label>Initial password (≥12 chars)</label><input name="password" type="password" minlength="12" required></div>
      <div><button type="submit">Add</button></div>
    </form>
  </div>

  <h2>Users</h2>
  <table>
    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Actions</th></tr></thead>
    <tbody>${users.map(userRow).join('') || `<tr><td colspan="6" class="muted">No users.</td></tr>`}</tbody>
  </table>
</main></body></html>`;
}
