import { describe, it, expect, vi } from 'vitest'
import {
  MODES_BY_PLAN,
  MIN_PLAN_FOR_MODE,
  getEnabledModes,
  getEnabledModesForPlan,
  isModeEnabled,
  checkModeAccess,
  getLockedModesForPlan,
} from './mode-entitlements'
import type { PlanName } from './plan-gates'
import type { Mode } from '@/lib/dashboard/mode-store'

function createMockSupabase(plan: string | null = null) {
  const api = {
    from(table: string) {
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: (_k: string, _v: unknown) => ({
              in: (_k: string, _v: unknown) => ({
                order: (_k: string, _o: unknown) => ({
                  limit: (_n: number) => ({
                    maybeSingle: () =>
                      Promise.resolve({
                        data: plan ? { plan, status: 'active' } : null,
                        error: null,
                      }),
                  }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'organizations') {
        return {
          select: () => ({
            eq: (_k: string, _v: unknown) => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }
      }
      throw new Error(`Unsupported table ${table}`)
    },
  }
  return api as unknown as import('@supabase/supabase-js').SupabaseClient
}

function createFailingSupabase() {
  return {
    from() {
      throw new Error('boom')
    },
  } as unknown as import('@supabase/supabase-js').SupabaseClient
}

describe('MODES_BY_PLAN — invariants', () => {
  it('every plan tier has at least chat', () => {
    for (const plan of Object.keys(MODES_BY_PLAN) as PlanName[]) {
      expect(MODES_BY_PLAN[plan]).toContain('chat')
    }
  })

  it('higher tiers are supersets of lower tiers', () => {
    const ladder: PlanName[] = ['free', 'starter', 'growth', 'scale', 'enterprise']
    for (let i = 1; i < ladder.length; i++) {
      const prev = new Set(MODES_BY_PLAN[ladder[i - 1]])
      const curr = new Set(MODES_BY_PLAN[ladder[i]])
      for (const mode of prev) {
        expect(curr.has(mode), `${ladder[i]} should include ${mode} from ${ladder[i - 1]}`).toBe(true)
      }
    }
  })

  it('preserves canonical mode order chat→inbox→work→money', () => {
    const canonical: Mode[] = ['chat', 'inbox', 'work', 'money']
    for (const plan of Object.keys(MODES_BY_PLAN) as PlanName[]) {
      const modes = MODES_BY_PLAN[plan]
      const indices = modes.map(m => canonical.indexOf(m))
      const sorted = [...indices].sort((a, b) => a - b)
      expect(indices).toEqual(sorted)
    }
  })

  it('growth and above unlock all four modes', () => {
    expect(MODES_BY_PLAN.growth).toEqual(['chat', 'inbox', 'work', 'money'])
    expect(MODES_BY_PLAN.scale).toEqual(['chat', 'inbox', 'work', 'money'])
    expect(MODES_BY_PLAN.enterprise).toEqual(['chat', 'inbox', 'work', 'money'])
  })

  it('free is restricted to chat only', () => {
    expect(MODES_BY_PLAN.free).toEqual(['chat'])
  })
})

describe('MIN_PLAN_FOR_MODE — agrees with MODES_BY_PLAN', () => {
  it.each([
    ['chat',  'free'],
    ['inbox', 'starter'],
    ['work',  'growth'],
    ['money', 'growth'],
  ] as Array<[Mode, PlanName]>)('%s requires %s', (mode, plan) => {
    expect(MIN_PLAN_FOR_MODE[mode]).toBe(plan)
    expect(MODES_BY_PLAN[plan]).toContain(mode)
  })
})

describe('getEnabledModesForPlan', () => {
  it('returns a fresh array (caller can mutate without breaking the constant)', () => {
    const a = getEnabledModesForPlan('growth')
    a.push('chat')
    const b = getEnabledModesForPlan('growth')
    expect(b).toEqual(['chat', 'inbox', 'work', 'money'])
  })

  it.each([
    ['free',    ['chat']],
    ['starter', ['chat', 'inbox']],
    ['growth',  ['chat', 'inbox', 'work', 'money']],
  ] as Array<[PlanName, Mode[]]>)('%s → %j', (plan, expected) => {
    expect(getEnabledModesForPlan(plan)).toEqual(expected)
  })
})

describe('getEnabledModes — async, with mocked Supabase', () => {
  it('returns the modes for the workspace plan', async () => {
    const client = createMockSupabase('growth')
    expect(await getEnabledModes(client, 'org-1')).toEqual(['chat', 'inbox', 'work', 'money'])
  })

  it('falls back to free when no subscription', async () => {
    const client = createMockSupabase(null)
    expect(await getEnabledModes(client, 'org-1')).toEqual(['chat'])
  })

  it('falls back to free on database error rather than throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const client = createFailingSupabase()
    expect(await getEnabledModes(client, 'org-1')).toEqual(['chat'])
    warn.mockRestore()
  })
})

describe('isModeEnabled', () => {
  it('chat is always enabled', async () => {
    const free = createMockSupabase(null)
    expect(await isModeEnabled(free, 'org', 'chat')).toBe(true)
  })

  it('money is locked on starter, unlocked on growth', async () => {
    const starter = createMockSupabase('starter')
    const growth = createMockSupabase('growth')
    expect(await isModeEnabled(starter, 'org', 'money')).toBe(false)
    expect(await isModeEnabled(growth, 'org', 'money')).toBe(true)
  })
})

describe('checkModeAccess', () => {
  it('returns allowed=true with currentPlan + requiredPlan when entitled', async () => {
    const client = createMockSupabase('growth')
    const access = await checkModeAccess(client, 'org-1', 'work')
    expect(access).toEqual({ allowed: true, currentPlan: 'growth', requiredPlan: 'growth' })
  })

  it('returns allowed=false with the plan needed to upgrade when locked', async () => {
    const client = createMockSupabase('starter')
    const access = await checkModeAccess(client, 'org-1', 'money')
    expect(access).toEqual({ allowed: false, currentPlan: 'starter', requiredPlan: 'growth' })
  })

  it('treats unknown subscription as free tier', async () => {
    const client = createMockSupabase(null)
    const access = await checkModeAccess(client, 'org-1', 'inbox')
    expect(access.allowed).toBe(false)
    expect(access.currentPlan).toBe('free')
    expect(access.requiredPlan).toBe('starter')
  })
})

describe('getLockedModesForPlan', () => {
  it.each([
    ['free',    ['inbox', 'work', 'money']],
    ['starter', ['work', 'money']],
    ['growth',  []],
  ] as Array<[PlanName, Mode[]]>)('%s locks %j', (plan, expected) => {
    expect(getLockedModesForPlan(plan)).toEqual(expected)
  })
})
