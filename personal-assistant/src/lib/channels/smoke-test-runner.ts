/**
 * Unified Smoke Test Runner
 *
 * Programmatic runner for all channel smoke tests. Can be called from cron,
 * API endpoints, or the monitoring dashboard. Produces a structured report
 * with per-channel status, latency, and overall health verdict.
 *
 * All channel checks run in parallel with 15-second timeouts and never throw.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChannelType } from './types'
import { gmailAdapter } from './gmail'
import { outlookAdapter } from './outlook'
import { checkAdapterHealth } from './health'
import { checkWhatsAppSession } from './whatsapp-monitor'
import { sendSMS } from './sms'
import { getOrgCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChannelSmokeResult {
  channel: ChannelType
  status: 'pass' | 'fail' | 'skip'
  latencyMs: number
  message: string
  error?: string
  testedAt: string
}

export interface SmokeTestReport {
  overall: 'pass' | 'fail' | 'partial'
  channels: ChannelSmokeResult[]
  duration_ms: number
  testedAt: string
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

const CHANNEL_TIMEOUT_MS = 15_000

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

// ---------------------------------------------------------------------------
// Individual channel smoke tests
// ---------------------------------------------------------------------------

async function smokeGmail(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ChannelSmokeResult> {
  const start = Date.now()
  const testedAt = new Date().toISOString()

  try {
    // Health check via adapter
    const health = await withTimeout(
      checkAdapterHealth(gmailAdapter),
      CHANNEL_TIMEOUT_MS,
      'Gmail health',
    )

    if (health.status === 'down') {
      return {
        channel: 'gmail',
        status: 'fail',
        latencyMs: Date.now() - start,
        message: `Health check: ${health.status}`,
        error: health.error,
        testedAt,
      }
    }

    // Attempt pull with org credentials
    const creds = await getOrgCredential(supabase, orgId, 'gmail')
    if (creds) {
      const since = new Date(Date.now() - 5 * 60 * 1000)
      const messages = await withTimeout(
        gmailAdapter.pull(creds, since),
        CHANNEL_TIMEOUT_MS,
        'Gmail pull',
      )

      return {
        channel: 'gmail',
        status: 'pass',
        latencyMs: Date.now() - start,
        message: `Health: ${health.status}, pulled ${messages.length} messages`,
        testedAt,
      }
    }

    return {
      channel: 'gmail',
      status: health.status === 'healthy' ? 'pass' : 'fail',
      latencyMs: Date.now() - start,
      message: `Health: ${health.status} (no org credentials for pull test)`,
      testedAt,
    }
  } catch (err) {
    return {
      channel: 'gmail',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: 'Gmail smoke test failed',
      error: err instanceof Error ? err.message : String(err),
      testedAt,
    }
  }
}

async function smokeOutlook(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ChannelSmokeResult> {
  const start = Date.now()
  const testedAt = new Date().toISOString()

  try {
    const health = await withTimeout(
      checkAdapterHealth(outlookAdapter),
      CHANNEL_TIMEOUT_MS,
      'Outlook health',
    )

    if (health.status === 'down') {
      return {
        channel: 'outlook',
        status: 'fail',
        latencyMs: Date.now() - start,
        message: `Health check: ${health.status}`,
        error: health.error,
        testedAt,
      }
    }

    // Attempt pull with org credentials
    const creds = await getOrgCredential(supabase, orgId, 'outlook')
    if (creds) {
      const since = new Date(Date.now() - 5 * 60 * 1000)
      const messages = await withTimeout(
        outlookAdapter.pull(creds, since),
        CHANNEL_TIMEOUT_MS,
        'Outlook pull',
      )

      return {
        channel: 'outlook',
        status: 'pass',
        latencyMs: Date.now() - start,
        message: `Health: ${health.status}, pulled ${messages.length} messages`,
        testedAt,
      }
    }

    return {
      channel: 'outlook',
      status: health.status === 'healthy' ? 'pass' : 'fail',
      latencyMs: Date.now() - start,
      message: `Health: ${health.status} (no org credentials for pull test)`,
      testedAt,
    }
  } catch (err) {
    return {
      channel: 'outlook',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: 'Outlook smoke test failed',
      error: err instanceof Error ? err.message : String(err),
      testedAt,
    }
  }
}

async function smokeWhatsApp(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ChannelSmokeResult> {
  const start = Date.now()
  const testedAt = new Date().toISOString()

  try {
    const bridgeUrl =
      process.env.WHATSAPP_BRIDGE_URL || 'https://bitbit-wa-bridge.fly.dev'

    // Check bridge health endpoint
    const healthRes = await withTimeout(
      fetch(`${bridgeUrl}/health`),
      CHANNEL_TIMEOUT_MS,
      'WhatsApp bridge health',
    )

    if (!healthRes.ok) {
      return {
        channel: 'whatsapp',
        status: 'fail',
        latencyMs: Date.now() - start,
        message: `Bridge health returned ${healthRes.status}`,
        error: `HTTP ${healthRes.status}`,
        testedAt,
      }
    }

    // Check session status via Supabase
    const session = await withTimeout(
      checkWhatsAppSession(supabase, orgId),
      CHANNEL_TIMEOUT_MS,
      'WhatsApp session check',
    )

    const sessionInfo = session.connected
      ? `connected (${session.sessionAge}h uptime)`
      : `disconnected: ${session.error || 'unknown'}`

    return {
      channel: 'whatsapp',
      status: session.connected ? 'pass' : 'fail',
      latencyMs: Date.now() - start,
      message: `Bridge: healthy, Session: ${sessionInfo}`,
      error: session.error,
      testedAt,
    }
  } catch (err) {
    return {
      channel: 'whatsapp',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: 'WhatsApp smoke test failed',
      error: err instanceof Error ? err.message : String(err),
      testedAt,
    }
  }
}

async function smokeSMS(): Promise<ChannelSmokeResult> {
  const start = Date.now()
  const testedAt = new Date().toISOString()

  const apiKey = process.env.TELNYX_API_KEY
  if (!apiKey) {
    return {
      channel: 'sms',
      status: 'skip',
      latencyMs: 0,
      message: 'No TELNYX_API_KEY configured',
      testedAt,
    }
  }

  try {
    // Validate API key
    const res = await withTimeout(
      fetch('https://api.telnyx.com/v2/messaging_profiles', {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      }),
      CHANNEL_TIMEOUT_MS,
      'Telnyx API validation',
    )

    if (!res.ok) {
      return {
        channel: 'sms',
        status: 'fail',
        latencyMs: Date.now() - start,
        message: `Telnyx API key invalid (${res.status})`,
        error: `HTTP ${res.status}`,
        testedAt,
      }
    }

    // Optional: send test ping if SMOKE_TEST_PHONE is set
    const testPhone = process.env.SMOKE_TEST_PHONE
    if (testPhone) {
      const result = await withTimeout(
        sendSMS(testPhone, `BitBit smoke ping ${new Date().toISOString()}`),
        CHANNEL_TIMEOUT_MS,
        'SMS send test',
      )

      return {
        channel: 'sms',
        status: result.success ? 'pass' : 'fail',
        latencyMs: Date.now() - start,
        message: result.success
          ? `API key valid, test SMS sent (${result.messageId})`
          : `API key valid, send failed: ${result.error}`,
        error: result.success ? undefined : result.error,
        testedAt,
      }
    }

    return {
      channel: 'sms',
      status: 'pass',
      latencyMs: Date.now() - start,
      message: 'API key valid (no SMOKE_TEST_PHONE for send test)',
      testedAt,
    }
  } catch (err) {
    return {
      channel: 'sms',
      status: 'fail',
      latencyMs: Date.now() - start,
      message: 'SMS smoke test failed',
      error: err instanceof Error ? err.message : String(err),
      testedAt,
    }
  }
}

// ---------------------------------------------------------------------------
// Individual channel runner
// ---------------------------------------------------------------------------

/**
 * Run smoke test for a single channel.
 */
export async function runChannelSmoke(
  channel: ChannelType,
  supabase: SupabaseClient,
  orgId: string,
): Promise<ChannelSmokeResult> {
  switch (channel) {
    case 'gmail':
      return smokeGmail(supabase, orgId)
    case 'outlook':
      return smokeOutlook(supabase, orgId)
    case 'whatsapp':
      return smokeWhatsApp(supabase, orgId)
    case 'sms':
      return smokeSMS()
    default:
      return {
        channel,
        status: 'skip',
        latencyMs: 0,
        message: `No smoke test defined for channel: ${channel}`,
        testedAt: new Date().toISOString(),
      }
  }
}

// ---------------------------------------------------------------------------
// Full suite runner
// ---------------------------------------------------------------------------

/**
 * Run all 4 channel smoke tests in parallel and produce a structured report.
 * Never throws -- always returns a complete report.
 */
export async function runAllSmokeTests(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SmokeTestReport> {
  const start = Date.now()
  const testedAt = new Date().toISOString()

  const results = await Promise.allSettled([
    smokeGmail(supabase, orgId),
    smokeOutlook(supabase, orgId),
    smokeWhatsApp(supabase, orgId),
    smokeSMS(),
  ])

  const channels: ChannelSmokeResult[] = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value
    }

    const channelNames: ChannelType[] = ['gmail', 'outlook', 'whatsapp', 'sms']
    return {
      channel: channelNames[i],
      status: 'fail' as const,
      latencyMs: Date.now() - start,
      message: 'Unexpected error during smoke test',
      error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      testedAt,
    }
  })

  // Compute overall status
  const nonSkipped = channels.filter((c) => c.status !== 'skip')
  const allPass = nonSkipped.length > 0 && nonSkipped.every((c) => c.status === 'pass')
  const anyFail = nonSkipped.some((c) => c.status === 'fail')
  const overall: SmokeTestReport['overall'] = allPass
    ? 'pass'
    : anyFail
      ? 'fail'
      : 'partial'

  return {
    overall,
    channels,
    duration_ms: Date.now() - start,
    testedAt,
  }
}
