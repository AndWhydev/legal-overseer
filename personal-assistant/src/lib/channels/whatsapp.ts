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

function getEnv() {
  return {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    andyPhone: process.env.WHATSAPP_ANDY_PHONE,
  }
}

function formatConfidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0
  if (confidence <= 1) return Math.round(confidence * 100)
  return Math.round(confidence)
}

function shortApprovalId(approvalId: string): string {
  return approvalId.slice(0, 8)
}

export async function sendMessage(to: string, text: string): Promise<string | null> {
  const env = getEnv()
  if (!env.phoneNumberId || !env.accessToken) {
    console.warn('WhatsApp not configured: missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
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
      console.warn(`WhatsApp send failed with status ${response.status}`)
      return null
    }

    const payload = (await response.json()) as WhatsAppMessageResponse
    return payload.messages?.[0]?.id ?? null
  } catch (error) {
    console.warn('WhatsApp send failed', error)
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
