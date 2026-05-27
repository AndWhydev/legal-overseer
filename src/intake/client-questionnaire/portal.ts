/**
 * Public client intake web portal.
 *
 * Served at /intake/:sessionId, OUTSIDE the admin dashboard auth gate —
 * a prospective client answers their questionnaire here without needing
 * to reply by email. One question at a time, mobile-responsive, branded
 * with the firm's name and colours, with a progress bar.
 *
 * Routes:
 *   GET  /intake/:sessionId          → render the current question
 *   POST /intake/:sessionId/answer   → record an answer, advance
 *
 * Australian English throughout.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createSafeLogger } from '../../governance/index.js';
import { getBranding } from '../../branding/index.js';
import type { IntakeQuestion, IntakeSession } from './types.js';
import { getIntakeSession } from './repo.js';
import { nextQuestion, submitAnswer } from './intake-agent.js';
import { CLARIFY_QUESTION as CLARIFY } from './classifier.js';

const logger = createSafeLogger('IntakePortal');

const INTAKE_PREFIX = '/intake/';

export function isIntakePortalRoute(path: string): boolean {
  return path === '/intake' || path.startsWith(INTAKE_PREFIX);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

interface Brand {
  firmName: string;
  primary: string;
  accent: string;
  logoUrl: string | null;
}

function brand(): Brand {
  let firmName = process.env.INTAKE_FIRM_NAME || 'Our Firm';
  let primary = process.env.INTAKE_FIRM_COLOURS_PRIMARY || '#1a2e4a';
  let accent = '#2f6fed';
  try {
    const b = getBranding();
    if (!process.env.INTAKE_FIRM_NAME && b.firm_name) firmName = b.firm_name;
    if (!process.env.INTAKE_FIRM_COLOURS_PRIMARY && b.primary_color) primary = b.primary_color;
    if (b.accent_color) accent = b.accent_color;
  } catch {
    /* branding table may not exist in a bare test DB — use env defaults */
  }
  return { firmName, primary, accent, logoUrl: process.env.INTAKE_FIRM_LOGO_URL || null };
}

function page(title: string, bodyInner: string): string {
  const b = brand();
  const logo = b.logoUrl
    ? `<img src="${escapeHtml(b.logoUrl)}" alt="${escapeHtml(b.firmName)}" style="max-height:48px">`
    : `<span class="firm">${escapeHtml(b.firmName)}</span>`;
  return `<!doctype html><html lang="en-AU"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(b.firmName)}</title>
<style>
  :root { --primary: ${b.primary}; --accent: ${b.accent}; }
  * { box-sizing: border-box; }
  body { font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1c2430; background: #f4f6fa; margin: 0; }
  header { background: var(--primary); color: #fff; padding: 20px 24px; display: flex; align-items: center; gap: 12px; }
  header .firm { font-size: 20px; font-weight: 600; }
  main { max-width: 640px; margin: 0 auto; padding: 24px 20px 64px; }
  .card { background: #fff; border-radius: 12px; padding: 28px 26px; box-shadow: 0 2px 14px rgba(20,30,50,0.08); margin-top: 24px; }
  .progress { height: 8px; background: #e3e8f0; border-radius: 6px; overflow: hidden; margin: 8px 0 22px; }
  .progress > span { display: block; height: 100%; background: var(--accent); transition: width .3s ease; }
  .step { color: #6b7686; font-size: 14px; margin-bottom: 4px; }
  h1 { font-size: 22px; margin: 0 0 10px; }
  label.q { display: block; font-size: 19px; font-weight: 600; margin: 4px 0 18px; }
  input[type=text], input[type=date], input[type=number], textarea, select {
    width: 100%; padding: 13px 14px; font-size: 17px; border: 1px solid #cdd5e0; border-radius: 8px; background: #fff;
  }
  textarea { min-height: 130px; resize: vertical; }
  .choice { display: block; padding: 14px 16px; border: 1px solid #cdd5e0; border-radius: 8px; margin-bottom: 10px; cursor: pointer; }
  .choice:hover { border-color: var(--accent); }
  .choice input { margin-right: 10px; }
  button { background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 14px 22px; font-size: 17px; font-weight: 600; cursor: pointer; margin-top: 18px; }
  button:hover { filter: brightness(1.05); }
  .muted { color: #6b7686; font-size: 14px; }
  .done { text-align: center; padding: 20px 0; }
  .done .tick { font-size: 48px; }
</style>
</head><body>
<header>${logo}</header>
<main>${bodyInner}</main>
</body></html>`;
}

function renderInput(question: IntakeQuestion): string {
  switch (question.type) {
    case 'date':
      return `<input type="date" name="answer" required>`;
    case 'number':
      return `<input type="number" name="answer" step="any" inputmode="decimal" required>`;
    case 'yes-no':
      return ['Yes', 'No']
        .map(
          (opt) =>
            `<label class="choice"><input type="radio" name="answer" value="${opt}" required>${opt}</label>`,
        )
        .join('');
    case 'choice':
      return (question.choices ?? [])
        .map(
          (opt) =>
            `<label class="choice"><input type="radio" name="answer" value="${escapeHtml(opt)}" required>${escapeHtml(opt)}</label>`,
        )
        .join('');
    case 'text':
    default:
      return `<textarea name="answer" required></textarea>`;
  }
}

function renderQuestionPage(session: IntakeSession): string {
  // Unknown matter type → free-text clarifier.
  if (session.matterType === 'unknown') {
    const inner = `<div class="card">
      <div class="step">Getting started</div>
      <label class="q">${escapeHtml(CLARIFY)}</label>
      <form method="post" action="/intake/${session.id}/answer">
        <textarea name="answer" required placeholder="Tell us in a sentence or two…"></textarea>
        <button type="submit">Continue</button>
      </form>
      <p class="muted">Your answers are reviewed by one of our lawyers before your consultation.</p>
    </div>`;
    return page('Tell us about your matter', inner);
  }

  const step = nextQuestion(session);
  if (!step) return renderComplete();

  const pct = step.total > 0 ? Math.round((step.answered / step.total) * 100) : 0;
  const isFinal = step.answered >= step.total - 1;
  const buttonLabel = isFinal ? 'Finish & send to our lawyers' : 'Continue';

  const inner = `<div class="card">
    <div class="step">Question ${step.answered + 1} of ${step.total}</div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <label class="q">${escapeHtml(step.question.text)}</label>
    <form method="post" action="/intake/${session.id}/answer">
      ${renderInput(step.question)}
      <button type="submit">${buttonLabel}</button>
    </form>
    <p class="muted">Your answers are reviewed by one of our lawyers before your consultation.</p>
  </div>`;
  return page('Your matter', inner);
}

function renderComplete(): string {
  const inner = `<div class="card done">
    <div class="tick">✓</div>
    <h1>Thank you</h1>
    <p>One of our lawyers will be in touch shortly. You will receive a confirmation by email.</p>
  </div>`;
  return page('Thank you', inner);
}

function renderNotFound(): string {
  const inner = `<div class="card">
    <h1>Link not found</h1>
    <p class="muted">This intake link is invalid or has expired. Please contact us directly.</p>
  </div>`;
  return page('Not found', inner);
}

function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to });
  res.end();
}

/** Handle a public intake portal request. Returns true when handled. */
export async function handleIntakePortalRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
): Promise<boolean> {
  const method = req.method ?? 'GET';

  // POST /intake/:id/answer
  const answerMatch = path.match(/^\/intake\/([0-9a-f-]+)\/answer$/i);
  if (answerMatch && method === 'POST') {
    const sessionId = answerMatch[1];
    const session = getIntakeSession(sessionId);
    if (!session) {
      send(res, 404, renderNotFound());
      return true;
    }
    const form = await readForm(req);
    const answer = (form.get('answer') ?? '').trim();
    if (answer) {
      try {
        await submitAnswer(sessionId, answer);
      } catch (err) {
        logger.error(`portal submit failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    redirect(res, `/intake/${sessionId}`);
    return true;
  }

  // GET /intake/:id
  const viewMatch = path.match(/^\/intake\/([0-9a-f-]+)$/i);
  if (viewMatch && method === 'GET') {
    const session = getIntakeSession(viewMatch[1]);
    if (!session) {
      send(res, 404, renderNotFound());
      return true;
    }
    if (session.status !== 'in-progress') {
      send(res, 200, renderComplete());
      return true;
    }
    send(res, 200, renderQuestionPage(session));
    return true;
  }

  return false;
}
