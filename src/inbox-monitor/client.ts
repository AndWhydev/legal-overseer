/**
 * IMAP fetch + MIME parse + attachment save.
 *
 * Uses imapflow for the IMAP transport and mailparser for MIME
 * decoding. Returns IncomingEmail values that downstream pipelines can
 * consume without knowing anything about IMAP.
 *
 * Strategy per poll:
 *   1. Open INBOX in non-readonly mode (we need to set \Seen).
 *   2. Search for UNSEEN messages.
 *   3. For each UID, download the full raw source, MIME-parse it, save
 *      attachments to data/inbox-monitor/<type>/<uid>/, and yield an
 *      IncomingEmail to the caller.
 *   4. Caller decides whether to mark \Seen — we do so only after the
 *      pipeline + reply both succeed.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve as resolvePath } from 'node:path';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import { createSafeLogger } from '../governance/index.js';
import type { IncomingEmail, ResolvedInboxConfig, SavedAttachment } from './types.js';

const logger = createSafeLogger('InboxMonitor.Client');

/**
 * Where attachments land. Production runs override via env.
 */
const DEFAULT_ATTACHMENT_ROOT =
  process.env.INBOX_MONITOR_ATTACHMENTS_DIR ??
  (process.env.NODE_ENV === 'production' ? '/data/inbox-monitor' : './data/inbox-monitor');

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200) || 'attachment';
}

/**
 * Resolve a primary address-only form from a mailparser AddressObject.
 */
function pickFromAddress(from: AddressObject | AddressObject[] | undefined): {
  address: string;
  name: string | null;
} {
  const list = Array.isArray(from) ? from : from ? [from] : [];
  for (const obj of list) {
    const first = obj?.value?.[0];
    if (first?.address) {
      return {
        address: first.address.toLowerCase(),
        name: first.name?.trim() || null,
      };
    }
  }
  return { address: 'unknown@unknown', name: null };
}

function pickToAddresses(to: AddressObject | AddressObject[] | undefined): string[] {
  const list = Array.isArray(to) ? to : to ? [to] : [];
  const out: string[] = [];
  for (const obj of list) {
    for (const v of obj.value ?? []) {
      if (v.address) out.push(v.address.toLowerCase());
    }
  }
  return out;
}

/**
 * Crude HTML → text fallback. Used only when an email has HTML but no
 * text/plain part. Mirrors the helper already in src/email/notifier.ts
 * but without re-importing across module boundaries.
 */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function saveAttachments(
  parsed: ParsedMail,
  inboxType: string,
  uid: number,
): Promise<{ saved: SavedAttachment[]; dir: string | null }> {
  if (!parsed.attachments || parsed.attachments.length === 0) {
    return { saved: [], dir: null };
  }

  const dir = resolvePath(join(DEFAULT_ATTACHMENT_ROOT, inboxType, String(uid)));
  await mkdir(dir, { recursive: true });

  const saved: SavedAttachment[] = [];
  for (let i = 0; i < parsed.attachments.length; i++) {
    const att = parsed.attachments[i];
    // Skip inline images (cid:) — they're rarely briefs and clutter
    // the audit log. Attachments with a filename are kept.
    if (att.contentDisposition === 'inline' && !att.filename) continue;

    const name = safeFilename(att.filename ?? `attachment-${i}`);
    // Prefix with the index to keep ordering and dodge name clashes.
    const path = join(dir, `${String(i).padStart(2, '0')}_${name}`);
    await writeFile(path, att.content);
    saved.push({
      filename: att.filename ?? name,
      path,
      mimeType: att.contentType ?? 'application/octet-stream',
      sizeBytes: att.size ?? att.content.length,
    });
  }

  return { saved, dir };
}

/**
 * Open the inbox, fetch + parse every UNSEEN message, hand each one
 * off to the supplied handler. After the handler returns successfully,
 * mark the message \Seen so the next poll cycle skips it.
 *
 * Errors thrown by the handler are caught here — we log and continue.
 * The inbox connection is always closed in the finally block.
 */
export async function fetchUnseenEmails(
  inbox: ResolvedInboxConfig,
  handler: (email: IncomingEmail) => Promise<{ markSeen: boolean }>,
): Promise<{ scanned: number; processed: number; errors: number }> {
  const client = new ImapFlow({
    host: inbox.imap.host,
    port: inbox.imap.port,
    secure: inbox.imap.secure,
    auth: { user: inbox.address, pass: inbox.password },
    logger: false,
  });

  let scanned = 0;
  let processed = 0;
  let errors = 0;

  try {
    await client.connect();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`IMAP connect failed for ${inbox.address}: ${msg}`);
    return { scanned, processed, errors: 1 };
  }

  let lock: Awaited<ReturnType<typeof client.getMailboxLock>> | null = null;
  try {
    lock = await client.getMailboxLock('INBOX');

    // Collect UIDs first so we can iterate without keeping the search
    // generator open while pipelines run.
    const uids: number[] = [];
    for await (const msg of client.fetch({ seen: false }, { uid: true, envelope: false })) {
      uids.push(msg.uid);
    }
    scanned = uids.length;
    if (scanned === 0) {
      return { scanned, processed, errors };
    }

    logger.info(`Inbox ${inbox.meta.type}: ${scanned} unseen message(s)`);

    for (const uid of uids) {
      try {
        const download = await client.download(String(uid), undefined, { uid: true });
        if (!download?.content) {
          logger.warn(`Inbox ${inbox.meta.type} uid=${uid}: empty download`);
          errors += 1;
          continue;
        }

        const parsed = await simpleParser(download.content);
        const { saved, dir } = await saveAttachments(parsed, inbox.meta.type, uid);

        const sender = pickFromAddress(parsed.from);
        const textBody =
          (parsed.text && parsed.text.trim()) ||
          (parsed.html ? htmlToText(parsed.html) : '') ||
          '';

        const email: IncomingEmail = {
          inbox,
          uid,
          messageId: parsed.messageId ?? `<no-message-id-${inbox.address}-${uid}>`,
          fromAddress: sender.address,
          fromName: sender.name,
          to: pickToAddresses(parsed.to),
          subject: (parsed.subject ?? '').trim(),
          bodyText: textBody,
          bodyHtml: typeof parsed.html === 'string' ? parsed.html : null,
          receivedAt: (parsed.date ?? new Date()).toISOString(),
          attachments: saved,
          attachmentsDir: dir,
        };

        const { markSeen } = await handler(email);
        if (markSeen) {
          try {
            await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
          } catch (err) {
            logger.warn(
              `Inbox ${inbox.meta.type} uid=${uid}: failed to mark \\Seen: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
        processed += 1;
      } catch (err) {
        errors += 1;
        logger.error(
          `Inbox ${inbox.meta.type} uid=${uid} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } finally {
    if (lock) lock.release();
    try {
      await client.logout();
    } catch {
      // already closed; ignore
    }
  }

  return { scanned, processed, errors };
}
