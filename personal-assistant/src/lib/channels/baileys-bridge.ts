/**
 * Baileys WhatsApp Bridge — Connection manager for WhatsApp via Baileys library.
 *
 * @module baileys-bridge
 *
 * ## WHATS-05: Baileys vs Cloud API Trade-offs
 *
 * ### Baileys (current implementation)
 * **Pros:**
 * - No Meta Business verification needed — works immediately
 * - Free — no per-message costs
 * - Full message type support (text, audio, images, documents, reactions)
 * - Direct WebSocket connection to WhatsApp servers
 *
 * **Cons:**
 * - Unofficial library — can break with WhatsApp protocol updates
 * - Requires a persistent process (bridge worker) running continuously
 * - Phone must stay online and connected to the internet
 * - Session can be revoked by WhatsApp if detected as unofficial client
 * - No official SLA or support
 *
 * ### Meta Cloud API (future migration target)
 * **Pros:**
 * - Official and reliable — backed by Meta's infrastructure
 * - Webhook-based — no persistent process needed
 * - Phone can be offline (messages routed through Meta servers)
 * - Official SLA, support, and documentation
 *
 * **Cons:**
 * - Requires Meta Business verification (can take weeks)
 * - Per-conversation pricing after free tier
 * - Template messages required for business-initiated conversations
 * - Limited to approved message templates for outbound
 *
 * ### Migration Path (Baileys -> Cloud API)
 * 1. Swap `baileys-bridge.ts` for `cloud-api-bridge.ts` (same interfaces)
 * 2. Both paths write to `channel_messages` on receive and drain `whatsapp_outbox` on send
 * 3. The webhook route (`/api/channels/whatsapp/route.ts`) already handles Cloud API payloads
 * 4. Shared downstream: `processWhatsAppMessage` -> conversation-manager -> agent dispatch
 *
 * ### Recommendation
 * Use Baileys for development and MVP (immediate connectivity, no verification wait).
 * Migrate to Cloud API once Meta Business verification is complete for production reliability.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logSessionHealth } from './whatsapp-monitor'
import type { WhatsAppSessionStatus } from './whatsapp-monitor'
import { processWhatsAppMessage } from './whatsapp-parser'

// ---------------------------------------------------------------------------
// Dynamic Baileys import — module works even if @whiskeysockets/baileys is
// not installed. Call `isBaileysAvailable()` before using bridge features.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type BaileysModule = any
type WASocket = any
/* eslint-enable @typescript-eslint/no-explicit-any */

let _baileys: BaileysModule | null = null
let _baileysChecked = false

async function loadBaileys(): Promise<BaileysModule | null> {
  if (_baileysChecked) return _baileys
  _baileysChecked = true
  try {
    _baileys = await import('@whiskeysockets/baileys')
    return _baileys
  } catch {
    console.warn('[baileys-bridge] @whiskeysockets/baileys not installed — bridge unavailable')
    _baileys = null
    return null
  }
}

/**
 * Check whether the Baileys library is installed and loadable.
 */
export async function isBaileysAvailable(): Promise<boolean> {
  const mod = await loadBaileys()
  return mod !== null
}

// ---------------------------------------------------------------------------
// Bridge class
// ---------------------------------------------------------------------------

const OUTBOX_POLL_INTERVAL_MS = 5_000
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_BACKOFF_BASE_MS = 5_000 // 5s, 15s, 45s

export class BaileysBridge {
  private sock: WASocket | null = null
  private sessionId: string | null = null
  private orgId: string
  private supabase: SupabaseClient
  private outboxTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private disposed = false
  private lastActivity: string | null = null

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase
    this.orgId = orgId
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Start the bridge — creates a Baileys WASocket, sets up listeners,
   * and begins the outbox drain loop.
   */
  async start(): Promise<{ sessionId: string; qr?: string }> {
    const baileys = await loadBaileys()
    if (!baileys) {
      throw new Error('Baileys library not installed. Run: npm i @whiskeysockets/baileys')
    }

    // Load existing auth state from Supabase (if any)
    const authState = await this.loadAuthState()

    // Create session row
    const { data: session, error } = await this.supabase
      .from('whatsapp_sessions')
      .insert({
        org_id: this.orgId,
        status: 'pairing',
        auth_state: authState?.creds ? JSON.stringify(authState) : null,
      })
      .select('id')
      .single()

    if (error || !session) {
      throw new Error(`Failed to create session: ${error?.message ?? 'unknown'}`)
    }

    this.sessionId = session.id as string

    // Create socket
    const { state, saveCreds } = authState ??
      (await baileys.useMultiFileAuthState(`./auth_state_${this.orgId}`))

    this.sock = baileys.makeWASocket({
      auth: state,
      printQRInTerminal: false,
    })

    // ── Connection lifecycle events ───────────────────────────────────
    this.sock.ev.on('connection.update', async (update: Record<string, unknown>) => {
      if (this.disposed) return

      const { connection, lastDisconnect, qr } = update as {
        connection?: string
        lastDisconnect?: { error?: { output?: { statusCode?: number } } }
        qr?: string
      }

      if (qr) {
        // Store QR for frontend retrieval
        await this.supabase
          .from('whatsapp_sessions')
          .update({ status: 'pairing', qr_code: qr })
          .eq('id', this.sessionId!)

        console.log(JSON.stringify({
          level: 'info',
          module: 'baileys-bridge',
          event: 'qr_generated',
          org_id: this.orgId,
          session_id: this.sessionId,
        }))
      }

      if (connection === 'open') {
        this.reconnectAttempts = 0
        this.lastActivity = new Date().toISOString()

        await this.supabase
          .from('whatsapp_sessions')
          .update({ status: 'connected', qr_code: null })
          .eq('id', this.sessionId!)

        await this.logHealth(true)
        this.startOutboxDrain()

        console.log(JSON.stringify({
          level: 'info',
          module: 'baileys-bridge',
          event: 'connected',
          org_id: this.orgId,
        }))
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== 401 // 401 = logged out

        await this.supabase
          .from('whatsapp_sessions')
          .update({ status: 'disconnected' })
          .eq('id', this.sessionId!)

        await this.logHealth(false, `Disconnected (status ${statusCode})`)

        if (shouldReconnect && !this.disposed) {
          await this.attemptReconnect()
        } else {
          console.log(JSON.stringify({
            level: 'warn',
            module: 'baileys-bridge',
            event: 'logged_out',
            org_id: this.orgId,
            status_code: statusCode,
          }))
        }
      }
    })

    // ── Credential persistence ────────────────────────────────────────
    this.sock.ev.on('creds.update', async () => {
      if (this.disposed) return
      await saveCreds()
      // Also persist to Supabase for cross-restart recovery
      try {
        const credsJson = JSON.stringify(state)
        await this.supabase
          .from('whatsapp_sessions')
          .update({ auth_state: credsJson })
          .eq('id', this.sessionId!)
      } catch (err) {
        console.error('[baileys-bridge] Failed to persist auth state:', err)
      }
    })

    // ── Message receive loop ──────────────────────────────────────────
    this.sock.ev.on('messages.upsert', async (upsert: { messages: Array<Record<string, unknown>>; type: string }) => {
      if (this.disposed) return
      if (upsert.type !== 'notify') return

      for (const msg of upsert.messages) {
        try {
          await this.handleIncomingMessage(msg)
        } catch (err) {
          console.error('[baileys-bridge] Error handling message:', err)
        }
      }
    })

    return { sessionId: this.sessionId }
  }

  /**
   * Stop the bridge — disconnect socket and clean up timers.
   */
  async stop(): Promise<void> {
    this.disposed = true
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer)
      this.outboxTimer = null
    }
    if (this.sock) {
      this.sock.end(undefined)
      this.sock = null
    }
    if (this.sessionId) {
      await this.supabase
        .from('whatsapp_sessions')
        .update({ status: 'disconnected' })
        .eq('id', this.sessionId)
    }
  }

  /**
   * Get current bridge status.
   */
  async getStatus(): Promise<{
    status: 'connected' | 'disconnected' | 'pairing'
    sessionId: string | null
    qrCode: string | null
    sessionAge: number | null
    lastActivity: string | null
  }> {
    if (!this.sessionId) {
      return { status: 'disconnected', sessionId: null, qrCode: null, sessionAge: null, lastActivity: null }
    }

    const { data } = await this.supabase
      .from('whatsapp_sessions')
      .select('status, qr_code, created_at')
      .eq('id', this.sessionId)
      .single()

    if (!data) {
      return { status: 'disconnected', sessionId: this.sessionId, qrCode: null, sessionAge: null, lastActivity: null }
    }

    const createdAt = new Date(data.created_at as string)
    const ageHours = Math.round(((Date.now() - createdAt.getTime()) / (1000 * 60 * 60)) * 10) / 10

    return {
      status: data.status as 'connected' | 'disconnected' | 'pairing',
      sessionId: this.sessionId,
      qrCode: (data.qr_code as string) ?? null,
      sessionAge: ageHours,
      lastActivity: this.lastActivity,
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async handleIncomingMessage(msg: Record<string, unknown>): Promise<void> {
    const key = msg.key as Record<string, unknown> | undefined
    if (!key) return

    // Skip messages sent by us
    if (key.fromMe) return

    const jid = key.remoteJid as string
    if (!jid) return

    // Skip group messages and status broadcasts
    if (jid.endsWith('@g.us') || jid === 'status@broadcast') return

    const pushName = (msg.pushName as string) || jid
    const messageId = key.id as string
    const messageContent = msg.message as Record<string, unknown> | undefined
    if (!messageContent) return

    // Dedup check via external_id
    const { data: existing } = await this.supabase
      .from('channel_messages')
      .select('id')
      .eq('org_id', this.orgId)
      .eq('channel', 'whatsapp')
      .eq('external_id', messageId)
      .limit(1)

    if (existing && existing.length > 0) return

    // Determine message type and extract content
    let body: string
    let metadata: Record<string, unknown> = { source: 'baileys', jid }

    if (messageContent.conversation) {
      // Simple text message
      body = messageContent.conversation as string
    } else if (messageContent.extendedTextMessage) {
      // Extended text (with link preview, etc.)
      const ext = messageContent.extendedTextMessage as Record<string, unknown>
      body = (ext.text as string) || ''
    } else if (messageContent.audioMessage) {
      // Voice note or audio — download and transcribe
      const audioMsg = messageContent.audioMessage as Record<string, unknown>
      const mimeType = (audioMsg.mimetype as string) || 'audio/ogg'

      try {
        const baileys = await loadBaileys()
        if (!baileys) {
          body = '[Voice note - Baileys unavailable for download]'
        } else {
          const buffer = await baileys.downloadMediaMessage(msg, 'buffer', {})
          // Dynamic import to avoid circular dependency
          const { transcribeVoiceNote } = await import('./whatsapp-voice')
          const transcription = await transcribeVoiceNote(Buffer.from(buffer), mimeType)

          if (transcription) {
            body = transcription
            metadata = { ...metadata, voice_note: true, original_mime_type: mimeType }
          } else {
            body = '[Voice note - transcription unavailable]'
            metadata = { ...metadata, voice_note: true, transcription_failed: true }
          }
        }
      } catch (err) {
        console.error('[baileys-bridge] Failed to process voice note:', err)
        body = '[Voice note - transcription unavailable]'
        metadata = { ...metadata, voice_note: true, transcription_failed: true }
      }
    } else {
      // Unsupported message type — log but skip processing
      console.log(JSON.stringify({
        level: 'info',
        module: 'baileys-bridge',
        event: 'unsupported_message_type',
        org_id: this.orgId,
        types: Object.keys(messageContent),
      }))
      return
    }

    this.lastActivity = new Date().toISOString()

    // Insert into channel_messages
    const { data: insertedMsg, error } = await this.supabase
      .from('channel_messages')
      .insert({
        org_id: this.orgId,
        channel: 'whatsapp',
        external_id: messageId,
        sender: pushName,
        sender_email: jid.replace('@s.whatsapp.net', ''),
        subject: 'WhatsApp Message',
        body,
        received_at: new Date().toISOString(),
        is_actionable: !metadata.transcription_failed,
        priority: 'medium',
        metadata,
      })
      .select('*')
      .single()

    if (error) {
      console.error('[baileys-bridge] Failed to insert message:', error.message)
      return
    }

    if (insertedMsg) {
      // Process through the same pipeline as webhook messages
      processWhatsAppMessage(this.supabase, this.orgId, insertedMsg, body).catch(err => {
        console.error('[baileys-bridge] Failed to process message:', err)
      })
    }
  }

  private startOutboxDrain(): void {
    if (this.outboxTimer) return

    this.outboxTimer = setInterval(async () => {
      if (this.disposed || !this.sock) return

      try {
        const { data: pending } = await this.supabase
          .from('whatsapp_outbox')
          .select('*')
          .eq('org_id', this.orgId)
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(10)

        if (!pending || pending.length === 0) return

        for (const row of pending) {
          try {
            const recipient = row.recipient as string
            const jid = recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`

            await this.sock.sendMessage(jid, { text: row.body as string })

            await this.supabase
              .from('whatsapp_outbox')
              .update({ status: 'sent', sent_at: new Date().toISOString() })
              .eq('id', row.id)

            this.lastActivity = new Date().toISOString()
          } catch (err) {
            console.error('[baileys-bridge] Failed to send outbox message:', err)
            await this.supabase
              .from('whatsapp_outbox')
              .update({ status: 'failed', error: String(err) })
              .eq('id', row.id)
          }
        }
      } catch (err) {
        console.error('[baileys-bridge] Outbox drain error:', err)
      }
    }, OUTBOX_POLL_INTERVAL_MS)
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log(JSON.stringify({
        level: 'error',
        module: 'baileys-bridge',
        event: 'max_reconnect_reached',
        org_id: this.orgId,
        attempts: this.reconnectAttempts,
      }))
      await this.logHealth(false, `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`)
      return
    }

    this.reconnectAttempts++
    const delayMs = RECONNECT_BACKOFF_BASE_MS * Math.pow(3, this.reconnectAttempts - 1)

    console.log(JSON.stringify({
      level: 'info',
      module: 'baileys-bridge',
      event: 'reconnecting',
      org_id: this.orgId,
      attempt: this.reconnectAttempts,
      delay_ms: delayMs,
    }))

    await new Promise(resolve => setTimeout(resolve, delayMs))

    if (!this.disposed) {
      try {
        await this.start()
      } catch (err) {
        console.error('[baileys-bridge] Reconnect failed:', err)
        await this.attemptReconnect()
      }
    }
  }

  private async loadAuthState(): Promise<Record<string, unknown> | null> {
    const { data } = await this.supabase
      .from('whatsapp_sessions')
      .select('auth_state')
      .eq('org_id', this.orgId)
      .eq('status', 'connected')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (data?.auth_state) {
      try {
        return typeof data.auth_state === 'string'
          ? JSON.parse(data.auth_state as string)
          : (data.auth_state as Record<string, unknown>)
      } catch {
        return null
      }
    }
    return null
  }

  private async logHealth(connected: boolean, error?: string): Promise<void> {
    const status: WhatsAppSessionStatus = {
      connected,
      sessionAge: null,
      lastActivity: this.lastActivity,
      error,
    }
    try {
      await logSessionHealth(this.supabase, this.orgId, status)
    } catch (err) {
      console.error('[baileys-bridge] Failed to log health:', err)
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Active bridge instances by org_id */
const activeBridges = new Map<string, BaileysBridge>()

/**
 * Create and start a Baileys bridge for an organisation.
 * Returns existing bridge if one is already active.
 */
export async function createBridge(
  supabase: SupabaseClient,
  orgId: string
): Promise<BaileysBridge> {
  const existing = activeBridges.get(orgId)
  if (existing) return existing

  const bridge = new BaileysBridge(supabase, orgId)
  activeBridges.set(orgId, bridge)
  return bridge
}

/**
 * Get the active bridge for an org (if any).
 */
export function getActiveBridge(orgId: string): BaileysBridge | undefined {
  return activeBridges.get(orgId)
}

/**
 * Stop and remove the bridge for an org.
 */
export async function destroyBridge(orgId: string): Promise<void> {
  const bridge = activeBridges.get(orgId)
  if (bridge) {
    await bridge.stop()
    activeBridges.delete(orgId)
  }
}
