/**
 * Production-hardening tests for Phase 43 integration gaps found during
 * the 2026-04-14 audit.
 *
 * These tests are INITIALLY FAILING by design (TDD):
 *   1. ExecuteToolOptions plumbing — the interface must carry
 *      `delegationMandate` + `entityId` from the TAOR config down to tools.ts.
 *   2. Rate limit — an `infinite_autopilot` mandate must NOT enable unbounded
 *      tool calls; `checkDelegationRateLimit` must enforce a per-entity
 *      hourly cap.
 *   3. TAOR exec-options builder — `config.delegationMandate`, `config.entityId`,
 *      `config.channel` must be threaded into `ExecuteToolOptions`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  checkDelegationRateLimit,
  countRecentDelegatedActions,
  DEFAULT_DELEGATION_RATE_LIMIT,
  DEFAULT_DELEGATION_RATE_WINDOW_MS,
  buildExecOptionsDelegation,
} from '../delegation-mandate'
import type { ExecuteToolOptions } from '../tools'
import { buildTaorExecOptions } from '../engine/taor-loop-utils'

// ---------------------------------------------------------------------------
// 1. ExecuteToolOptions type plumbing
// ---------------------------------------------------------------------------

describe('ExecuteToolOptions carries delegation fields', () => {
  it('has delegationMandate and entityId fields', () => {
    // Type-only test: a well-formed options object with the new fields compiles.
    const options: ExecuteToolOptions = {
      agentConfigId: 'a-1',
      confidenceScore: 0.4,
      delegationMandate: 'infinite_autopilot',
      entityId: 'entity-acme',
    }
    expect(options.delegationMandate).toBe('infinite_autopilot')
    expect(options.entityId).toBe('entity-acme')
  })
})

// ---------------------------------------------------------------------------
// 2. buildExecOptionsDelegation — helper that packages the plumbing
// ---------------------------------------------------------------------------

describe('buildExecOptionsDelegation', () => {
  it('returns null when mandate or entityId is missing', () => {
    expect(buildExecOptionsDelegation(undefined, 'e-1')).toBeNull()
    expect(buildExecOptionsDelegation('infinite_autopilot', undefined)).toBeNull()
    expect(buildExecOptionsDelegation(undefined, undefined)).toBeNull()
  })

  it('returns null when mandate is "standard"', () => {
    // Standard mandate = no delegation short-circuit; treat same as no mandate.
    expect(buildExecOptionsDelegation('standard', 'e-1')).toBeNull()
  })

  it('returns EntityDelegation when mandate is infinite_autopilot', () => {
    expect(buildExecOptionsDelegation('infinite_autopilot', 'e-1')).toEqual({
      mandate: 'infinite_autopilot',
      entityId: 'e-1',
    })
  })

  it('returns EntityDelegation when mandate is supervised', () => {
    expect(buildExecOptionsDelegation('supervised', 'e-1')).toEqual({
      mandate: 'supervised',
      entityId: 'e-1',
    })
  })
})

// ---------------------------------------------------------------------------
// 3. Rate limit — per-entity hourly cap on delegated actions
// ---------------------------------------------------------------------------

describe('checkDelegationRateLimit', () => {
  beforeEach(() => vi.clearAllMocks())

  function mockSupabaseCountable(count: number, error: { message: string } | null = null): any {
    const chain: any = {}
    for (const m of ['select', 'eq', 'gte']) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    // terminal: resolve with a head: true style count response
    chain.then = undefined
    // postgrest countable select returns { data, error, count }
    chain.eq = vi.fn().mockImplementation(() => chain)
    chain.gte = vi.fn().mockResolvedValue({ data: null, error, count })
    chain.select = vi.fn().mockReturnValue(chain)
    return { from: vi.fn().mockReturnValue(chain) }
  }

  it('allows execution when count is below the limit', async () => {
    const supabase = mockSupabaseCountable(5)
    const result = await checkDelegationRateLimit(supabase, 'org-1', 'e-1', 100)
    expect(result.allowed).toBe(true)
    expect(result.count).toBe(5)
    expect(result.limit).toBe(100)
  })

  it('blocks when count is at or above the limit', async () => {
    const supabase = mockSupabaseCountable(100)
    const result = await checkDelegationRateLimit(supabase, 'org-1', 'e-1', 100)
    expect(result.allowed).toBe(false)
    expect(result.count).toBe(100)
    expect(result.reason).toMatch(/rate limit/i)
  })

  it('uses default limit when none provided', async () => {
    const supabase = mockSupabaseCountable(1)
    const result = await checkDelegationRateLimit(supabase, 'org-1', 'e-1')
    expect(result.limit).toBe(DEFAULT_DELEGATION_RATE_LIMIT)
  })

  it('uses default window when none provided', async () => {
    const supabase = mockSupabaseCountable(0)
    const result = await checkDelegationRateLimit(supabase, 'org-1', 'e-1')
    expect(result.windowMs).toBe(DEFAULT_DELEGATION_RATE_WINDOW_MS)
  })

  it('fails-OPEN on query error (allows execution, logs warning)', async () => {
    const supabase = mockSupabaseCountable(0, { message: 'connection reset' })
    const result = await checkDelegationRateLimit(supabase, 'org-1', 'e-1')
    // Fail-open: a transient db error should not block autonomous ops.
    // This is a deliberate trade-off — alternative is fail-closed which
    // would pause all delegation on any DB blip.
    expect(result.allowed).toBe(true)
    expect(result.count).toBe(0) // treated as 0 on error
  })
})

describe('countRecentDelegatedActions', () => {
  it('returns the count from the window', async () => {
    const chain: any = {}
    for (const m of ['select', 'eq', 'gte']) chain[m] = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockResolvedValue({ data: null, error: null, count: 42 })
    const supabase = { from: vi.fn().mockReturnValue(chain) } as any

    const count = await countRecentDelegatedActions(
      supabase,
      'org-1',
      'e-1',
      60 * 60 * 1000,
    )
    expect(count).toBe(42)
  })

  it('returns 0 when count is null', async () => {
    const chain: any = {}
    for (const m of ['select', 'eq', 'gte']) chain[m] = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockResolvedValue({ data: null, error: null, count: null })
    const supabase = { from: vi.fn().mockReturnValue(chain) } as any

    const count = await countRecentDelegatedActions(supabase, 'org-1', 'e-1', 1000)
    expect(count).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 4. TAOR exec-options builder — threads config fields into ExecuteToolOptions
// ---------------------------------------------------------------------------

describe('buildTaorExecOptions', () => {
  it('returns undefined when agentConfigId is absent (existing behaviour preserved)', () => {
    expect(buildTaorExecOptions({ orgId: 'o', supabase: {} as any })).toBeUndefined()
  })

  it('includes core fields when agentConfigId present', () => {
    const opts = buildTaorExecOptions({
      orgId: 'o',
      supabase: {} as any,
      agentConfigId: 'a-1',
      agentType: 'invoice-flow',
      orgSettings: { confidence_thresholds: { act: 0.9, ask: 0.5 } },
      calibratedThresholds: null,
    })
    expect(opts?.agentConfigId).toBe('a-1')
    expect(opts?.agentType).toBe('invoice-flow')
    expect(opts?.orgSettings?.confidence_thresholds?.act).toBe(0.9)
  })

  it('threads delegationMandate and entityId', () => {
    const opts = buildTaorExecOptions({
      orgId: 'o',
      supabase: {} as any,
      agentConfigId: 'a-1',
      delegationMandate: 'infinite_autopilot',
      entityId: 'entity-acme',
    })
    expect(opts?.delegationMandate).toBe('infinite_autopilot')
    expect(opts?.entityId).toBe('entity-acme')
  })

  it('passes through spawnDepth and parentAgentId', () => {
    const opts = buildTaorExecOptions({
      orgId: 'o',
      supabase: {} as any,
      agentConfigId: 'a-1',
      _spawnDepth: 2,
      maxDepth: 5,
      parentAgentId: 'parent-1',
    } as any)
    expect(opts?.spawnDepth).toBe(2)
    expect(opts?.maxSpawnDepth).toBe(5)
    expect(opts?.parentAgentId).toBe('parent-1')
  })

  it('defaults spawnDepth to 0 and maxSpawnDepth to 3', () => {
    const opts = buildTaorExecOptions({
      orgId: 'o',
      supabase: {} as any,
      agentConfigId: 'a-1',
    } as any)
    expect(opts?.spawnDepth).toBe(0)
    expect(opts?.maxSpawnDepth).toBe(3)
  })
})
