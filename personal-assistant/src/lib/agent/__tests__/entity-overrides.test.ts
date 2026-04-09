import { describe, it, expect, vi } from 'vitest'
import { resolveEntityOverrides, DEFAULT_ENTITY_OVERRIDES } from '../entity-overrides'

function mockSupabase(data: Record<string, unknown> | null, error: { message: string } | null = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
    }),
  } as any
}

describe('resolveEntityOverrides', () => {
  it('returns defaults when entityId is undefined', async () => {
    const supabase = mockSupabase(null)
    const result = await resolveEntityOverrides(supabase, 'org-1', undefined)
    expect(result).toEqual(DEFAULT_ENTITY_OVERRIDES)
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('returns defaults when no override row exists', async () => {
    const supabase = mockSupabase(null)
    const result = await resolveEntityOverrides(supabase, 'org-1', 'entity-1')
    expect(result).toEqual(DEFAULT_ENTITY_OVERRIDES)
  })

  it('returns defaults on query error (fail-open)', async () => {
    const supabase = mockSupabase(null, { message: 'table does not exist' })
    const result = await resolveEntityOverrides(supabase, 'org-1', 'entity-1')
    expect(result).toEqual(DEFAULT_ENTITY_OVERRIDES)
  })

  it('resolves override when row exists', async () => {
    const supabase = mockSupabase({
      delegation_mandate: 'infinite_autopilot',
      ltv_multiplier: 3.5,
      iteration_cap: 200,
      budget_preset: 'dynamic_workspace',
    })
    const result = await resolveEntityOverrides(supabase, 'org-1', 'entity-1')
    expect(result.delegationMandate).toBe('infinite_autopilot')
    expect(result.ltvMultiplier).toBe(3.5)
    expect(result.iterationCap).toBe(200)
    expect(result.budgetPreset).toBe('dynamic_workspace')
  })

  it('handles null iteration_cap as undefined', async () => {
    const supabase = mockSupabase({
      delegation_mandate: 'supervised',
      ltv_multiplier: 1.0,
      iteration_cap: null,
      budget_preset: 'standard',
    })
    const result = await resolveEntityOverrides(supabase, 'org-1', 'entity-1')
    expect(result.iterationCap).toBeUndefined()
  })

  it('defaults ltvMultiplier to 1.0 when database returns invalid value', async () => {
    const supabase = mockSupabase({
      delegation_mandate: 'standard',
      ltv_multiplier: null,
      iteration_cap: null,
      budget_preset: 'standard',
    })
    const result = await resolveEntityOverrides(supabase, 'org-1', 'entity-1')
    expect(result.ltvMultiplier).toBe(1.0)
  })
})
