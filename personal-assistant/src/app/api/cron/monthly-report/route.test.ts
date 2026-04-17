/* eslint-disable @next/next/no-assign-module-variable -- test setup uses `module =` for cron-auth mock. Pre-existing; safe in test scope. */
import { describe, it, expect } from 'vitest'

describe('/api/cron/monthly-report', () => {
  it('route file exists and exports GET handler', async () => {
    const module = await import('./route')
    expect(module.GET).toBeDefined()
    expect(typeof module.GET).toBe('function')
    expect(module.maxDuration).toBe(300)
    expect(module.dynamic).toBe('force-dynamic')
  })
})
