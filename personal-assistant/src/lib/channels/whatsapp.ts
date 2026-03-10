import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger';

interface WhatsAppMessageResponse {
  messages?: Array<{ id?: string }>
}

type IndexedDecision = {
  type: 'indexed'
  index: number
  decision: 'approved' | 'rejected'
}

type SimpleDecision = {
  type: 'simple'
  decision: 'approved' | 'rejected'
}

export type ParsedApprovalReply = SimpleDecision | IndexedDecision

function formatConfidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0
  if (confidence <= 1) return Math.round(confidence * 100)
  return Math.round(confidence)
}

function shortApprovalId(approvalId: string): string {
  return approvalId.slice(0, 8)
}

// ─── Baileys-backed transport (via Supabase outbox) ─────────────────────────
export async function sendMessageViaBridge(
  client: SupabaseClient,
  orgId: string,
  to: string,
  text: string,
): Promise<string | null> {
  // Find connected session for this org
  const { data: session } = await client
    .from('whatsapp_sessions')
    .select('id')
    .eq('org_id', orgId)
    .eq('status', 'connected')
    .limit(1)
    .single()

  if (!session) {
    logger.warn('WhatsApp: no connected session for org', orgId)
    return null
  }

  const { data, error } = await client
    .from('whatsapp_outbox')
    .insert({
      org_id: orgId,
      session_id: session.id,
      recipient: to,
      body: text,
      status: 'pending',
    })
    .select('id')
    .single()

  if (error) {
    logger.warn('WhatsApp: failed to queue message', error.message)
    return null
  }

  return data?.id ?? null
}

// ─── Meta Cloud API transport (primary) ─────────────────────────────────────

function getEnv() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    andyPhone: process.env.WHATSAPP_ANDY_PHONE,
  }
}

/**
 * Send via Meta Cloud API (primary transport).
 */
export async function sendMessage(to: string, text: string): Promise<string | null> {
  const env = getEnv()
  if (!env.phoneNumberId || !env.accessToken) {
    logger.warn('WhatsApp not configured: missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
    return null
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${env.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      },
    )

    if (!response.ok) {
      logger.warn(`WhatsApp send failed with status ${response.status}`)
      return null
    }

    const payload = (await response.json()) as WhatsAppMessageResponse
    return payload.messages?.[0]?.id ?? null
  } catch (error) {
    logger.warn('WhatsApp send failed', error)
    return null
  }
}

export async function sendApprovalRequest(
  to: string,
  approvalId: string,
  summary: string,
  agentName: string,
  confidence: number,
): Promise<string | null> {
  const message =
    `[BitBit] ${agentName} wants to: ${summary}\n` +
    `Confidence: ${formatConfidencePercent(confidence)}%\n` +
    'Reply Y to approve, N to reject\n' +
    `Ref: ${shortApprovalId(approvalId)}`

  return sendMessage(to, message)
}

export async function sendDigest(
  to: string,
  approvals: Array<{ id: string; summary: string; agentName: string }>,
): Promise<string | null> {
  const lines = approvals.map(
    (approval, index) => `${index + 1}. ${approval.agentName}: ${approval.summary}`,
  )

  const message =
    `[BitBit] Daily Digest - ${approvals.length} pending approvals:\n\n` +
    `${lines.join('\n')}\n\n` +
    "Reply with number + Y/N (e.g. '1Y' or '2N') or open dashboard to review all."

  return sendMessage(to, message)
}

export function parseApprovalReply(text: string): ParsedApprovalReply | null {
  const normalized = text.trim().toUpperCase()
  if (!normalized) {
    return null
  }

  if (normalized === 'Y') {
    return { type: 'simple', decision: 'approved' }
  }

  if (normalized === 'N') {
    return { type: 'simple', decision: 'rejected' }
  }

  const indexedMatch = normalized.match(/^(\d+)(Y|N)$/)
  if (!indexedMatch) {
    return null
  }

  const index = Number(indexedMatch[1])
  if (!Number.isInteger(index) || index < 1) {
    return null
  }

  return {
    type: 'indexed',
    index,
    decision: indexedMatch[2] === 'Y' ? 'approved' : 'rejected',
  }
}

export function getWhatsAppConfig() {
  return getEnv()
}

/**
 * Check if WhatsApp is available — Meta Cloud API first, Baileys bridge fallback.
 */
export async function isAvailable(client?: SupabaseClient, orgId?: string): Promise<boolean> {
  // Meta Cloud API is primary — check env vars first
  const env = getEnv()
  if (env.phoneNumberId && env.accessToken) return true

  // Baileys bridge is secondary — check for connected sessions
  if (client && orgId) {
    try {
      const { count } = await client
        .from('whatsapp_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'connected')

      return (count ?? 0) > 0
    } catch {
      return false
    }
  }

  return false
}

export const whatsappAdapter: import('./types').ChannelAdapter = {
  type: 'whatsapp',
  name: 'WhatsApp',
  description: 'Messaging via WhatsApp (Meta Cloud API primary, Baileys bridge fallback)',
  icon: 'MessageCircle',

  async pull() {
    // WhatsApp is push-based. Inbound handled by bridge worker or webhooks.
    return []
  },

  async isAvailable() {
    // Meta Cloud API is primary
    const env = getEnv()
    if (env.phoneNumberId && env.accessToken) return true

    // Baileys bridge is secondary — but we can't check sessions without a client
    // The adapter interface doesn't pass supabase, so we can only check env here.
    return false
  },
}
