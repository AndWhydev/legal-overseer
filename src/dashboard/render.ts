/**
 * HTML renderer for the Legal Overseer dashboard.
 *
 * No framework — template literals + an escapeHtml helper. Four core
 * views:
 *
 *   - / (matter list)
 *   - /review (review queue)
 *   - /calendar (deadline calendar)
 *   - /billing (billing tracker)
 *
 * Plus per-matter and per-review detail pages.
 */

import type {
  MatterSummary,
  MatterRow,
  MatterDetail,
  ReviewQueueView,
  CalendarView,
  BillingTrackerView,
} from './aggregator.js';
import type { ReviewQueueRow } from '../compliance/reviewGate.js';
import type { Matter } from '../db/repositories/matters.js';

export function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function fmtSeconds(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec - h * 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `$${n.toFixed(2)}`;
}

const STYLES = `
:root {
  --bg: #0f1115;
  --panel: #181b22;
  --panel-2: #1f232b;
  --text: #e6e9ee;
  --muted: #8a93a4;
  --accent: #7aa2f7;
  --green: #6dd29b;
  --amber: #e5b76a;
  --red: #f07178;
}
body { background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; }
header { padding: 16px 24px; background: var(--panel); border-bottom: 1px solid #2a2f3a; display: flex; gap: 16px; align-items: center; }
header h1 { font-size: 16px; margin: 0; }
header nav a { color: var(--muted); margin-right: 16px; text-decoration: none; padding: 4px 8px; border-radius: 4px; }
header nav a:hover, header nav a.active { color: var(--text); background: var(--panel-2); }
main { padding: 24px; max-width: 1400px; margin: 0 auto; }
h2 { font-size: 14px; text-transform: uppercase; color: var(--muted); letter-spacing: 0.05em; margin: 24px 0 8px; }
table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: 6px; overflow: hidden; }
th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #2a2f3a; }
th { background: var(--panel-2); color: var(--muted); font-weight: 500; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: var(--panel-2); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.health { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
.health.green { background: var(--green); }
.health.amber { background: var(--amber); }
.health.red { background: var(--red); }
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--panel-2); color: var(--muted); font-size: 11px; }
.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
.totals .card { background: var(--panel); padding: 12px 16px; border-radius: 6px; }
.totals .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.totals .value { font-size: 22px; font-weight: 600; margin-top: 4px; }
.muted { color: var(--muted); }
.danger { color: var(--red); }
.warn { color: var(--amber); }
.good { color: var(--green); }
pre { background: var(--panel-2); padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
.body-md { background: var(--panel-2); padding: 16px; border-radius: 6px; white-space: pre-wrap; font-family: 'Georgia', serif; font-size: 14px; line-height: 1.6; }
.disclaimer-banner { background: #4a2b1f; color: #ffd5c2; padding: 12px 16px; border-radius: 6px; margin: 12px 0; border-left: 4px solid #f07178; }
`;

function layout(activePath: string, title: string, body: string): string {
  const item = (href: string, label: string) =>
    `<a href="${href}" class="${activePath === href ? 'active' : ''}">${label}</a>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} — Legal Overseer</title><style>${STYLES}</style></head><body>
<header>
  <h1>Legal Overseer</h1>
  <nav>
    ${item('/', 'Matters')}
    ${item('/review', 'Review queue')}
    ${item('/calendar', 'Deadlines')}
    ${item('/billing', 'Billing')}
    ${item('/upload', 'Upload')}
    ${item('/templates', 'Templates')}
    ${item('/precedents', 'Precedents')}
  </nav>
</header>
<main>${body}</main>
</body></html>`;
}

function healthDot(h: MatterRow['health']): string {
  return `<span class="health ${h}" title="${h}"></span>`;
}

function matterRow(r: MatterRow): string {
  const m = r.matter;
  const urgent =
    r.daysToMostUrgent === null
      ? '<span class="muted">—</span>'
      : r.daysToMostUrgent <= 7
        ? `<span class="danger">${r.daysToMostUrgent}d</span>`
        : r.daysToMostUrgent <= 14
          ? `<span class="warn">${r.daysToMostUrgent}d</span>`
          : `${r.daysToMostUrgent}d`;
  return `<tr>
    <td>${healthDot(r.health)}<a href="/matter/${escapeHtml(m.id)}">${escapeHtml(m.matter_number)}</a></td>
    <td>${escapeHtml(m.title)}</td>
    <td>${escapeHtml(m.client_name)}</td>
    <td><span class="pill">${escapeHtml(m.matter_type)}</span></td>
    <td>${escapeHtml(m.jurisdiction)}</td>
    <td>${escapeHtml(m.responsible_lawyer_email ?? '—')}</td>
    <td>${escapeHtml(m.status)}</td>
    <td>${r.openDeadlines}</td>
    <td>${urgent}</td>
    <td>${r.pendingReviews}</td>
    <td>${fmtUsd(r.billing.aiCostUsd)}</td>
  </tr>`;
}

export function renderMatters(summary: MatterSummary): string {
  const totals = `
    <div class="totals">
      <div class="card"><div class="label">Matters</div><div class="value">${summary.totals.matters}</div></div>
      <div class="card"><div class="label">Open</div><div class="value good">${summary.totals.open}</div></div>
      <div class="card"><div class="label">On hold</div><div class="value warn">${summary.totals.onHold}</div></div>
      <div class="card"><div class="label">Closed</div><div class="value muted">${summary.totals.closed}</div></div>
      <div class="card"><div class="label">Pending reviews</div><div class="value ${summary.totals.pendingReviews > 0 ? 'warn' : ''}">${summary.totals.pendingReviews}</div></div>
      <div class="card"><div class="label">Deadlines (30d)</div><div class="value ${summary.totals.upcomingDeadlines30d > 0 ? 'warn' : ''}">${summary.totals.upcomingDeadlines30d}</div></div>
      <div class="card"><div class="label">AI spend (total)</div><div class="value">${fmtUsd(summary.totals.aiCostUsdTotal)}</div></div>
    </div>`;

  const rows = summary.rows.length
    ? summary.rows.map(matterRow).join('\n')
    : `<tr><td colspan="11" class="muted">No matters yet. Configure LEGAL_EMAIL inbox to start intake.</td></tr>`;

  const body = `
    ${totals}
    <h2>Matters</h2>
    <table>
      <thead><tr>
        <th>Number</th><th>Title</th><th>Client</th><th>Type</th><th>Juris.</th>
        <th>Responsible</th><th>Status</th><th>Open d/l</th><th>Most urgent</th>
        <th>Pending reviews</th><th>AI $</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="muted" style="margin-top:24px">Generated ${escapeHtml(summary.generatedAt)}</p>
  `;
  return layout('/', 'Matters', body);
}

export function renderMatterDetail(d: MatterDetail): string {
  const m = d.matter;
  const deadlines = d.deadlines.length
    ? d.deadlines
        .map(
          (dl) =>
            `<tr><td>${escapeHtml(dl.due_date)}</td><td><span class="pill">${escapeHtml(dl.deadline_type)}</span></td><td>${escapeHtml(dl.description)}</td><td>${escapeHtml(dl.status)}</td><td>${escapeHtml(dl.recommended_action ?? '—')}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="muted">No deadlines.</td></tr>`;

  const reviews = d.reviews.length
    ? d.reviews
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.created_at)}</td><td><a href="/review/${escapeHtml(r.id)}">${escapeHtml(r.title)}</a></td><td><span class="pill">${escapeHtml(r.output_kind)}</span></td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.reviewed_by ?? '—')}</td><td>${fmtUsd(r.cost_usd)}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="muted">No outputs yet.</td></tr>`;

  const billing = d.billing.length
    ? d.billing
        .map(
          (b) =>
            `<tr><td>${escapeHtml(b.created_at)}</td><td><span class="pill">${escapeHtml(b.kind)}</span></td><td>${escapeHtml(b.actor_id)}</td><td>${escapeHtml(b.description)}</td><td>${fmtSeconds(b.duration_seconds)}</td><td>${fmtUsd(b.cost_usd)}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="muted">No billing entries.</td></tr>`;

  const audit = d.audit
    .slice(0, 50)
    .map(
      (a) =>
        `<tr><td>${escapeHtml(a.created_at)}</td><td><span class="pill">${escapeHtml(a.action)}</span></td><td>${escapeHtml(a.actor_id)}</td><td>${escapeHtml(a.detail ?? '')}</td></tr>`,
    )
    .join('');

  const body = `
    <h2>${healthDot(d.row.health)}${escapeHtml(m.matter_number)} — ${escapeHtml(m.title)}</h2>

    <table style="width:auto;margin-bottom:24px">
      <tr><th>Client</th><td>${escapeHtml(m.client_name)} ${m.client_email ? `&lt;${escapeHtml(m.client_email)}&gt;` : ''}</td></tr>
      <tr><th>Type</th><td>${escapeHtml(m.matter_type)}</td></tr>
      <tr><th>Jurisdiction</th><td>${escapeHtml(m.jurisdiction)}</td></tr>
      <tr><th>Responsible lawyer</th><td>${escapeHtml(m.responsible_lawyer_email ?? '—')}</td></tr>
      <tr><th>Opposing</th><td>${escapeHtml(m.opposing_party ?? '—')} ${m.opposing_solicitor ? `via ${escapeHtml(m.opposing_solicitor)}` : ''}</td></tr>
      <tr><th>Status</th><td>${escapeHtml(m.status)}</td></tr>
      <tr><th>Opened</th><td>${escapeHtml(m.opened_at)}</td></tr>
      <tr><th>Folder</th><td><code>${escapeHtml(m.matter_folder ?? '—')}</code></td></tr>
    </table>

    <h2>Billing summary</h2>
    <div class="totals">
      <div class="card"><div class="label">AI runs</div><div class="value">${d.billingSummary.aiRuns}</div></div>
      <div class="card"><div class="label">AI time</div><div class="value">${fmtSeconds(d.billingSummary.aiSeconds)}</div></div>
      <div class="card"><div class="label">AI spend</div><div class="value">${fmtUsd(d.billingSummary.aiCostUsd)}</div></div>
      <div class="card"><div class="label">Lawyer time</div><div class="value">${fmtSeconds(d.billingSummary.lawyerSeconds)}</div></div>
    </div>

    <h2>Deadlines</h2>
    <table>
      <thead><tr><th>Due</th><th>Type</th><th>Description</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${deadlines}</tbody>
    </table>

    <h2>Review queue</h2>
    <table>
      <thead><tr><th>Created</th><th>Title</th><th>Kind</th><th>Status</th><th>Reviewer</th><th>Cost</th></tr></thead>
      <tbody>${reviews}</tbody>
    </table>

    <h2>Billing log</h2>
    <table>
      <thead><tr><th>When</th><th>Kind</th><th>Actor</th><th>Description</th><th>Duration</th><th>Cost</th></tr></thead>
      <tbody>${billing}</tbody>
    </table>

    <h2>Audit trail (last 50)</h2>
    <table>
      <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Detail</th></tr></thead>
      <tbody>${audit || `<tr><td colspan="4" class="muted">No audit entries.</td></tr>`}</tbody>
    </table>
  `;
  return layout('/', `Matter ${m.matter_number}`, body);
}

function reviewRow(r: ReviewQueueRow): string {
  return `<tr>
    <td><a href="/review/${escapeHtml(r.id)}">${escapeHtml(r.title)}</a></td>
    <td>${escapeHtml(r.matter_number ?? '—')}</td>
    <td><span class="pill">${escapeHtml(r.output_kind)}</span></td>
    <td>${escapeHtml(r.skill_id)}</td>
    <td>${escapeHtml(r.created_at)}</td>
    <td>${escapeHtml(r.status)}</td>
    <td>${escapeHtml(r.reviewed_by ?? '—')}</td>
    <td>${fmtUsd(r.cost_usd)}</td>
  </tr>`;
}

export function renderReviewQueue(v: ReviewQueueView): string {
  const sec = (title: string, rows: ReviewQueueRow[]) => `
    <h2>${title} (${rows.length})</h2>
    <table>
      <thead><tr><th>Title</th><th>Matter</th><th>Kind</th><th>Skill</th><th>Created</th><th>Status</th><th>Reviewer</th><th>Cost</th></tr></thead>
      <tbody>${rows.length ? rows.map(reviewRow).join('') : `<tr><td colspan="8" class="muted">None.</td></tr>`}</tbody>
    </table>`;

  const body = `
    ${sec('Pending review', v.pending)}
    ${sec('Recently approved', v.approved)}
    ${sec('Recently rejected', v.rejected)}
    ${sec('Recently sent', v.sent)}
  `;
  return layout('/review', 'Review queue', body);
}

export function renderReviewDetail(payload: { review: ReviewQueueRow; matter: Matter | null }): string {
  const { review, matter } = payload;
  const meta = review.metadata_json ? `<pre>${escapeHtml(review.metadata_json)}</pre>` : '<p class="muted">No metadata.</p>';

  const actions = review.status === 'pending'
    ? `<form method="post" action="/review/${escapeHtml(review.id)}/approve" style="display:inline">
         <input name="reviewer" placeholder="reviewer@firm.example" required style="padding:6px;background:#1f232b;color:#e6e9ee;border:1px solid #2a2f3a;border-radius:4px">
         <input name="note" placeholder="optional note" style="padding:6px;background:#1f232b;color:#e6e9ee;border:1px solid #2a2f3a;border-radius:4px;margin-left:8px">
         <button type="submit" style="padding:6px 12px;background:#6dd29b;color:#0f1115;border:none;border-radius:4px;margin-left:8px;cursor:pointer">Approve</button>
       </form>
       <form method="post" action="/review/${escapeHtml(review.id)}/reject" style="display:inline;margin-left:16px">
         <input name="reviewer" placeholder="reviewer@firm.example" required style="padding:6px;background:#1f232b;color:#e6e9ee;border:1px solid #2a2f3a;border-radius:4px">
         <input name="note" placeholder="reason" required style="padding:6px;background:#1f232b;color:#e6e9ee;border:1px solid #2a2f3a;border-radius:4px;margin-left:8px">
         <button type="submit" style="padding:6px 12px;background:#f07178;color:#0f1115;border:none;border-radius:4px;margin-left:8px;cursor:pointer">Reject</button>
       </form>`
    : `<p class="muted">Already ${escapeHtml(review.status)} by ${escapeHtml(review.reviewed_by ?? 'unknown')} on ${escapeHtml(review.reviewed_at ?? 'unknown')}.${review.review_note ? ` Note: ${escapeHtml(review.review_note)}` : ''}</p>`;

  const body = `
    <h2>${escapeHtml(review.title)}</h2>
    <p>
      <span class="pill">${escapeHtml(review.output_kind)}</span>
      <span class="pill">skill: ${escapeHtml(review.skill_id)}</span>
      <span class="pill">status: ${escapeHtml(review.status)}</span>
      ${matter ? `<span class="pill">matter: <a href="/matter/${escapeHtml(matter.id)}">${escapeHtml(matter.matter_number)}</a></span>` : ''}
      <span class="pill">cost: ${fmtUsd(review.cost_usd)}</span>
    </p>

    <div class="disclaimer-banner">
      <b>Reviewer responsibility:</b> nothing in this output can be sent to a
      client or filed with a court until you approve it. Approving binds the
      named reviewer; the audit log is permanent.
    </div>

    <h2>Body</h2>
    <div class="body-md">${escapeHtml(review.body_markdown)}</div>

    <h2>Actions</h2>
    <div>${actions}</div>

    <h2>Metadata</h2>
    ${meta}
  `;
  return layout('/review', `Review: ${review.title}`, body);
}

export function renderCalendar(view: CalendarView): string {
  const blocks = view.entries.length
    ? view.entries
        .map((e) => {
          const items = e.deadlines
            .map(
              (it) =>
                `<tr><td><span class="pill">${escapeHtml(it.deadline.deadline_type)}</span></td><td>${it.matter ? `<a href="/matter/${escapeHtml(it.matter.id)}">${escapeHtml(it.matter.matter_number)}</a>` : '—'}</td><td>${escapeHtml(it.deadline.description)}</td><td>${escapeHtml(it.deadline.recommended_action ?? '—')}</td></tr>`,
            )
            .join('');
          return `<h2>${escapeHtml(e.date)}</h2><table><thead><tr><th>Type</th><th>Matter</th><th>Description</th><th>Action</th></tr></thead><tbody>${items}</tbody></table>`;
        })
        .join('')
    : `<p class="muted">No upcoming deadlines in the next ${view.windowDays} days.</p>`;

  return layout('/calendar', 'Deadline calendar', blocks);
}

export function renderBilling(view: BillingTrackerView): string {
  const totals = `
    <div class="totals">
      <div class="card"><div class="label">Total AI time</div><div class="value">${fmtSeconds(view.totals.aiSeconds)}</div></div>
      <div class="card"><div class="label">Total AI spend</div><div class="value">${fmtUsd(view.totals.aiCostUsd)}</div></div>
      <div class="card"><div class="label">Total lawyer time</div><div class="value">${fmtSeconds(view.totals.lawyerSeconds)}</div></div>
    </div>`;

  const rows = view.rows.length
    ? view.rows
        .map(
          (r) =>
            `<tr><td><a href="/matter/${escapeHtml(r.matter.id)}">${escapeHtml(r.matter.matter_number)}</a></td><td>${escapeHtml(r.matter.title)}</td><td>${escapeHtml(r.matter.client_name)}</td><td>${r.summary.aiRuns}</td><td>${fmtSeconds(r.summary.aiSeconds)}</td><td>${fmtUsd(r.summary.aiCostUsd)}</td><td>${fmtSeconds(r.summary.lawyerSeconds)}</td><td>${r.ratioAiToLawyer === null ? '—' : r.ratioAiToLawyer.toFixed(2)}</td></tr>`,
        )
        .join('')
    : `<tr><td colspan="8" class="muted">No billing data yet.</td></tr>`;

  const body = `
    ${totals}
    <h2>Per matter</h2>
    <table>
      <thead><tr><th>Number</th><th>Title</th><th>Client</th><th>AI runs</th><th>AI time</th><th>AI $</th><th>Lawyer time</th><th>AI / Lawyer</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  return layout('/billing', 'Billing tracker', body);
}

export function render404(what: string): string {
  return layout('/', '404', `<h2>404 — ${escapeHtml(what)} not found</h2>`);
}
