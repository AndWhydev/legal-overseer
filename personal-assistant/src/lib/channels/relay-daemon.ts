/**
 * Channel Relay Daemon
 *
 * Latency Budget (CHAN-05):
 * -------------------------
 * - Poll initiation: <100ms
 * - IMAP/API pull: 500ms-5s (depends on message count and provider)
 * - Dedup check: <50ms per message (DB query)
 * - Insert: <20ms per message (upsert)
 * - Classification routing: <100ms (queue, not inline)
 * - Total per-cycle target: <10s for up to 50 messages
 * - Burst conditions (>20 messages): sequential processing, no skip
 * - Cross-channel dedup window: 5 minutes
 */

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelMessage, ChannelType } from './types'
import { gmailAdapter } from './gmail'
import { outlookAdapter } from './outlook'
import { asanaAdapter } from './asana'
import { calendlyAdapter } from './calendly'
import { stripeAdapter } from './stripe'
import { clickupAdapter } from './clickup'
import { ga4Adapter } from './ga4'
import { wordpressAdapter } from './wordpress'
import { cluelyAdapter } from './cluely'
import { isDuplicate, computeContentHash } from './dedup'
import { getOrgCredential, storeOrgCredential, storeChannelCredential, encryptCredential } from '@/lib/integrations/credentials'
import { logger } from '@/lib/core/logger';
import { fetchGooglePhotos, fetchOutlookPhotos, fetchSlackPhotos, fetchAsanaPhotos } from '@/lib/avatar/channel-photos'

export interface PollResult {
  messagesFound: number
  messagesInserted: number
  skipped: boolean
  error?: string
  latencyMs?: number
  dedupStats?: { externalId: number; contentHash: number }
}

const adapterMap = {
  gmail: gmailAdapter,
  outlook: outlookAdapter,
  asana: asanaAdapter,
  calendly: calendlyAdapter,
  stripe: stripeAdapter,
  clickup: clickupAdapter,
  ga4: ga4Adapter,
  wordpress: wordpressAdapter,
  cluely: cluelyAdapter,
} as const

async function hydrateAdapterConfig(
  supabase: SupabaseClient,
  orgId: string,
  channelType: ChannelType,
  config: unknown,
): Promise<Record<string, unknown>> {
  const baseConfig =
    config && typeof config === 'object' ? { ...(config as Record<string, unknown>) } : {}

  const readCredential = async (providers: string[]): Promise<Record<string, unknown> | null> => {
    for (const provider of providers) {
      try {
        const creds = await getOrgCredential(supabase, orgId, provider)
        if (creds) return creds
      } catch {
        // Best-effort lookup; relay falls back to connection config/env.
      }
    }
    return null
  }

  try {
    if (channelType === 'gmail') {
      const creds = await readCredential(['gmail'])
      let accessToken = creds?.['access_token'] as string | undefined
      const tokenExpiresAt = creds?.['token_expires_at'] as string | undefined
      const refreshToken = creds?.['refresh_token'] as string | undefined

      // Refresh if expired or expiring within 5 minutes
      const isExpired = tokenExpiresAt
        ? new Date(tokenExpiresAt).getTime() - 5 * 60 * 1000 <= Date.now()
        : !accessToken

      if (isExpired && refreshToken) {
        const clientId = process.env.GOOGLE_CLIENT_ID
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET
        if (clientId && clientSecret) {
          try {
            const res = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
              }),
            })
            if (res.ok) {
              const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string }
              accessToken = data.access_token
              const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
              // Persist refreshed token back to credential store
              const updatedCreds = {
                ...creds,
                access_token: data.access_token,
                refresh_token: data.refresh_token || refreshToken,
                token_expires_at: newExpiresAt,
              }
              try {
                await storeOrgCredential(supabase, orgId, 'gmail', updatedCreds as Record<string, unknown>, 'relay-daemon')
              } catch (storeErr) {
                logger.warn('[relay] Failed to persist refreshed Gmail token:', storeErr)
              }
              logger.info('[relay] Gmail token refreshed successfully')
            } else {
              logger.warn('[relay] Gmail token refresh failed:', await res.text())
            }
          } catch (err) {
            logger.warn('[relay] Gmail token refresh error:', err)
          }
        }
      }

      if (typeof accessToken === 'string' && accessToken) {
        baseConfig.accessToken = accessToken
      }
      return baseConfig
    }

    if (channelType === 'outlook') {
      const creds = await readCredential(['outlook'])
      let accessToken = creds?.['access_token'] as string | undefined
      const tokenExpiresAt = creds?.['token_expires_at'] as string | undefined
      const refreshToken = creds?.['refresh_token'] as string | undefined

      // Refresh if expired or expiring within 5 minutes
      const isExpired = tokenExpiresAt
        ? new Date(tokenExpiresAt).getTime() - 5 * 60 * 1000 <= Date.now()
        : !accessToken

      if (isExpired && refreshToken) {
        const clientId = creds?.['client_id'] as string | undefined || process.env.OUTLOOK_CLIENT_ID
        const clientSecret = creds?.['client_secret'] as string | undefined || process.env.OUTLOOK_CLIENT_SECRET
        const tenantId = creds?.['tenant_id'] as string | undefined || process.env.OUTLOOK_TENANT_ID || 'common'
        if (clientId && clientSecret) {
          try {
            const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
            const res = await fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
                scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send',
              }),
            })
            if (res.ok) {
              const data = await res.json() as { access_token: string; expires_in: number; refresh_token?: string }
              accessToken = data.access_token
              const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()
              const updatedCreds = {
                ...creds,
                access_token: data.access_token,
                refresh_token: data.refresh_token || refreshToken,
                token_expires_at: newExpiresAt,
              }
              try {
                await storeOrgCredential(supabase, orgId, 'outlook', updatedCreds as Record<string, unknown>, 'relay-daemon')
              } catch (storeErr) {
                logger.warn('[relay] Failed to persist refreshed Outlook token:', storeErr)
              }
              logger.info('[relay] Outlook token refreshed successfully')
            } else {
              logger.warn('[relay] Outlook token refresh failed:', await res.text())
            }
          } catch (err) {
            logger.warn('[relay] Outlook token refresh error:', err)
          }
        }
      }

      if (typeof accessToken === 'string' && accessToken) {
        baseConfig.accessToken = accessToken
      }
      return baseConfig
    }

    if (channelType === 'clickup') {
      const creds = await readCredential(['clickup'])
      const accessToken = creds?.['access_token']
      if (typeof accessToken === 'string' && accessToken) {
        baseConfig.accessToken = accessToken
      }
      return baseConfig
    }

    if (channelType === 'ga4') {
      const creds = await readCredential(['ga4', 'google-analytics'])
      const accessToken = creds?.['access_token']
      const propertyId = creds?.['property_id']
      if (typeof accessToken === 'string' && accessToken) {
        baseConfig.accessToken = accessToken
      }
      if (typeof propertyId === 'string' && propertyId) {
        baseConfig.property_id = propertyId
      }
      return baseConfig
    }

    if (channelType === 'wordpress') {
      const creds = await readCredential(['wordpress'])
      const siteUrl = creds?.['site_url']
      const username = creds?.['username']
      const applicationPassword = creds?.['application_password']
      if (typeof siteUrl === 'string' && siteUrl) {
        baseConfig.site_url = siteUrl
      }
      if (typeof username === 'string' && username) {
        baseConfig.username = username
      }
      if (typeof applicationPassword === 'string' && applicationPassword) {
        baseConfig.application_password = applicationPassword
      }
      return baseConfig
    }

    if (channelType === 'cluely') {
      const creds = await readCredential(['cluely'])
      const apiKey = creds?.['api_key']
      const workspaceId = creds?.['workspace_id']
      const baseUrl = creds?.['base_url']
      if (typeof apiKey === 'string' && apiKey) {
        baseConfig.api_key = apiKey
      }
      if (typeof workspaceId === 'string' && workspaceId) {
        baseConfig.workspace_id = workspaceId
      }
      if (typeof baseUrl === 'string' && baseUrl) {
        baseConfig.base_url = baseUrl
      }
      return baseConfig
    }
  } catch (err) {
    logger.warn(`[relay] Failed to hydrate config for ${channelType}:`, err)
  }

  return baseConfig
}

/**
 * Retry a classification call with exponential backoff.
 * On final failure, marks the message as 'unclassified'.
 */
async function classifyWithRetry(
  supabase: SupabaseClient,
  orgId: string,
  messageId: string,
  _msg: ChannelMessage
): Promise<void> {
  const maxAttempts = 3
  const backoffMs = [1000, 2000, 4000]

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Classification is handled by the synthesizer pipeline (Phase 8 agent infra).
      // Mark message as pending classification — the synthesizer picks it up.
      const { error: updateError } = await supabase
        .from('channel_messages')
        .update({ classification: 'pending' })
        .eq('id', messageId)
        .eq('org_id', orgId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      return
    } catch (err) {
      logger.error(
        `[relay] Classification attempt ${attempt + 1}/${maxAttempts} failed for message ${messageId}:`,
        err instanceof Error ? err.message : String(err)
      )

      if (attempt < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, backoffMs[attempt]))
      } else {
        // Final failure: mark as unclassified
        const { error: fallbackError } = await supabase
          .from('channel_messages')
          .update({ classification: 'unclassified' })
          .eq('id', messageId)
          .eq('org_id', orgId)

        if (fallbackError) {
          logger.error(
            `[relay] Failed to mark message ${messageId} as unclassified: ${fallbackError.message}`
          )
        }

        logger.error(
          `[relay] Message ${messageId} marked as unclassified after ${maxAttempts} failed attempts`
        )
      }
    }
  }
}

/**
 * Poll a channel for new messages and persist them to channel_messages.
 * Never throws -- returns errors in PollResult.error.
 *
 * Includes:
 * - Two-tier dedup (external_id + content-hash cross-channel)
 * - Latency instrumentation per phase (pull, dedup, insert, total)
 * - Burst detection and logging (>20 messages)
 * - Classification retry with exponential backoff
 */
export async function pollChannel(
  supabase: SupabaseClient,
  orgId: string,
  channelType: ChannelType
): Promise<PollResult> {
  const pollStartMs = Date.now()

  try {
    // Read channel_connections row
    const { data: conn, error: connErr } = await supabase
      .from('channel_connections')
      .select('*')
      .eq('org_id', orgId)
      .eq('channel_type', channelType)
      .single()

    if (connErr || !conn) {
      return { messagesFound: 0, messagesInserted: 0, skipped: true, error: connErr?.message || 'No connection found' }
    }

    if (!conn.relay_enabled) {
      return { messagesFound: 0, messagesInserted: 0, skipped: true }
    }

    const adapter = adapterMap[channelType as keyof typeof adapterMap]
    if (!adapter) {
      return { messagesFound: 0, messagesInserted: 0, skipped: true, error: `No adapter for channel: ${channelType}` }
    }

    // Phase: Pull messages since poll_cursor
    const pullStartMs = Date.now()
    const since = conn.poll_cursor ? new Date(conn.poll_cursor) : undefined
    const adapterConfig = await hydrateAdapterConfig(supabase, orgId, channelType, conn.config)
    const messages = await adapter.pull(adapterConfig, since)
    const pullDurationMs = Date.now() - pullStartMs

    if (messages.length === 0) {
      const totalDurationMs = Date.now() - pollStartMs
      logger.info(JSON.stringify({
        event: 'relay_poll',
        channel: channelType,
        pollStartMs,
        pullDurationMs,
        dedupDurationMs: 0,
        insertDurationMs: 0,
        totalDurationMs,
        messagesFound: 0,
        messagesInserted: 0,
        duplicatesSkipped: 0,
      }))
      return { messagesFound: 0, messagesInserted: 0, skipped: false, latencyMs: totalDurationMs, dedupStats: { externalId: 0, contentHash: 0 } }
    }

    // Burst detection
    if (messages.length > 20) {
      logger.warn(`[relay] Burst detected: ${messages.length} messages from ${channelType}`)
    }

    // Phase: Dedup
    const dedupStartMs = Date.now()
    let externalIdDupes = 0
    let contentHashDupes = 0
    const messagesToInsert: { msg: ChannelMessage; contentHash: string }[] = []

    for (const msg of messages) {
      const result = await isDuplicate(supabase, orgId, msg)
      if (result.duplicate) {
        if (result.matchType === 'external_id') externalIdDupes++
        if (result.matchType === 'content_hash') contentHashDupes++
        continue
      }
      const hash = computeContentHash(msg.sender, msg.subject, msg.body)
      messagesToInsert.push({ msg, contentHash: hash })
    }
    const dedupDurationMs = Date.now() - dedupStartMs

    // Phase: Insert
    const insertStartMs = Date.now()
    let inserted = 0
    for (const { msg, contentHash } of messagesToInsert) {
      const { data: insertedRow, error: upsertErr } = await supabase
        .from('channel_messages')
        .upsert(
          {
            org_id: orgId,
            channel: msg.channel,
            external_id: msg.externalId,
            sender: msg.sender,
            sender_email: msg.senderEmail || null,
            subject: msg.subject || null,
            body: msg.body,
            body_full: msg.bodyFull || null,
            received_at: msg.receivedAt.toISOString(),
            is_actionable: msg.isActionable,
            priority: msg.priority,
            processed: false,
            metadata: msg.metadata,
            content_hash: contentHash,
          },
          { onConflict: 'org_id,channel,external_id', ignoreDuplicates: true }
        )
        .select('id')
        .single()

      if (!upsertErr && insertedRow) {
        inserted++
        // Trigger classification with retry for each inserted message
        await classifyWithRetry(supabase, orgId, insertedRow.id, msg)
      }
    }
    const insertDurationMs = Date.now() - insertStartMs

    // Phase: RAG embedding (enqueue to job queue, non-blocking)
    if (inserted > 0 && process.env.PINECONE_API_KEY) {
      const embeddingPromise = (async () => {
        try {
          const { enqueueEmbedding } = await import('@/lib/rag/embedding-queue')
          let enqueued = 0

          for (const { msg: m } of messagesToInsert) {
            if (!m.body || m.body.length === 0) continue

            const content = (m as unknown as { bodyFull?: string }).bodyFull ?? m.body
            const metadata = {
              message_id: m.externalId,
              org_id: orgId,
              channel: m.channel,
              sender: m.sender,
              sender_email: m.senderEmail,
              subject: m.subject,
              received_at: m.receivedAt.toISOString(),
              chunk_index: 0,
              total_chunks: 1,
              is_full_body: Boolean((m as unknown as { bodyFull?: string }).bodyFull),
            }

            const result = await enqueueEmbedding(supabase, orgId, m.externalId, content, metadata)
            if (result.success) enqueued++
          }

          logger.info('[relay] RAG embedding jobs enqueued', {
            channel: channelType,
            enqueued,
            total: messagesToInsert.length,
          })
        } catch (err) {
          logger.debug('[relay] RAG embedding enqueue failed (non-critical):', err)
        }
      })()
      void embeddingPromise
    }

    // Phase: Avatar fetch (all channels, fire-and-forget)
    if (inserted > 0) {
      const accessToken = adapterConfig.accessToken as string | undefined
      const senderEmails = messagesToInsert
        .map(({ msg }) => msg.senderEmail)
        .filter((e): e is string => Boolean(e))

      const avatarPromise = (async () => {
        let stored = 0
        try {
          if (channelType === 'gmail' && accessToken) {
            stored = await fetchGooglePhotos(supabase, accessToken, senderEmails)
          } else if (channelType === 'outlook' && accessToken) {
            stored = await fetchOutlookPhotos(supabase, accessToken, senderEmails)
          } else if (channelType === 'slack') {
            const botToken = adapterConfig.botToken as string | undefined
            const userIds = messagesToInsert
              .map(({ msg }) => (msg.metadata as Record<string, unknown>)?.userId as string)
              .filter((id): id is string => Boolean(id))
            if (botToken && userIds.length > 0) {
              stored = await fetchSlackPhotos(supabase, botToken, userIds)
            }
          } else if (channelType === 'asana' && accessToken) {
            const gids = messagesToInsert
              .map(({ msg }) => (msg.metadata as Record<string, unknown>)?.assigneeGid as string)
              .filter((g): g is string => Boolean(g))
            if (gids.length > 0) {
              stored = await fetchAsanaPhotos(supabase, accessToken, gids)
            }
          }
          if (stored > 0) {
            logger.info(`[relay] Fetched ${stored} ${channelType} profile photo(s)`)
          }
        } catch (err) {
          logger.debug('[relay] Avatar fetch failed (non-critical):', err)
        }
      })()
      // Don't await — fire-and-forget
      void avatarPromise
    }

    // Update poll_cursor to latest message receivedAt
    const latestDate = messages.reduce(
      (max, m) => (m.receivedAt > max ? m.receivedAt : max),
      messages[0].receivedAt
    )

    await supabase
      .from('channel_connections')
      .update({
        poll_cursor: latestDate.toISOString(),
        last_sync: new Date().toISOString(),
      })
      .eq('org_id', orgId)
      .eq('channel_type', channelType)

    const totalDurationMs = Date.now() - pollStartMs

    // Structured latency log
    logger.info(JSON.stringify({
      event: 'relay_poll',
      channel: channelType,
      pollStartMs,
      pullDurationMs,
      dedupDurationMs,
      insertDurationMs,
      totalDurationMs,
      messagesFound: messages.length,
      messagesInserted: inserted,
      duplicatesSkipped: externalIdDupes + contentHashDupes,
    }))

    return {
      messagesFound: messages.length,
      messagesInserted: inserted,
      skipped: false,
      latencyMs: totalDurationMs,
      dedupStats: { externalId: externalIdDupes, contentHash: contentHashDupes },
    }
  } catch (err) {
    return {
      messagesFound: 0,
      messagesInserted: 0,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - pollStartMs,
    }
  }
}

/**
 * Fetch unprocessed messages for an org (for classification pipeline).
 */
export async function processNewMessages(
  supabase: SupabaseClient,
  orgId: string
): Promise<ChannelMessage[]> {
  const { data, error } = await supabase
    .from('channel_messages')
    .select('*')
    .eq('org_id', orgId)
    .eq('processed', false)
    .order('received_at', { ascending: true })
    .limit(50)

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    channel: row.channel as ChannelType,
    externalId: row.external_id as string,
    sender: row.sender as string,
    senderEmail: (row.sender_email as string) || undefined,
    subject: (row.subject as string) || undefined,
    body: row.body as string,
    receivedAt: new Date(row.received_at as string),
    isActionable: row.is_actionable as boolean,
    priority: row.priority as ChannelMessage['priority'],
    metadata: (row.metadata as Record<string, unknown>) || {},
  }))
}
