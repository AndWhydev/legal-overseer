/**
 * Minimal HTTP dashboard for the overseer.
 *
 * Routes:
 *   GET /                  → fleet overview
 *   GET /project/:id       → per-project deep view
 *   GET /task/:id          → task detail (input/output JSON)
 *   GET /api/fleet.json    → JSON fleet summary (for tooling)
 *
 * No external deps beyond what's already in the repo. Runs on
 * DASHBOARD_PORT (default 3000) and binds to 127.0.0.1 — local only.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createSafeLogger } from '../governance/index.js';
import {
  buildFleetSummary,
  buildProjectDetail,
  getTaskWithParsed,
} from './aggregator.js';
import {
  renderFleet,
  renderProject,
  renderTask,
  render404,
} from './render.js';

const logger = createSafeLogger('Dashboard');

function html(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body, null, 2));
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  // Strip trailing slash (except for root) for consistent matching.
  const path = url === '/' ? url : url.replace(/\/+$/, '').split('?')[0];

  try {
    if (path === '/' || path === '/fleet') {
      html(res, 200, renderFleet(buildFleetSummary()));
      return;
    }
    if (path === '/api/fleet.json') {
      json(res, 200, buildFleetSummary());
      return;
    }
    const projectMatch = path.match(/^\/project\/([0-9a-f-]+)$/i);
    if (projectMatch) {
      const detail = buildProjectDetail(projectMatch[1]);
      if (!detail) { html(res, 404, render404('project')); return; }
      html(res, 200, renderProject(detail));
      return;
    }
    const taskMatch = path.match(/^\/task\/([0-9a-f-]+)$/i);
    if (taskMatch) {
      const info = getTaskWithParsed(taskMatch[1]);
      if (!info || !info.task) { html(res, 404, render404('task')); return; }
      html(res, 200, renderTask({ task: info.task, inputObj: info.inputObj, outputObj: info.outputObj }));
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

/**
 * Start the dashboard HTTP server. Binds to 127.0.0.1 only.
 *
 * @param port - port to listen on (default $DASHBOARD_PORT or 3000)
 * @returns handle with stop()
 */
export async function startDashboard(port?: number): Promise<DashboardServer> {
  const listenPort = port ?? Number.parseInt(process.env.DASHBOARD_PORT ?? '3000', 10);
  const server = createServer(handle);

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
