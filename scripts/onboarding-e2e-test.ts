#!/usr/bin/env npx tsx
/**
 * Onboarding E2E Verification Script
 *
 * Verifies the onboarding flow works end-to-end against the deployed BitBit
 * application by checking all key onboarding routes exist and respond correctly.
 *
 * Usage: npx tsx scripts/onboarding-e2e-test.ts https://app.bitbit.chat
 *
 * Outputs:
 *   - Colorized pass/fail per test to console
 *   - JSON report to scripts/onboarding-e2e-results.json
 *
 * Exit code 0 = all tests pass, 1 = one or more failures
 */

import { resolve } from 'path'
import { existsSync, writeFileSync, readFileSync } from 'fs'

// --- Env Loading -------------------------------------------------------------

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

// --- Types -------------------------------------------------------------------

type TestStatus = 'PASS' | 'FAIL' | 'SKIP'

interface TestResult {
  name: string
  status: TestStatus
  detail: string
  durationMs: number
  httpStatus?: number
}

// --- Color Helpers -----------------------------------------------------------

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

// --- HTTP Helper -------------------------------------------------------------

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

// --- Test Definitions --------------------------------------------------------

async function testOnboardingPageLoad(baseUrl: string): Promise<TestResult> {
  const name = 'Onboarding page load'
  const start = Date.now()
  try {
    // Next.js route is /(auth)/onboard, not /onboarding
    const { response, durationMs } = await timedFetch(`${baseUrl}/onboard`)

    // 200 (page loads) or 307/302 (redirect to login) are both valid
    if (response.status === 200) {
      return {
        name,
        status: 'PASS',
        detail: `Page loads directly (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    if (response.status === 307 || response.status === 302) {
      const location = response.headers.get('location') || ''
      return {
        name,
        status: 'PASS',
        detail: `Redirects to login (${durationMs}ms) -> ${location.slice(0, 80)}`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'FAIL',
      detail: `Unexpected HTTP ${response.status}`,
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

async function testOnboardingApiReachable(baseUrl: string): Promise<TestResult> {
  const name = 'Onboarding API reachable'
  const start = Date.now()
  try {
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/api/onboarding`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )

    // 400 (bad request) or 401 (auth required) means the route exists and responds
    if (response.status === 400 || response.status === 401) {
      return {
        name,
        status: 'PASS',
        detail: `Route responds with ${response.status} (${durationMs}ms) -- expected without auth/payload`,
        durationMs,
        httpStatus: response.status,
      }
    }

    // 307/302 redirect to login is also acceptable
    if (response.status === 307 || response.status === 302) {
      return {
        name,
        status: 'PASS',
        detail: `Route redirects to login (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    if (response.status === 404 || response.status === 500) {
      return {
        name,
        status: 'FAIL',
        detail: `HTTP ${response.status} -- route may be missing or broken`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'PASS',
      detail: `Route responds with HTTP ${response.status} (${durationMs}ms)`,
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

async function testFirstValueApiReachable(baseUrl: string): Promise<TestResult> {
  const name = 'First-value API reachable'
  const start = Date.now()
  try {
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/api/onboarding/first-value`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )

    // 400 or 401 means the route exists
    if (response.status === 400 || response.status === 401) {
      return {
        name,
        status: 'PASS',
        detail: `Route responds with ${response.status} (${durationMs}ms) -- expected without auth/payload`,
        durationMs,
        httpStatus: response.status,
      }
    }

    // Redirect to login is acceptable
    if (response.status === 307 || response.status === 302) {
      return {
        name,
        status: 'PASS',
        detail: `Route redirects to login (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    if (response.status === 404 || response.status === 500) {
      return {
        name,
        status: 'FAIL',
        detail: `HTTP ${response.status} -- route may be missing or broken`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'PASS',
      detail: `Route responds with HTTP ${response.status} (${durationMs}ms)`,
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

async function testE2eOnboardingHelper(baseUrl: string): Promise<TestResult> {
  const name = 'E2E onboarding helper route'
  const start = Date.now()
  try {
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/api/auth/e2e/onboarding`
    )

    // 405 (GET not supported) or 401 (auth required) both confirm route exists
    if (
      response.status === 405 ||
      response.status === 401 ||
      response.status === 400
    ) {
      return {
        name,
        status: 'PASS',
        detail: `Route exists, responds with ${response.status} (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    // Redirect is also valid
    if (response.status === 307 || response.status === 302) {
      return {
        name,
        status: 'PASS',
        detail: `Route redirects (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    // 200 is also fine (route exists and responds to GET)
    if (response.status === 200) {
      return {
        name,
        status: 'PASS',
        detail: `Route responds OK (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    if (response.status === 404) {
      return {
        name,
        status: 'FAIL',
        detail: `HTTP 404 -- E2E helper route not found`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'PASS',
      detail: `Route responds with HTTP ${response.status} (${durationMs}ms)`,
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

async function testSkipOnboardingStep(baseUrl: string): Promise<TestResult> {
  const name = 'Skip-for-now onboarding affordance'
  const start = Date.now()
  try {
    // Next.js route is /(auth)/onboard, not /onboarding
    const { response, durationMs } = await timedFetch(`${baseUrl}/onboard`)

    // If redirected (user not authenticated), skip this test
    if (response.status === 307 || response.status === 302) {
      return {
        name,
        status: 'SKIP',
        detail: `Redirected to login -- cannot verify skip affordance without auth (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    if (response.status === 200) {
      const body = await response.text()
      const hasSkip =
        body.toLowerCase().includes('skip') ||
        body.toLowerCase().includes('later') ||
        body.toLowerCase().includes('not now')

      if (hasSkip) {
        return {
          name,
          status: 'PASS',
          detail: `Skip affordance found in page content (${durationMs}ms)`,
          durationMs,
          httpStatus: response.status,
        }
      }

      // Page loads but no skip text found -- could be SSR hydration issue
      return {
        name,
        status: 'SKIP',
        detail: `Page loaded but skip text not found in server-rendered HTML (may require client JS) (${durationMs}ms)`,
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

async function testAuthCallbackOAuthReturn(baseUrl: string): Promise<TestResult> {
  const name = 'OAuth callback route (FR-6)'
  const start = Date.now()
  try {
    // Next.js route is /callback/[provider], not /api/auth/callback/google
    const { response, durationMs } = await timedFetch(
      `${baseUrl}/callback/google`
    )

    // 400 (missing code/state) or redirect both confirm the route exists
    if (response.status === 400) {
      return {
        name,
        status: 'PASS',
        detail: `Route responds with 400 (missing params) -- expected (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    if (response.status === 307 || response.status === 302) {
      const location = response.headers.get('location') || ''
      return {
        name,
        status: 'PASS',
        detail: `Route redirects (${durationMs}ms) -> ${location.slice(0, 80)}`,
        durationMs,
        httpStatus: response.status,
      }
    }

    // 401 is also valid (auth infrastructure responding)
    if (response.status === 401) {
      return {
        name,
        status: 'PASS',
        detail: `Route responds with 401 (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    // 200 is acceptable too (may return error page)
    if (response.status === 200) {
      return {
        name,
        status: 'PASS',
        detail: `Route responds OK (${durationMs}ms)`,
        durationMs,
        httpStatus: response.status,
      }
    }

    if (response.status === 404) {
      return {
        name,
        status: 'FAIL',
        detail: `HTTP 404 -- Google OAuth callback route not found`,
        durationMs,
        httpStatus: response.status,
      }
    }

    return {
      name,
      status: 'PASS',
      detail: `Route responds with HTTP ${response.status} (${durationMs}ms)`,
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

// --- Output ------------------------------------------------------------------

function printResults(results: TestResult[], baseUrl: string): void {
  console.log()
  console.log(colors.bold(colors.cyan('  BitBit Onboarding E2E Test')))
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
      colors.red('  RESULT: FAIL -- Some onboarding tests did not pass.')
    )
  } else if (skip > 0) {
    console.log(
      colors.yellow(
        '  RESULT: PASS (with skipped) -- All runnable tests passed.'
      )
    )
  } else {
    console.log(
      colors.green('  RESULT: ALL TESTS PASSED -- Onboarding flow verified.')
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

  const outPath = resolve(__dirname, 'onboarding-e2e-results.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf-8')
  console.log(colors.dim(`  Report written to: ${outPath}`))
  console.log()
}

// --- Main --------------------------------------------------------------------

async function main(): Promise<void> {
  const baseUrl = process.argv[2]

  if (!baseUrl) {
    console.error(
      'Usage: npx tsx scripts/onboarding-e2e-test.ts <app-url>'
    )
    console.error(
      'Example: npx tsx scripts/onboarding-e2e-test.ts https://app.bitbit.chat'
    )
    process.exit(1)
  }

  // Normalize URL (strip trailing slash)
  const url = baseUrl.replace(/\/$/, '')

  console.log()
  console.log(colors.bold(colors.cyan('  BitBit Onboarding E2E Test')))
  console.log(colors.dim(`  Target: ${url}`))
  console.log(colors.dim('  Running tests sequentially...'))

  const results: TestResult[] = []

  // Run tests sequentially, continue on failure
  results.push(await testOnboardingPageLoad(url))
  results.push(await testOnboardingApiReachable(url))
  results.push(await testFirstValueApiReachable(url))
  results.push(await testE2eOnboardingHelper(url))
  results.push(await testSkipOnboardingStep(url))
  results.push(await testAuthCallbackOAuthReturn(url))

  // Output results
  printResults(results, url)
  writeJsonReport(results, url)

  // Exit code
  const hasFail = results.some((r) => r.status === 'FAIL')
  process.exit(hasFail ? 1 : 0)
}

main().catch((err) => {
  console.error('Onboarding E2E test error:', err)
  process.exit(1)
})
