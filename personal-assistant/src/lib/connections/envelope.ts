import type { Envelope, TransportType } from './types'
import type { ChannelMessage } from '@/lib/channels/types'
import crypto from 'crypto'

export function envelopeToChannelMessage(envelope: Envelope): ChannelMessage {
  return {
    id: envelope.dedup_key,
    channel: envelope.provider as ChannelMessage['channel'],
    externalId: envelope.dedup_key,
    sender: envelope.payload.sender?.name || envelope.payload.sender?.email || 'Unknown',
    senderEmail: envelope.payload.sender?.email,
    subject: envelope.payload.subject,
    body: envelope.payload.body,
    bodyFull: envelope.payload.body_html || envelope.payload.body,
    receivedAt: new Date(envelope.timestamp),
    isActionable: true,
    priority: 'medium',
    metadata: {
      ...envelope.payload.metadata,
      _bridge: envelope.transport === 'bridge',
      _webhook: envelope.transport === 'webhook',
      _connection_id: envelope.connection_id,
    },
  }
}

export function generateDedupKey(
  provider: string,
  externalId?: string,
  sender?: string,
  subject?: string,
  body?: string,
): string {
  if (externalId) return externalId
  const hash = crypto.createHash('md5')
    .update(`${provider}:${sender}:${subject}:${body?.slice(0, 200)}`)
    .digest('hex')
  return `${provider}-${hash}`
}

export function generateBridgeToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  )
}
