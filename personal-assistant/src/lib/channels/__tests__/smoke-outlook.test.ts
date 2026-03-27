/**
 * Outlook Channel Smoke Test
 *
 * Production verification test -- connects to Microsoft Graph API with real credentials.
 * Gated behind SMOKE_TEST=1 env var so it never runs in CI without credentials.
 *
 * Required env vars:
 *   SMOKE_TEST=1
 *   OUTLOOK_CLIENT_ID
 *   OUTLOOK_CLIENT_SECRET
 *   OUTLOOK_TENANT_ID
 *   OUTLOOK_USER_ID (for client-credentials flow)
 */
import { describe, it, expect } from 'vitest'
import { outlookAdapter } from '../outlook'
import { checkAdapterHealth } from '../health'

const SMOKE = Boolean(process.env.SMOKE_TEST)
const HAS_CREDENTIALS = Boolean(
  process.env.OUTLOOK_CLIENT_ID && process.env.OUTLOOK_CLIENT_SECRET,
)

describe.skipIf(!SMOKE)('Outlook Smoke Tests', () => {
  describe.skipIf(!HAS_CREDENTIALS)('with live credentials', () => {
    it('isAvailable returns true with Graph API credentials', { timeout: 30_000 }, async () => {
      const start = Date.now()
      const available = await outlookAdapter.isAvailable()
      const elapsed = Date.now() - start
      console.log(`[outlook] isAvailable: ${available} (${elapsed}ms)`)
      expect(available).toBe(true)
    })

    it('pulls messages via Graph API', { timeout: 30_000 }, async () => {
      const since = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
      const config: Record<string, unknown> = {
        client_id: process.env.OUTLOOK_CLIENT_ID || '',
        client_secret: process.env.OUTLOOK_CLIENT_SECRET || '',
        tenant_id: process.env.OUTLOOK_TENANT_ID || '',
        refresh_token: process.env.OUTLOOK_REFRESH_TOKEN || '',
      }

      const start = Date.now()
      const messages = await outlookAdapter.pull(config, since)
      const elapsed = Date.now() - start

      console.log(`[outlook] pull: ${messages.length} messages in ${elapsed}ms`)

      expect(Array.isArray(messages)).toBe(true)
      expect(elapsed).toBeLessThan(10_000) // Must complete within 10s
    })

    it('health check reports healthy', { timeout: 30_000 }, async () => {
      const start = Date.now()
      const report = await checkAdapterHealth(outlookAdapter)
      const elapsed = Date.now() - start

      console.log(
        `[outlook] health: ${report.status} (${report.latencyMs}ms, total ${elapsed}ms)`,
      )

      expect(report.channel).toBe('outlook')
      expect(report.status).not.toBe('down')
      expect(['healthy', 'degraded']).toContain(report.status)
    })
  })
})
