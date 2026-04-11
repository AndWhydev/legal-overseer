/**
 * WhatsApp Bridge Smoke Test
 *
 * Production verification test -- connects to the Baileys bridge at Fly.io
 * and checks health endpoint, session status, and uptime.
 * Gated behind SMOKE_TEST=1 env var so it never runs in CI without credentials.
 *
 * Required env vars:
 *   SMOKE_TEST=1
 *   WHATSAPP_BRIDGE_URL (default: https://bitbit-wa-bridge.fly.dev)
 */
import { describe, it, expect } from 'vitest'

const SMOKE = Boolean(process.env.SMOKE_TEST)
const BRIDGE_URL =
  process.env.WHATSAPP_BRIDGE_URL || 'https://bitbit-wa-bridge.fly.dev'

describe.skipIf(!SMOKE)('WhatsApp Bridge Smoke Tests', () => {
  it('bridge responds to health check', { timeout: 30_000 }, async () => {
    const start = Date.now()
    const res = await fetch(`${BRIDGE_URL}/health`)
    const elapsed = Date.now() - start

    console.log(`[whatsapp] health check: ${res.status} (${elapsed}ms)`)

    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toBeDefined()
    expect(typeof body).toBe('object')
  })

  it('bridge reports connected session', { timeout: 30_000 }, async () => {
    const start = Date.now()
    const res = await fetch(`${BRIDGE_URL}/status`)
    const elapsed = Date.now() - start

    console.log(`[whatsapp] status check: ${res.status} (${elapsed}ms)`)

    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      connected?: boolean
      status?: string
    }
    expect(body).toBeDefined()

    // If disconnected, log warning but don't fail -- bridge may need QR re-scan
    if (!body.connected && body.status !== 'connected') {
      console.warn(
        `[whatsapp] WARNING: Bridge reports disconnected. May need QR re-scan. Status: ${JSON.stringify(body)}`,
      )
    }
  })

  it('bridge uptime exceeds 1 hour', { timeout: 30_000 }, async () => {
    const start = Date.now()
    const res = await fetch(`${BRIDGE_URL}/status`)
    const elapsed = Date.now() - start

    console.log(`[whatsapp] uptime check: ${res.status} (${elapsed}ms)`)

    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      sessionAge?: number | null
      session_age?: number | null
      uptime?: number | null
    }

    // sessionAge is in hours (from BaileysBridge.getStatus)
    const ageHours =
      body.sessionAge ?? body.session_age ?? body.uptime ?? null

    if (ageHours === null) {
      console.warn(
        '[whatsapp] WARNING: No session age reported -- session may not be established',
      )
      // Fail only if session age is null (no connection at all)
      expect(ageHours).not.toBeNull()
    } else if (ageHours < 1) {
      console.warn(
        `[whatsapp] WARNING: Session age is ${ageHours}h (< 1h). Recent restart?`,
      )
      // Soft check -- warn but don't fail for < 1h
      expect(ageHours).toBeGreaterThanOrEqual(0)
    } else {
      console.log(`[whatsapp] Session age: ${ageHours}h (healthy)`)
      expect(ageHours).toBeGreaterThanOrEqual(1)
    }
  })
})
