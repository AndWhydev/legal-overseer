/**
 * WhatsApp Bridge Manager — Baileys connection lifecycle for standalone Fly.io deployment.
 *
 * Manages bridge start/stop/reconnect, auth state persistence to both filesystem
 * (/data/auth_state/) and Supabase whatsapp_sessions.session_data column, outbox drain loop,
 * and health reporting.
 *
 * Environment variables:
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS)
 *   DEFAULT_ORG_ID            — Auto-start bridge for this org on boot
 *   BRIDGE_SECRET             — Bearer token for management endpoints
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Dynamic Baileys import
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
type BaileysModule = any
type WASocket = any
/* eslint-enable @typescript-eslint/no-explicit-any */

let _baileys: BaileysModule | null = null

async function loadBaileys(): Promise<BaileysModule> {
  if (_baileys) return _baileys
  _baileys = await import('@whiskeysockets/baileys')
  return _baileys
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OUTBOX_POLL_INTERVAL_MS = 5_000
const HEALTH_REPORT_INTERVAL_MS = 60_000
const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_BACKOFF_BASE_MS = 5_000 // 5s, 15s, 45s, 135s, 405s
const AUTH_STATE_DIR = '/data/auth_state'

// ---------------------------------------------------------------------------
// Supabase client singleton
// ---------------------------------------------------------------------------

let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase

  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _supabase
}

// ---------------------------------------------------------------------------
// Bridge state per org
// ---------------------------------------------------------------------------

interface BridgeState {
  sock: WASocket | null
  sessionId: string | null
  orgId: string
  outboxTimer: ReturnType<typeof setInterval> | null
  healthTimer: ReturnType<typeof setInterval> | null
  reconnectAttempts: number
  disposed: boolean
  lastActivity: string | null
  currentQr: string | null
  status: 'connected' | 'disconnected' | 'pairing' | 'reconnecting'
  startedAt: string
}

const bridges = new Map<string, BridgeState>()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the WhatsApp bridge for an organisation.
 * Creates Baileys WASocket, sets up listeners, begins outbox drain and health reporting.
 */
export async function startBridge(orgId: string): Promise<{
  sessionId: string
  status: string
  qr?: string
}> {
  // Return existing if already running
  const existing = bridges.get(orgId)
  if (existing && !existing.disposed) {
    return {
      sessionId: existing.sessionId ?? '',
      status: existing.status,
      qr: existing.currentQr ?? undefined,
    }
  }

  const supabase = getSupabase()
  const baileys = await loadBaileys()

  const state: BridgeState = {
    sock: null,
    sessionId: null,
    orgId,
    outboxTimer: null,
    healthTimer: null,
    reconnectAttempts: 0,
    disposed: false,
    lastActivity: null,
    currentQr: null,
    status: 'pairing',
    startedAt: new Date().toISOString(),
  }

  bridges.set(orgId, state)

  // Load or create auth state
  const authStatePath = join(AUTH_STATE_DIR, orgId)
  if (!existsSync(authStatePath)) {
    mkdirSync(authStatePath, { recursive: true })
  }

  // Try loading auth from Supabase first, fall back to filesystem
  const savedAuth = await loadAuthFromSupabase(supabase, orgId)
  if (savedAuth) {
    // Write to filesystem for Baileys useMultiFileAuthState
    try {
      writeFileSync(join(authStatePath, 'creds.json'), JSON.stringify(savedAuth))
    } catch {
      console.warn(`[bridge-manager] Could not write cached auth for org ${orgId}`)
    }
  }

  const { state: authState, saveCreds } = await baileys.useMultiFileAuthState(authStatePath)

  // Create session row in Supabase
  const { data: session, error } = await supabase
    .from('whatsapp_sessions')
    .insert({
      org_id: orgId,
      status: 'pairing',
      session_data: null,
    })
    .select('id')
    .single()

  if (error || !session) {
    bridges.delete(orgId)
    throw new Error(`Failed to create session: ${error?.message ?? 'unknown'}`)
  }

  state.sessionId = session.id as string

  // Create Baileys socket
  state.sock = baileys.makeWASocket({
    auth: authState,
    printQRInTerminal: false,
  })

  // ── Connection lifecycle events ─────────────────────────────────────
  state.sock.ev.on('connection.update', async (update: Record<string, unknown>) => {
    if (state.disposed) return

    const { connection, lastDisconnect, qr } = update as {
      connection?: string
      lastDisconnect?: { error?: { output?: { statusCode?: number } } }
      qr?: string
    }

    if (qr) {
      state.currentQr = qr
      state.status = 'pairing'

      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'pairing', qr_data: qr })
        .eq('id', state.sessionId!)

      console.log(JSON.stringify({
        level: 'info',
        module: 'bridge-manager',
        event: 'qr_generated',
        org_id: orgId,
        session_id: state.sessionId,
      }))
    }

    if (connection === 'open') {
      state.reconnectAttempts = 0
      state.lastActivity = new Date().toISOString()
      state.status = 'connected'
      state.currentQr = null

      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'connected', qr_data: null })
        .eq('id', state.sessionId!)

      await syncChannelConnection(supabase, orgId, 'connected')
      await logHealth(supabase, orgId, true)
      startOutboxDrain(state)
      startHealthReporting(state)

      console.log(JSON.stringify({
        level: 'info',
        module: 'bridge-manager',
        event: 'connected',
        org_id: orgId,
      }))
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = statusCode !== 401 // 401 = logged out

      state.status = 'disconnected'
      state.currentQr = null

      await supabase
        .from('whatsapp_sessions')
        .update({ status: 'disconnected' })
        .eq('id', state.sessionId!)

      await syncChannelConnection(supabase, orgId, 'disconnected')
      await logHealth(supabase, orgId, false, `Disconnected (status ${statusCode})`)

      if (shouldReconnect && !state.disposed) {
        await attemptReconnect(state)
      } else {
        console.log(JSON.stringify({
          level: 'warn',
          module: 'bridge-manager',
          event: 'logged_out',
          org_id: orgId,
          status_code: statusCode,
        }))
      }
    }
  })

  // ── Credential persistence ──────────────────────────────────────────
  state.sock.ev.on('creds.update', async () => {
    if (state.disposed) return
    await saveCreds()

    // Also persist to Supabase for cross-machine recovery
    try {
      const credsPath = join(authStatePath, 'creds.json')
      if (existsSync(credsPath)) {
        const credsJson = readFileSync(credsPath, 'utf-8')
        await supabase
          .from('whatsapp_sessions')
          .update({ session_data: credsJson })
          .eq('id', state.sessionId!)
      }
    } catch (err) {
      console.error('[bridge-manager] Failed to persist auth state:', err)
    }
  })

  // ── Message receive loop ────────────────────────────────────────────
  state.sock.ev.on('messages.upsert', async (upsert: { messages: Array<Record<string, unknown>>; type: string }) => {
    if (state.disposed) return
    if (upsert.type !== 'notify') return

    for (const msg of upsert.messages) {
      try {
        await handleIncomingMessage(supabase, state, msg)
      } catch (err) {
        console.error('[bridge-manager] Error handling message:', err)
      }
    }
  })

  return {
    sessionId: state.sessionId,
    status: state.status,
    qr: state.currentQr ?? undefined,
  }
}

/**
 * Stop the WhatsApp bridge for an organisation.
 */
export async function stopBridge(orgId: string): Promise<void> {
  const state = bridges.get(orgId)
  if (!state) return

  state.disposed = true
  state.status = 'disconnected'

  if (state.outboxTimer) {
    clearInterval(state.outboxTimer)
    state.outboxTimer = null
  }

  if (state.healthTimer) {
    clearInterval(state.healthTimer)
    state.healthTimer = null
  }

  if (state.sock) {
    state.sock.end(undefined)
    state.sock = null
  }

  if (state.sessionId) {
    const supabase = getSupabase()
    await supabase
      .from('whatsapp_sessions')
      .update({ status: 'disconnected' })
      .eq('id', state.sessionId)
  }

  bridges.delete(orgId)

  console.log(JSON.stringify({
    level: 'info',
    module: 'bridge-manager',
    event: 'stopped',
    org_id: orgId,
  }))
}

/**
 * Get detailed bridge status for an organisation.
 */
export function getBridgeStatus(orgId: string): {
  running: boolean
  status: string
  sessionId: string | null
  qrCode: string | null
  sessionAge: number | null
  lastActivity: string | null
  reconnectAttempts: number
} {
  const state = bridges.get(orgId)
  if (!state || state.disposed) {
    return {
      running: false,
      status: 'stopped',
      sessionId: null,
      qrCode: null,
      sessionAge: null,
      lastActivity: null,
      reconnectAttempts: 0,
    }
  }

  const startedAt = new Date(state.startedAt)
  const ageHours = Math.round(((Date.now() - startedAt.getTime()) / (1000 * 60 * 60)) * 10) / 10

  return {
    running: true,
    status: state.status,
    sessionId: state.sessionId,
    qrCode: state.currentQr,
    sessionAge: ageHours,
    lastActivity: state.lastActivity,
    reconnectAttempts: state.reconnectAttempts,
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function loadAuthFromSupabase(
  supabase: SupabaseClient,
  orgId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('session_data')
    .eq('org_id', orgId)
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (data?.session_data) {
    try {
      return typeof data.session_data === 'string'
        ? JSON.parse(data.session_data as string)
        : (data.session_data as Record<string, unknown>)
    } catch {
      return null
    }
  }
  return null
}

async function handleIncomingMessage(
  supabase: SupabaseClient,
  state: BridgeState,
  msg: Record<string, unknown>
): Promise<void> {
  const key = msg.key as Record<string, unknown> | undefined
  if (!key) return

  const fromMe = !!key.fromMe
  const jid = key.remoteJid as string
  if (!jid) return

  // Skip group messages and status broadcasts
  if (jid.endsWith('@g.us') || jid === 'status@broadcast') return

  const pushName = fromMe ? 'Me' : ((msg.pushName as string) || jid)
  const messageId = key.id as string
  const messageContent = msg.message as Record<string, unknown> | undefined
  if (!messageContent) return

  // Dedup check via external_id
  const { data: existing } = await supabase
    .from('channel_messages')
    .select('id')
    .eq('org_id', state.orgId)
    .eq('channel', 'whatsapp')
    .eq('external_id', messageId)
    .limit(1)

  if (existing && existing.length > 0) return

  // Determine message type and extract content
  let body: string
  const metadata: Record<string, unknown> = {
    source: 'baileys-bridge',
    jid,
    from_me: fromMe,
    direction: fromMe ? 'outbound' : 'inbound',
  }

  if (messageContent.conversation) {
    body = messageContent.conversation as string
  } else if (messageContent.extendedTextMessage) {
    const ext = messageContent.extendedTextMessage as Record<string, unknown>
    body = (ext.text as string) || ''
  } else {
    // Log unsupported types but skip processing
    console.log(JSON.stringify({
      level: 'info',
      module: 'bridge-manager',
      event: 'unsupported_message_type',
      org_id: state.orgId,
      types: Object.keys(messageContent),
    }))
    return
  }

  state.lastActivity = new Date().toISOString()

  // Insert into channel_messages
  const { error } = await supabase
    .from('channel_messages')
    .insert({
      org_id: state.orgId,
      channel: 'whatsapp',
      external_id: messageId,
      sender: pushName,
      sender_email: jid.replace('@s.whatsapp.net', ''),
      subject: 'WhatsApp Message',
      body,
      received_at: new Date().toISOString(),
      is_actionable: !fromMe,
      priority: 'medium',
      metadata,
    })

  if (error) {
    console.error('[bridge-manager] Failed to insert message:', error.message)
  }
}

function startOutboxDrain(state: BridgeState): void {
  if (state.outboxTimer) return

  const supabase = getSupabase()

  state.outboxTimer = setInterval(async () => {
    if (state.disposed || !state.sock) return

    try {
      const { data: pending } = await supabase
        .from('whatsapp_outbox')
        .select('*')
        .eq('org_id', state.orgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10)

      if (!pending || pending.length === 0) return

      for (const row of pending) {
        try {
          const recipient = row.recipient as string
          const jid = recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`

          await state.sock.sendMessage(jid, { text: row.body as string })

          await supabase
            .from('whatsapp_outbox')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', row.id)

          state.lastActivity = new Date().toISOString()
        } catch (err) {
          console.error('[bridge-manager] Failed to send outbox message:', err)
          await supabase
            .from('whatsapp_outbox')
            .update({ status: 'failed', error: String(err) })
            .eq('id', row.id)
        }
      }
    } catch (err) {
      console.error('[bridge-manager] Outbox drain error:', err)
    }
  }, OUTBOX_POLL_INTERVAL_MS)
}

function startHealthReporting(state: BridgeState): void {
  if (state.healthTimer) return

  const supabase = getSupabase()

  // Report immediately on start
  logHealth(supabase, state.orgId, true).catch(() => {})

  state.healthTimer = setInterval(async () => {
    if (state.disposed) return

    const connected = state.status === 'connected'
    await logHealth(supabase, state.orgId, connected).catch((err) => {
      console.error('[bridge-manager] Health report failed:', err)
    })
  }, HEALTH_REPORT_INTERVAL_MS)
}

async function logHealth(
  supabase: SupabaseClient,
  orgId: string,
  connected: boolean,
  error?: string
): Promise<void> {
  await supabase
    .from('channel_health')
    .upsert({
      org_id: orgId,
      channel: 'whatsapp',
      status: connected ? 'healthy' : 'unhealthy',
      last_check: new Date().toISOString(),
      details: JSON.stringify({
        bridge: 'baileys',
        connected,
        error: error ?? null,
      }),
    }, {
      onConflict: 'org_id,channel',
    })
}

async function syncChannelConnection(
  supabase: SupabaseClient,
  orgId: string,
  status: 'connected' | 'disconnected'
): Promise<void> {
  try {
    // Sync to channel_connections
    const { error: ccErr } = await supabase.from('channel_connections').upsert(
      {
        org_id: orgId,
        channel_type: 'whatsapp',
        status,
        relay_enabled: false,
        config: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,channel_type' },
    )
    if (ccErr) {
      console.error('[bridge-manager] channel_connections sync failed:', ccErr.message)
    }

    // Sync to org_integrations (read by settings page)
    const { error: oiErr } = await supabase.from('org_integrations').upsert(
      {
        org_id: orgId,
        provider: 'whatsapp',
        status,
        metadata: { source: 'baileys-bridge' },
        ...(status === 'connected' ? { connected_at: new Date().toISOString() } : {}),
      },
      { onConflict: 'org_id,provider' },
    )
    if (oiErr) {
      console.error('[bridge-manager] org_integrations sync failed:', oiErr.message)
    }

    console.log(`[bridge-manager] connection synced: whatsapp=${status} for org ${orgId}`)
  } catch (err) {
    console.error('[bridge-manager] Failed to sync channel connection:', err)
  }
}

async function attemptReconnect(state: BridgeState): Promise<void> {
  if (state.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(JSON.stringify({
      level: 'error',
      module: 'bridge-manager',
      event: 'max_reconnect_reached',
      org_id: state.orgId,
      attempts: state.reconnectAttempts,
    }))

    await logHealth(getSupabase(), state.orgId, false, `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) exceeded`)

    // Alert via notifications table
    try {
      await getSupabase()
        .from('notifications')
        .insert({
          org_id: state.orgId,
          type: 'whatsapp_bridge_down',
          title: 'WhatsApp Bridge Disconnected',
          body: `Bridge failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts. Manual intervention required.`,
          channel: 'dashboard',
          status: 'pending',
        })
    } catch (err) {
      console.error('[bridge-manager] Failed to create alert notification:', err)
    }

    return
  }

  state.reconnectAttempts++
  state.status = 'reconnecting'
  const delayMs = RECONNECT_BACKOFF_BASE_MS * Math.pow(3, state.reconnectAttempts - 1)

  console.log(JSON.stringify({
    level: 'info',
    module: 'bridge-manager',
    event: 'reconnecting',
    org_id: state.orgId,
    attempt: state.reconnectAttempts,
    delay_ms: delayMs,
  }))

  await new Promise(resolve => setTimeout(resolve, delayMs))

  if (!state.disposed) {
    // Clean up old socket
    if (state.sock) {
      try { state.sock.end(undefined) } catch { /* ignore */ }
      state.sock = null
    }

    // Remove from bridges map so startBridge creates fresh state
    bridges.delete(state.orgId)

    try {
      await startBridge(state.orgId)
    } catch (err) {
      console.error('[bridge-manager] Reconnect failed:', err)
      // Restore state for next attempt tracking
      state.sock = null
      bridges.set(state.orgId, state)
      await attemptReconnect(state)
    }
  }
}
