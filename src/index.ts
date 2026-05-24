/**
 * Legal Overseer — main entry.
 *
 * HTTP server exposing /health, optional task processor, inbox
 * monitor, dashboard, briefing scheduler, licence checking, and the
 * update-channel poller. Designed for on-prem deployment on a law
 * firm server.
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
import { createSafeLogger, checkRateLimit } from './governance/index.js';
import { getLicenceState, startLicenceRecheck, stopLicenceRecheck, TIER_LIMITS } from './licence/index.js';
import { startUpdateChecks, stopUpdateChecks, getCurrentVersion, getUpdateState } from './updater/index.js';
import { purgeExpiredSessions } from './users/session.js';
import { isSetupComplete } from './onboarding/index.js';
import { initReminderScheduler, stopReminderScheduler } from './reminders/index.js';
import { initWeeklyBriefingScheduler, stopWeeklyBriefingScheduler } from './weekly-briefing/index.js';
import { ensureBuiltInTemplatesLoaded } from './templates/index.js';

const logger = createSafeLogger('Main');

const VERSION = getCurrentVersion();
const PORT = parseInt(process.env.PORT || '8080', 10);
const BIND = process.env.HTTP_BIND ?? '0.0.0.0';

let isShuttingDown = false;

function clientIpFromReq(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

async function applyRateLimit(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const ip = clientIpFromReq(req);
  // GET requests cheap; everything else costs more.
  const risk = (req.method ?? 'GET') === 'GET' ? 'low' : 'medium';
  const result = await checkRateLimit(`http:${ip}`, risk);
  res.setHeader('x-ratelimit-remaining', String(result.remainingPoints));
  if (!result.allowed) {
    res.setHeader('retry-after', String(Math.ceil(result.msBeforeNext / 1000)));
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'rate_limited' }));
    return false;
  }
  return true;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (isShuttingDown) {
    res.writeHead(503, { 'content-type': 'application/json', connection: 'close' });
    res.end(JSON.stringify({ error: 'shutting_down' }));
    return;
  }

  const url = req.url || '/';
  const method = req.method || 'GET';
  logger.info(`${method} ${url}`);

  const allowed = await applyRateLimit(req, res);
  if (!allowed) return;

  if (method === 'GET' && url === '/health') {
    healthCheck(req, res);
    return;
  }

  if (method === 'GET' && url === '/version') {
    const lic = getLicenceState();
    const upd = getUpdateState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'Legal Overseer',
      version: VERSION,
      licence: {
        valid: lic.valid,
        tier: lic.payload?.tier ?? null,
        tier_label: lic.payload ? TIER_LIMITS[lic.payload.tier].label : null,
        firm_name: lic.payload?.firm_name ?? null,
        expires_at: lic.payload?.expires_at ?? null,
        days_until_expiry: lic.daysUntilExpiry,
      },
      update: {
        latest: upd.latest,
        update_available: upd.updateAvailable,
        unsupported: upd.unsupported,
        last_checked_at: upd.lastCheckedAt,
        notice: upd.notice,
      },
      setup_complete: isSetupComplete(),
    }, null, 2));
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
  res.end(JSON.stringify({ error: 'Not Found' }));
}

function printBanner(licenceMsg: string): void {
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
  logger.info(`Licence: ${licenceMsg}`);
}

export async function main(): Promise<void> {
  try {
    initializeDatabase();
    logger.info('Database initialized');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Database initialization failed: ${errorMessage}`);
    process.exit(1);
  }

  // Licence check FIRST — its result drives the banner and the
  // dashboard banner state.
  const licence = getLicenceState();
  startLicenceRecheck();
  printBanner(licence.message);

  if (!isSetupComplete()) {
    logger.warn('First-run setup is incomplete. Open the dashboard at /setup to finish.');
  }

  // Update channel.
  if (process.env.UPDATE_CHECK_DISABLED !== 'true') {
    startUpdateChecks();
    logger.info('Update channel polling enabled');
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

  // Deadline reminder dispatcher (30/14/7/1 day + overdue).
  initReminderScheduler();

  // Weekly per-lawyer intelligence briefing.
  initWeeklyBriefingScheduler();

  // Built-in templates — load on first boot, idempotent.
  try { ensureBuiltInTemplatesLoaded(); }
  catch (err) { logger.warn(`builtin templates: ${err instanceof Error ? err.message : String(err)}`); }

  // Local dashboard (matter list, review queue, calendar, billing, users).
  let dashboard: DashboardServer | null = null;
  if (process.env.ENABLE_DASHBOARD !== 'false') {
    try {
      dashboard = await startDashboard();
    } catch (err) {
      logger.error(`Dashboard failed to start: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Session GC — drop expired rows once an hour.
  const sessionGc = setInterval(() => {
    try { purgeExpiredSessions(); } catch (err) {
      logger.warn(`session purge failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, 60 * 60 * 1000);
  if (sessionGc.unref) sessionGc.unref();

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

  // Sensible socket timeouts so idle connections don't pile up.
  server.keepAliveTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.requestTimeout = 60_000;
  server.maxHeadersCount = 100;

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
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Tell load balancers / health probes we're going away.
    server.close(() => {
      logger.info('HTTP server closed.');
    });

    if (enableTaskProcessor) {
      try { stopTaskLoop(); } catch { /* ignore */ }
      try { stopOverseerLoop(); } catch { /* ignore */ }
    }
    try { stopInboxMonitor(); } catch { /* ignore */ }
    try { stopUpdateChecks(); } catch { /* ignore */ }
    try { stopLicenceRecheck(); } catch { /* ignore */ }
    try { stopReminderScheduler(); } catch { /* ignore */ }
    try { stopWeeklyBriefingScheduler(); } catch { /* ignore */ }
    try { clearInterval(sessionGc); } catch { /* ignore */ }
    if (dashboard) {
      dashboard.stop().catch(() => undefined);
    }

    // Give in-flight requests up to 25s before we force-exit.
    setTimeout(() => {
      try { closeDatabase(); } catch { /* ignore */ }
      logger.info('Shutdown complete.');
      process.exit(0);
    }, 1500).unref();

    setTimeout(() => {
      logger.error('Forcing shutdown after timeout.');
      try { closeDatabase(); } catch { /* ignore */ }
      process.exit(1);
    }, 25000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${err.message}`);
    logger.error(err.stack ?? '');
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    logger.error(`unhandledRejection: ${msg}`);
  });

  server.listen(PORT, BIND, () => {
    logger.info(`Server listening on http://${BIND}:${PORT}`);
    logger.info(`Health check: http://${BIND}:${PORT}/health`);
    logger.info('Legal Overseer ready.');
  });
}

main().catch((error: Error) => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
