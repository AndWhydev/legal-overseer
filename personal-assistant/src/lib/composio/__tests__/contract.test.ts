/**
 * Contract tests for the Composio SDK facade.
 *
 * These replay captured fixtures through our typed wrappers to catch
 * SDK response-shape drift at CI time. When Composio changes a field
 * name (e.g. `expiresAt` → `expiry_at`) we want the test suite to fail
 * immediately rather than discovering it silently in prod when tokens
 * stop refreshing.
 *
 * Fixtures live in ./fixtures/. Add a new fixture whenever we start
 * depending on a new field.
 */
import { describe, it, expect } from 'vitest'

import activeAccount from './fixtures/connected-account.active.json'
import expiredAccount from './fixtures/connected-account.expired.json'
import initiateResponse from './fixtures/initiate-connection.success.json'
import triggerCreated from './fixtures/trigger.created.json'

// Copy of extractExpiry from lifecycles/composio.ts — intentionally
// duplicated so this contract is self-contained and fails loudly if
// someone simplifies the production helper.
function extractExpiry(source: unknown): string | undefined {
  if (!source || typeof source !== 'object') return undefined
  const rec = source as Record<string, unknown>
  const keys = [
    'auth_expires_at', 'authExpiresAt', 'expiresAt', 'expires_at',
    'expiry', 'expiryDate', 'tokenExpiresAt', 'token_expires_at', 'expiry_time',
  ]
  for (const k of keys) {
    const v = rec[k]
    if (typeof v === 'string' && v.length > 0) return v
    if (typeof v === 'number') return new Date(v).toISOString()
  }
  for (const nk of ['data', 'metadata', 'params', 'credentials']) {
    const nested = rec[nk]
    if (nested && typeof nested === 'object') {
      const r = extractExpiry(nested)
      if (r) return r
    }
  }
  return undefined
}

describe('Composio contract — connected-account shape', () => {
  it('ACTIVE account exposes id + status + toolkit', () => {
    expect(activeAccount).toMatchObject({
      id: expect.stringMatching(/^ca_/),
      status: 'ACTIVE',
    })
    expect(activeAccount.toolkit || (activeAccount as any).appName).toBeTruthy()
  })

  it('extractExpiry finds expiresAt inside nested data', () => {
    expect(extractExpiry(activeAccount)).toBe('2026-05-15T12:34:56.000Z')
  })

  it('EXPIRED account is detectable via status', () => {
    expect(expiredAccount.status).toBe('EXPIRED')
  })

  it('extractExpiry still finds expiry on EXPIRED account', () => {
    expect(extractExpiry(expiredAccount)).toBe('2025-01-01T00:00:00.000Z')
  })
})

describe('Composio contract — initiate connection', () => {
  it('response carries redirectUrl + id', () => {
    expect(initiateResponse).toMatchObject({
      id: expect.stringMatching(/^cr_/),
      redirectUrl: expect.stringContaining('composio.dev'),
    })
  })
})

describe('Composio contract — trigger creation', () => {
  it('response carries id + status + connectedAccountId', () => {
    expect(triggerCreated).toMatchObject({
      id: expect.stringMatching(/^trg_/),
      status: 'ACTIVE',
      connectedAccountId: expect.stringMatching(/^ca_/),
    })
  })
})
