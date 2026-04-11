/**
 * WhatsApp Bridge HTTP Server — Management API for the standalone Baileys bridge.
 *
 * Plain Node.js HTTP server (same pattern as deployments/fly/src/worker.ts).
 * Auto-starts bridge on boot using DEFAULT_ORG_ID env var.
 *
 * Routes:
 *   GET  /health         — Bridge health status (public, used by fly.toml checks)
 *   POST /bridge/start   — Start bridge for an org (requires BRIDGE_SECRET)
 *   POST /bridge/stop    — Stop bridge for an org (requires BRIDGE_SECRET)
 *   GET  /bridge/status  — Detailed bridge status (requires BRIDGE_SECRET)
 *   GET  /bridge/qr      — Current QR code if in pairing state (requires BRIDGE_SECRET)
 *
 * Environment variables:
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (bypasses RLS)
 *   DEFAULT_ORG_ID            — Auto-start bridge for this org on boot
 *   BRIDGE_SECRET             — Bearer token for management endpoints
 *   PORT                      — HTTP port (default 3000)
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { startBridge, stopBridge, getBridgeStatus } from './bridge-manager.js'

const PORT = parseInt(process.env.PORT || '3000', 10)
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || ''
const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID || ''

// ─── Request body parser ──────────────────────────────────────────

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8')
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

// ─── JSON response helper ─────────────────────────────────────────

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

// ─── Auth middleware ───────────────────────────────────────────────

function isAuthorized(req: IncomingMessage): boolean {
  if (!BRIDGE_SECRET) {
    console.warn('[server] BRIDGE_SECRET not set — all management requests denied')
    return false
  }

  const authHeader = req.headers.authorization || ''
  return authHeader === `Bearer ${BRIDGE_SECRET}`
}

// ─── Route handlers ───────────────────────────────────────────────

async function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const orgId = DEFAULT_ORG_ID
  if (orgId) {
    const status = getBridgeStatus(orgId)
    json(res, 200, {
      ok: status.running && status.status === 'connected',
      bridge: status,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  } else {
    json(res, 200, {
      ok: true,
      bridge: null,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  }
}

async function handleBridgeStart(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!isAuthorized(req)) {
    json(res, 401, { error: 'Unauthorized' })
    return
  }

  let body: Record<string, unknown>
  try {
    body = await parseBody(req)
  } catch {
    json(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const orgId = (body.org_id as string) || DEFAULT_ORG_ID
  if (!orgId) {
    json(res, 400, { error: 'org_id required (in body or DEFAULT_ORG_ID env)' })
    return
  }

  try {
    const result = await startBridge(orgId)
    json(res, 200, { ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[server] Failed to start bridge for ${orgId}: ${message}`)
    json(res, 500, { error: 'Failed to start bridge', detail: message })
  }
}

async function handleBridgeStop(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!isAuthorized(req)) {
    json(res, 401, { error: 'Unauthorized' })
    return
  }

  let body: Record<string, unknown>
  try {
    body = await parseBody(req)
  } catch {
    json(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const orgId = (body.org_id as string) || DEFAULT_ORG_ID
  if (!orgId) {
    json(res, 400, { error: 'org_id required' })
    return
  }

  try {
    await stopBridge(orgId)
    json(res, 200, { ok: true, stopped: orgId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    json(res, 500, { error: 'Failed to stop bridge', detail: message })
  }
}

async function handleBridgeStatus(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!isAuthorized(req)) {
    json(res, 401, { error: 'Unauthorized' })
    return
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const orgId = url.searchParams.get('org_id') || DEFAULT_ORG_ID

  if (!orgId) {
    json(res, 400, { error: 'org_id required (query param or DEFAULT_ORG_ID env)' })
    return
  }

  const status = getBridgeStatus(orgId)
  json(res, 200, { ok: true, ...status })
}

async function handleBridgeQr(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  if (!isAuthorized(req)) {
    json(res, 401, { error: 'Unauthorized' })
    return
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const orgId = url.searchParams.get('org_id') || DEFAULT_ORG_ID

  if (!orgId) {
    json(res, 400, { error: 'org_id required' })
    return
  }

  const status = getBridgeStatus(orgId)

  if (status.qrCode) {
    json(res, 200, { ok: true, qr: status.qrCode, status: status.status })
  } else {
    json(res, 200, {
      ok: true,
      qr: null,
      status: status.status,
      message: status.status === 'connected'
        ? 'Already connected, no QR needed'
        : 'No QR available — bridge may not be running or already paired',
    })
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`)
  const method = req.method || 'GET'

  try {
    if (method === 'GET' && url.pathname === '/health') {
      await handleHealth(req, res)
    } else if (method === 'POST' && url.pathname === '/bridge/start') {
      await handleBridgeStart(req, res)
    } else if (method === 'POST' && url.pathname === '/bridge/stop') {
      await handleBridgeStop(req, res)
    } else if (method === 'GET' && url.pathname === '/bridge/status') {
      await handleBridgeStatus(req, res)
    } else if (method === 'GET' && url.pathname === '/bridge/qr') {
      await handleBridgeQr(req, res)
    } else {
      json(res, 404, { error: 'Not found' })
    }
  } catch (err) {
    console.error(`[server] Unhandled error: ${err}`)
    json(res, 500, { error: 'Internal server error' })
  }
})

server.listen(PORT, () => {
  console.log(`[whatsapp-bridge] Server listening on port ${PORT}`)
  console.log(`[whatsapp-bridge] Health: http://localhost:${PORT}/health`)

  // Auto-start bridge for default org
  if (DEFAULT_ORG_ID) {
    console.log(`[whatsapp-bridge] Auto-starting bridge for org ${DEFAULT_ORG_ID}`)
    startBridge(DEFAULT_ORG_ID)
      .then((result) => {
        console.log(`[whatsapp-bridge] Bridge started: ${JSON.stringify(result)}`)
      })
      .catch((err) => {
        console.error(`[whatsapp-bridge] Auto-start failed: ${err}`)
      })
  } else {
    console.warn('[whatsapp-bridge] No DEFAULT_ORG_ID set — bridge not auto-started')
  }
})

// ─── Graceful shutdown ────────────────────────────────────────────

function shutdown(signal: string): void {
  console.log(`[whatsapp-bridge] Received ${signal}, shutting down gracefully...`)

  // Stop all bridges
  if (DEFAULT_ORG_ID) {
    stopBridge(DEFAULT_ORG_ID).catch(() => {})
  }

  server.close(() => {
    console.log('[whatsapp-bridge] Server closed, exiting.')
    process.exit(0)
  })

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('[whatsapp-bridge] Forced shutdown after timeout')
    process.exit(1)
  }, 10_000)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export { server }
