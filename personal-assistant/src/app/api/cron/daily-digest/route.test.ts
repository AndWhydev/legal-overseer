/* eslint-disable @next/next/no-assign-module-variable -- test setup uses `module =` for cron-auth mock. Pre-existing; safe in test scope. */
import { describe, it, expect } from 'vitest'

// Note: Cron routes are integration endpoints that require full Supabase setup.
// They are tested via end-to-end tests in e2e/ and verified via:
// 1. TypeScript compilation (npx tsc --noEmit)
// 2. Production Vercel deployments with actual environment variables
// 3. Manual testing with CRON_SECRET set in Vercel environment

describe('/api/cron/daily-digest', () => {
  it('route file exists and exports GET handler', async () => {
    const module = await import('./route')
    expect(module.GET).toBeDefined()
    expect(typeof module.GET).toBe('function')
    expect(module.maxDuration).toBe(300)
    expect(module.dynamic).toBe('force-dynamic')
  })
})
