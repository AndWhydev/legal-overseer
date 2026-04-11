/**
 * BlueBubbles (iMessage) Provider Plugin
 *
 * Bridges iMessage via a BlueBubbles server running on a Mac VPS.
 * Receives webhook POSTs from BlueBubbles, normalizes them into Envelopes,
 * and allows sending replies back via the BlueBubbles REST API.
 *
 * Config shape (stored in org_connections.config):
 *   bb_server_url: string — BlueBubbles Cloudflare tunnel URL
 *   bb_password: string   — BlueBubbles server password
 *
 * Provider id is 'imessage' — BlueBubbles is an implementation detail.
 */

import type { ProviderPlugin, OrgConnection, Envelope } from '../types'
import type { BlueBubblesWebhookPayload } from '../../bridges/types'

interface BlueBubblesConfig {
  bb_server_url: string
  bb_password: string
}

function getConfig(connection: OrgConnection): BlueBubblesConfig {
  const cfg = connection.config as Record<string, unknown>
  if (!cfg.bb_server_url || !cfg.bb_password) {
    throw new Error('BlueBubbles connection missing bb_server_url or bb_password')
  }
  return {
    bb_server_url: (cfg.bb_server_url as string).replace(/\/$/, ''),
    bb_password: cfg.bb_password as string,
  }
}

/**
 * Parse incoming BlueBubbles webhook POST into Envelopes.
 * Only processes 'new-message' events where isFromMe is false.
 */
async function webhookParse(req: Request, connection: OrgConnection): Promise<Envelope[]> {
  const body = await req.json() as BlueBubblesWebhookPayload
  const cfg = getConfig(connection)

  // Only process incoming messages (not outgoing)
  if (body.type !== 'new-message') return []
  if (body.data.isFromMe) return []

  const { guid, text, dateCreated, handle, chats, attachments } = body.data

  const senderAddress = handle?.address ?? null
  const chatDisplayName = chats[0]?.displayName ?? null
  const chatGuid = chats[0]?.guid ?? null

  // Determine if address is a phone number
  const isPhone = senderAddress ? /^\+?\d{7,15}$/.test(senderAddress.replace(/[\s\-()]/g, '')) : false

  const envelope: Envelope = {
    connection_id: connection.id,
    org_id: connection.org_id,
    provider: 'imessage',
    transport: 'webhook',
    dedup_key: guid,
    timestamp: new Date(dateCreated).toISOString(),
    payload: {
      type: 'message',
      sender: {
        name: chatDisplayName ?? senderAddress ?? undefined,
        phone: isPhone && senderAddress ? senderAddress : undefined,
      },
      body: text ?? '',
      attachments: attachments.length > 0
        ? attachments.map(att => ({
            name: att.transferName,
            url: `${cfg.bb_server_url}/api/v1/attachment/${att.guid}?password=${cfg.bb_password}`,
            mime: att.mimeType || 'application/octet-stream',
          }))
        : undefined,
      metadata: {
        chat_guid: chatGuid,
        bb_message_guid: guid,
      },
    },
  }

  return [envelope]
}

/**
 * Send a message back via BlueBubbles REST API.
 * Requires chat_guid in envelope.payload.metadata.
 */
async function send(connection: OrgConnection, envelope: Envelope): Promise<void> {
  const cfg = getConfig(connection)
  const chatGuid = envelope.payload.metadata?.chat_guid as string | undefined

  if (!chatGuid) {
    throw new Error('Cannot send: no chat_guid in envelope metadata')
  }

  const tempGuid = `bitbit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const res = await fetch(
    `${cfg.bb_server_url}/api/v1/message/text?password=${cfg.bb_password}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatGuid,
        tempGuid,
        message: envelope.payload.body,
      }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`BlueBubbles send failed: ${res.status} ${err}`)
  }
}

/**
 * Ping the BlueBubbles server to verify it's reachable.
 */
async function healthCheck(connection: OrgConnection): Promise<boolean> {
  try {
    const cfg = getConfig(connection)
    const res = await fetch(`${cfg.bb_server_url}/api/v1/ping?password=${cfg.bb_password}`)
    if (!res.ok) return false
    const data = await res.json() as { data?: string }
    return data.data === 'pong'
  } catch {
    return false
  }
}

/**
 * Backfill messages via GET /api/v1/message.
 * Fetches up to 100 messages sorted DESC and filters by since date and isFromMe.
 */
async function pull(connection: OrgConnection, since?: Date): Promise<Envelope[]> {
  const cfg = getConfig(connection)
  const sinceTs = since?.getTime() ?? (Date.now() - 24 * 60 * 60 * 1000)

  const url = `${cfg.bb_server_url}/api/v1/message?password=${cfg.bb_password}&limit=100&sort=DESC`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`BlueBubbles pull failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { data?: BlueBubblesWebhookPayload['data'][] }
  const messages = data.data ?? []
  const envelopes: Envelope[] = []

  for (const msg of messages) {
    // Skip outgoing messages
    if (msg.isFromMe) continue

    // Skip messages before since date
    if (msg.dateCreated < sinceTs) continue

    const senderAddress = msg.handle?.address ?? null
    const chatDisplayName = msg.chats[0]?.displayName ?? null
    const chatGuid = msg.chats[0]?.guid ?? null
    const isPhone = senderAddress ? /^\+?\d{7,15}$/.test(senderAddress.replace(/[\s\-()]/g, '')) : false

    envelopes.push({
      connection_id: connection.id,
      org_id: connection.org_id,
      provider: 'imessage',
      transport: 'poll',
      dedup_key: msg.guid,
      timestamp: new Date(msg.dateCreated).toISOString(),
      payload: {
        type: 'message',
        sender: {
          name: chatDisplayName ?? senderAddress ?? undefined,
          phone: isPhone && senderAddress ? senderAddress : undefined,
        },
        body: msg.text ?? '',
        attachments: msg.attachments.length > 0
          ? msg.attachments.map(att => ({
              name: att.transferName,
              url: `${cfg.bb_server_url}/api/v1/attachment/${att.guid}?password=${cfg.bb_password}`,
              mime: att.mimeType || 'application/octet-stream',
            }))
          : undefined,
        metadata: {
          chat_guid: chatGuid,
          bb_message_guid: msg.guid,
        },
      },
    })
  }

  // Sort ascending by timestamp
  envelopes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return envelopes
}

export const blueBubblesProvider: ProviderPlugin = {
  id: 'imessage',
  name: 'iMessage (BlueBubbles)',
  description: 'iMessage via BlueBubbles server running on a Mac VPS',
  category: 'communication',
  auth: { method: 'bridge' },
  defaultTransport: 'webhook',
  capabilities: ['pull', 'send', 'webhook'],
  pull,
  send,
  webhookParse,
  healthCheck,
}
