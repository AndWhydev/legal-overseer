/**
 * Outbound send guards.
 *
 * Single chokepoint every channel sender calls before hitting the wire.
 * Prevents dev/test environments from messaging real users, and provides
 * a dry-run mode for validating pipelines without any external calls.
 *
 * Env knobs:
 *   BITBIT_OUTBOUND_MODE=dry-run   — short-circuit every send to a fake success
 *   SENDBLUE_DEV_ALLOWLIST         — comma-separated recipients permitted in non-prod
 *                                    (E.164 phones, Telegram chat IDs, Matrix user IDs,
 *                                    email addresses — normalised case-insensitively)
 *
 * In production (NODE_ENV='production') the allowlist is ignored and all
 * recipients pass. The guard's job is to prevent accidental prod-phone
 * sends from dev envs, not to replace prod ACLs.
 */

import { logger } from '@/lib/core/logger'

export type OutboundChannel =
  | 'sendblue'
  | 'sms'
  | 'whatsapp'
  | 'telegram'
  | 'baileys'
  | 'matrix'

export class OutboundBlockedError extends Error {
  readonly recipient: string
  readonly channel: OutboundChannel
  readonly reason: 'not-allowlisted' | 'dry-run'

  constructor(recipient: string, channel: OutboundChannel, reason: 'not-allowlisted' | 'dry-run') {
    super(
      reason === 'dry-run'
        ? `[dry-run] blocked ${channel} send to ${recipient}`
        : `[guard] blocked ${channel} send to non-allowlisted recipient ${recipient} in ${process.env.NODE_ENV ?? 'unknown'} env`,
    )
    this.name = 'OutboundBlockedError'
    this.recipient = recipient
    this.channel = channel
    this.reason = reason
  }
}

/** Strip formatting from phone-like recipients so "+61 4 1234 5678" matches "+61412345678". */
function normaliseRecipient(raw: string): string {
  const trimmed = raw.trim()
  // Phone-shaped: strip spaces, dashes, parens
  if (/^\+?[0-9][\d\s\-()]+$/.test(trimmed)) {
    return trimmed.replace(/[\s\-()]/g, '')
  }
  // Email / chat ID / Matrix ID: lowercase
  return trimmed.toLowerCase()
}

function parseAllowlist(): Set<string> {
  const raw = process.env.SENDBLUE_DEV_ALLOWLIST ?? ''
  const entries = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(normaliseRecipient)
  return new Set(entries)
}

/**
 * Assert that an outbound send is permitted.
 *
 * Throws OutboundBlockedError (reason='dry-run') if BITBIT_OUTBOUND_MODE=dry-run
 * so callers can treat it as a clean short-circuit, not an error.
 *
 * Throws OutboundBlockedError (reason='not-allowlisted') in non-prod envs
 * when the recipient is not in SENDBLUE_DEV_ALLOWLIST.
 *
 * Returns silently when the send should proceed.
 */
export function assertOutboundAllowed(recipient: string, channel: OutboundChannel): void {
  if (process.env.BITBIT_OUTBOUND_MODE === 'dry-run') {
    logger.info('[guards] dry-run — blocking outbound send', { channel, recipient })
    throw new OutboundBlockedError(recipient, channel, 'dry-run')
  }

  if (process.env.NODE_ENV === 'production') return

  const allowlist = parseAllowlist()
  if (allowlist.size === 0) {
    logger.error(
      '[guards] non-prod outbound blocked — SENDBLUE_DEV_ALLOWLIST is empty. Set it to permit dev sends.',
      { channel, recipient, env: process.env.NODE_ENV },
    )
    throw new OutboundBlockedError(recipient, channel, 'not-allowlisted')
  }

  const normalised = normaliseRecipient(recipient)
  if (!allowlist.has(normalised)) {
    logger.error('[guards] non-prod outbound blocked — recipient not in allowlist', {
      channel,
      recipient: normalised,
      env: process.env.NODE_ENV,
    })
    throw new OutboundBlockedError(recipient, channel, 'not-allowlisted')
  }
}

/** Convenience for callers that want to swallow dry-run and return a fake success. */
export function isDryRun(): boolean {
  return process.env.BITBIT_OUTBOUND_MODE === 'dry-run'
}
