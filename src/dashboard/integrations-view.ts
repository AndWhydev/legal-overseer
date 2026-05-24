/**
 * Integrations dashboard.
 *
 * Shows configured/unconfigured state for LEAP and Clio + a "Sync now"
 * button per integration. Setup is via .env (or the onboarding wizard
 * — see install/README-INSTALL.md).
 */

import { escapeHtml } from './render.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;--accent:#7aa2f7;--green:#6dd29b;--red:#f07178}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
nav a.active,nav a:hover{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:1000px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
.card{background:var(--panel);padding:20px 24px;border-radius:8px;margin-bottom:16px;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}
.brand{font-size:18px;font-weight:600}
.muted{color:var(--muted)}
.ok{color:var(--green)}
.warn{color:var(--red)}
.pill{display:inline-block;padding:2px 8px;border-radius:999px;background:var(--panel-2);color:var(--muted);font-size:11px;margin-right:4px}
button{background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:8px 18px;font:inherit;font-weight:600;cursor:pointer}
button.secondary{background:var(--panel-2);color:var(--text)}
code{background:var(--panel-2);padding:2px 6px;border-radius:4px;font-size:12px}
.status{font-size:13px;margin-top:4px}
pre.output{background:var(--panel-2);padding:8px 12px;border-radius:6px;font-size:12px;white-space:pre-wrap;display:none;margin-top:12px}
pre.output.visible{display:block}
`;

function envHint(brand: string, lines: string[]): string {
  return `<div class="muted" style="font-size:12px;margin-top:8px">Set in <code>.env</code>: ${lines.map((l) => `<code>${l}</code>`).join(' ')}</div>`;
}

function integrationRow(brand: string, configured: boolean, syncPath: string, envHintHtml: string): string {
  const statusLine = configured
    ? `<div class="status ok">Connected — credentials present in environment.</div>`
    : `<div class="status warn">Not configured — sync is skipped silently.</div>${envHintHtml}`;
  const button = configured
    ? `<button onclick="syncNow('${escapeHtml(brand)}', '${escapeHtml(syncPath)}')">Sync now</button>`
    : `<button disabled style="opacity:.4;cursor:not-allowed">Sync now</button>`;
  return `<div class="card">
    <div>
      <div class="brand">${escapeHtml(brand)}</div>
      ${statusLine}
    </div>
    <div>${button}</div>
    <pre class="output" id="out-${escapeHtml(brand)}"></pre>
  </div>`;
}

export function renderIntegrationsPage(opts: {
  currentEmail: string;
  leapConfigured: boolean;
  clioConfigured: boolean;
}): string {
  const leap = integrationRow('LEAP', opts.leapConfigured, '/integrations/leap/sync',
    envHint('LEAP', ['LEAP_BASE_URL', 'LEAP_CLIENT_ID', 'LEAP_CLIENT_SECRET', 'LEAP_ACCESS_TOKEN']));
  const clio = integrationRow('Clio', opts.clioConfigured, '/integrations/clio/sync',
    envHint('Clio', ['CLIO_BASE_URL', 'CLIO_ACCESS_TOKEN']));

  return `<!doctype html><html><head><meta charset="utf-8"><title>Integrations — Legal Overseer</title><style>${STYLE}</style></head>
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
    <a href="/integrations" class="active">Integrations</a>
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(opts.currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>
  <p class="muted">Legal Overseer can sync matters bidirectionally with LEAP and Clio. Credentials are optional — the system works fully without them.</p>
  ${leap}
  ${clio}
  <p class="muted" style="margin-top:16px">Imported matters carry the prefix <code>LEAP-</code> or <code>CLIO-</code> on their matter number so the audit log preserves provenance.</p>
</main>
<script>
async function syncNow(brand, path) {
  const out = document.getElementById('out-' + brand);
  out.className = 'output visible';
  out.textContent = brand + ': syncing…';
  try {
    const r = await fetch(path, { method: 'POST' });
    const j = await r.json();
    out.textContent = JSON.stringify(j, null, 2);
  } catch (err) {
    out.textContent = brand + ': ' + err;
  }
}
</script>
</body></html>`;
}
