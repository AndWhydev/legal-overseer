/**
 * Telegram Webhook Handler
 *
 * Handles incoming Telegram updates via webhook POST requests.
 * Uses native Node.js http (no Express adapter needed).
 *
 * Security:
 * - Verifies X-Telegram-Bot-Api-Secret-Token header
 * - Uses constant-time comparison to prevent timing attacks
 * - 10-second timeout for update processing
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { bot, isBotReady } from './bot.js';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('TelegramWebhook');

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');
  return timingSafeEqual(bufA, bufB);
}

/**
 * Parse JSON body from incoming request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const MAX_BODY_SIZE = 1024 * 1024; // 1MB
    const timeout = setTimeout(() => {
      reject(new Error('Request body timeout'));
    }, 5000);

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        clearTimeout(timeout);
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      clearTimeout(timeout);
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Handle incoming Telegram webhook request
 *
 * @param req - Incoming HTTP request
 * @param res - HTTP response
 * @returns true if request was handled, false if not a webhook request
 */
export async function handleTelegramWebhook(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '';
  const method = req.method || 'GET';

  // Check if this is a webhook request (POST /telegram/*)
  if (method !== 'POST' || !url.startsWith('/telegram/')) {
    return false;
  }

  // Bot not configured or not initialized
  if (!bot || !isBotReady()) {
    logger.warn('Telegram webhook received but bot not ready');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bot not ready' }));
    return true;
  }

  // Webhook secret not configured
  if (!WEBHOOK_SECRET) {
    logger.warn('Telegram webhook received but secret not configured');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Webhook secret not configured' }));
    return true;
  }

  // Verify secret token header BEFORE processing
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
  const providedSecret = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;

  if (!providedSecret || !secureCompare(providedSecret, WEBHOOK_SECRET)) {
    logger.warn('Telegram webhook unauthorized - invalid or missing secret token');
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return true;
  }

  try {
    // Parse update body
    const update = await parseBody(req);

    // Process update with 10-second timeout
    const updatePromise = bot.handleUpdate(update as Parameters<typeof bot.handleUpdate>[0]);
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('Update processing timeout')), 10000);
    });

    await Promise.race([updatePromise, timeoutPromise]);

    // Respond quickly with 200 OK (Telegram requires response within 60s)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Telegram webhook error: ${errorMessage}`);

    // Still return 200 to prevent Telegram from retrying
    // (error was logged, don't want infinite retry loops)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, error: 'processed with errors' }));
    return true;
  }
}

/**
 * Log Telegram configuration status on startup
 */
export function logTelegramStatus(): void {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.info('Telegram integration: DISABLED (TELEGRAM_BOT_TOKEN not set)');
  } else if (!process.env.TELEGRAM_WEBHOOK_SECRET) {
    logger.info('Telegram integration: DISABLED (TELEGRAM_WEBHOOK_SECRET not set)');
  } else {
    logger.info('Telegram integration: ENABLED (webhook mode)');
  }
}
