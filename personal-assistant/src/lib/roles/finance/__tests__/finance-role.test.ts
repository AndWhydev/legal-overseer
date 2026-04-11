import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

function createMockSupabase(data: {
  invoices?: Record<string, unknown>[]
  contacts?: Record<string, unknown>[]
  bi_snapshots?: Record<string, unknown>[]
} = {}) {
  const store: Record<string, Record<string, unknown>[]> = {
    invoices: data.invoices ?? [],
    contacts: data.contacts ?? [],
    bi_snapshots: data.bi_snapshots ?? [],
  }

  const upsertedData: Record<string, Record<string, unknown>[]> = {}

  function createQueryBuilder(table: string) {
    let filters: Array<{ type: string; args: unknown[] }> = []
    let isSingle = false
    let upsertPayload: Record<string, unknown> | null = null

    function applyFilters(rows: Record<string, unknown>[]) {
      let result = [...rows]
      for (const f of filters) {
        if (f.type === 'eq') {
          const [col, val] = f.args as [string, unknown]
          result = result.filter((r) => r[col] === val)
        } else if (f.type === 'in') {
          const [col, vals] = f.args as [string, unknown[]]
          result = result.filter((r) => vals.includes(r[col]))
        } else if (f.type === 'gte') {
          const [col, val] = f.args as [string, string]
          result = result.filter((r) => (r[col] as string) >= val)
        } else if (f.type === 'lte') {
          const [col, val] = f.args as [string, string]
          result = result.filter((r) => (r[col] as string) <= val)
        } else if (f.type === 'lt') {
          const [col, val] = f.args as [string, string]
          result = result.filter((r) => (r[col] as string) < val)
        } else if (f.type === 'gt') {
          const [col, val] = f.args as [string, string]
          result = result.filter((r) => (r[col] as string) > val)
        } else if (f.type === 'not_is_null') {
          const [col] = f.args as [string]
          result = result.filter((r) => r[col] != null)
        }
      }
      return result
    }

    const builder: Record<string, unknown> = {
      select(_fields?: string, _opts?: Record<string, unknown>) {
        return builder
      },
      eq(col: string, val: unknown) {
        filters.push({ type: 'eq', args: [col, val] })
        return builder
      },
      in(col: string, vals: unknown[]) {
        filters.push({ type: 'in', args: [col, vals] })
        return builder
      },
      gte(col: string, val: unknown) {
        filters.push({ type: 'gte', args: [col, val] })
        return builder
      },
      lte(col: string, val: unknown) {
        filters.push({ type: 'lte', args: [col, val] })
        return builder
      },
      lt(col: string, val: unknown) {
        filters.push({ type: 'lt', args: [col, val] })
        return builder
      },
      gt(col: string, val: unknown) {
        filters.push({ type: 'gt', args: [col, val] })
        return builder
      },
      not(col: string, op: string, _val: unknown) {
        if (op === 'is') {
          filters.push({ type: 'not_is_null', args: [col] })
        }
        return builder
      },
      order() { return builder },
      limit() { return builder },
      single() {
        isSingle = true
        const rows = store[table] ?? []
        const filtered = applyFilters(rows)
        if (filtered.length === 0) {
          return Promise.resolve({ data: null, error: { message: 'Not found', code: 'PGRST116' } })
        }
        return Promise.resolve({ data: filtered[0], error: null })
      },
      upsert(payload: Record<string, unknown>, _opts?: Record<string, unknown>) {
        upsertPayload = payload
        if (!upsertedData[table]) upsertedData[table] = []
        upsertedData[table].push(payload)
        return Promise.resolve({ data: payload, error: null })
      },
      then(resolve: (val: unknown) => void) {
        const rows = store[table] ?? []
        const filtered = applyFilters(rows)
        resolve({ data: filtered, error: null })
      },
    }

    return builder
  }

  return {
    supabase: {
      from: (table: string) => createQueryBuilder(table),
    },
    upsertedData,
  }
}

// ---------------------------------------------------------------------------
// Mock logger
// ---------------------------------------------------------------------------

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Tests: Cash Flow Monitor
// ---------------------------------------------------------------------------

describe('cash-flow-monitor', () => {
  it('computes cash flow with mixed invoice statuses', async () => {
    const { computeCashFlow } = await import('../cash-flow-monitor')

    const today = new Date()
    const thisMonth = today.toISOString().slice(0, 7)
    const paidDate = `${thisMonth}-10`
    const pastDueDate = new Date(today.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const futureDueDate = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { supabase } = createMockSupabase({
      invoices: [
        { id: '1', org_id: 'org1', status: 'paid', total: 1000, paid_date: paidDate },
        { id: '2', org_id: 'org1', status: 'paid', total: 500, paid_date: paidDate },
        { id: '3', org_id: 'org1', status: 'sent', total: 2000, due_date: futureDueDate },
        { id: '4', org_id: 'org1', status: 'overdue', total: 800, due_date: pastDueDate, invoice_number: 'INV-004' },
        { id: '5', org_id: 'org1', status: 'draft', total: 300 },
      ],
      bi_snapshots: [], // No cache
    })

    const snapshot = await computeCashFlow(supabase as any, 'org1')

    expect(snapshot.period).toBe('current_month')
    expect(snapshot.incoming).toBeGreaterThan(0)
    expect(snapshot.pending).toBeGreaterThanOrEqual(0)
    expect(snapshot.overdue).toBeGreaterThanOrEqual(0)
    expect(typeof snapshot.projectedBalance).toBe('number')
    expect(Array.isArray(snapshot.alerts)).toBe(true)
  })

  it('returns cached snapshot when fresh', async () => {
    const { computeCashFlow } = await import('../cash-flow-monitor')

    const cachedSnapshot = {
      period: 'current_month' as const,
      incoming: 5000,
      outgoing: 0,
      pending: 2000,
      overdue: 800,
      projectedBalance: 5000,
      alerts: [],
    }

    const { supabase } = createMockSupabase({
      bi_snapshots: [{
        org_id: 'org1',
        metric_type: 'cash_flow',
        data: cachedSnapshot,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(), // 12h from now
      }],
    })

    const result = await computeCashFlow(supabase as any, 'org1')
    expect(result.incoming).toBe(5000)
    expect(result.pending).toBe(2000)
  })

  it('generates alerts for large overdue amounts', async () => {
    const { computeCashFlow } = await import('../cash-flow-monitor')

    const pastDue = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { supabase } = createMockSupabase({
      invoices: [
        { id: '1', org_id: 'org1', status: 'overdue', total: 6000, due_date: pastDue, invoice_number: 'INV-001', client_contact_id: 'c1' },
      ],
      bi_snapshots: [],
    })

    const snapshot = await computeCashFlow(supabase as any, 'org1')
    expect(snapshot.overdue).toBeGreaterThanOrEqual(6000)
    // Should have at least one high-severity alert
    const highAlerts = snapshot.alerts.filter((a) => a.severity === 'high')
    expect(highAlerts.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: Payment Pattern Learning
// ---------------------------------------------------------------------------

describe('payment-learner', () => {
  it('learns patterns from historical paid invoices', async () => {
    const { learnPaymentPatterns } = await import('../payment-learner')

    const { supabase } = createMockSupabase({
      invoices: [
        { id: '1', org_id: 'org1', status: 'paid', client_contact_id: 'c1', issued_date: '2026-01-01', due_date: '2026-01-15', paid_date: '2026-01-10', total: 1000 },
        { id: '2', org_id: 'org1', status: 'paid', client_contact_id: 'c1', issued_date: '2026-02-01', due_date: '2026-02-15', paid_date: '2026-02-08', total: 1500 },
        { id: '3', org_id: 'org1', status: 'paid', client_contact_id: 'c1', issued_date: '2026-03-01', due_date: '2026-03-15', paid_date: '2026-03-12', total: 2000 },
        { id: '4', org_id: 'org1', status: 'paid', client_contact_id: 'c2', issued_date: '2026-01-01', due_date: '2026-01-15', paid_date: '2026-01-20', total: 500 },
      ],
      contacts: [
        { id: 'c1', org_id: 'org1', name: 'Sezer' },
        { id: 'c2', org_id: 'org1', name: 'Andy' },
      ],
    })

    const patterns = await learnPaymentPatterns(supabase as any, 'org1')

    expect(patterns.length).toBe(2)

    // Sezer has 3 invoices, should be first (sorted by count)
    const sezerPattern = patterns.find((p) => p.contactName === 'Sezer')
    expect(sezerPattern).toBeDefined()
    expect(sezerPattern!.totalInvoices).toBe(3)
    expect(sezerPattern!.avgPaymentDays).toBeGreaterThan(0)
    expect(sezerPattern!.medianPaymentDays).toBeGreaterThan(0)
    expect(sezerPattern!.onTimeRate).toBeGreaterThanOrEqual(0)
    expect(sezerPattern!.onTimeRate).toBeLessThanOrEqual(1)
  })

  it('returns empty array when no paid invoices exist', async () => {
    const { learnPaymentPatterns } = await import('../payment-learner')

    const { supabase } = createMockSupabase({
      invoices: [
        { id: '1', org_id: 'org1', status: 'sent', client_contact_id: 'c1', total: 1000 },
      ],
    })

    const patterns = await learnPaymentPatterns(supabase as any, 'org1')
    expect(patterns.length).toBe(0)
  })

  it('predicts payment date based on historical pattern', async () => {
    const { predictPaymentDate } = await import('../payment-learner')

    const { supabase } = createMockSupabase({
      invoices: [
        { id: '1', org_id: 'org1', status: 'paid', client_contact_id: 'c1', issued_date: '2026-01-01', due_date: '2026-01-15', paid_date: '2026-01-10', total: 1000 },
        { id: '2', org_id: 'org1', status: 'paid', client_contact_id: 'c1', issued_date: '2026-02-01', due_date: '2026-02-15', paid_date: '2026-02-08', total: 1500 },
        { id: '3', org_id: 'org1', status: 'paid', client_contact_id: 'c1', issued_date: '2026-03-01', due_date: '2026-03-15', paid_date: '2026-03-12', total: 2000 },
      ],
      contacts: [
        { id: 'c1', org_id: 'org1', name: 'Sezer' },
      ],
    })

    const prediction = await predictPaymentDate(
      supabase as any, 'org1', 'c1', '2026-04-01', 14,
    )

    expect(prediction.predictedDate).toBeDefined()
    expect(prediction.confidence).toBeGreaterThan(0)
    // Should use median (around 9 days), so predicted date around April 10
    expect(prediction.predictedDate).toMatch(/^2026-04-/)
  })

  it('falls back to terms when no history exists', async () => {
    const { predictPaymentDate } = await import('../payment-learner')

    const { supabase } = createMockSupabase({
      invoices: [],
      contacts: [],
    })

    const prediction = await predictPaymentDate(
      supabase as any, 'org1', 'unknown-contact', '2026-04-01', 14,
    )

    expect(prediction.predictedDate).toBe('2026-04-15')
    expect(prediction.confidence).toBe(0.2) // Low confidence for no-data fallback
  })
})

// ---------------------------------------------------------------------------
// Tests: Weekly Digest
// ---------------------------------------------------------------------------

describe('weekly-digest', () => {
  it('generates a digest with all required sections', async () => {
    const { generateWeeklyDigest } = await import('../weekly-digest')

    const today = new Date()
    const daysAgo = (n: number) => new Date(today.getTime() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const daysFromNow = (n: number) => new Date(today.getTime() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { supabase } = createMockSupabase({
      invoices: [
        // Created this week
        { id: '1', org_id: 'org1', status: 'sent', total: 2000, created_at: daysAgo(2) + 'T10:00:00Z', due_date: daysFromNow(5) },
        // Paid this week
        { id: '2', org_id: 'org1', status: 'paid', total: 1500, paid_date: daysAgo(1), created_at: daysAgo(20) + 'T10:00:00Z' },
        // Overdue
        { id: '3', org_id: 'org1', status: 'overdue', total: 800, due_date: daysAgo(10), invoice_number: 'INV-003', created_at: daysAgo(30) + 'T10:00:00Z' },
        // Upcoming (due in next 7 days)
        { id: '4', org_id: 'org1', status: 'sent', total: 3000, due_date: daysFromNow(3), created_at: daysAgo(10) + 'T10:00:00Z' },
      ],
      bi_snapshots: [],
    })

    const digest = await generateWeeklyDigest(supabase as any, 'org1')

    expect(digest.period.start).toBeDefined()
    expect(digest.period.end).toBeDefined()
    expect(digest.invoiced.count).toBeGreaterThanOrEqual(0)
    expect(typeof digest.invoiced.total).toBe('number')
    expect(typeof digest.received.total).toBe('number')
    expect(typeof digest.overdue.total).toBe('number')
    expect(typeof digest.upcoming.total).toBe('number')
    expect(typeof digest.cashFlowSummary).toBe('string')
    expect(Array.isArray(digest.insights)).toBe(true)
    expect(Array.isArray(digest.actionItems)).toBe(true)
  })

  it('isMondayInAEST detects Monday correctly', async () => {
    const { isMondayInAEST } = await import('../weekly-digest')

    // Create a known Monday in AEST (UTC+10)
    // Monday 2026-03-16 00:00 AEST = Sunday 2026-03-15 14:00 UTC
    const mondayAEST = new Date('2026-03-15T14:00:00Z')
    expect(isMondayInAEST(mondayAEST)).toBe(true)

    // Tuesday 2026-03-17 00:00 AEST = Monday 2026-03-16 14:00 UTC
    const tuesdayAEST = new Date('2026-03-16T14:00:00Z')
    expect(isMondayInAEST(tuesdayAEST)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: Cash Flow Alert Thresholds
// ---------------------------------------------------------------------------

describe('cash-flow alerts', () => {
  it('triggers high-severity alert at $5000+ overdue', async () => {
    const { computeCashFlow } = await import('../cash-flow-monitor')

    const pastDue = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { supabase } = createMockSupabase({
      invoices: [
        { id: '1', org_id: 'org1', status: 'overdue', total: 3000, due_date: pastDue, invoice_number: 'INV-001' },
        { id: '2', org_id: 'org1', status: 'overdue', total: 2500, due_date: pastDue, invoice_number: 'INV-002' },
      ],
      bi_snapshots: [],
    })

    const snapshot = await computeCashFlow(supabase as any, 'org1')
    expect(snapshot.overdue).toBeGreaterThanOrEqual(5000)

    const highAlerts = snapshot.alerts.filter((a) => a.severity === 'high')
    expect(highAlerts.length).toBeGreaterThan(0)
    expect(highAlerts.some((a) => a.type === 'large_overdue')).toBe(true)
  })

  it('triggers medium-severity for moderate overdue', async () => {
    const { computeCashFlow } = await import('../cash-flow-monitor')

    const pastDue = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { supabase } = createMockSupabase({
      invoices: [
        { id: '1', org_id: 'org1', status: 'overdue', total: 500, due_date: pastDue, invoice_number: 'INV-001' },
      ],
      bi_snapshots: [],
    })

    const snapshot = await computeCashFlow(supabase as any, 'org1')
    expect(snapshot.overdue).toBeGreaterThan(0)
    expect(snapshot.overdue).toBeLessThan(5000)

    const mediumAlerts = snapshot.alerts.filter((a) => a.severity === 'medium')
    expect(mediumAlerts.length).toBeGreaterThan(0)
  })
})
