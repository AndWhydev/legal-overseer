import { describe, it, expect } from 'vitest'

describe('/api/cron/proactive-alerts', () => {
  it('route file exists and exports GET handler', async () => {
    const routeModule = await import('./route')
    expect(routeModule.GET).toBeDefined()
    expect(typeof routeModule.GET).toBe('function')
    expect(routeModule.maxDuration).toBe(300)
    expect(routeModule.dynamic).toBe('force-dynamic')
  })
})
