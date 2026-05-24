/**
 * Client portal HTTP routes.
 *
 * Mounted at /client-portal/* by the dashboard server. The look is
 * deliberately clean and professional — no mention of AI anywhere on
 * the client-facing surface (the firm's brand fronts the work).
 *
 *   GET  /client-portal/login                 → email + password form
 *   POST /client-portal/login                 → session creation
 *   GET  /client-portal/logout                → session destroy
 *   GET  /client-portal                       → dashboard (matters list)
 *   GET  /client-portal/matter/:id            → matter view (visible docs only)
 *   POST /client-portal/matter/:id/upload     → client document upload
 *
 * Share links (`/share/<token>`) live OUTSIDE the client portal so
 * external counsel can open one without a portal account.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createSafeLogger } from '../governance/index.js';
import {
  getClientUserByEmail,
  verifyClientPassword,
  createClientSession,
  loadClientSession,
  destroyClientSession,
  parseClientSessionCookie,
  setClientSessionCookie,
  clearClientSessionCookie,
  listClientMatters,
  isClientAllowedMatter,
  listVisibleDocumentIds,
  type ClientUser,
} from './repo.js';
import { getMatterById } from '../db/repositories/matters.js';
import { getDocument, listMatterDocuments, storeDocument, parseMultipart, extractText } from '../uploads/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { renderClientLogin, renderClientDashboard, renderClientMatter } from './views.js';

const logger = createSafeLogger('ClientPortal');

export function isClientPortalRoute(path: string): boolean {
  return path === '/client-portal' || path.startsWith('/client-portal/');
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function html(res: ServerResponse, status: number, body: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
  res.end(body);
}
function redirect(res: ServerResponse, to: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(303, { location: to, ...headers });
  res.end();
}

function resolveClientSession(req: IncomingMessage): ClientUser | null {
  const id = parseClientSessionCookie(req.headers.cookie);
  if (!id) return null;
  const loaded = loadClientSession(id);
  return loaded?.user ?? null;
}

export async function handleClientPortalRoute(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  isSecure: boolean,
): Promise<boolean> {
  if (!isClientPortalRoute(path)) return false;
  const method = req.method ?? 'GET';

  try {
    // ─── login / logout ─────────────────────────────────────────
    if (method === 'GET' && path === '/client-portal/login') {
      html(res, 200, renderClientLogin());
      return true;
    }
    if (method === 'POST' && path === '/client-portal/login') {
      const body = await readForm(req);
      const email = (body.get('email') ?? '').trim().toLowerCase();
      const password = body.get('password') ?? '';
      const user = email ? getClientUserByEmail(email) : null;
      const ok = !!user && user.status === 'active' && verifyClientPassword(user, password);
      if (!ok || !user) {
        html(res, 401, renderClientLogin('Invalid email or password.', email));
        return true;
      }
      const session = createClientSession(user.id);
      appendLegalAudit({
        matterId: null, actorId: `client:${user.email}`, action: 'client_portal.login',
        detail: `login from ${req.socket.remoteAddress ?? 'unknown'}`,
        refTable: 'client_users', refId: user.id,
      });
      redirect(res, '/client-portal', {
        'set-cookie': setClientSessionCookie(session.id, isSecure),
      });
      return true;
    }
    if (method === 'GET' && path === '/client-portal/logout') {
      const cookieId = parseClientSessionCookie(req.headers.cookie);
      if (cookieId) destroyClientSession(cookieId);
      redirect(res, '/client-portal/login', { 'set-cookie': clearClientSessionCookie() });
      return true;
    }

    // ─── auth wall ──────────────────────────────────────────────
    const user = resolveClientSession(req);
    if (!user) {
      redirect(res, '/client-portal/login');
      return true;
    }

    // ─── dashboard ──────────────────────────────────────────────
    if (method === 'GET' && (path === '/client-portal' || path === '/client-portal/')) {
      const matterIds = listClientMatters(user.id);
      const matters = matterIds
        .map((id) => getMatterById(id))
        .filter((m): m is NonNullable<typeof m> => !!m);
      html(res, 200, renderClientDashboard({ user, matters }));
      return true;
    }

    // ─── per-matter ─────────────────────────────────────────────
    const matterMatch = path.match(/^\/client-portal\/matter\/([0-9a-f-]+)$/i);
    if (method === 'GET' && matterMatch) {
      const matterId = matterMatch[1];
      if (!isClientAllowedMatter(user.id, matterId)) {
        html(res, 403, renderClientDashboard({ user, matters: [], flash: { kind: 'error', msg: 'You do not have access to that matter.' } }));
        return true;
      }
      const matter = getMatterById(matterId);
      if (!matter) {
        html(res, 404, renderClientDashboard({ user, matters: [], flash: { kind: 'error', msg: 'Matter not found.' } }));
        return true;
      }
      const visibleIds = new Set(listVisibleDocumentIds(matterId));
      const documents = listMatterDocuments(matterId).filter((d) => visibleIds.has(d.id));
      html(res, 200, renderClientMatter({ user, matter, documents }));
      return true;
    }

    // ─── client-side upload ─────────────────────────────────────
    const uploadMatch = path.match(/^\/client-portal\/matter\/([0-9a-f-]+)\/upload$/i);
    if (method === 'POST' && uploadMatch) {
      const matterId = uploadMatch[1];
      if (!isClientAllowedMatter(user.id, matterId)) {
        html(res, 403, '<h1>Forbidden</h1>');
        return true;
      }
      const matter = getMatterById(matterId);
      if (!matter) { html(res, 404, '<h1>Not found</h1>'); return true; }
      try {
        const parsed = await parseMultipart(req, { maxBytes: 50 * 1024 * 1024 });
        const file = parsed.files.find((f) => f.fieldName === 'file');
        if (!file) { redirect(res, `/client-portal/matter/${matterId}`); return true; }
        const extract = await extractText(file.data, file.filename, file.contentType);
        const stored = storeDocument({
          matterId, filename: file.filename, contentType: file.contentType,
          data: file.data, extractedText: extract.text,
          extractionNote: `client upload: ${extract.note}`,
          uploadedBy: `client:${user.email}`,
        });
        appendLegalAudit({
          matterId, actorId: `client:${user.email}`, action: 'document.upload_by_client',
          detail: `${file.filename} (${stored.sizeBytes} bytes)`,
          refTable: 'documents', refId: stored.id,
        });
      } catch (err) {
        logger.warn(`client upload failed: ${err instanceof Error ? err.message : String(err)}`);
      }
      redirect(res, `/client-portal/matter/${matterId}`);
      return true;
    }

    html(res, 404, '<h1>Not found</h1>');
    return true;
  } catch (err) {
    logger.error(`client-portal error: ${err instanceof Error ? err.message : String(err)}`);
    html(res, 500, '<h1>Sorry — something went wrong. Please contact your solicitor.</h1>');
    return true;
  }
}
