/**
 * Onboarding HTTP routes.
 *
 * Mounted by the dashboard server at /setup/*. When setup is not
 * complete, the dashboard's normal routes redirect here. Once the
 * wizard's "finish" handler flips setup_state.completed, the
 * dashboard switches to its normal mode.
 *
 * The wizard is allowed to write the first admin user without an
 * authenticated session — that's the bootstrap exception. After
 * setup completes, every mutating route requires a session.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createSafeLogger } from '../governance/index.js';
import { renderWizard, STEPS, type Step } from './wizard.js';
import { getSetupState, isSetupComplete, markSetupComplete } from './state.js';
import { createUser, getUserByEmail, hasAnyAdmin } from '../users/index.js';
import { createSession, setSessionCookieHeader } from '../users/session.js';
import { getLicenceState, assertCanAddUser, LicenceLimitError } from '../licence/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { getDatabase } from '../db/connection.js';

const logger = createSafeLogger('OnboardingServer');

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function html(res: ServerResponse, status: number, body: string, extraHeaders: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...extraHeaders });
  res.end(body);
}

function redirect(res: ServerResponse, to: string, headers: Record<string, string> = {}): void {
  res.writeHead(303, { location: to, ...headers });
  res.end();
}

function currentStep(): Step {
  const lic = getLicenceState();
  if (!lic.valid) return 'licence';
  if (!hasAnyAdmin()) return 'admin';
  return 'review';
}

function isSetupRoute(path: string): boolean {
  return path === '/setup' || path.startsWith('/setup/');
}

export async function handleOnboardingRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  isSecure: boolean,
): Promise<boolean> {
  if (!isSetupRoute(path)) return false;

  // If setup is complete, every /setup hit redirects to /.
  if (isSetupComplete() && path !== '/setup/done') {
    redirect(res, '/');
    return true;
  }

  const method = req.method ?? 'GET';
  const state = getSetupState();

  try {
    if (method === 'GET' && (path === '/setup' || path === '/setup/')) {
      html(res, 200, renderWizard({ step: currentStep(), state }));
      return true;
    }

    if (method === 'GET' && path === '/setup/done') {
      html(res, 200, renderWizard({ step: 'done', state }));
      return true;
    }

    // ---- step-specific GETs (for reload) ----
    const stepMatch = path.match(/^\/setup\/(licence|firm|admin|email|review)$/);
    if (method === 'GET' && stepMatch) {
      html(res, 200, renderWizard({ step: stepMatch[1] as Step, state }));
      return true;
    }

    // ---- POST: next step (passthrough for licence + email) ----
    if (method === 'POST' && path === '/setup/next') {
      const fromMatch = (req.url ?? '').match(/from=([a-z]+)/);
      const from = (fromMatch?.[1] as Step | undefined) ?? 'licence';
      const idx = STEPS.indexOf(from);
      const next = STEPS[Math.min(idx + 1, STEPS.length - 1)];
      redirect(res, `/setup/${next}`);
      return true;
    }

    if (method === 'POST' && path === '/setup/firm') {
      const form = await readForm(req);
      const firmName = (form.get('firm_name') ?? '').trim();
      const jurisdiction = (form.get('jurisdiction') ?? 'NSW').trim();
      const notes = (form.get('notes') ?? '').trim();
      if (!firmName) {
        html(res, 400, renderWizard({ step: 'firm', state, flash: { kind: 'error', msg: 'Firm name is required.' } }));
        return true;
      }
      const db = getDatabase();
      db.prepare(
        `UPDATE setup_state SET firm_name = ?, notes = ? WHERE id = 1`,
      ).run(firmName, notes || null);
      if (jurisdiction) {
        process.env.DEFAULT_JURISDICTION = jurisdiction;
      }
      redirect(res, '/setup/admin');
      return true;
    }

    if (method === 'POST' && path === '/setup/admin') {
      const form = await readForm(req);
      const full_name = (form.get('full_name') ?? '').trim();
      const email = (form.get('email') ?? '').trim().toLowerCase();
      const password = form.get('password') ?? '';
      const confirm = form.get('password_confirm') ?? '';

      const errors: string[] = [];
      if (!full_name) errors.push('Full name is required.');
      if (!email || !email.includes('@')) errors.push('Valid email is required.');
      if (password.length < 12) errors.push('Password must be at least 12 characters.');
      if (password !== confirm) errors.push('Passwords do not match.');
      if (errors.length) {
        html(res, 400, renderWizard({
          step: 'admin', state,
          flash: { kind: 'error', msg: errors.join(' ') },
          formValues: { full_name, email },
        }));
        return true;
      }

      if (getUserByEmail(email)) {
        html(res, 400, renderWizard({
          step: 'admin', state,
          flash: { kind: 'error', msg: 'A user with that email already exists.' },
          formValues: { full_name, email },
        }));
        return true;
      }

      try {
        assertCanAddUser();
      } catch (err) {
        const msg = err instanceof LicenceLimitError ? err.message : (err as Error).message;
        html(res, 400, renderWizard({
          step: 'admin', state,
          flash: { kind: 'error', msg },
          formValues: { full_name, email },
        }));
        return true;
      }

      const user = createUser({ email, full_name, role: 'admin', password });
      appendLegalAudit({
        matterId: null,
        actorId: 'setup-wizard',
        action: 'user.create',
        detail: `bootstrap admin ${email}`,
        refTable: 'users',
        refId: user.id,
        metadata: { role: 'admin' },
      });

      const session = createSession(
        user.id,
        req.socket.remoteAddress ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
      redirect(res, '/setup/email', {
        'set-cookie': setSessionCookieHeader(session.id, isSecure),
      });
      return true;
    }

    if (method === 'POST' && path === '/setup/finish') {
      if (!hasAnyAdmin()) {
        redirect(res, '/setup/admin');
        return true;
      }
      const adminEmail = (getDatabase()
        .prepare(`SELECT email FROM users WHERE role='admin' AND status='active' ORDER BY created_at LIMIT 1`)
        .get() as { email: string } | undefined)?.email ?? 'unknown';
      markSetupComplete(adminEmail, getSetupState().firm_name ?? undefined);
      appendLegalAudit({
        matterId: null,
        actorId: adminEmail,
        action: 'setup.complete',
        detail: 'first-run wizard finished',
      });
      redirect(res, '/setup/done');
      return true;
    }

    html(res, 404, renderWizard({ step: currentStep(), state, flash: { kind: 'error', msg: 'Unknown setup path.' } }));
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`setup error: ${msg}`);
    html(res, 500, renderWizard({ step: currentStep(), state, flash: { kind: 'error', msg } }));
    return true;
  }
}

export { isSetupRoute };
