/**
 * Matter timeline view.
 *
 * Two modes: the on-screen view (rich header, navigation, link to print)
 * and the printable mode (?print=1) which strips chrome and applies
 * print-friendly CSS so the lawyer can print-to-PDF for client
 * reporting. No PDF library is bundled — the browser's "Save as PDF"
 * dialog produces a perfectly serviceable artifact.
 */

import { escapeHtml } from './render.js';
import type { Matter } from '../db/repositories/matters.js';
import type { TimelineEvent, TimelineColor } from '../matter-timeline/index.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;
      --accent:#7aa2f7;--green:#6dd29b;--amber:#e5b76a;--red:#f07178;--grey:#5a6273}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
header h1{font-size:16px;margin:0}
header nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
header nav a:hover,header nav a.active{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:980px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
.summary{background:var(--panel);padding:16px 20px;border-radius:8px;margin-bottom:16px}
.summary h2{margin-top:0}
.timeline{position:relative;margin-top:24px;padding-left:32px}
.timeline:before{content:"";position:absolute;left:11px;top:6px;bottom:6px;width:2px;background:#2a2f3a}
.event{position:relative;padding:0 0 18px 0}
.event .dot{position:absolute;left:-32px;top:6px;width:14px;height:14px;border-radius:50%;border:2px solid var(--bg)}
.event .dot.green{background:var(--green)}
.event .dot.amber{background:var(--amber)}
.event .dot.red{background:var(--red)}
.event .dot.grey{background:var(--grey)}
.event .when{color:var(--muted);font-size:12px;margin-bottom:2px}
.event .title{font-weight:600}
.event .detail{color:var(--muted);font-size:13px;margin-top:2px}
.event a{color:var(--accent);text-decoration:none}
.event a:hover{text-decoration:underline}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;background:var(--panel-2);color:var(--muted);font-size:11px;margin-left:8px;vertical-align:middle}
.muted{color:var(--muted)}
@media print {
  body{background:#fff;color:#111}
  header,.no-print{display:none}
  main{max-width:none;padding:8px 0}
  .summary,.timeline:before{background:transparent;border:none}
  .event .dot{border-color:#fff}
  .event .detail,.event .when,.muted,.pill{color:#444}
  .event a{color:#000;text-decoration:underline}
  .pill{border:1px solid #ddd;background:#f5f5f5}
}
`;

function colorClass(c: TimelineColor): string {
  return c;
}

export function renderTimelinePage(opts: {
  matter: Matter;
  events: TimelineEvent[];
  currentEmail: string;
  printable: boolean;
}): string {
  const { matter, events, currentEmail, printable } = opts;

  const greenCount = events.filter((e) => e.color === 'green').length;
  const amberCount = events.filter((e) => e.color === 'amber').length;
  const redCount = events.filter((e) => e.color === 'red').length;

  const eventsHtml = events.length
    ? events.map((e) => {
        const linkOpen = e.href ? `<a href="${escapeHtml(e.href)}">` : '';
        const linkClose = e.href ? '</a>' : '';
        const badge = e.badge ? `<span class="pill">${escapeHtml(e.badge)}</span>` : '';
        return `<div class="event">
          <span class="dot ${colorClass(e.color)}"></span>
          <div class="when">${escapeHtml(e.at)}</div>
          <div class="title">${linkOpen}${escapeHtml(e.title)}${linkClose}${badge}</div>
          ${e.detail ? `<div class="detail">${escapeHtml(e.detail)}</div>` : ''}
        </div>`;
      }).join('')
    : `<p class="muted">No events recorded yet for this matter.</p>`;

  const header = printable
    ? ''
    : `<header>
        <h1>Legal Overseer</h1>
        <nav>
          <a href="/">Matters</a>
          <a href="/review">Review queue</a>
          <a href="/calendar">Deadlines</a>
          <a href="/billing">Billing</a>
          <a href="/upload">Upload</a>
        </nav>
        <div style="margin-left:auto;color:var(--muted)">${escapeHtml(currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
      </header>`;

  const exportControls = printable
    ? ''
    : `<div class="no-print" style="margin-top:8px"><a href="/matter/${escapeHtml(matter.id)}/timeline?print=1" target="_blank" style="color:#7aa2f7">Open printable view (use your browser's Save as PDF)</a></div>`;

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Timeline — ${escapeHtml(matter.matter_number)}</title><style>${STYLE}</style></head>
<body>
${header}
<main>
  <div class="summary">
    <h2>${escapeHtml(matter.matter_number)} — ${escapeHtml(matter.title)}</h2>
    <p class="muted">${escapeHtml(matter.client_name)} · ${escapeHtml(matter.jurisdiction)} · ${escapeHtml(matter.matter_type)} · ${escapeHtml(matter.status)}</p>
    <p>Events: <strong>${events.length}</strong>
      &nbsp;<span class="pill" style="color:#6dd29b">${greenCount} completed</span>
      &nbsp;<span class="pill" style="color:#e5b76a">${amberCount} pending</span>
      &nbsp;<span class="pill" style="color:#f07178">${redCount} overdue / rejected</span>
    </p>
    ${exportControls}
  </div>

  <div class="timeline">${eventsHtml}</div>
</main>
${printable ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>' : ''}
</body></html>`;
}
