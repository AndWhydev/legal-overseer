/**
 * Cost estimator dashboard view.
 */

import { escapeHtml } from './render.js';
import type { CostEstimate, MonthlyMatterCost } from '../cost-estimator/index.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;--accent:#7aa2f7;--green:#6dd29b;--red:#f07178}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
nav a.active,nav a:hover{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:1100px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
.card{background:var(--panel);padding:20px;border-radius:8px;margin-bottom:16px}
label{display:block;margin:8px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
select{background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:6px 8px;font:inherit}
.estimate{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}
.estimate .box{background:var(--panel-2);padding:14px 18px;border-radius:6px}
.estimate .label{color:var(--muted);font-size:11px;text-transform:uppercase}
.estimate .value{font-size:24px;font-weight:600;margin-top:4px}
table{width:100%;border-collapse:collapse;background:var(--panel);border-radius:6px;overflow:hidden}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #2a2f3a}
th{background:var(--panel-2);color:var(--muted);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
.muted{color:var(--muted)}
.danger{color:var(--red)}
`;

const MATTER_TYPES = [
  'contract', 'employment', 'estates', 'family', 'property',
  'commercial', 'litigation', 'criminal', 'immigration', 'regulatory', 'unclassified',
];

export function renderCostEstimatorPage(opts: {
  currentEmail: string;
  matterType: string;
  complexity: 'simple' | 'medium' | 'complex';
  estimate: CostEstimate;
  monthly: MonthlyMatterCost[];
}): string {
  const matterOpts = MATTER_TYPES
    .map((t) => `<option value="${t}"${opts.matterType === t ? ' selected' : ''}>${t}</option>`).join('');
  const complOpts = (['simple', 'medium', 'complex'] as const)
    .map((c) => `<option value="${c}"${opts.complexity === c ? ' selected' : ''}>${c}</option>`).join('');

  const monthlyRows = opts.monthly.length
    ? opts.monthly.map((r) => `<tr>
        <td><a href="/matter/${escapeHtml(r.matterId)}" style="color:var(--accent)">${escapeHtml(r.matterNumber)}</a></td>
        <td>${escapeHtml(r.matterTitle)}</td>
        <td>$${r.aiUsd.toFixed(2)}</td>
        <td>${Math.round(r.aiSeconds / 60)} min AI</td>
        <td>${Math.round(r.lawyerSeconds / 60)} min lawyer</td>
      </tr>`).join('')
    : `<tr><td colspan="5" class="muted">No billing in this month yet.</td></tr>`;

  const ym = new Date().toISOString().slice(0, 7);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Cost estimator — Legal Overseer</title><style>${STYLE}</style></head>
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
    <a href="/cost-estimator" class="active">Cost estimator</a>
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(opts.currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>
  <h2>Estimate cost before opening a matter</h2>
  <div class="card">
    <p class="muted">Pick the matter type and complexity. The estimate is a rough baseline derived from the firm's own usage over time — refine it once your firm has a few closed matters in this category.</p>
    <form method="get" action="/cost-estimator" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div><label>Matter type</label><select name="matter_type">${matterOpts}</select></div>
      <div><label>Complexity</label><select name="complexity">${complOpts}</select></div>
      <div style="grid-column:1 / -1"><button type="submit" style="background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:8px 14px;font-weight:600;cursor:pointer">Estimate</button></div>
    </form>
    <div class="estimate">
      <div class="box"><div class="label">Estimated AI spend</div><div class="value">$${opts.estimate.estimatedAiUsd.toFixed(2)} USD</div></div>
      <div class="box"><div class="label">Estimated lawyer hours</div><div class="value">${opts.estimate.estimatedLawyerHours.toFixed(1)} h</div></div>
      <div class="box"><div class="label">Complexity</div><div class="value">${escapeHtml(opts.complexity)}</div></div>
    </div>
    <p class="muted" style="margin-top:12px">${escapeHtml(opts.estimate.notes)}</p>
  </div>

  <h2>This month per matter (${ym})</h2>
  <table>
    <thead><tr><th>Matter</th><th>Title</th><th>AI spend</th><th>AI time</th><th>Lawyer time</th></tr></thead>
    <tbody>${monthlyRows}</tbody>
  </table>
  <p class="muted" style="margin-top:12px">Per-matter cost status (over/under estimate) is available at <code>/matter/:id/cost-status.json</code>.</p>
</main></body></html>`;
}
