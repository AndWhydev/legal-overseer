/**
 * ClickUp Webhook Handler
 *
 * Handles incoming ClickUp webhook requests with signature verification.
 * Creates tasks when ClickUp tasks move to "Review" status.
 *
 * Security:
 * - Verifies X-Signature header using HMAC-SHA256
 * - Uses constant-time comparison to prevent timing attacks
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ClickUpWebhookPayload, ClickUpStatusValue } from './types.js';
import { createTask } from '../../db/repositories/tasks.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('ClickUpWebhook');

const WEBHOOK_SECRET = process.env.CLICKUP_WEBHOOK_SECRET;

/**
 * Parse JSON body from incoming request and return both parsed JSON and raw body
 */
async function parseBodyWithRaw(req: IncomingMessage): Promise<{ parsed: unknown; raw: string }> {
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
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve({ parsed: raw ? JSON.parse(raw) : {}, raw });
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
 * Verify ClickUp webhook signature using HMAC-SHA256
 */
function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  const computed = createHmac('sha256', secret).update(rawBody).digest('hex');

  // Ensure same length for timing-safe comparison
  if (computed.length !== signature.length) {
    return false;
  }

  const bufComputed = Buffer.from(computed, 'utf-8');
  const bufSignature = Buffer.from(signature, 'utf-8');
  return timingSafeEqual(bufComputed, bufSignature);
}

/**
 * Check if a status value contains "review" (case-insensitive)
 */
function isReviewStatus(statusValue: ClickUpStatusValue | string | null | undefined): boolean {
  if (!statusValue) return false;

  const statusString =
    typeof statusValue === 'string' ? statusValue : statusValue.status;

  return statusString?.toLowerCase().includes('review') ?? false;
}

/**
 * Check if the request path is for ClickUp webhook
 */
export function isClickUpWebhook(req: IncomingMessage): boolean {
  const url = req.url || '';
  const method = req.method || 'GET';
  return method === 'POST' && url === '/clickup/webhook';
}

/**
 * Handle incoming ClickUp webhook request
 *
 * @param req - Incoming HTTP request
 * @param res - HTTP response
 * @returns true if request was handled, false if not a webhook request
 */
export async function handleClickUpWebhook(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Check if this is a ClickUp webhook request
  if (!isClickUpWebhook(req)) {
    return false;
  }

  // Webhook secret not configured - graceful degradation
  if (!WEBHOOK_SECRET) {
    logger.warn('ClickUp webhook received but CLICKUP_WEBHOOK_SECRET not configured');
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Webhook secret not configured' }));
    return true;
  }

  try {
    // Parse body and get raw for signature verification
    const { parsed, raw } = await parseBodyWithRaw(req);
    const payload = parsed as ClickUpWebhookPayload;

    // Verify signature from X-Signature header
    const signatureHeader = req.headers['x-signature'];
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!signature || !verifySignature(raw, signature, WEBHOOK_SECRET)) {
      logger.warn('ClickUp webhook unauthorized - invalid or missing signature');
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return true;
    }

    // Log the event
    logger.info(`ClickUp webhook: ${payload.event} for task ${payload.task_id}`);

    // Handle taskStatusUpdated - check if moved to "Review" status
    if (payload.event === 'taskStatusUpdated' && payload.history_items) {
      for (const item of payload.history_items) {
        if (item.field === 'status' && isReviewStatus(item.after)) {
          // Create Gatekeeper task for review
          const task = createTask('gatekeeper', 'clickup_webhook', JSON.stringify(payload));
          logger.info(`Created Gatekeeper task ${task.id} for ClickUp task ${payload.task_id}`);
        }
      }
    }

    // Return 200 OK immediately (webhook best practice)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`ClickUp webhook error: ${errorMessage}`);

    // Return 200 to acknowledge receipt (avoid infinite retries)
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, error: 'processed with errors' }));
    return true;
  }
}
