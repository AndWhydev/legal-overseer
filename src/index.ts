/**
 * Legal Overseer — main entry.
 *
 * HTTP server exposing /health, optional task processor, inbox
 * monitor, dashboard, and briefing scheduler. Designed for on-prem
 * deployment on a law firm server.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { healthCheck } from './api/health.js';
import { initializeDatabase, closeDatabase } from './db/index.js';
import { startTaskLoop, stopTaskLoop } from './agent/index.js';
import { isEmailConfigured } from './email/notifier.js';
import { initInboxMonitor, stopInboxMonitor } from './inbox-monitor/index.js';
import { initBriefingScheduler } from './briefing/index.js';
import { startDashboard, type DashboardServer } from './dashboard/index.js';
import { startOverseerLoop, stopOverseerLoop } from './agent/overseer-loop.js';
import { createSafeLogger } from './governance/index.js';

const logger = createSafeLogger('Main');

const VERSION = '0.1.0';
const PORT = parseInt(process.env.PORT || '8080', 10);

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/';
  const method = req.method || 'GET';
  logger.info(`${method} ${url}`);

  if (method === 'GET' && url === '/health') {
    healthCheck(req, res);
    return;
  }

  if (method === 'GET' && url === '/') {
    const response = {
      name: 'Legal Overseer',
      version: VERSION,
      description: 'AI legal operations system for Australian law firms',
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', path: url }));
}

function printBanner(): void {
  logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   Legal Overseer                                          ║
║   AI legal operations for Australian law firms            ║
║   Version: ${VERSION.padEnd(46)}║
║                                                           ║
║   Every AI output requires lawyer review before send.     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

export async function main(): Promise<void> {
  printBanner();
  logger.info(`Legal Overseer v${VERSION} starting...`);

  try {
    initializeDatabase();
    logger.info('Database initialized');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Database initialization failed: ${errorMessage}`);
    process.exit(1);
  }

  if (isEmailConfigured()) {
    logger.info('Email notifier: SMTP configured');
  } else {
    logger.warn(
      'Email notifier: SMTP not configured (set ADMIN_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS to enable)',
    );
  }

  // Inbox monitor — polls LEGAL/CLIENT/COURT/INTERNAL inboxes.
  initInboxMonitor();

  // Daily briefing scheduler.
  initBriefingScheduler();
  logger.info('Briefing scheduler initialized');

  // Local dashboard (matter list, review queue, calendar, billing).
  let dashboard: DashboardServer | null = null;
  if (process.env.ENABLE_DASHBOARD !== 'false') {
    try {
      dashboard = await startDashboard();
    } catch (err) {
      logger.error(`Dashboard failed to start: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // HTTP health server.
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      logger.error('Request handler error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    });
  });

  // Optional task processor + overseer loop.
  const enableTaskProcessor = process.env.ENABLE_TASK_PROCESSOR === 'true';

  if (enableTaskProcessor) {
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.error(
        'ANTHROPIC_API_KEY required for task processor. ' +
          'Set ENABLE_TASK_PROCESSOR=false to run without task processing.',
      );
      process.exit(1);
    }
    const pollInterval = parseInt(process.env.TASK_POLL_INTERVAL || '5000', 10);
    startTaskLoop(pollInterval);
    logger.info(`Task processor enabled (polling every ${pollInterval}ms)`);

    const overseerInterval = parseInt(process.env.OVERSEER_INTERVAL_MS || '600000', 10);
    startOverseerLoop(overseerInterval);
  } else {
    logger.info('Task processor disabled (set ENABLE_TASK_PROCESSOR=true to enable)');
  }

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    if (enableTaskProcessor) {
      stopTaskLoop();
      stopOverseerLoop();
    }
    stopInboxMonitor();
    if (dashboard) dashboard.stop().catch(() => undefined);
    server.close(() => {
      closeDatabase();
      logger.info('Server closed.');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout.');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info('Legal Overseer ready.');
  });
}

main().catch((error: Error) => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
