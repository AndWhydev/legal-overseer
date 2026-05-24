/**
 * Local HTTP dashboard for Legal Overseer.
 *
 * Adds setup-wizard redirection, cookie-session auth, user management,
 * per-lawyer filtered review queue, rate limiting, and a generic
 * error pipeline that never leaks internals.
 *
 * Routes:
 *   GET  /setup/*                  → first-run wizard (until complete)
 *   GET  /login, POST /login       → session creation
 *   GET  /logout                   → session destruction
 *   GET  /                         → matter list (auth required)
 *   GET  /matter/:id               → matter detail
 *   GET  /review                   → review queue (lawyer-filtered)
 *   GET  /review/:id               → review detail
 *   POST /review/:id/approve|reject→ review actions
 *   GET  /calendar                 → deadlines (30d)
 *   GET  /billing                  → billing tracker
 *   GET  /users                    → admin-only user management
 *   POST /users/create, /users/:id/(role|suspend|reactivate)
 *   GET  /api/matters.json, /api/review.json
 *
 * Binds 127.0.0.1 by default. Front with the firm's reverse proxy if
 * remote access is needed (and set FORCE_HTTPS=true so cookies use
 * the Secure flag).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createSafeLogger } from '../governance/index.js';
import {
  buildMatterSummary,
  buildMatterDetail,
  buildReviewQueueView,
  buildCalendarView,
  buildBillingTrackerView,
  getReviewWithMatter,
} from './aggregator.js';
import {
  renderMatters,
  renderMatterDetail,
  renderReviewQueue,
  renderReviewDetail,
  renderCalendar,
  renderBilling,
  render404,
} from './render.js';
import { renderUsersPage } from './users-view.js';
import { renderUploadPage } from './upload-view.js';
import { renderBriefingPrefsPage } from './briefing-prefs-view.js';
import { handleClientPortalRoute, isClientPortalRoute } from '../client-portal/index.js';
import {
  isShareLinkLive,
  grantDocumentVisibility,
  revokeDocumentVisibility,
  createShareLink,
  listMatterShareLinks,
  revokeShareLink,
  listClientUsers,
  createClientUser,
  grantClientMatter,
  isDocumentVisibleToClients,
  type ClientUser as ClientUserType,
} from '../client-portal/index.js';
import { renderClientMgmtPage } from './client-mgmt-view.js';
import { renderShareLandingPage } from '../client-portal/views.js';
import {
  handleDictationRoute,
  isDictationRoute,
} from '../dictation/index.js';
import { renderCostEstimatorPage } from './cost-estimator-view.js';
import { estimateMatterCost, getMatterCostStatus, listMonthlyMatterCosts } from '../cost-estimator/index.js';
import {
  renderPrecedentsList,
  renderPrecedentDetail,
  renderPrecedentOfferForm,
} from './precedents-view.js';
import {
  addPrecedent,
  getPrecedentById,
  searchPrecedents,
} from '../precedents/index.js';
import { getReviewById } from '../compliance/reviewGate.js';
import { renderTimelinePage } from './timeline-view.js';
import { renderTemplatesList, renderTemplateDetail } from './templates-view.js';
import {
  listTemplates,
  getTemplateBySlug,
  upsertTemplate,
  listTemplateVersions,
  type TemplateCategory,
} from '../templates/index.js';
import {
  getConflictCheckById,
  getConflictCheckForMatter,
  listPendingConflictChecks,
  resolveConflictCheck,
} from '../compliance/conflicts.js';
import {
  listRecentReminders,
  snoozeDeadline as snoozeDeadlineHelper,
  dismissDeadline as dismissDeadlineHelper,
} from '../reminders/index.js';
import {
  getBriefingPreferences,
  setBriefingPreferences,
} from '../weekly-briefing/index.js';
import {
  parseMultipart,
  extractText,
  storeDocument,
  listMatterDocuments,
  getDocument,
  readDocumentBytes,
} from '../uploads/index.js';
import {
  listMatters,
  getMatterById,
  getMatterByNumber,
  createMatter,
  nextMatterNumber,
} from '../db/repositories/matters.js';
import { buildMatterTimeline } from '../matter-timeline/index.js';
import { assertCanCreateMatter as enforceMatterCap, LicenceLimitError as TierError } from '../licence/index.js';
import { appendLegalAudit as audit } from '../compliance/audit.js';
import {
  resolveSession,
  clientIp,
  isLockedOut,
  recordLoginFailure,
  recordLoginSuccess,
  renderLoginPage,
  UnauthorizedError,
  ForbiddenError,
} from './auth.js';
import { approveReview, rejectReview } from '../compliance/reviewGate.js';
import {
  getUserByEmail,
  createUser,
  setUserStatus,
  setUserRole,
  getUserById,
  destroySession,
  createSession,
  setSessionCookieHeader,
  clearSessionCookieHeader,
  type UserRole,
  type Session,
} from '../users/index.js';
import { verifyPassword } from '../users/password.js';
import {
  assertCanAddUser,
  LicenceLimitError,
  getLicenceState,
} from '../licence/index.js';
import { isSetupComplete, handleOnboardingRoute, isSetupRoute } from '../onboarding/index.js';
import { appendLegalAudit } from '../compliance/audit.js';
import { checkRateLimit } from '../governance/index.js';

const logger = createSafeLogger('Dashboard');

function html(res: ServerResponse, status: number, body: string, extraHeaders: Record<string, string | string[]> = {}): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...extraHeaders });
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function redirect(res: ServerResponse, to: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(303, { location: to, ...headers });
  res.end();
}

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function isSecureRequest(req: IncomingMessage): boolean {
  if (process.env.FORCE_HTTPS === 'true') return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.includes('https')) return true;
  return false;
}

function requireRole(session: Session, role: UserRole): void {
  if (session.user.role !== role) {
    throw new ForbiddenError(`requires role: ${role}`);
  }
}

async function rateLimitRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const ip = clientIp(req);
  const method = req.method ?? 'GET';
  const risk = method === 'GET' ? 'low' : 'medium';
  const result = await checkRateLimit(`dash:${ip}`, risk);
  res.setHeader('x-ratelimit-remaining', String(result.remainingPoints));
  if (!result.allowed) {
    res.setHeader('retry-after', String(Math.ceil(result.msBeforeNext / 1000)));
    res.writeHead(429, { 'content-type': 'text/plain' });
    res.end('Too many requests. Please slow down.');
    return false;
  }
  return true;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';
  const path = url === '/' ? url : url.replace(/\/+$/, '').split('?')[0];

  const allowed = await rateLimitRequest(req, res);
  if (!allowed) return;

  const isSecure = isSecureRequest(req);

  // ---- client portal lives at /client-portal/* — separate auth ----
  if (isClientPortalRoute(path)) {
    await handleClientPortalRoute(req, res, path, isSecure);
    return;
  }

  // ---- shared document landing: GET /share/:token ----
  const shareLandingMatch = path.match(/^\/share\/([0-9a-f]+)$/i);
  if (shareLandingMatch) {
    const link = isShareLinkLive(shareLandingMatch[1]);
    if (!link) { html(res, 404, render404('share link expired or revoked')); return; }
    const doc = getDocument(link.matter_id, link.document_id);
    if (!doc) { html(res, 404, render404('document')); return; }
    if (method === 'GET' && /[?&]download=1/.test(url)) {
      const bytes = readDocumentBytes(doc);
      res.writeHead(200, {
        'content-type': doc.contentType || 'application/octet-stream',
        'content-disposition': `attachment; filename="${encodeURIComponent(doc.filename)}"`,
        'content-length': String(bytes.length),
      });
      res.end(bytes);
      return;
    }
    html(res, 200, renderShareLandingPage({
      filename: doc.filename,
      expiresAt: link.expires_at,
      downloadHref: `/share/${shareLandingMatch[1]}?download=1`,
    }));
    return;
  }

  // ---- dictation routes (lives within main dashboard auth) ----

  // ---- setup wizard takes priority ----
  if (!isSetupComplete()) {
    if (isSetupRoute(path)) {
      await handleOnboardingRoute(req, res, path, isSecure);
      return;
    }
    redirect(res, '/setup');
    return;
  }

  // ---- public routes (no session required) ----
  if (method === 'GET' && path === '/login') {
    html(res, 200, renderLoginPage());
    return;
  }
  if (method === 'POST' && path === '/login') {
    const ip = clientIp(req);
    if (isLockedOut(ip)) {
      html(res, 429, renderLoginPage('Too many failed attempts. Try again in a few minutes.'));
      return;
    }
    const body = await readBody(req);
    const email = (body.get('email') ?? '').trim().toLowerCase();
    const password = body.get('password') ?? '';
    const user = email ? getUserByEmail(email) : null;
    const ok = !!user && user.status === 'active'
      && verifyPassword(password, {
        hash: user.password_hash, salt: user.password_salt, iter: user.password_iter,
      });
    if (!ok || !user) {
      recordLoginFailure(ip);
      html(res, 401, renderLoginPage('Invalid email or password.', email));
      return;
    }
    recordLoginSuccess(ip);
    const session = createSession(user.id, ip, req.headers['user-agent'] ?? undefined);
    appendLegalAudit({
      matterId: null, actorId: user.email, action: 'auth.login',
      detail: `from ${ip}`, refTable: 'users', refId: user.id,
    });
    redirect(res, '/', { 'set-cookie': setSessionCookieHeader(session.id, isSecure) });
    return;
  }
  if (method === 'GET' && path === '/logout') {
    const session = resolveSession(req);
    if (session) {
      destroySession(session.id);
      appendLegalAudit({
        matterId: null, actorId: session.user.email, action: 'auth.logout',
        refTable: 'users', refId: session.user.id,
      });
    }
    redirect(res, '/login', { 'set-cookie': clearSessionCookieHeader() });
    return;
  }

  // ---- everything below requires a session ----
  const session = resolveSession(req);
  if (!session) {
    if (path.startsWith('/api/')) {
      json(res, 401, { error: 'unauthorized' });
      return;
    }
    redirect(res, '/login');
    return;
  }

  try {
    if (method === 'GET' && (path === '/' || path === '/matters')) {
      html(res, 200, renderMatters(buildMatterSummary()));
      return;
    }
    if (method === 'GET' && path === '/review') {
      html(res, 200, renderReviewQueue(buildReviewQueueView()));
      return;
    }
    if (method === 'GET' && path === '/calendar') {
      html(res, 200, renderCalendar(buildCalendarView(30)));
      return;
    }
    if (method === 'GET' && path === '/billing') {
      html(res, 200, renderBilling(buildBillingTrackerView()));
      return;
    }
    if (method === 'GET' && path === '/api/matters.json') {
      json(res, 200, buildMatterSummary());
      return;
    }
    if (method === 'GET' && path === '/api/review.json') {
      json(res, 200, buildReviewQueueView());
      return;
    }

    const matterMatch = path.match(/^\/matter\/([0-9a-f-]+)$/i);
    if (method === 'GET' && matterMatch) {
      const detail = buildMatterDetail(matterMatch[1]);
      if (!detail) { html(res, 404, render404('matter')); return; }
      html(res, 200, renderMatterDetail(detail));
      return;
    }

    // ---- matter timeline ----
    const timelineMatch = path.match(/^\/matter\/([0-9a-f-]+)\/timeline$/i);
    if (method === 'GET' && timelineMatch) {
      const matter = getMatterById(timelineMatch[1]);
      if (!matter) { html(res, 404, render404('matter')); return; }
      const events = buildMatterTimeline(matter.id);
      html(res, 200, renderTimelinePage({ matter, events, currentEmail: session.user.email, printable: /[?&]print=1/.test(url) }));
      return;
    }

    // ---- document download ----
    const docDownloadMatch = path.match(/^\/matter\/([0-9a-f-]+)\/document\/([0-9a-f-]+)$/i);
    if (method === 'GET' && docDownloadMatch) {
      const [, mId, dId] = docDownloadMatch;
      const doc = getDocument(mId, dId);
      if (!doc) { html(res, 404, render404('document')); return; }
      const bytes = readDocumentBytes(doc);
      res.writeHead(200, {
        'content-type': doc.contentType || 'application/octet-stream',
        'content-disposition': `inline; filename="${encodeURIComponent(doc.filename)}"`,
        'content-length': String(bytes.length),
      });
      res.end(bytes);
      return;
    }

    // ---- upload portal ----
    if (method === 'GET' && path === '/upload') {
      const matters = listMatters();
      const matterLookup = new Map(matters.map((m) => [m.id, m]));
      const recent = matters.flatMap((m) => listMatterDocuments(m.id)).slice(0, 25);
      html(res, 200, renderUploadPage({
        currentEmail: session.user.email,
        matters,
        recent,
        matterLookup,
      }));
      return;
    }
    if (method === 'POST' && path === '/upload') {
      try {
        const parsed = await parseMultipart(req, { maxBytes: 50 * 1024 * 1024 });
        const file = parsed.files.find((f) => f.fieldName === 'file');
        if (!file) { json(res, 400, { error: 'no file' }); return; }

        let matterId = parsed.fields.matter_id?.trim() || null;
        let matter = matterId ? getMatterById(matterId) : null;

        if (!matter) {
          try { enforceMatterCap(); }
          catch (err) {
            const msg = err instanceof TierError ? err.message : (err as Error).message;
            json(res, 402, { error: msg });
            return;
          }
          // Create a new matter from the document filename.
          const number = nextMatterNumber();
          matter = createMatter({
            matter_number: number,
            title: file.filename.slice(0, 100),
            client_name: '(pending — created from uploaded document)',
            matter_type: 'unclassified',
            jurisdiction: process.env.DEFAULT_JURISDICTION ?? 'NSW',
            responsible_lawyer_email: session.user.email,
            notes: `Created from document upload by ${session.user.email}`,
          });
          matterId = matter.id;
          audit({
            matterId: matter.id, actorId: session.user.email,
            action: 'matter.create_from_upload',
            detail: file.filename, refTable: 'matters', refId: matter.id,
          });
        }

        const extract = await extractText(file.data, file.filename, file.contentType);
        const stored = storeDocument({
          matterId: matter!.id,
          filename: file.filename,
          contentType: file.contentType,
          data: file.data,
          extractedText: extract.text,
          extractionNote: extract.note,
          uploadedBy: session.user.email,
        });
        audit({
          matterId: matter!.id, actorId: session.user.email,
          action: 'document.upload',
          detail: `${file.filename} (${stored.sizeBytes} bytes, ${stored.extractedChars} chars)`,
          refTable: 'documents', refId: stored.id,
          metadata: { kind: extract.kind, note: extract.note },
        });

        json(res, 200, {
          ok: true,
          document_id: stored.id,
          matter_id: matter!.id,
          matter_number: matter!.matter_number,
          extracted_chars: stored.extractedChars,
          extraction_note: stored.extractionNote,
        });
      } catch (err) {
        json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    const reviewActionMatch = path.match(/^\/review\/([0-9a-f-]+)\/(approve|reject)$/i);
    if (method === 'POST' && reviewActionMatch) {
      const [, id, action] = reviewActionMatch;
      const body = await readBody(req);
      const reviewer = (body.get('reviewer') ?? session.user.email).trim();
      const note = body.get('note') ?? undefined;
      if (!reviewer) {
        html(res, 400, render404('reviewer required'));
        return;
      }
      if (action === 'approve') {
        approveReview({ reviewId: id, reviewer, note });
      } else {
        rejectReview({ reviewId: id, reviewer, note });
      }
      redirect(res, `/review/${id}`);
      return;
    }
    const reviewMatch = path.match(/^\/review\/([0-9a-f-]+)$/i);
    if (method === 'GET' && reviewMatch) {
      const payload = getReviewWithMatter(reviewMatch[1]);
      if (!payload) { html(res, 404, render404('review')); return; }
      html(res, 200, renderReviewDetail(payload));
      return;
    }

    // ---- precedents ----
    if (method === 'GET' && path === '/precedents') {
      const u2 = new URL(url, 'http://x');
      const q = u2.searchParams.get('q') ?? '';
      const matterType = u2.searchParams.get('matter_type') ?? '';
      const documentType = u2.searchParams.get('document_type') ?? '';
      const results = searchPrecedents({
        query: q || undefined,
        matterType: matterType || undefined,
        documentType: documentType || undefined,
      });
      html(res, 200, renderPrecedentsList({
        currentEmail: session.user.email,
        results, query: q, matterType, documentType,
      }));
      return;
    }
    const precDetailMatch = path.match(/^\/precedents\/([0-9a-f-]+)$/i);
    if (method === 'GET' && precDetailMatch) {
      const p = getPrecedentById(precDetailMatch[1]);
      if (!p) { html(res, 404, render404('precedent')); return; }
      html(res, 200, renderPrecedentDetail({ currentEmail: session.user.email, precedent: p }));
      return;
    }
    const precOfferMatch = path.match(/^\/precedents\/from-review\/([0-9a-f-]+)$/i);
    if (method === 'GET' && precOfferMatch) {
      const review = getReviewById(precOfferMatch[1]);
      if (!review) { html(res, 404, render404('review')); return; }
      if (review.status !== 'approved') {
        html(res, 400, render404('only approved reviews can become precedents'));
        return;
      }
      html(res, 200, renderPrecedentOfferForm({
        currentEmail: session.user.email,
        reviewId: review.id,
        defaultTitle: review.title,
        defaultCategory: review.output_kind === 'drafted_document' ? 'letter' : 'other',
        defaultMatterType: null,
        defaultDocumentType: review.output_kind,
        bodyMarkdown: review.body_markdown,
      }));
      return;
    }
    if (method === 'POST' && precOfferMatch) {
      const review = getReviewById(precOfferMatch[1]);
      if (!review || review.status !== 'approved') { html(res, 400, render404('approval required first')); return; }
      const body = await readBody(req);
      const title = (body.get('title') ?? review.title).trim();
      const category = (body.get('category') ?? 'other').trim();
      const matter_type = (body.get('matter_type') ?? '').trim() || null;
      const document_type = (body.get('document_type') ?? '').trim() || null;
      const tags = (body.get('tags') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const p = addPrecedent({
        title, category, matter_type, document_type,
        body_markdown: review.body_markdown,
        source_review_id: review.id,
        source_matter_id: review.matter_id,
        added_by: session.user.email,
        tags,
      });
      appendLegalAudit({
        matterId: review.matter_id, actorId: session.user.email,
        action: 'precedent.add',
        detail: `from review ${review.id}: ${title}`,
        refTable: 'precedents', refId: p.id,
      });
      redirect(res, `/precedents/${p.id}`);
      return;
    }

    // ---- LEAP + Clio: sync triggers ----
    if (method === 'POST' && path === '/integrations/leap/sync') {
      const { syncLeap } = await import('../integrations/leap/index.js');
      const result = await syncLeap({ triggeredBy: session.user.email });
      json(res, 200, result);
      return;
    }
    if (method === 'POST' && path === '/integrations/clio/sync') {
      const { syncClio } = await import('../integrations/clio/index.js');
      const result = await syncClio({ triggeredBy: session.user.email });
      json(res, 200, result);
      return;
    }
    if (method === 'GET' && path === '/integrations') {
      const { renderIntegrationsPage } = await import('./integrations-view.js');
      const { isLeapConfigured } = await import('../integrations/leap/index.js');
      const { isClioConfigured } = await import('../integrations/clio/index.js');
      html(res, 200, renderIntegrationsPage({
        currentEmail: session.user.email,
        leapConfigured: isLeapConfigured(),
        clioConfigured: isClioConfigured(),
      }));
      return;
    }

    // ---- dictation portal ----
    if (isDictationRoute(path)) {
      const handled = await handleDictationRoute(req, res, path, session);
      if (handled) return;
    }

    // ---- cost estimator UI ----
    if (method === 'GET' && path === '/cost-estimator') {
      const url2 = new URL(url, 'http://x');
      const matterType = url2.searchParams.get('matter_type') ?? 'commercial';
      const complexity = (url2.searchParams.get('complexity') ?? 'medium') as 'simple' | 'medium' | 'complex';
      const estimate = estimateMatterCost(matterType, complexity);
      const monthly = listMonthlyMatterCosts(new Date().toISOString().slice(0, 7));
      html(res, 200, renderCostEstimatorPage({
        currentEmail: session.user.email,
        matterType, complexity, estimate, monthly,
      }));
      return;
    }
    const matterCostMatch = path.match(/^\/matter\/([0-9a-f-]+)\/cost-status\.json$/i);
    if (method === 'GET' && matterCostMatch) {
      const status = getMatterCostStatus(matterCostMatch[1]);
      json(res, 200, status);
      return;
    }

    // ---- client management (admin / lawyer) ----
    if (method === 'GET' && path === '/clients') {
      const clients = listClientUsers();
      const matters = listMatters();
      html(res, 200, renderClientMgmtPage({
        currentEmail: session.user.email, clients, matters,
      }));
      return;
    }
    if (method === 'POST' && path === '/clients/create') {
      const body = await readBody(req);
      const full_name = (body.get('full_name') ?? '').trim();
      const email = (body.get('email') ?? '').trim().toLowerCase();
      const password = body.get('password') ?? '';
      let flash: { kind: 'ok' | 'error'; msg: string };
      try {
        if (!full_name || !email) throw new Error('Name and email required.');
        if (password.length < 12) throw new Error('Password must be ≥12 characters.');
        const u = createClientUser({ full_name, email, password });
        appendLegalAudit({
          matterId: null, actorId: session.user.email, action: 'client_user.create',
          detail: email, refTable: 'client_users', refId: u.id,
        });
        flash = { kind: 'ok', msg: `Added ${email}.` };
      } catch (err) {
        flash = { kind: 'error', msg: err instanceof Error ? err.message : 'Could not add client.' };
      }
      const clients = listClientUsers();
      const matters = listMatters();
      html(res, 200, renderClientMgmtPage({
        currentEmail: session.user.email, clients, matters, flash,
      }));
      return;
    }
    const clientGrantMatch = path.match(/^\/clients\/([0-9a-f-]+)\/grant-matter$/i);
    if (method === 'POST' && clientGrantMatch) {
      const clientId = clientGrantMatch[1];
      const body = await readBody(req);
      const matterId = (body.get('matter_id') ?? '').trim();
      if (matterId) {
        grantClientMatter(clientId, matterId, session.user.email);
        appendLegalAudit({
          matterId, actorId: session.user.email, action: 'client_user.grant_matter',
          detail: `client ${clientId} → matter ${matterId}`,
          refTable: 'client_user_matters', refId: clientId,
        });
      }
      redirect(res, '/clients');
      return;
    }

    // ---- document visibility + share links ----
    const docVisMatch = path.match(/^\/matter\/([0-9a-f-]+)\/document\/([0-9a-f-]+)\/(share|unshare|sharelink)$/i);
    if (method === 'POST' && docVisMatch) {
      const [, mId, dId, action] = docVisMatch;
      if (action === 'share') {
        grantDocumentVisibility({ documentId: dId, matterId: mId, grantedBy: session.user.email });
        appendLegalAudit({ matterId: mId, actorId: session.user.email, action: 'document.share_with_clients', refTable: 'documents', refId: dId });
      } else if (action === 'unshare') {
        revokeDocumentVisibility(dId);
        appendLegalAudit({ matterId: mId, actorId: session.user.email, action: 'document.unshare_from_clients', refTable: 'documents', refId: dId });
      } else if (action === 'sharelink') {
        const link = createShareLink({ documentId: dId, matterId: mId, createdBy: session.user.email });
        appendLegalAudit({ matterId: mId, actorId: session.user.email, action: 'document.share_link_created', detail: link.token, refTable: 'share_links', refId: link.token });
        json(res, 200, { ok: true, url: `/share/${link.token}`, expires_at: link.expires_at });
        return;
      }
      redirect(res, `/matter/${mId}`);
      return;
    }
    const shareRevokeMatch = path.match(/^\/share-link\/([0-9a-f]+)\/revoke$/i);
    if (method === 'POST' && shareRevokeMatch) {
      revokeShareLink(shareRevokeMatch[1]);
      appendLegalAudit({ matterId: null, actorId: session.user.email, action: 'share_link.revoked', detail: shareRevokeMatch[1], refTable: 'share_links', refId: shareRevokeMatch[1] });
      redirect(res, req.headers.referer?.toString() ?? '/');
      return;
    }

    // ---- templates ----
    if (method === 'GET' && path === '/templates') {
      const templates = listTemplates();
      html(res, 200, renderTemplatesList({ templates, currentEmail: session.user.email }));
      return;
    }
    if (method === 'POST' && path === '/templates/create') {
      const body = await readBody(req);
      let flash: { kind: 'ok' | 'error'; msg: string };
      try {
        const slug = (body.get('slug') ?? '').trim();
        const title = (body.get('title') ?? '').trim();
        const category = (body.get('category') ?? 'other') as TemplateCategory;
        const bodyMd = body.get('body_markdown') ?? '';
        if (!slug || !title || !bodyMd) throw new Error('slug, title, and body are required');
        upsertTemplate({
          slug, title, category,
          description: body.get('description') ?? '',
          body_markdown: bodyMd,
          source: 'firm',
          author_email: session.user.email,
          change_note: 'initial firm version',
        });
        flash = { kind: 'ok', msg: `Template "${title}" added.` };
      } catch (err) {
        flash = { kind: 'error', msg: err instanceof Error ? err.message : 'Could not add template.' };
      }
      const templates = listTemplates();
      html(res, 200, renderTemplatesList({ templates, currentEmail: session.user.email, flash }));
      return;
    }
    const tplSlugMatch = path.match(/^\/templates\/([a-z0-9-]+)$/i);
    if (method === 'GET' && tplSlugMatch) {
      const tpl = getTemplateBySlug(tplSlugMatch[1]);
      if (!tpl) { html(res, 404, render404('template')); return; }
      const versions = listTemplateVersions(tpl.id);
      html(res, 200, renderTemplateDetail({ template: tpl, versions, currentEmail: session.user.email }));
      return;
    }
    const tplUpdateMatch = path.match(/^\/templates\/([a-z0-9-]+)\/update$/i);
    if (method === 'POST' && tplUpdateMatch) {
      const tpl = getTemplateBySlug(tplUpdateMatch[1]);
      if (!tpl) { html(res, 404, render404('template')); return; }
      const body = await readBody(req);
      let flash: { kind: 'ok' | 'error'; msg: string };
      try {
        upsertTemplate({
          slug: tpl.slug,
          title: (body.get('title') ?? tpl.title).trim(),
          category: tpl.category,
          description: body.get('description') ?? tpl.description ?? '',
          body_markdown: body.get('body_markdown') ?? tpl.body_markdown,
          source: tpl.source,
          author_email: session.user.email,
          change_note: body.get('change_note') ?? 'updated via dashboard',
        });
        flash = { kind: 'ok', msg: 'New version saved.' };
      } catch (err) {
        flash = { kind: 'error', msg: err instanceof Error ? err.message : 'Could not save.' };
      }
      const fresh = getTemplateBySlug(tpl.slug);
      const versions = fresh ? listTemplateVersions(fresh.id) : [];
      html(res, 200, renderTemplateDetail({ template: fresh ?? tpl, versions, currentEmail: session.user.email, flash }));
      return;
    }

    // ---- conflict check resolution ----
    const conflictResolveMatch = path.match(/^\/conflict\/([0-9a-f-]+)\/(clear|block|override)$/i);
    if (method === 'POST' && conflictResolveMatch) {
      const [, conflictId, action] = conflictResolveMatch;
      const body = await readBody(req);
      const note = body.get('note') ?? undefined;
      const decision = action === 'clear' ? 'cleared' : action === 'block' ? 'blocked' : 'override';
      try {
        const c = resolveConflictCheck({ conflictId, by: session.user.email, decision, note });
        redirect(res, `/matter/${c.matter_id}`);
      } catch (err) {
        html(res, 400, render404(err instanceof Error ? err.message : 'conflict not found'));
      }
      return;
    }

    // ---- weekly briefing preferences ----
    if (method === 'GET' && path === '/me/briefing') {
      const prefs = getBriefingPreferences(session.user.id);
      html(res, 200, renderBriefingPrefsPage(prefs, session.user.email));
      return;
    }
    if (method === 'POST' && path === '/me/briefing') {
      const body = await readBody(req);
      setBriefingPreferences({
        user_id: session.user.id,
        weekly_enabled: body.get('weekly_enabled') === 'on',
        section_matters: body.get('section_matters') === 'on',
        section_deadlines: body.get('section_deadlines') === 'on',
        section_overdue: body.get('section_overdue') === 'on',
        section_regulatory: body.get('section_regulatory') === 'on',
        section_precedents: body.get('section_precedents') === 'on',
        practice_areas: (body.get('practice_areas') ?? '')
          .split(',').map((s) => s.trim()).filter(Boolean),
      });
      redirect(res, '/me/briefing');
      return;
    }

    // ---- deadline snooze / dismiss ----
    const snoozeMatch = path.match(/^\/deadline\/([0-9a-f-]+)\/snooze$/i);
    if (method === 'POST' && snoozeMatch) {
      const body = await readBody(req);
      const days = Math.max(1, Math.min(30, Number.parseInt(body.get('days') ?? '7', 10) || 7));
      const until = new Date(Date.now() + days * 86400000).toISOString();
      snoozeDeadlineHelper(snoozeMatch[1], until, session.user.email);
      redirect(res, '/calendar');
      return;
    }
    const dismissMatch = path.match(/^\/deadline\/([0-9a-f-]+)\/dismiss$/i);
    if (method === 'POST' && dismissMatch) {
      dismissDeadlineHelper(dismissMatch[1], session.user.email);
      redirect(res, '/calendar');
      return;
    }

    // ---- users (admin only) ----
    if (method === 'GET' && path === '/users') {
      requireRole(session, 'admin');
      html(res, 200, renderUsersPage({ currentEmail: session.user.email }));
      return;
    }
    if (method === 'POST' && path === '/users/create') {
      requireRole(session, 'admin');
      const body = await readBody(req);
      const full_name = (body.get('full_name') ?? '').trim();
      const email = (body.get('email') ?? '').trim().toLowerCase();
      const password = body.get('password') ?? '';
      const role = (body.get('role') ?? 'lawyer') as UserRole;

      let flash: { kind: 'ok' | 'error'; msg: string };
      try {
        if (!email || !full_name) throw new Error('Name and email are required.');
        if (password.length < 12) throw new Error('Password must be at least 12 characters.');
        if (!['admin', 'lawyer', 'paralegal'].includes(role)) throw new Error('Invalid role.');
        if (getUserByEmail(email)) throw new Error('A user with that email already exists.');
        assertCanAddUser();
        const user = createUser({ email, full_name, role, password });
        appendLegalAudit({
          matterId: null, actorId: session.user.email, action: 'user.create',
          detail: `${email} as ${role}`, refTable: 'users', refId: user.id,
        });
        flash = { kind: 'ok', msg: `Added ${email}.` };
      } catch (err) {
        const msg = err instanceof LicenceLimitError
          ? err.message
          : err instanceof Error ? err.message : 'Could not add user.';
        flash = { kind: 'error', msg };
      }
      html(res, 200, renderUsersPage({ flash, currentEmail: session.user.email }));
      return;
    }
    const userRoleMatch = path.match(/^\/users\/([0-9a-f-]+)\/role$/i);
    if (method === 'POST' && userRoleMatch) {
      requireRole(session, 'admin');
      const body = await readBody(req);
      const role = (body.get('role') ?? '') as UserRole;
      const user = getUserById(userRoleMatch[1]);
      let flash: { kind: 'ok' | 'error'; msg: string };
      try {
        if (!user) throw new Error('User not found.');
        if (!['admin', 'lawyer', 'paralegal'].includes(role)) throw new Error('Invalid role.');
        setUserRole(user.id, role);
        appendLegalAudit({
          matterId: null, actorId: session.user.email, action: 'user.update_role',
          detail: `${user.email} → ${role}`, refTable: 'users', refId: user.id,
        });
        flash = { kind: 'ok', msg: `Role updated for ${user.email}.` };
      } catch (err) {
        flash = { kind: 'error', msg: err instanceof Error ? err.message : 'Could not update role.' };
      }
      html(res, 200, renderUsersPage({ flash, currentEmail: session.user.email }));
      return;
    }
    const userSuspendMatch = path.match(/^\/users\/([0-9a-f-]+)\/(suspend|reactivate)$/i);
    if (method === 'POST' && userSuspendMatch) {
      requireRole(session, 'admin');
      const [, id, action] = userSuspendMatch;
      const user = getUserById(id);
      let flash: { kind: 'ok' | 'error'; msg: string };
      try {
        if (!user) throw new Error('User not found.');
        if (action === 'reactivate') {
          assertCanAddUser();
        }
        setUserStatus(id, action === 'suspend' ? 'suspended' : 'active');
        appendLegalAudit({
          matterId: null, actorId: session.user.email,
          action: `user.${action}`, detail: user.email, refTable: 'users', refId: id,
        });
        flash = { kind: 'ok', msg: `${user.email} ${action}d.` };
      } catch (err) {
        const msg = err instanceof LicenceLimitError ? err.message
          : err instanceof Error ? err.message : `Could not ${action} user.`;
        flash = { kind: 'error', msg };
      }
      html(res, 200, renderUsersPage({ flash, currentEmail: session.user.email }));
      return;
    }

    html(res, 404, render404('page'));
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(res, '/login');
      return;
    }
    if (err instanceof ForbiddenError) {
      html(res, 403, render404('forbidden'));
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`request ${path} failed: ${msg}`);
    html(res, 500, render404('internal error'));
  }
}

export interface DashboardServer {
  port: number;
  url: string;
  stop(): Promise<void>;
}

export async function startDashboard(port?: number): Promise<DashboardServer> {
  const listenPort = port ?? Number.parseInt(process.env.DASHBOARD_PORT ?? '3000', 10);
  const bindHost = process.env.DASHBOARD_BIND ?? '127.0.0.1';
  const server = createServer((req, res) => {
    const start = Date.now();
    handle(req, res)
      .catch((err) => {
        logger.error(`handler crash: ${err instanceof Error ? err.message : String(err)}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'text/plain' });
          res.end('internal error');
        }
      })
      .finally(() => {
        const ms = Date.now() - start;
        logger.info(`${req.method} ${req.url} → ${res.statusCode} ${ms}ms`);
      });
  });

  // Keep-alive timeouts so memory does not climb with idle clients.
  server.keepAliveTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.requestTimeout = 60_000;
  server.maxHeadersCount = 100;

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, bindHost, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : listenPort;
  const url = `http://${bindHost}:${actualPort}`;
  logger.info(`dashboard listening on ${url}`);

  const licStatus = getLicenceState();
  if (!licStatus.valid) {
    logger.warn(`dashboard started with invalid licence: ${licStatus.message}`);
  }

  return {
    port: actualPort,
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
