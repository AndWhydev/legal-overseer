import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConnectionHealthReporter } from '../health-reporter'

function makeSupabase(
  initial: { consecutive_failures?: number; status?: string; readError?: string } = {},
) {
  const updateCalls: Record<string, unknown>[] = []
  const single = vi.fn().mockResolvedValue({
    data: { consecutive_failures: initial.consecutive_failures ?? 0, status: initial.status ?? 'connected' },
    error: initial.readError ? { message: initial.readError } : null,
  })
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ single })),
    })),
    update: vi.fn((u: Record<string, unknown>) => {
      updateCalls.push(u)
      return {
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
    }),
  }))
  return { supabase: { from } as any, updateCalls, single }
}

describe('ConnectionHealthReporter', () => {
  it('resets consecutive_failures on success', async () => {
    const { supabase, updateCalls } = makeSupabase({ consecutive_failures: 2 })
    const reporter = new ConnectionHealthReporter(supabase)

    await reporter.report({ connectionId: 'c1', healthy: true })

    expect(updateCalls.length).toBe(1)
    expect(updateCalls[0].consecutive_failures).toBe(0)
    expect(updateCalls[0].last_error).toBeNull()
  })

  it('increments consecutive_failures on failure without flipping status until threshold', async () => {
    const { supabase, updateCalls } = makeSupabase({ consecutive_failures: 1 })
    const reporter = new ConnectionHealthReporter(supabase)

    await reporter.report({ connectionId: 'c1', healthy: false, error: 'boom' })

    expect(updateCalls[0].consecutive_failures).toBe(2)
    expect(updateCalls[0].status).toBeUndefined()
    expect(updateCalls[0].last_error).toBe('boom')
  })

  it('flips to error status after threshold failures', async () => {
    const { supabase, updateCalls } = makeSupabase({ consecutive_failures: 2, status: 'connected' })
    const reporter = new ConnectionHealthReporter(supabase)

    await reporter.report({ connectionId: 'c1', healthy: false, error: 'boom', failureThreshold: 3 })

    expect(updateCalls[0].consecutive_failures).toBe(3)
    expect(updateCalls[0].status).toBe('error')
  })

  it('honours explicit nextStatus override', async () => {
    const { supabase, updateCalls } = makeSupabase({ status: 'connected' })
    const reporter = new ConnectionHealthReporter(supabase)

    await reporter.report({
      connectionId: 'c1',
      healthy: false,
      nextStatus: 'auth_expired',
      error: 'expired',
    })

    expect(updateCalls[0].status).toBe('auth_expired')
  })

  it('recovers from error status on success', async () => {
    const { supabase, updateCalls } = makeSupabase({ status: 'error', consecutive_failures: 5 })
    const reporter = new ConnectionHealthReporter(supabase)

    await reporter.report({ connectionId: 'c1', healthy: true })

    expect(updateCalls[0].status).toBe('connected')
    expect(updateCalls[0].consecutive_failures).toBe(0)
  })

  it('does not clobber suspended/disabled statuses on success', async () => {
    const { supabase, updateCalls } = makeSupabase({ status: 'suspended' })
    const reporter = new ConnectionHealthReporter(supabase)

    await reporter.report({ connectionId: 'c1', healthy: true })

    expect(updateCalls[0].status).toBeUndefined()
  })

  it('setStatus writes only status + metadata fields', async () => {
    const { supabase, updateCalls } = makeSupabase()
    const reporter = new ConnectionHealthReporter(supabase)

    await reporter.setStatus('c1', 'auth_expired', { error: 'expired', authExpiresAt: null })

    expect(updateCalls[0].status).toBe('auth_expired')
    expect(updateCalls[0].last_error).toBe('expired')
    expect(updateCalls[0].auth_expires_at).toBeNull()
    expect(updateCalls[0].consecutive_failures).toBeUndefined()
  })

  it('returns early when reading current state fails', async () => {
    const { supabase, updateCalls } = makeSupabase({ readError: 'rls denied' })
    const reporter = new ConnectionHealthReporter(supabase)

    await reporter.report({ connectionId: 'c1', healthy: false, error: 'boom' })

    expect(updateCalls).toHaveLength(0)
  })
})
