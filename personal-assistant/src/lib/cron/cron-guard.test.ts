/* eslint-disable @next/next/no-assign-module-variable -- test setup uses `module =` for cron-auth mock. Pre-existing; safe in test scope. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Note: Comprehensive integration testing of cron routes is handled by the individual
// route tests which actually invoke the Next.js route handlers.
// Unit testing of withCronGuard requires mocking the service-client initialization
// which is tested implicitly through the route tests.

describe('cron-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exports withCronGuard and types from cron-guard module', async () => {
    // This is a smoke test to ensure the module exports are correct
    const module = await import('./cron-guard')
    expect(module.withCronGuard).toBeDefined()
    expect(module.cronMaxDuration).toBe(300)
    expect(module.cronDynamic).toBe('force-dynamic')
  })
})
