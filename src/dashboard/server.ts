/**
 * Minimal HTTP dashboard for Legal Overseer.
 *
 * Routes:
 *   GET  /                         → matter list
 *   GET  /matter/:id               → per-matter deep view
 *   GET  /review                   → review queue (pending + recents)
 *   GET  /review/:id               → per-review detail (approve/reject)
 *   POST /review/:id/approve       → approve a pending review
 *   POST /review/:id/reject        → reject a pending review
 *   GET  /calendar                 → deadline calendar (30d window)
 *   GET  /billing                  → billing tracker
 *   GET  /api/matters.json         → JSON matter summary (for tooling)
 *   GET  /api/review.json          → JSON review queue (for tooling)
 *
 * Runs on DASHBOARD_PORT (default 3000) bound to 127.0.0.1 only.
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
import { approveReview, rejectReview } from '../compliance/reviewGate.js';

const logger = createSafeLogger('Dashboard');

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function redirect(res: ServerResponse, to: string): void {
  res.writeHead(303, { location: to });
  res.end();
}

async function readBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';
  const path = url === '/' ? url : url.replace(/\/+$/, '').split('?')[0];

  try {
    // ----- GET pages -----
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

    // ----- JSON APIs -----
    if (method === 'GET' && path === '/api/matters.json') {
      json(res, 200, buildMatterSummary());
      return;
    }
    if (method === 'GET' && path === '/api/review.json') {
      json(res, 200, buildReviewQueueView());
      return;
    }

    // ----- matter detail -----
    const matterMatch = path.match(/^\/matter\/([0-9a-f-]+)$/i);
    if (method === 'GET' && matterMatch) {
      const detail = buildMatterDetail(matterMatch[1]);
      if (!detail) { html(res, 404, render404('matter')); return; }
      html(res, 200, renderMatterDetail(detail));
      return;
    }

    // ----- review detail + actions -----
    const reviewActionMatch = path.match(/^\/review\/([0-9a-f-]+)\/(approve|reject)$/i);
    if (method === 'POST' && reviewActionMatch) {
      const [, id, action] = reviewActionMatch;
      const body = await readBody(req);
      const reviewer = body.get('reviewer') ?? '';
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

    html(res, 404, render404('page'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`request ${path} failed: ${msg}`);
    html(res, 500, `<pre>${msg}</pre>`);
  }
}

export interface DashboardServer {
  port: number;
  url: string;
  stop(): Promise<void>;
}

export async function startDashboard(port?: number): Promise<DashboardServer> {
  const listenPort = port ?? Number.parseInt(process.env.DASHBOARD_PORT ?? '3000', 10);
  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      logger.error(`handler crash: ${err instanceof Error ? err.message : String(err)}`);
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('internal error');
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : listenPort;
  const url = `http://127.0.0.1:${actualPort}`;
  logger.info(`dashboard listening on ${url}`);

  return {
    port: actualPort,
    url,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
