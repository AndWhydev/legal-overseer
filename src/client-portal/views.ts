/**
 * Client-portal HTML views.
 *
 * Deliberately professional + plain-English. No AI indicators are
 * shown anywhere — the firm's brand is the only thing the client sees.
 */

import { escapeHtml } from '../dashboard/render.js';
import type { Matter } from '../db/repositories/matters.js';
import type { StoredDocument } from '../uploads/index.js';
import type { ClientUser } from './repo.js';

const STYLE = `
:root{--bg:#fbfaf6;--panel:#ffffff;--ink:#1a1a1a;--muted:#666;--border:#e5e1d8;--accent:#1f3a6b;--accent-soft:#eef1f8}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:15px/1.55 Georgia,'Times New Roman',serif;margin:0}
header{background:var(--accent);color:#fff;padding:18px 28px;display:flex;align-items:center;justify-content:space-between}
header .brand{font-size:18px;font-weight:600;letter-spacing:.02em}
header .who{font-size:13px;color:#dde4f1}
header a{color:#fff;text-decoration:underline}
main{max-width:840px;margin:0 auto;padding:32px 28px}
h1{font-size:24px;margin:0 0 16px}
h2{font-size:17px;margin:28px 0 10px;color:var(--accent);border-bottom:1px solid var(--border);padding-bottom:6px}
p.lead{color:var(--muted);margin-top:0}
.card{background:var(--panel);border:1px solid var(--border);border-radius:6px;padding:20px 24px;margin-bottom:18px}
.matter{display:block;padding:16px 18px;text-decoration:none;color:inherit;border:1px solid var(--border);border-radius:6px;background:var(--panel);margin-bottom:10px}
.matter:hover{border-color:var(--accent);background:var(--accent-soft)}
.matter .ref{color:var(--accent);font-weight:600}
.matter .title{font-size:16px;margin-top:2px}
.muted{color:var(--muted);font-size:13px}
label{display:block;margin:14px 0 4px;font-size:13px;color:var(--muted)}
input[type="email"],input[type="password"],input[type="file"]{width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:4px;background:#fff;font:inherit}
button{margin-top:18px;background:var(--accent);color:#fff;border:none;border-radius:4px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer}
.center{display:grid;place-items:center;min-height:80vh}
.flash{padding:10px 14px;border-radius:6px;margin-bottom:14px;background:#fee;color:#762;border-left:4px solid #c44}
table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--border);border-radius:6px;overflow:hidden}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);font-size:14px}
th{background:var(--accent-soft);color:var(--accent);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.04em}
tr:last-child td{border-bottom:none}
a{color:var(--accent)}
footer{max-width:840px;margin:36px auto 28px;padding:0 28px;color:var(--muted);font-size:12px;border-top:1px solid var(--border);padding-top:14px}
`;

function shell(title: string, body: string, currentUser?: ClientUser): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Client Portal</title><style>${STYLE}</style></head>
<body>
<header>
  <div class="brand">Client Portal</div>
  <div class="who">${currentUser ? `${escapeHtml(currentUser.full_name)} · <a href="/client-portal/logout">sign out</a>` : ''}</div>
</header>
<main>${body}</main>
<footer>This portal is provided by your solicitors. Communications via this portal are confidential. If you need urgent help, please call your solicitor directly.</footer>
</body></html>`;
}

export function renderClientLogin(flash?: string, email?: string): string {
  return shell('Sign in',
    `<div class="center"><div class="card" style="width:380px">
      <h1 style="font-size:20px">Sign in</h1>
      <p class="lead">Enter your email and password to access your matter.</p>
      ${flash ? `<div class="flash">${escapeHtml(flash)}</div>` : ''}
      <form method="post" action="/client-portal/login">
        <label>Email</label>
        <input type="email" name="email" required value="${escapeHtml(email ?? '')}">
        <label>Password</label>
        <input type="password" name="password" required>
        <button type="submit">Sign in</button>
      </form>
      <p class="muted" style="margin-top:18px">If you have not yet received credentials, please contact your solicitor.</p>
    </div></div>`);
}

export function renderClientDashboard(opts: {
  user: ClientUser;
  matters: Matter[];
  flash?: { kind: 'ok' | 'error'; msg: string };
}): string {
  const flashHtml = opts.flash ? `<div class="flash">${escapeHtml(opts.flash.msg)}</div>` : '';
  const body = `
    <h1>Welcome, ${escapeHtml(opts.user.full_name)}</h1>
    ${flashHtml}
    <p class="lead">Your current matters with the firm are listed below.</p>
    ${opts.matters.length
      ? opts.matters.map((m) => `<a class="matter" href="/client-portal/matter/${escapeHtml(m.id)}">
          <div class="ref">${escapeHtml(m.matter_number)}</div>
          <div class="title">${escapeHtml(m.title)}</div>
          <div class="muted">Status: ${escapeHtml(m.status)} · Opened ${escapeHtml(m.opened_at)}</div>
        </a>`).join('')
      : `<p class="muted">No matters are currently associated with your account. If this is unexpected, please contact your solicitor.</p>`}
  `;
  return shell('Your matters', body, opts.user);
}

export function renderClientMatter(opts: {
  user: ClientUser;
  matter: Matter;
  documents: StoredDocument[];
}): string {
  const docs = opts.documents.length
    ? opts.documents.map((d) => `<tr>
        <td><a href="/matter/${escapeHtml(d.matterId)}/document/${escapeHtml(d.id)}">${escapeHtml(d.filename)}</a></td>
        <td class="muted">${escapeHtml(d.uploadedAt)}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" class="muted">No shared documents yet. Your solicitor will share documents here when ready.</td></tr>`;
  const body = `
    <p><a href="/client-portal">← back to your matters</a></p>
    <h1>${escapeHtml(opts.matter.title)}</h1>
    <p class="muted">Matter reference: ${escapeHtml(opts.matter.matter_number)}</p>

    <h2>Documents shared with you</h2>
    <table>
      <thead><tr><th>Document</th><th>Shared</th></tr></thead>
      <tbody>${docs}</tbody>
    </table>

    <h2>Send a document to your solicitor</h2>
    <div class="card">
      <p>You can upload a document here. Your solicitor will be notified.</p>
      <form method="post" action="/client-portal/matter/${escapeHtml(opts.matter.id)}/upload" enctype="multipart/form-data">
        <input type="file" name="file" required>
        <button type="submit">Upload</button>
      </form>
    </div>

    <h2>Next steps</h2>
    <p class="muted">For specific updates or questions about your matter, contact your solicitor directly.</p>
  `;
  return shell(opts.matter.matter_number, body, opts.user);
}

export function renderShareLandingPage(opts: {
  filename: string;
  expiresAt: string;
  downloadHref: string;
}): string {
  const body = `<div class="center"><div class="card" style="width:480px">
    <h1 style="font-size:20px">A document has been shared with you</h1>
    <p>You have been given access to <b>${escapeHtml(opts.filename)}</b>.</p>
    <p class="muted">This link expires on <b>${escapeHtml(opts.expiresAt)}</b>.</p>
    <p><a href="${escapeHtml(opts.downloadHref)}"><button>Download document</button></a></p>
    <p class="muted" style="margin-top:18px">If you weren't expecting this, please contact the sender.</p>
  </div></div>`;
  return shell('Shared document', body);
}
