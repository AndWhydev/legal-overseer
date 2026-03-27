/**
 * Gmail Channel Smoke Test
 *
 * Production verification test -- connects to real Gmail API with real credentials.
 * Gated behind SMOKE_TEST=1 env var so it never runs in CI without credentials.
 *
 * Required env vars:
 *   SMOKE_TEST=1
 *   GMAIL_ACCESS_TOKEN (or GMAIL_USER + GMAIL_APP_PASSWORD for IMAP)
 */
import { describe, it, expect } from 'vitest'
import { gmailAdapter } from '../gmail'
import { checkAdapterHealth } from '../health'

const SMOKE = Boolean(process.env.SMOKE_TEST)
const HAS_CREDENTIALS = Boolean(
  process.env.GMAIL_ACCESS_TOKEN ||
    (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
)

describe.skipIf(!SMOKE)('Gmail Smoke Tests', () => {
  describe.skipIf(!HAS_CREDENTIALS)('with live credentials', () => {
    it('isAvailable returns true', { timeout: 30_000 }, async () => {
      const start = Date.now()
      const available = await gmailAdapter.isAvailable()
      const elapsed = Date.now() - start
      console.log(`[gmail] isAvailable: ${available} (${elapsed}ms)`)
      expect(available).toBe(true)
    })

    it('pulls messages within poll interval', { timeout: 30_000 }, async () => {
      const since = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
      const config: Record<string, unknown> = {
        mode: 'api',
        oauth: {
          client_id: process.env.GOOGLE_CLIENT_ID || '',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          refresh_token: process.env.GOOGLE_REFRESH_TOKEN || '',
          access_token: process.env.GMAIL_ACCESS_TOKEN || '',
        },
      }

      const start = Date.now()
      const messages = await gmailAdapter.pull(config, since)
      const elapsed = Date.now() - start

      console.log(`[gmail] pull: ${messages.length} messages in ${elapsed}ms`)

      expect(Array.isArray(messages)).toBe(true)
      expect(elapsed).toBeLessThan(10_000) // Must complete within 10s
    })

    it('health check reports healthy', { timeout: 30_000 }, async () => {
      const start = Date.now()
      const report = await checkAdapterHealth(gmailAdapter)
      const elapsed = Date.now() - start

      console.log(
        `[gmail] health: ${report.status} (${report.latencyMs}ms, total ${elapsed}ms)`,
      )

      expect(report.channel).toBe('gmail')
      expect(report.status).not.toBe('down')
      expect(['healthy', 'degraded']).toContain(report.status)
    })
  })
})
