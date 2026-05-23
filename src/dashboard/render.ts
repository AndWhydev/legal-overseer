/**
 * Tiny HTML renderer for the overseer dashboard.
 *
 * No framework: just template literals + an `escapeHtml` helper. The
 * goal is a CTO-friendly at-a-glance view of the fleet, served from a
 * single Node process with zero build step.
 */

import type {
  FleetSummary,
  ProjectDetail,
  ProjectFleetRow,
} from './aggregator.js';
import type { Task } from '../db/repositories/tasks.js';

export function escapeHtml(s: string): string {
  return s
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

const STYLES = `
:root {
  color-scheme: dark;
  --bg: #0e0f12;
  --panel: #15171c;
  --border: #262931;
  --text: #d7dae0;
  --muted: #7c828c;
  --accent: #6ea8fe;
  --green: #4ade80;
  --amber: #fbbf24;
  --red: #ef4444;
}
* { box-sizing: border-box; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
  margin: 0;
  padding: 24px;
  line-height: 1.5;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1 { font-size: 22px; margin: 0 0 4px 0; }
h2 { font-size: 16px; margin: 24px 0 8px 0; color: var(--muted); font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; }
header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.muted { color: var(--muted); font-size: 12px; }
.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 24px; }
.totals .panel { text-align: center; }
.totals .num { font-size: 24px; font-weight: 600; }
.totals .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
tr:hover td { background: rgba(255,255,255,0.02); }
.health { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
.health.green { background: var(--green); }
.health.amber { background: var(--amber); }
.health.red { background: var(--red); }
.tag { display: inline-block; background: var(--border); color: var(--text); padding: 2px 8px; border-radius: 10px; font-size: 11px; margin-right: 4px; }
.tag.success { background: #14532d; color: #4ade80; }
.tag.failed  { background: #5a1212; color: #ef4444; }
.tag.running { background: #1e3a5f; color: #6ea8fe; }
.tag.pending { background: #3a3a1e; color: #fbbf24; }
.tag.completed { background: #14532d; color: #4ade80; }
.tag.cancelled { background: #2a2a2a; color: #7c828c; }
.tag.escalate { background: #5a3812; color: #fbbf24; }
.tag.wait    { background: #2a2a2a; color: #7c828c; }
.tag.dispatch { background: #1e3a5f; color: #6ea8fe; }
pre { background: #0a0b0d; border: 1px solid var(--border); padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; max-height: 400px; }
.code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px; color: var(--muted); }
nav { margin-bottom: 16px; font-size: 13px; }
nav a { margin-right: 12px; }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Overseer</title>
  <style>${STYLES}</style>
</head>
<body>
  <nav>
    <a href="/">← Fleet</a>
  </nav>
  ${body}
</body>
</html>`;
}

function healthChip(h: ProjectFleetRow['health']): string {
  return `<span class="health ${h}" title="${h}"></span>`;
}

export function renderFleet(summary: FleetSummary): string {
  const { totals } = summary;
  const totalCards = `
    <div class="totals">
      <div class="panel"><div class="num">${totals.projects}</div><div class="label">Projects</div></div>
      <div class="panel"><div class="num">${totals.active}</div><div class="label">Active</div></div>
      <div class="panel"><div class="num">${totals.paused}</div><div class="label">Paused</div></div>
      <div class="panel"><div class="num">${totals.runningTasks}</div><div class="label">Running</div></div>
      <div class="panel"><div class="num">${totals.pendingTasks}</div><div class="label">Pending</div></div>
      <div class="panel"><div class="num">${totals.lessons}</div><div class="label">Lessons</div></div>
      <div class="panel"><div class="num">$${totals.costLast24hUsd.toFixed(2)}</div><div class="label">Spend 24h</div></div>
    </div>`;

  const rows = summary.rows
    .map((r) => {
      const p = r.project;
      const tierLabel = p.model_tier_override ?? 'default';
      return `<tr>
        <td>${healthChip(r.health)}<a href="/project/${escapeHtml(p.id)}">${escapeHtml(p.name)}</a>
            <div class="code">${escapeHtml(p.path)}</div></td>
        <td>${escapeHtml(p.status)}</td>
        <td>${p.priority}</td>
        <td>${tierLabel}</td>
        <td>${r.iterationsLast24h}/${r.iterationsCap}</td>
        <td>${r.pendingTasks} · <span class="tag running">${r.runningTasks}</span></td>
        <td>${r.lastWorkerStatus ? `<span class="tag ${escapeHtml(r.lastWorkerStatus)}">${escapeHtml(r.lastWorkerStatus)}</span>` : '—'}
            <div class="muted">${ago(r.lastWorkerAt)}</div></td>
        <td>${r.lessonsCount}</td>
        <td>${r.costLast24hUsd > 0 ? `$${r.costLast24hUsd.toFixed(3)}` : '—'}</td>
      </tr>`;
    })
    .join('');

  const body = `
  <header>
    <div>
      <h1>Overseer Fleet</h1>
      <div class="muted">Updated ${escapeHtml(summary.generatedAt)}</div>
    </div>
    <div class="muted">${summary.rows.length} project(s)</div>
  </header>
  ${totalCards}
  <div class="panel">
    <table>
      <thead><tr>
        <th>Project</th><th>Status</th><th>Pri</th><th>Tier</th>
        <th>Iter 24h</th><th>Tasks p/r</th><th>Last worker</th>
        <th>Lessons</th><th>Cost 24h</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="9">no projects registered</td></tr>'}</tbody>
    </table>
  </div>`;

  return shell('Fleet', body);
}

export function renderProject(detail: ProjectDetail): string {
  const p = detail.project;
  const r = detail.fleetRow;

  const taskRows = detail.recentTasks
    .map((t) => {
      return `<tr>
        <td><a href="/task/${escapeHtml(t.id)}">${escapeHtml(t.id.slice(0, 8))}</a></td>
        <td>${escapeHtml(t.skillId)}</td>
        <td><span class="tag ${escapeHtml(t.status)}">${escapeHtml(t.status)}</span></td>
        <td class="muted">${ago(t.createdAt)}</td>
        <td>${t.costUsd !== null ? `$${t.costUsd.toFixed(4)}` : '—'}</td>
      </tr>`;
    })
    .join('');

  const lessonRows = detail.recentLessons
    .map((l) => `<tr>
        <td><span class="tag ${escapeHtml(l.outcome)}">${escapeHtml(l.outcome)}</span></td>
        <td>${l.importance}</td>
        <td><b>${escapeHtml(l.title)}</b><div class="muted">${escapeHtml(l.body.slice(0, 200))}${l.body.length > 200 ? '…' : ''}</div></td>
        <td class="muted">${ago(l.created_at)}</td>
      </tr>`)
    .join('');

  const body = `
  <header>
    <div>
      <h1>${healthChip(r.health)}${escapeHtml(p.name)}</h1>
      <div class="code">${escapeHtml(p.path)}</div>
    </div>
    <div class="muted">${escapeHtml(p.status)} · priority ${p.priority} · tier ${p.model_tier_override ?? 'default'}</div>
  </header>

  <div class="totals">
    <div class="panel"><div class="num">${r.iterationsLast24h}/${r.iterationsCap}</div><div class="label">Iterations 24h</div></div>
    <div class="panel"><div class="num">${r.pendingTasks}</div><div class="label">Pending</div></div>
    <div class="panel"><div class="num">${r.runningTasks}</div><div class="label">Running</div></div>
    <div class="panel"><div class="num">${r.lessonsCount}</div><div class="label">Lessons</div></div>
    <div class="panel"><div class="num">$${r.costLast24hUsd.toFixed(3)}</div><div class="label">Cost 24h</div></div>
    <div class="panel"><div class="num">${detail.playbook.exists ? '✓' : '—'}</div><div class="label">Playbook</div></div>
  </div>

  ${r.lastEscalationAt ? `<div class="panel"><b>Last escalation:</b> ${ago(r.lastEscalationAt)}</div>` : ''}

  <h2>Recent tasks</h2>
  <div class="panel"><table>
    <thead><tr><th>ID</th><th>Skill</th><th>Status</th><th>When</th><th>Cost</th></tr></thead>
    <tbody>${taskRows || '<tr><td colspan="5">no tasks yet</td></tr>'}</tbody>
  </table></div>

  <h2>Lessons learned</h2>
  <div class="panel"><table>
    <thead><tr><th>Outcome</th><th>Imp</th><th>Lesson</th><th>Age</th></tr></thead>
    <tbody>${lessonRows || '<tr><td colspan="4">no lessons yet</td></tr>'}</tbody>
  </table></div>

  ${p.notes ? `<h2>Notes</h2><div class="panel">${escapeHtml(p.notes)}</div>` : ''}
  `;

  return shell(p.name, body);
}

export function renderTask(
  taskInfo: { task: Task; inputObj: unknown; outputObj: unknown },
): string {
  const { task, inputObj, outputObj } = taskInfo;
  const body = `
  <header>
    <div>
      <h1>Task ${escapeHtml(task.id.slice(0, 8))}</h1>
      <div class="muted">skill ${escapeHtml(task.skill_id)} · created ${ago(task.created_at)} · ${task.completed_at ? `completed ${ago(task.completed_at)}` : 'in flight'}</div>
    </div>
    <div><span class="tag ${escapeHtml(task.status)}">${escapeHtml(task.status)}</span></div>
  </header>

  ${task.project_id ? `<div class="muted">project: <a href="/project/${escapeHtml(task.project_id)}">${escapeHtml(task.project_id)}</a></div>` : ''}
  ${task.error_message ? `<h2>Error</h2><div class="panel"><pre>${escapeHtml(task.error_message)}</pre></div>` : ''}

  <h2>Input</h2>
  <div class="panel"><pre>${escapeHtml(JSON.stringify(inputObj, null, 2))}</pre></div>

  <h2>Output</h2>
  <div class="panel"><pre>${escapeHtml(JSON.stringify(outputObj, null, 2))}</pre></div>
  `;

  return shell(`Task ${task.id.slice(0, 8)}`, body);
}

export function render404(what: string): string {
  return shell('Not found', `<h1>Not found</h1><p>No such ${escapeHtml(what)}.</p>`);
}
