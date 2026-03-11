#!/usr/bin/env npx tsx
/**
 * Channel Smoke Test Script
 *
 * Exercises live channel endpoints against the deployed BitBit application
 * to verify credentials are working in production.
 *
 * Usage: npx tsx scripts/channel-smoke-test.ts https://app.bitbit.chat
 *
 * Outputs:
 *   - Colorized pass/fail per test to console
 *   - JSON report to scripts/smoke-test-results.json
 *
 * Exit code 0 = all tests pass, 1 = one or more failures
 */

import { resolve } from 'path'
import { existsSync, writeFileSync, readFileSync } from 'fs'

// ─── Env Loading ─────────────────────────────────────────────────────

const envPath = resolve(__dirname, '..', 'personal-assistant', '.env.local')
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

// ─── Types ───────────────────────────────────────────────────────────

type TestStatus = 'PASS' | 'FAIL' | 'SKIP'

interface TestResult {
  name: string
  status: TestStatus
  detail: string
  durationMs: number
  httpStatus?: number
}

// ─── Color Helpers ───────────────────────────────────────────────────

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}

function statusColor(status: TestStatus): string {
  switch (status) {
    case 'PASS':
      return colors.green(status)
    case 'FAIL':
      return colors.red(status)
    case 'SKIP':
      return colors.yellow(status)
  }
}

// ─── HTTP Helper ─────────────────────────────────────────────────────

const REQUEST_TIMEOUT = 10_000

async function timedFetch(
  url: string,
  options: RequestInit = {}
): Promise<{ response: Response; durationMs: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  const start = Date.now()

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: 'manual',
    })
    const durationMs = Date.now() - start
    clearTimeout(timeout)
    return { response, durationMs }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

// ─── Test Definitions ────────────────────────────────────────────────

async function testHealthCheck(baseUrl: string): Promise<TestResult> {
  const name = 'Health check'
  const start = Date.now()
  try {
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/api/monitoring/health`
    )
    if (response.status >= 200 && response.status < 300) {
      return {
        name,
        status: 'PASS',
        detail: `App is running (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }
    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status}`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testChannelStatus(baseUrl: string): Promise<TestResult> {
  const name = 'Channel status API'
  const start = Date.now()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceKey) {
    return {
      name,
      status: 'SKIP',
      detail: 'SUPABASE_SERVICE_ROLE_KEY not set',
      durationMs: 0,
    }
  }

  try {
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/api/channels/status`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    )
    if (response.status >= 200 && response.status < 300) {
      const body = await response.text()
      return {
        name,
        status: 'PASS',
        detail: `Channels reported (${durationMs}ms, ${body.length} bytes)`,
        durationMs,
        httpStatus: response.status,
      }
    }
    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status}`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testGmailOAuthStart(baseUrl: string): Promise<TestResult> {
  const name = 'Gmail OAuth redirect'
  const start = Date.now()
  try {
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/api/auth/oauth/start?provider=gmail`
    )
    const location = response.headers.get('location') || ''

    if (
      (response.status === 302 || response.status === 307) &&
      location.includes('accounts.google.com')
    ) {
      return {
        name,
        status: 'PASS',
        detail: `Redirect to accounts.google.com (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    // Some implementations return 200 with a redirect URL in the body
    if (response.status === 200) {
      const body = await response.text()
      if (body.includes('accounts.google.com')) {
        return {
          name,
          status: 'PASS',
          detail: `OAuth URL contains accounts.google.com (${durationMs}ms)`,
          durationMs,
          httpStatus: response.status,
        }
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status}, Location: ${location || '(none)'}`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testOutlookOAuthStart(baseUrl: string): Promise<TestResult> {
  const name = 'Outlook OAuth redirect'
  const start = Date.now()
  try {
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/api/auth/oauth/start?provider=outlook`
    )
    const location = response.headers.get('location') || ''

    if (
      (response.status === 302 || response.status === 307) &&
      location.includes('login.microsoftonline.com')
    ) {
      return {
        name,
        status: 'PASS',
        detail: `Redirect to login.microsoftonline.com (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    if (response.status === 200) {
      const body = await response.text()
      if (body.includes('login.microsoftonline.com')) {
        return {
          name,
          status: 'PASS',
          detail: `OAuth URL contains login.microsoftonline.com (${durationMs}ms)`,
          durationMs,
          httpStatus: response.status,
        }
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status}, Location: ${location || '(none)'}`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testRelayDaemon(baseUrl: string): Promise<TestResult> {
  const name = 'Relay daemon trigger'
  const start = Date.now()
  const relaySecret = process.env.RELAY_SECRET

  if (!relaySecret) {
    return {
      name,
      status: 'SKIP',
      detail: 'RELAY_SECRET not set',
      durationMs: 0,
    }
  }

  try {
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/api/channels/relay`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${relaySecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    )

    const relayDuration = response.headers.get('x-relay-duration-ms')

    if (response.status >= 200 && response.status < 300) {
      return {
        name,
        status: 'PASS',
        detail: `Relay executed (${durationMs}ms${relayDuration ? `, relay: ${relayDuration}ms` : ''})`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status}`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testTokenRefreshCron(baseUrl: string): Promise<TestResult> {
  const name = 'Token refresh cron'
  const start = Date.now()
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return {
      name,
      status: 'SKIP',
      detail: 'CRON_SECRET not set',
      durationMs: 0,
    }
  }

  try {
    // Try GET first (Vercel cron routes typically use GET)
    let { response, durationMs } = await timedFetch(
      `${baseUrl}/api/cron/token-refresh`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      }
    )

    // Fallback to POST if GET returns 405
    if (response.status === 405) {
      const retry = await timedFetch(
        `${baseUrl}/api/cron/token-refresh`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        }
      )
      response = retry.response
      durationMs = retry.durationMs
    }

    if (response.status >= 200 && response.status < 300) {
      return {
        name,
        status: 'PASS',
        detail: `Token refresh executed (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status}`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testWhatsAppBridge(): Promise<TestResult> {
  const name = 'WhatsApp bridge health'
  const start = Date.now()
  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL

  if (!bridgeUrl) {
    return {
      name,
      status: 'SKIP',
      detail: 'WHATSAPP_BRIDGE_URL not set',
      durationMs: 0,
    }
  }

  try {
    const { response, durationMs } = await timedFetch(
      `${bridgeUrl.replace(/\/$/, '')}/health`
    )

    if (response.status >= 200 && response.status < 300) {
      const body = await response.text()
      return {
        name,
        status: 'PASS',
        detail: `Bridge healthy (${durationMs}ms): ${body.slice(0, 100)}`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status}`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

// ─── Credential Verification Tests ───────────────────────────────────

async function testStripeApiKey(): Promise<TestResult> {
  const name = 'Stripe API key'
  const start = Date.now()
  const stripeKey = process.env.STRIPE_SECRET_KEY

  if (!stripeKey) {
    return {
      name,
      status: 'SKIP',
      detail: 'STRIPE_SECRET_KEY not set',
      durationMs: 0,
    }
  }

  try {
    const { response, durationMs } = await timedFetch(
      'https://api.stripe.com/v1/balance',
      {
        headers: {
          Authorization: `Bearer ${stripeKey}`,
        },
      }
    )

    if (response.status === 200) {
      const body = await response.json() as { available?: Array<{ amount: number; currency: string }> }
      const available = body.available?.[0]
      const detail = available
        ? `Valid (${durationMs}ms) — balance: ${available.amount} ${available.currency}`
        : `Valid (${durationMs}ms)`
      return { name, status: 'PASS', detail, durationMs, httpStatus: 200 }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status} — key may be invalid`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testTelnyxApiKey(): Promise<TestResult> {
  const name = 'Telnyx API key'
  const start = Date.now()
  const telnyxKey = process.env.TELNYX_API_KEY

  if (!telnyxKey) {
    return {
      name,
      status: 'SKIP',
      detail: 'TELNYX_API_KEY not set',
      durationMs: 0,
    }
  }

  try {
    const { response, durationMs } = await timedFetch(
      'https://api.telnyx.com/v2/messaging_profiles',
      {
        headers: {
          Authorization: `Bearer ${telnyxKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (response.status === 200) {
      const body = await response.json() as { data?: unknown[] }
      const count = body.data?.length ?? 0
      return {
        name,
        status: 'PASS',
        detail: `Valid (${durationMs}ms) — ${count} messaging profile(s)`,
        durationMs,
        httpStatus: 200,
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status} — key may be invalid`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testResendApiKey(): Promise<TestResult> {
  const name = 'Resend API key'
  const start = Date.now()
  const resendKey = process.env.RESEND_API_KEY

  if (!resendKey) {
    return {
      name,
      status: 'SKIP',
      detail: 'RESEND_API_KEY not set',
      durationMs: 0,
    }
  }

  try {
    const { response, durationMs } = await timedFetch(
      'https://api.resend.com/domains',
      {
        headers: {
          Authorization: `Bearer ${resendKey}`,
        },
      }
    )

    if (response.status === 200) {
      const body = await response.json() as { data?: unknown[] }
      const count = body.data?.length ?? 0
      return {
        name,
        status: 'PASS',
        detail: `Valid (${durationMs}ms) — ${count} domain(s)`,
        durationMs,
        httpStatus: 200,
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status} — key may be invalid`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testMetaWhatsAppToken(): Promise<TestResult> {
  const name = 'Meta WhatsApp token'
  const start = Date.now()
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    return {
      name,
      status: 'SKIP',
      detail: `Missing: ${!accessToken ? 'WHATSAPP_ACCESS_TOKEN' : ''}${!accessToken && !phoneNumberId ? ' + ' : ''}${!phoneNumberId ? 'WHATSAPP_PHONE_NUMBER_ID' : ''}`,
      durationMs: 0,
    }
  }

  try {
    const { response, durationMs } = await timedFetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}?access_token=${accessToken}`
    )

    if (response.status === 200) {
      return {
        name,
        status: 'PASS',
        detail: `Token valid (${durationMs}ms)`,
        durationMs,
        httpStatus: 200,
      }
    }

    if (response.status === 401 || response.status === 403) {
      return {
        name,
        status: 'FAIL',
        detail: `HTTP ${response.status} — token expired or invalid (expected per MEMORY.md)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status}`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

async function testBraveSearchApiKey(): Promise<TestResult> {
  const name = 'Brave Search API key'
  const start = Date.now()
  const braveKey = process.env.BRAVE_SEARCH_API_KEY

  if (!braveKey) {
    return {
      name,
      status: 'SKIP',
      detail: 'BRAVE_SEARCH_API_KEY not set',
      durationMs: 0,
    }
  }

  try {
    const { response, durationMs } = await timedFetch(
      'https://api.search.brave.com/res/v1/web/search?q=test&count=1',
      {
        headers: {
          'X-Subscription-Token': braveKey,
          Accept: 'application/json',
        },
      }
    )

    if (response.status === 200) {
      return {
        name,
        status: 'PASS',
        detail: `Valid (${durationMs}ms)`,
        durationMs,
        httpStatus: 200,
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `HTTP ${response.status} — key may be invalid`,
      durationMs,
      httpStatus: response.status,
    }
  } catch (err: any) {
    return {
      name,
      status: 'FAIL',
      detail: `Network error: ${err.message}`,
      durationMs: Date.now() - start,
    }
  }
}

// ─── Output ──────────────────────────────────────────────────────────

function printResults(results: TestResult[], baseUrl: string): void {
  console.log()
  console.log(colors.bold(colors.cyan('  BitBit Channel Smoke Test')))
  console.log(colors.dim(`  Target: ${baseUrl}`))
  console.log()

  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    const num = `${i + 1}.`.padEnd(4)
    const statusStr = statusColor(r.status)
    console.log(`  ${num}${statusStr}  ${colors.bold(r.name)}`)
    console.log(`        ${colors.dim(r.detail)}`)
  }

  console.log()

  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const skip = results.filter((r) => r.status === 'SKIP').length
  const total = results.length

  console.log(colors.bold('  Summary'))
  console.log(
    `  ${colors.green(`${pass} passed`)}  ${colors.red(`${fail} failed`)}  ${colors.yellow(`${skip} skipped`)}  (${total} tests)`
  )
  console.log()

  if (fail > 0) {
    console.log(
      colors.red('  RESULT: FAIL -- Some smoke tests did not pass.')
    )
  } else if (skip > 0) {
    console.log(
      colors.yellow(
        '  RESULT: PASS (with skipped) -- All runnable tests passed.'
      )
    )
  } else {
    console.log(
      colors.green('  RESULT: ALL TESTS PASSED -- All channels operational.')
    )
  }
  console.log()
}

function writeJsonReport(results: TestResult[], baseUrl: string): void {
  const report = {
    timestamp: new Date().toISOString(),
    target: baseUrl,
    results: results.map((r) => ({
      name: r.name,
      status: r.status,
      detail: r.detail,
      durationMs: r.durationMs,
      httpStatus: r.httpStatus ?? null,
    })),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === 'PASS').length,
      failed: results.filter((r) => r.status === 'FAIL').length,
      skipped: results.filter((r) => r.status === 'SKIP').length,
    },
  }

  const outPath = resolve(__dirname, 'smoke-test-results.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(colors.dim(`  Report written to: ${outPath}`))
  console.log()
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const baseUrl = process.argv[2]

  if (!baseUrl) {
    console.error(
      'Usage: npx tsx scripts/channel-smoke-test.ts <app-url>'
    )
    console.error('Example: npx tsx scripts/channel-smoke-test.ts https://app.bitbit.chat')
    process.exit(1)
  }

  // Normalize URL (strip trailing slash)
  const url = baseUrl.replace(/\/$/, '')

  console.log()
  console.log(colors.bold(colors.cyan('  BitBit Channel Smoke Test')))
  console.log(colors.dim(`  Target: ${url}`))
  console.log(colors.dim('  Running tests sequentially...'))

  const results: TestResult[] = []

  // Run tests sequentially, continue on failure
  results.push(await testHealthCheck(url))
  results.push(await testChannelStatus(url))
  results.push(await testGmailOAuthStart(url))
  results.push(await testOutlookOAuthStart(url))
  results.push(await testRelayDaemon(url))
  results.push(await testTokenRefreshCron(url))
  results.push(await testWhatsAppBridge())

  // Credential verification tests (direct API calls)
  results.push(await testStripeApiKey())
  results.push(await testTelnyxApiKey())
  results.push(await testResendApiKey())
  results.push(await testMetaWhatsAppToken())
  results.push(await testBraveSearchApiKey())

  // Output results
  printResults(results, url)
  writeJsonReport(results, url)

  // Exit code
  const hasFail = results.some((r) => r.status === 'FAIL')
  process.exit(hasFail ? 1 : 0)
}

main().catch((err) => {
  console.error('Smoke test error:', err)
  process.exit(1)
})
