/**
 * BitBit - Enterprise-grade agentic AI system for CheekyGlo
 *
 * Entry point for the BitBit agent system.
 * Provides HTTP server with health check endpoint for Fly.io.
 * Optionally runs the task processor when ENABLE_TASK_PROCESSOR=true.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { healthCheck } from './api/health.js';
import { initializeDatabase, closeDatabase } from './db/index.js';
import { startTaskLoop, stopTaskLoop } from './agent/index.js';
import { isEmailConfigured } from './email/notifier.js';
import { logClickUpStatus, handleClickUpWebhook } from './integrations/clickup/index.js';
import { initRDScout } from './skills/rd-scout/index.js';
import { initSEOBacklinks } from './skills/seo-backlinks/index.js';
import { initInboxMonitor, stopInboxMonitor } from './inbox-monitor/index.js';
import { initBriefingScheduler } from './briefing/index.js';
import { createSafeLogger } from './governance/index.js';

const logger = createSafeLogger('Main');

const VERSION = '0.1.0';
const PORT = parseInt(process.env.PORT || '8080', 10);

/**
 * Simple router for HTTP requests
 */
async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = req.url || '/';
  const method = req.method || 'GET';

  logger.info(`${method} ${url}`);

  // Route: POST /clickup/webhook (ClickUp webhook)
  if (await handleClickUpWebhook(req, res)) {
    return;
  }

  // Route: GET /health
  if (method === 'GET' && url === '/health') {
    healthCheck(req, res);
    return;
  }

  // Route: GET /
  if (method === 'GET' && url === '/') {
    const response = {
      name: 'BitBit',
      version: VERSION,
      description: 'Enterprise Agentic AI System',
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));
    return;
  }

  // 404 for all other routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', path: url }));
}

/**
 * Print ASCII banner
 */
function printBanner(): void {
  logger.info(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██████╗ ██╗████████╗██████╗ ██╗████████╗                ║
║   ██╔══██╗██║╚══██╔══╝██╔══██╗██║╚══██╔══╝                ║
║   ██████╔╝██║   ██║   ██████╔╝██║   ██║                   ║
║   ██╔══██╗██║   ██║   ██╔══██╗██║   ██║                   ║
║   ██████╔╝██║   ██║   ██████╔╝██║   ██║                   ║
║   ╚═════╝ ╚═╝   ╚═╝   ╚═════╝ ╚═╝   ╚═╝                   ║
║                                                           ║
║   Enterprise Agentic AI System                            ║
║   Version: ${VERSION.padEnd(46)}║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

/**
 * Main entry point for BitBit agent system.
 * Starts HTTP server and optionally starts task processor.
 * Handles graceful shutdown for both HTTP and task processor.
 */
export async function main(): Promise<void> {
  printBanner();

  logger.info(`BitBit v${VERSION} starting...`);

  // Initialize database
  try {
    initializeDatabase();
    logger.info('Database initialized');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Database initialization failed: ${errorMessage}`);
    process.exit(1);
  }

  // Report email notification status
  if (isEmailConfigured()) {
    logger.info('Email notifier: SMTP configured');
  } else {
    logger.warn(
      'Email notifier: SMTP not configured (set ADMIN_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS to enable)',
    );
  }

  // Log ClickUp integration status
  logClickUpStatus();

  // Initialize R&D Scout skill (if enabled)
  initRDScout();

  // Initialize SEO Backlinks skill (if enabled)
  initSEOBacklinks();

  // Initialize inbox monitor (if enabled) — polls 5 dedicated IMAP
  // inboxes and routes each to its downstream pipeline.
  initInboxMonitor();

  // Initialize Briefing scheduler (if enabled)
  initBriefingScheduler();
  logger.info('Briefing scheduler initialized');

  // Create HTTP server (wrap async handler to catch errors)
  const server = createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      logger.error('Request handler error:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    });
  });

  // Optionally start task processor
  const enableTaskProcessor = process.env.ENABLE_TASK_PROCESSOR === 'true';

  if (enableTaskProcessor) {
    // Check for required API key
    if (!process.env.ANTHROPIC_API_KEY) {
      logger.error(
        'ANTHROPIC_API_KEY required for task processor. ' +
          'Set ENABLE_TASK_PROCESSOR=false to run without task processing.'
      );
      process.exit(1);
    }

    const pollInterval = parseInt(process.env.TASK_POLL_INTERVAL || '5000', 10);
    startTaskLoop(pollInterval);
    logger.info(`Task processor enabled (polling every ${pollInterval}ms)`);
  } else {
    logger.info('Task processor disabled (set ENABLE_TASK_PROCESSOR=true to enable)');
  }

  // Handle graceful shutdown (Fly.io sends SIGTERM)
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    // Stop task processor first
    if (enableTaskProcessor) {
      stopTaskLoop();
    }

    // Stop inbox monitor if it's running.
    stopInboxMonitor();

    // Then close HTTP server
    server.close(() => {
      closeDatabase();
      logger.info('Server closed.');
      process.exit(0);
    });

    // Force exit after 30 seconds (matches Fly.io kill_timeout)
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout.');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start server
  server.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info('BitBit ready.');
  });
}

// Run if executed directly
main().catch((error: Error) => {
  logger.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
