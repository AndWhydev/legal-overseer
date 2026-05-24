/**
 * First-run setup wizard.
 *
 * Renders a minimal HTML form that the firm's IT person walks through
 * before the system goes live. Steps:
 *
 *   1. Confirm licence key is loaded.
 *   2. Pick firm display name + jurisdiction.
 *   3. Create the initial admin user.
 *   4. Configure SMTP / inbox mailbox slots (optional, can defer).
 *   5. Smoke test.
 *   6. Mark setup complete → wizard never shows again.
 *
 * Server lives in src/onboarding/server.ts.
 */

import { escapeHtml } from '../dashboard/render.js';
import { getLicenceState } from '../licence/index.js';
import { TIER_LIMITS } from '../licence/types.js';
import type { SetupState } from './state.js';

const STEPS = ['licence', 'firm', 'admin', 'email', 'review', 'done'] as const;
type Step = (typeof STEPS)[number];

interface RenderInput {
  step: Step;
  state: SetupState;
  flash?: { kind: 'error' | 'ok'; msg: string };
  formValues?: Record<string, string>;
}

const STYLE = `
:root { --bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;
        --accent:#7aa2f7;--green:#6dd29b;--amber:#e5b76a;--red:#f07178; }
* { box-sizing:border-box; }
body { background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0; }
header { padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a; }
header h1 { font-size:18px;margin:0; }
main { max-width:780px;margin:0 auto;padding:32px 24px; }
.steps { display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap; }
.steps .s { padding:6px 12px;border-radius:999px;background:var(--panel);color:var(--muted);font-size:12px; }
.steps .s.active { background:var(--accent);color:#0f1115;font-weight:600; }
.steps .s.done { background:var(--green);color:#0f1115; }
.card { background:var(--panel);padding:24px;border-radius:8px;margin-bottom:16px; }
h2 { margin-top:0;font-size:18px; }
p.lead { color:var(--muted);margin-top:0; }
label { display:block;margin:12px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em; }
input, select, textarea { width:100%;background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:8px 10px;font:inherit; }
button { background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer;margin-top:16px; }
button.secondary { background:var(--panel-2);color:var(--text); }
.flash { padding:12px 16px;border-radius:6px;margin-bottom:16px; }
.flash.error { background:#4a2027;color:#ffb8bf;border-left:4px solid var(--red); }
.flash.ok { background:#1f3d2a;color:#b6f0ce;border-left:4px solid var(--green); }
.pill { display:inline-block;padding:2px 8px;border-radius:999px;background:var(--panel-2);color:var(--muted);font-size:11px; }
.muted { color:var(--muted); }
.row { display:grid;grid-template-columns:1fr 1fr;gap:16px; }
code { background:var(--panel-2);padding:2px 6px;border-radius:4px;font-size:12px; }
`;

function shell(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Legal Overseer — first-run setup</title><style>${STYLE}</style></head>
<body><header><h1>Legal Overseer — first-run setup</h1></header><main>${body}</main></body></html>`;
}

function stepBadge(step: Step, current: Step): string {
  const idx = STEPS.indexOf(step);
  const cIdx = STEPS.indexOf(current);
  const cls = step === current ? 'active' : idx < cIdx ? 'done' : '';
  const label = { licence: '1. Licence', firm: '2. Firm', admin: '3. Admin', email: '4. Email', review: '5. Review', done: '✓ Done' }[step];
  return `<span class="s ${cls}">${label}</span>`;
}

function stepRibbon(current: Step): string {
  return `<div class="steps">${STEPS.map((s) => stepBadge(s, current)).join('')}</div>`;
}

function flash(input: RenderInput): string {
  if (!input.flash) return '';
  return `<div class="flash ${input.flash.kind}">${escapeHtml(input.flash.msg)}</div>`;
}

function renderLicenceStep(input: RenderInput): string {
  const lic = getLicenceState();
  const tierLabel = lic.payload ? TIER_LIMITS[lic.payload.tier].label : '—';
  const statusColor = lic.valid ? 'good' : 'danger';
  const statusText = lic.valid ? 'Valid' : 'Invalid';
  return `<div class="card">
    <h2>Licence</h2>
    <p class="lead">Legal Overseer is licensed to a specific firm. The licence key is checked on every boot.</p>
    <table style="width:100%;border-collapse:collapse">
      <tr><td class="muted" style="padding:4px 0">Status</td><td><span class="pill" style="color:${lic.valid ? '#6dd29b' : '#f07178'}">${statusText}</span></td></tr>
      <tr><td class="muted" style="padding:4px 0">Firm name</td><td>${escapeHtml(lic.payload?.firm_name ?? '—')}</td></tr>
      <tr><td class="muted" style="padding:4px 0">Domain</td><td>${escapeHtml(lic.payload?.firm_domain ?? '—')}</td></tr>
      <tr><td class="muted" style="padding:4px 0">Tier</td><td>${escapeHtml(tierLabel)}</td></tr>
      <tr><td class="muted" style="padding:4px 0">Expires</td><td>${escapeHtml(lic.payload?.expires_at?.slice(0, 10) ?? '—')}</td></tr>
      <tr><td class="muted" style="padding:4px 0">Source</td><td><code>${escapeHtml(lic.source)}</code></td></tr>
    </table>
    <p class="muted" style="margin-top:16px">${escapeHtml(lic.message)}</p>
    <form method="post" action="/setup/next?from=licence">
      <button type="submit" ${lic.valid ? '' : 'disabled style="opacity:.4;cursor:not-allowed"'}>Continue →</button>
    </form>
    ${lic.valid ? '' : `<p class="muted" style="margin-top:16px">To install a licence: place the key string in <code>/data/licence.key</code> (or set <code>LICENCE_KEY</code> env), then reload this page.</p>`}
  </div>`;
}

function renderFirmStep(input: RenderInput): string {
  const vals = input.formValues ?? {};
  const lic = getLicenceState();
  return `<div class="card">
    <h2>Firm details</h2>
    <p class="lead">These show up on the dashboard and on every audit-log entry.</p>
    <form method="post" action="/setup/firm">
      <label>Firm display name</label>
      <input name="firm_name" required value="${escapeHtml(vals.firm_name ?? lic.payload?.firm_name ?? '')}">
      <label>Default jurisdiction</label>
      <select name="jurisdiction">
        ${['NSW','VIC','QLD','WA','SA','TAS','ACT','NT','Cth'].map(j => `<option ${vals.jurisdiction===j?'selected':''}>${j}</option>`).join('')}
      </select>
      <label>Notes (optional)</label>
      <textarea name="notes" rows="3" placeholder="Anything the next IT person should know about this install">${escapeHtml(vals.notes ?? '')}</textarea>
      <button type="submit">Continue →</button>
    </form>
  </div>`;
}

function renderAdminStep(input: RenderInput): string {
  const vals = input.formValues ?? {};
  return `<div class="card">
    <h2>First admin user</h2>
    <p class="lead">This is the only user who can manage other users. Use a real lawyer's email — admins can approve work product.</p>
    <form method="post" action="/setup/admin">
      <label>Full name</label>
      <input name="full_name" required value="${escapeHtml(vals.full_name ?? '')}">
      <label>Email</label>
      <input name="email" type="email" required value="${escapeHtml(vals.email ?? '')}">
      <label>Password (min 12 chars)</label>
      <input name="password" type="password" required minlength="12">
      <label>Repeat password</label>
      <input name="password_confirm" type="password" required minlength="12">
      <button type="submit">Create admin →</button>
    </form>
  </div>`;
}

function renderEmailStep(input: RenderInput): string {
  return `<div class="card">
    <h2>Email connectivity</h2>
    <p class="lead">Skip this step if you'll configure email later — the system runs without it. You can edit <code>.env</code> and restart at any time.</p>
    <p class="muted">Required env keys for inbound: <code>LEGAL_EMAIL</code>, <code>LEGAL_EMAIL_PASS</code>. For outbound: <code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>.</p>
    <p class="muted">See <code>install/README-INSTALL.md</code> for details by provider (O365, Google Workspace, on-prem Exchange).</p>
    <form method="post" action="/setup/next?from=email"><button type="submit">Continue →</button></form>
  </div>`;
}

function renderReviewStep(input: RenderInput): string {
  const lic = getLicenceState();
  return `<div class="card">
    <h2>Review &amp; finish</h2>
    <p class="lead">Everything below has been recorded. Click "Finish setup" to dismiss the wizard for good.</p>
    <table style="width:100%">
      <tr><td class="muted">Firm</td><td>${escapeHtml(input.state.firm_name ?? lic.payload?.firm_name ?? '—')}</td></tr>
      <tr><td class="muted">Licence</td><td>${escapeHtml(lic.payload?.licence_id ?? '—')}</td></tr>
      <tr><td class="muted">Tier</td><td>${escapeHtml(lic.payload ? TIER_LIMITS[lic.payload.tier].label : '—')}</td></tr>
    </table>
    <form method="post" action="/setup/finish"><button type="submit">Finish setup →</button></form>
  </div>`;
}

function renderDoneStep(): string {
  return `<div class="card">
    <h2>Setup complete</h2>
    <p>The wizard will not show again. From here on, the dashboard is at <a href="/">the matter list</a>.</p>
    <p class="muted">If you ever need to re-run setup (e.g. after a clean DB restore), the operator can update <code>setup_state.completed = 0</code> in SQLite.</p>
    <a href="/"><button>Open dashboard</button></a>
  </div>`;
}

export function renderWizard(input: RenderInput): string {
  let body = '';
  switch (input.step) {
    case 'licence':
      body = renderLicenceStep(input);
      break;
    case 'firm':
      body = renderFirmStep(input);
      break;
    case 'admin':
      body = renderAdminStep(input);
      break;
    case 'email':
      body = renderEmailStep(input);
      break;
    case 'review':
      body = renderReviewStep(input);
      break;
    case 'done':
      body = renderDoneStep();
      break;
  }
  return shell(`${stepRibbon(input.step)}${flash(input)}${body}`);
}

export type { Step };
export { STEPS };
