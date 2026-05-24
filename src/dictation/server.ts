/**
 * Dictation HTTP routes.
 *
 *   GET  /dictate                → upload form + transcription history.
 *   POST /dictate                → accept audio, transcribe, save txt
 *                                  to documents store, queue a task
 *                                  for the chosen skill.
 *
 * Transcribed text is shown back to the lawyer for review BEFORE the
 * skill task is queued. The lawyer ticks a checkbox to confirm the
 * transcription before it goes any further.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { escapeHtml } from '../dashboard/render.js';
import { createSafeLogger } from '../governance/index.js';
import { parseMultipart } from '../uploads/multipart.js';
import { storeDocument } from '../uploads/store.js';
import { transcribeAudio, isTranscriptionAvailable } from './transcribe.js';
import { listMatters, getMatterById } from '../db/repositories/matters.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getDatabase } from '../db/connection.js';
import { randomUUID } from 'node:crypto';
import type { Session } from '../users/index.js';

const logger = createSafeLogger('DictationServer');

export function isDictationRoute(path: string): boolean {
  return path === '/dictate' || path.startsWith('/dictate/');
}

const STYLE = `
:root{--bg:#0f1115;--panel:#181b22;--panel-2:#1f232b;--text:#e6e9ee;--muted:#8a93a4;--accent:#7aa2f7;--green:#6dd29b;--red:#f07178}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0}
header{padding:16px 24px;background:var(--panel);border-bottom:1px solid #2a2f3a;display:flex;gap:16px;align-items:center}
header nav a{color:var(--muted);margin-right:16px;text-decoration:none;padding:4px 8px;border-radius:4px}
header nav a.active,header nav a:hover{color:var(--text);background:var(--panel-2)}
main{padding:24px;max-width:900px;margin:0 auto}
h2{font-size:14px;text-transform:uppercase;color:var(--muted);letter-spacing:0.05em;margin:24px 0 8px}
.card{background:var(--panel);padding:20px;border-radius:8px;margin-bottom:16px}
label{display:block;margin:8px 0 4px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:0.05em}
input[type="file"],select,textarea{background:var(--panel-2);color:var(--text);border:1px solid #2a2f3a;border-radius:4px;padding:8px 10px;font:inherit;width:100%}
textarea{font-family:inherit;min-height:160px}
button{background:var(--accent);color:#0f1115;border:none;border-radius:4px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer;margin-top:12px}
.warn{background:#3a2920;color:#f0c780;padding:12px 16px;border-radius:6px;border-left:4px solid var(--red);margin-bottom:16px}
.ok{background:#1f3d2a;color:#b6f0ce;padding:12px 16px;border-radius:6px;border-left:4px solid var(--green);margin-bottom:16px}
.muted{color:var(--muted);font-size:13px}
`;

function shell(currentEmail: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Dictate — Legal Overseer</title><style>${STYLE}</style></head>
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
    <a href="/dictate" class="active">Dictate</a>
  </nav>
  <div style="margin-left:auto;color:var(--muted)">${escapeHtml(currentEmail)} · <a href="/logout" style="color:#7aa2f7">log out</a></div>
</header>
<main>${body}</main></body></html>`;
}

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}
function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to });
  res.end();
}

interface SubmittedDictation {
  id: string;
  filename: string;
  transcript: string;
  matterId: string;
  skillId: string;
  audioDocId: string;
}

const RECENT: SubmittedDictation[] = [];
const RECENT_MAX = 20;

function renderForm(opts: {
  currentEmail: string;
  warn?: string;
  ok?: string;
  preview?: { transcript: string; filename: string; audioDocId: string; matterIdHint?: string; durationMs?: number };
}): string {
  const matters = listMatters();
  const matterOptions = matters
    .map((m) => `<option value="${escapeHtml(m.id)}"${opts.preview?.matterIdHint === m.id ? ' selected' : ''}>${escapeHtml(m.matter_number)} — ${escapeHtml(m.title)}</option>`)
    .join('');
  const available = isTranscriptionAvailable();

  const warnBlock = !available
    ? `<div class="warn">Audio transcription is currently <b>disabled</b>. Set <code>WHISPER_API_KEY</code> in the environment and restart, or type the brief into the form below.</div>`
    : '';
  const flashBlock = opts.warn ? `<div class="warn">${escapeHtml(opts.warn)}</div>` : '';
  const okBlock = opts.ok ? `<div class="ok">${escapeHtml(opts.ok)}</div>` : '';

  const previewBlock = opts.preview
    ? `<h2>Transcription preview</h2>
       <div class="card">
         <p class="muted">${escapeHtml(opts.preview.filename)} — ${opts.preview.durationMs ? `${opts.preview.durationMs} ms` : ''}</p>
         <form method="post" action="/dictate/submit">
           <input type="hidden" name="audio_doc_id" value="${escapeHtml(opts.preview.audioDocId)}">
           <label>Transcription (edit before submitting)</label>
           <textarea name="transcript" required>${escapeHtml(opts.preview.transcript)}</textarea>
           <label>Attach to matter</label>
           <select name="matter_id" required>${matterOptions}</select>
           <label>Send to skill</label>
           <select name="skill_id">
             <option value="legal_research">Legal Research</option>
             <option value="matter_drafting">Matter Drafting</option>
             <option value="client_comms">Client Comms</option>
             <option value="matter_management">Matter Management</option>
             <option value="general">General</option>
           </select>
           <label><input type="checkbox" name="confirmed" required> I have reviewed the transcription and confirm it is accurate.</label>
           <button type="submit">Submit to skill queue</button>
         </form>
       </div>`
    : '';

  const recentBlock = RECENT.length
    ? `<h2>Recent dictations</h2>
       <table style="width:100%;border-collapse:collapse;background:var(--panel);border-radius:6px;overflow:hidden">
         <thead><tr style="background:#1f232b"><th style="text-align:left;padding:8px 12px;color:#8a93a4;font-size:12px;text-transform:uppercase">When (in-memory)</th><th style="text-align:left;padding:8px 12px;color:#8a93a4;font-size:12px;text-transform:uppercase">Audio</th><th style="text-align:left;padding:8px 12px;color:#8a93a4;font-size:12px;text-transform:uppercase">Matter</th><th style="text-align:left;padding:8px 12px;color:#8a93a4;font-size:12px;text-transform:uppercase">Skill</th></tr></thead>
         <tbody>${RECENT.map((r) => {
           const m = getMatterById(r.matterId);
           return `<tr style="border-top:1px solid #2a2f3a"><td style="padding:8px 12px">${escapeHtml(r.id.slice(0, 8))}</td><td style="padding:8px 12px">${escapeHtml(r.filename)}</td><td style="padding:8px 12px">${m ? escapeHtml(m.matter_number) : '—'}</td><td style="padding:8px 12px">${escapeHtml(r.skillId)}</td></tr>`;
         }).join('')}</tbody>
       </table>`
    : '';

  const body = `
    ${flashBlock}${okBlock}${warnBlock}
    <h2>Dictate &amp; draft</h2>
    <div class="card">
      <p class="muted">Upload an audio file (MP3, WAV, M4A — max 25 MB). The file is transcribed by Whisper and then shown back to you to review BEFORE any drafting skill is invoked.</p>
      <form method="post" action="/dictate" enctype="multipart/form-data">
        <label>Audio file</label>
        <input type="file" name="audio" accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-m4a,audio/mp4" required>
        <label>Attach to matter (optional — assign after preview)</label>
        <select name="matter_id_hint">
          <option value="">—</option>${matterOptions}
        </select>
        <button type="submit"${available ? '' : ' disabled style="opacity:.4;cursor:not-allowed"'}>Upload &amp; transcribe</button>
      </form>
    </div>

    ${previewBlock}
    ${recentBlock}
  `;
  return shell(opts.currentEmail, body);
}

function queueSkillTask(input: {
  matterId: string;
  skillId: string;
  description: string;
  payload: Record<string, unknown>;
}): string {
  const db = getDatabase();
  const id = randomUUID();
  const now = new Date().toISOString();
  // Insert a task row in the same shape the processor reads.
  db.prepare(
    `INSERT INTO tasks (id, agent_id, task_type, status, priority, input_json, created_at, updated_at)
     VALUES (?, 'overseer', ?, 'pending', 5, ?, ?, ?)`,
  ).run(id, `skill:${input.skillId}`, JSON.stringify({ description: input.description, ...input.payload, matterId: input.matterId }), now, now);
  return id;
}

export async function handleDictationRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  session: Session,
): Promise<boolean> {
  if (!isDictationRoute(path)) return false;
  const method = req.method ?? 'GET';

  try {
    if (method === 'GET' && path === '/dictate') {
      html(res, 200, renderForm({ currentEmail: session.user.email }));
      return true;
    }

    if (method === 'POST' && path === '/dictate') {
      const parsed = await parseMultipart(req, { maxBytes: 30 * 1024 * 1024 });
      const file = parsed.files.find((f) => f.fieldName === 'audio');
      if (!file) {
        html(res, 400, renderForm({ currentEmail: session.user.email, warn: 'No audio file uploaded.' }));
        return true;
      }
      const matterHint = parsed.fields.matter_id_hint || '';
      // Need a matter to store the audio against. Use the hint if
      // provided; otherwise stage under a sentinel matter so the
      // lawyer can attach it after preview.
      const matterIdForStorage = matterHint || (listMatters()[0]?.id ?? '');
      if (!matterIdForStorage) {
        html(res, 400, renderForm({ currentEmail: session.user.email, warn: 'No matters exist yet. Create one first via /upload or intake.' }));
        return true;
      }
      // Store the raw audio first so the audit trail has a copy.
      const audioStored = storeDocument({
        matterId: matterIdForStorage,
        filename: file.filename,
        contentType: file.contentType,
        data: file.data,
        extractedText: '',
        extractionNote: 'audio file (awaiting transcription)',
        uploadedBy: session.user.email,
      });
      appendLegalAudit({
        matterId: matterIdForStorage, actorId: session.user.email,
        action: 'dictation.audio_uploaded', detail: file.filename,
        refTable: 'documents', refId: audioStored.id,
      });

      const t = await transcribeAudio(file.data, file.filename, file.contentType);
      if (!t.ok) {
        html(res, 502, renderForm({
          currentEmail: session.user.email,
          warn: `Transcription failed: ${t.error}`,
        }));
        return true;
      }

      appendLegalAudit({
        matterId: matterIdForStorage, actorId: session.user.email,
        action: 'dictation.transcribed',
        detail: `${file.filename} → ${t.text.length} chars (${t.durationMs} ms)`,
        refTable: 'documents', refId: audioStored.id,
        metadata: { model: 'whisper-1' },
      });

      html(res, 200, renderForm({
        currentEmail: session.user.email,
        preview: {
          transcript: t.text,
          filename: file.filename,
          audioDocId: audioStored.id,
          matterIdHint: matterHint || matterIdForStorage,
          durationMs: t.durationMs,
        },
      }));
      return true;
    }

    if (method === 'POST' && path === '/dictate/submit') {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const transcript = (form.get('transcript') ?? '').trim();
      const matterId = (form.get('matter_id') ?? '').trim();
      const skillId = (form.get('skill_id') ?? 'general').trim();
      const audioDocId = (form.get('audio_doc_id') ?? '').trim();
      const confirmed = form.get('confirmed') === 'on';
      if (!confirmed || !transcript || !matterId) {
        html(res, 400, renderForm({ currentEmail: session.user.email, warn: 'Transcript, matter, and confirmation are required.' }));
        return true;
      }
      const taskId = queueSkillTask({
        matterId, skillId, description: 'Dictated brief',
        payload: { transcript, audioDocumentId: audioDocId, source: 'dictation' },
      });
      appendLegalAudit({
        matterId, actorId: session.user.email,
        action: 'dictation.queued_for_skill',
        detail: `skill=${skillId} task=${taskId} chars=${transcript.length}`,
        refTable: 'tasks', refId: taskId,
      });
      RECENT.unshift({
        id: randomUUID(), filename: 'submitted',
        transcript: transcript.slice(0, 200), matterId, skillId, audioDocId,
      });
      if (RECENT.length > RECENT_MAX) RECENT.pop();
      html(res, 200, renderForm({
        currentEmail: session.user.email,
        ok: `Submitted to ${skillId} for matter ${matterId}. Task id: ${taskId}.`,
      }));
      return true;
    }

    html(res, 404, '<h1>404</h1>');
    return true;
  } catch (err) {
    logger.error(`dictation error: ${err instanceof Error ? err.message : String(err)}`);
    html(res, 500, '<h1>internal error</h1>');
    return true;
  }
}
