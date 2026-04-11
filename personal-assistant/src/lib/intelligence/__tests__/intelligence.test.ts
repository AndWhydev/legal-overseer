import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  }

  // select with count option
  const originalSelect = chainable.select
  chainable.select = vi.fn((_cols: string, opts?: { count?: string; head?: boolean }) => {
    if (opts?.count === 'exact') {
      return {
        ...chainable,
        eq: vi.fn().mockReturnValue({
          ...chainable,
          eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
          in: vi.fn().mockResolvedValue({ count: 0, error: null }),
        }),
      }
    }
    return chainable
  })

  const from = vi.fn(() => chainable)

  return {
    from,
    _chainable: chainable,
  }
}

// ---------------------------------------------------------------------------
// Revenue Radar Tests
// ---------------------------------------------------------------------------

describe('Revenue Radar', () => {
  it('returns gathering data when below minimum invoices', async () => {
    const { analyzeRevenueOpportunities } = await import('../revenue-radar')

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'invoices') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await analyzeRevenueOpportunities(supabase, 'org-123')
    expect(result.gatheringData).toBe(true)
    expect(result.opportunities).toHaveLength(0)
  })

  it('detects stale clients with no recent activity', async () => {
    const { analyzeRevenueOpportunities } = await import('../revenue-radar')

    const oneHundredDaysAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    const twoHundredDaysAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()

    let invoiceCallCount = 0
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'invoices') {
          invoiceCallCount++
          if (invoiceCallCount === 1) {
            // Count query (MIN_INVOICES check)
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
              }),
            }
          }
          // Data query
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: 'inv-1', client_contact_id: 'contact-1', total: 1000, status: 'paid', created_at: twoHundredDaysAgo, paid_date: twoHundredDaysAgo, currency: 'AUD' },
                  { id: 'inv-2', client_contact_id: 'contact-1', total: 1500, status: 'paid', created_at: oneHundredDaysAgo, paid_date: oneHundredDaysAgo, currency: 'AUD' },
                ],
                error: null,
              }),
            }),
          }
        }
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'contact-1',
                  name: 'Stale Client',
                  last_activity_at: oneHundredDaysAgo,
                  created_at: twoHundredDaysAgo,
                  emails: ['stale@test.com'],
                },
              ],
              error: null,
            }),
          }
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await analyzeRevenueOpportunities(supabase, 'org-123')
    expect(result.gatheringData).toBe(false)
    expect(result.opportunities.length).toBeGreaterThanOrEqual(1)

    const staleOpp = result.opportunities.find((o) => o.type === 'stale_client')
    if (staleOpp) {
      expect(staleOpp.contactName).toBe('Stale Client')
      expect(staleOpp.estimatedValue).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Client Health Tests
// ---------------------------------------------------------------------------

describe('Client Health', () => {
  it('returns gathering data when below minimum contacts', async () => {
    const { computeClientHealth } = await import('../client-health')

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ data: [{ id: 'c1', name: 'Solo', last_activity_at: null, created_at: null }], error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await computeClientHealth(supabase, 'org-123')
    expect(result.gatheringData).toBe(true)
    expect(result.scores).toHaveLength(0)
  })

  it('scores clients on a 0-100 scale with correct grades', async () => {
    const { computeClientHealth } = await import('../client-health')

    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'c1', name: 'Good Client', last_activity_at: recentDate, created_at: recentDate },
                { id: 'c2', name: 'Okay Client', last_activity_at: recentDate, created_at: recentDate },
              ],
              error: null,
            }),
          }
        }
        if (table === 'invoices') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'inv-1', client_contact_id: 'c1', status: 'paid', total: 1000, due_date: recentDate, paid_date: recentDate, created_at: recentDate },
              ],
              error: null,
            }),
          }
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [
                { id: 'p1', contact_id: 'c1', status: 'completed', created_at: recentDate, completed_at: recentDate },
              ],
              error: null,
            }),
          }
        }
        if (table === 'channel_messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: [
                  { id: 'm1', contact_id: 'c1', direction: 'inbound', received_at: recentDate, processed: true },
                  { id: 'm2', contact_id: 'c1', direction: 'outbound', received_at: recentDate, processed: true },
                  { id: 'm3', contact_id: 'c1', direction: 'inbound', received_at: recentDate, processed: true },
                  { id: 'm4', contact_id: 'c1', direction: 'outbound', received_at: recentDate, processed: true },
                  { id: 'm5', contact_id: 'c1', direction: 'outbound', received_at: recentDate, processed: true },
                ],
                error: null,
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await computeClientHealth(supabase, 'org-123')
    expect(result.gatheringData).toBe(false)
    expect(result.scores.length).toBeGreaterThan(0)

    for (const score of result.scores) {
      expect(score.score).toBeGreaterThanOrEqual(0)
      expect(score.score).toBeLessThanOrEqual(100)
      expect(['excellent', 'good', 'fair', 'poor', 'critical']).toContain(score.grade)
      expect(score.breakdown.responsiveness).toBeGreaterThanOrEqual(0)
      expect(score.breakdown.paymentHealth).toBeGreaterThanOrEqual(0)
      expect(score.breakdown.projectProgress).toBeGreaterThanOrEqual(0)
      expect(score.breakdown.engagement).toBeGreaterThanOrEqual(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Cash Flow Prophet Tests
// ---------------------------------------------------------------------------

describe('Cash Flow Prophet', () => {
  it('returns gathering data when below minimum paid invoices', async () => {
    const { projectCashFlow } = await import('../cash-flow-prophet')

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'invoices') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await projectCashFlow(supabase, 'org-123', 3)
    expect(result.gatheringData).toBe(true)
    expect(result.projections).toHaveLength(0)
  })

  it('generates projections for future months', async () => {
    const { projectCashFlow } = await import('../cash-flow-prophet')

    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const lastMonthStr = lastMonth.toISOString().slice(0, 10)

    let invoiceCallCount = 0
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'invoices') {
          invoiceCallCount++
          if (invoiceCallCount === 1) {
            // Count query (MIN_PAID_INVOICES check)
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ count: 10, error: null }),
                }),
              }),
            }
          }
          // Data queries
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockResolvedValue({
              data: [
                { total: 2000, paid_date: lastMonthStr, status: 'paid' },
                { total: 3000, paid_date: lastMonthStr, status: 'paid' },
              ],
              error: null,
            }),
          }
        }
        if (table === 'proposals') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await projectCashFlow(supabase, 'org-123', 3)
    expect(result.gatheringData).toBe(false)
    expect(result.projections.length).toBeGreaterThanOrEqual(1)

    for (const proj of result.projections) {
      expect(proj.month).toMatch(/^\d{4}-\d{2}$/)
      expect(proj.confidence).toBeGreaterThan(0)
      expect(proj.confidence).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Capacity Oracle Tests
// ---------------------------------------------------------------------------

describe('Capacity Oracle', () => {
  it('returns gathering data when no active items', async () => {
    const { assessCapacity } = await import('../capacity-oracle')

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'projects' || table === 'tasks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await assessCapacity(supabase, 'org-123')
    expect(result.gatheringData).toBe(true)
    expect(result.status).toBe('under')
  })

  it('detects overloaded status with many projects', async () => {
    const { assessCapacity } = await import('../capacity-oracle')

    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: Array.from({ length: 7 }, (_, i) => ({
                id: `proj-${i}`,
                name: `Project ${i}`,
                status: 'active',
                contact_id: `contact-${i}`,
                due_date: futureDate,
                created_at: new Date().toISOString(),
              })),
              error: null,
            }),
          }
        }
        if (table === 'tasks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: Array.from({ length: 10 }, (_, i) => ({
                id: `task-${i}`,
                title: `Task ${i}`,
                status: 'todo',
                project_id: `proj-0`,
                due_date: futureDate,
                priority: 'medium',
                created_at: new Date().toISOString(),
              })),
              error: null,
            }),
          }
        }
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: Array.from({ length: 7 }, (_, i) => ({
                id: `contact-${i}`,
                name: `Client ${i}`,
              })),
              error: null,
            }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await assessCapacity(supabase, 'org-123')
    expect(result.gatheringData).toBe(false)
    // 7 projects * 20 + 10 tasks * 5 = 190 -> capped at 150 -> overloaded
    expect(result.status).toBe('overloaded')
    expect(result.activeProjects).toBe(7)
    expect(result.activeTasks).toBe(10)
    expect(result.alerts.some((a) => a.type === 'overcommitted')).toBe(true)
  })

  it('identifies optimal utilization', async () => {
    const { assessCapacity } = await import('../capacity-oracle')

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'bi_snapshots') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'p1', name: 'Proj 1', status: 'active', contact_id: null, due_date: null, created_at: new Date().toISOString() },
                { id: 'p2', name: 'Proj 2', status: 'active', contact_id: null, due_date: null, created_at: new Date().toISOString() },
                { id: 'p3', name: 'Proj 3', status: 'active', contact_id: null, due_date: null, created_at: new Date().toISOString() },
              ],
              error: null,
            }),
          }
        }
        if (table === 'tasks') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 't1', title: 'Task 1', status: 'todo', project_id: null, due_date: null, priority: 'low', created_at: new Date().toISOString() },
              ],
              error: null,
            }),
          }
        }
        if (table === 'contacts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
        }
      }),
    } as unknown as import('@supabase/supabase-js').SupabaseClient

    const result = await assessCapacity(supabase, 'org-123')
    expect(result.gatheringData).toBe(false)
    // 3 projects * 20 + 1 task * 5 = 65 -> optimal
    expect(result.status).toBe('optimal')
    expect(result.utilizationPercent).toBe(65)
  })
})
