/**
 * Per-user weekly briefing preferences page.
 */

import { escapeHtml } from './render.js';
import type { BriefingPreferences } from '../weekly-briefing/index.js';

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;--accent:#7aa2f7}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
main{padding:24px;max-width:720px;margin:0 auto}
.card{background:var(--panel);padding:24px;border-radius:8px}
label.row{display:block;padding:8px 0;border-bottom:1px solid #2a2f3a}
input[type="checkbox"]{margin-right:8px;transform:scale(1.2)}
input[type="text"]{background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:6px 8px;font:inherit;width:100%;margin-top:4px}
button{background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer;margin-top:16px}
.muted{color:var(--muted);font-size:13px}
`;

function chk(name: string, label: string, value: boolean): string {
  return `<label class="row"><input type="checkbox" name="${escapeHtml(name)}"${value ? ' checked' : ''}>${escapeHtml(label)}</label>`;
}

export function renderBriefingPrefsPage(prefs: BriefingPreferences, currentEmail: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Weekly briefing — Legal Overseer</title><style>${STYLE}</style></head>
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
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>
  <h2 style="text-transform:uppercase;color:var(--muted);font-size:14px;letter-spacing:0.05em;margin:8px 0 16px">Weekly briefing preferences</h2>
  <div class="card">
    <p class="muted">Your weekly intelligence briefing is sent every Monday at 08:00. Use the controls below to customise what it includes — or turn it off entirely.</p>
    <form method="post" action="/me/briefing">
      ${chk('weekly_enabled', 'Send me the weekly briefing', prefs.weekly_enabled)}
      ${chk('section_matters', 'My active matters', prefs.section_matters)}
      ${chk('section_deadlines', 'Upcoming deadlines this week', prefs.section_deadlines)}
      ${chk('section_overdue', 'Overdue items', prefs.section_overdue)}
      ${chk('section_regulatory', 'Regulatory changes relevant to my practice areas', prefs.section_regulatory)}
      ${chk('section_precedents', 'New precedents added this week', prefs.section_precedents)}
      <label class="row" style="border-bottom:none">
        <div>Practice areas (comma-separated)</div>
        <input type="text" name="practice_areas" value="${escapeHtml(prefs.practice_areas.join(', '))}" placeholder="commercial, employment, family">
        <div class="muted">Used to filter the regulatory-changes section. Leave blank for all.</div>
      </label>
      <button type="submit">Save preferences</button>
    </form>
  </div>
</main></body></html>`;
}
