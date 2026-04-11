#!/usr/bin/env npx tsx
/**
 * OAuth Credential Verification Script
 *
 * Validates that all OAuth credentials are properly configured before
 * attempting live flows. Checks env var existence, format, and endpoint
 * reachability.
 *
 * Usage: npx tsx scripts/verify-oauth-credentials.ts
 *
 * Exit code 0 = all critical checks pass
 * Exit code 1 = one or more FAIL checks
 */

import { resolve } from 'path'
import { existsSync } from 'fs'

// Load env from personal-assistant/.env.local if it exists
const envPath = resolve(__dirname, '..', 'personal-assistant', '.env.local')
if (existsSync(envPath)) {
  // Simple dotenv-style loading without external dependency
  const fs = require('fs') as typeof import('fs')
  const content = fs.readFileSync(envPath, 'utf-8')
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

type CheckStatus = 'PASS' | 'FAIL' | 'WARN'

interface CheckResult {
  provider: string
  check: string
  status: CheckStatus
  detail: string
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

function statusColor(status: CheckStatus): string {
  switch (status) {
    case 'PASS':
      return colors.green(status)
    case 'FAIL':
      return colors.red(status)
    case 'WARN':
      return colors.yellow(status)
  }
}

// ─── Check Helpers ───────────────────────────────────────────────────

function checkEnvExists(
  provider: string,
  envVar: string,
  critical: boolean = true
): CheckResult {
  const value = process.env[envVar]
  if (value && value.trim().length > 0) {
    return {
      provider,
      check: `${envVar} exists`,
      status: 'PASS',
      detail: `Set (${value.length} chars)`,
    }
  }
  return {
    provider,
    check: `${envVar} exists`,
    status: critical ? 'FAIL' : 'WARN',
    detail: 'Not set',
  }
}

function checkEnvPattern(
  provider: string,
  envVar: string,
  pattern: RegExp,
  patternDesc: string
): CheckResult {
  const value = process.env[envVar]
  if (!value) {
    return {
      provider,
      check: `${envVar} format`,
      status: 'FAIL',
      detail: 'Not set (cannot validate format)',
    }
  }
  if (pattern.test(value)) {
    return {
      provider,
      check: `${envVar} format`,
      status: 'PASS',
      detail: `Matches ${patternDesc}`,
    }
  }
  return {
    provider,
    check: `${envVar} format`,
    status: 'WARN',
    detail: `Does not match expected pattern: ${patternDesc}`,
  }
}

async function checkEndpointReachable(
  provider: string,
  checkName: string,
  url: string
): Promise<CheckResult> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
    })
    clearTimeout(timeout)
    return {
      provider,
      check: checkName,
      status: 'PASS',
      detail: `Reachable (HTTP ${resp.status})`,
    }
  } catch (err: any) {
    return {
      provider,
      check: checkName,
      status: 'WARN',
      detail: `Unreachable: ${err.message || err}`,
    }
  }
}

// ─── Provider Checks ─────────────────────────────────────────────────

async function checkGoogle(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  results.push(checkEnvExists('Google', 'GOOGLE_CLIENT_ID'))
  results.push(
    checkEnvPattern(
      'Google',
      'GOOGLE_CLIENT_ID',
      /\.apps\.googleusercontent\.com$/,
      '*.apps.googleusercontent.com'
    )
  )
  results.push(checkEnvExists('Google', 'GOOGLE_CLIENT_SECRET'))
  results.push(
    checkEnvPattern(
      'Google',
      'GOOGLE_CLIENT_SECRET',
      /^GOCSPX-/,
      'starts with GOCSPX-'
    )
  )
  results.push(
    await checkEndpointReachable(
      'Google',
      'Token info endpoint',
      'https://oauth2.googleapis.com/tokeninfo'
    )
  )
  results.push(checkEnvExists('Google', 'NEXT_PUBLIC_APP_URL'))

  return results
}

async function checkMicrosoft(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  results.push(checkEnvExists('Microsoft', 'OUTLOOK_CLIENT_ID'))
  results.push(
    checkEnvPattern(
      'Microsoft',
      'OUTLOOK_CLIENT_ID',
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'UUID format'
    )
  )
  results.push(checkEnvExists('Microsoft', 'OUTLOOK_CLIENT_SECRET'))
  results.push(checkEnvExists('Microsoft', 'OUTLOOK_TENANT_ID', false))
  results.push(
    await checkEndpointReachable(
      'Microsoft',
      'OpenID config endpoint',
      'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration'
    )
  )

  return results
}

function checkAsana(): CheckResult[] {
  return [
    checkEnvExists('Asana', 'ASANA_CLIENT_ID'),
    checkEnvExists('Asana', 'ASANA_CLIENT_SECRET'),
  ]
}

function checkCalendly(): CheckResult[] {
  return [
    checkEnvExists('Calendly', 'CALENDLY_CLIENT_ID'),
    checkEnvExists('Calendly', 'CALENDLY_CLIENT_SECRET'),
  ]
}

async function checkWhatsApp(): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  const bridgeUrl = process.env.WHATSAPP_BRIDGE_URL

  if (!bridgeUrl) {
    results.push({
      provider: 'WhatsApp',
      check: 'WHATSAPP_BRIDGE_URL exists',
      status: 'WARN',
      detail: 'Not set (bridge health check skipped)',
    })
    return results
  }

  results.push({
    provider: 'WhatsApp',
    check: 'WHATSAPP_BRIDGE_URL exists',
    status: 'PASS',
    detail: bridgeUrl,
  })

  results.push(
    await checkEndpointReachable(
      'WhatsApp',
      'Bridge health endpoint',
      `${bridgeUrl.replace(/\/$/, '')}/health`
    )
  )

  return results
}

function checkGeneral(): CheckResult[] {
  const results: CheckResult[] = []

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    results.push({
      provider: 'General',
      check: 'NEXT_PUBLIC_APP_URL is HTTPS',
      status: 'FAIL',
      detail: 'Not set',
    })
  } else if (appUrl.startsWith('https://')) {
    results.push({
      provider: 'General',
      check: 'NEXT_PUBLIC_APP_URL is HTTPS',
      status: 'PASS',
      detail: appUrl,
    })
  } else {
    results.push({
      provider: 'General',
      check: 'NEXT_PUBLIC_APP_URL is HTTPS',
      status: 'WARN',
      detail: `Not HTTPS: ${appUrl}`,
    })
  }

  results.push(checkEnvExists('General', 'RELAY_SECRET'))
  results.push(checkEnvExists('General', 'CRON_SECRET'))

  return results
}

// ─── Output Formatting ──────────────────────────────────────────────

function printResults(results: CheckResult[]): void {
  // Column widths
  const providerW = 12
  const checkW = 36
  const statusW = 6

  // Header
  console.log()
  console.log(
    colors.bold(
      '  ' +
        'Provider'.padEnd(providerW) +
        'Check'.padEnd(checkW) +
        'Status'.padEnd(statusW + 4) +
        'Detail'
    )
  )
  console.log(colors.dim('  ' + '-'.repeat(providerW + checkW + statusW + 40)))

  let currentProvider = ''
  for (const r of results) {
    const providerLabel =
      r.provider !== currentProvider ? r.provider : ''
    currentProvider = r.provider

    const line =
      '  ' +
      providerLabel.padEnd(providerW) +
      r.check.padEnd(checkW) +
      statusColor(r.status).padEnd(statusW + 13) +
      colors.dim(r.detail)
    console.log(line)
  }
  console.log()
}

function printSummary(results: CheckResult[]): void {
  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  const warn = results.filter((r) => r.status === 'WARN').length
  const total = results.length

  console.log(colors.bold('  Summary'))
  console.log(
    `  ${colors.green(`${pass} passed`)}  ${colors.red(`${fail} failed`)}  ${colors.yellow(`${warn} warnings`)}  (${total} checks)`
  )
  console.log()

  if (fail > 0) {
    console.log(
      colors.red(
        '  RESULT: FAIL -- Some critical checks did not pass. See details above.'
      )
    )
  } else if (warn > 0) {
    console.log(
      colors.yellow(
        '  RESULT: PASS WITH WARNINGS -- All critical checks passed but some optional checks need attention.'
      )
    )
  } else {
    console.log(
      colors.green('  RESULT: ALL CHECKS PASSED -- Credentials are properly configured.')
    )
  }
  console.log()
}

// ─── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log()
  console.log(
    colors.bold(colors.cyan('  BitBit OAuth Credential Verification'))
  )
  console.log(colors.dim('  Checking credential configuration for all providers...'))

  const results: CheckResult[] = []

  // Run all provider checks
  results.push(...(await checkGoogle()))
  results.push(...(await checkMicrosoft()))
  results.push(...checkAsana())
  results.push(...checkCalendly())
  results.push(...(await checkWhatsApp()))
  results.push(...checkGeneral())

  // Output
  printResults(results)
  printSummary(results)

  // Exit code
  const hasFail = results.some((r) => r.status === 'FAIL')
  process.exit(hasFail ? 1 : 0)
}

main().catch((err) => {
  console.error('Verification script error:', err)
  process.exit(1)
})
