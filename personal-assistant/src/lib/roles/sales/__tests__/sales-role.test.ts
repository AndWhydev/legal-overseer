import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

function createMockSupabase(data: {
  leads?: Record<string, unknown>[]
  proposals?: Record<string, unknown>[]
  onboardings?: Record<string, unknown>[]
  contacts?: Record<string, unknown>[]
  channel_messages?: Record<string, unknown>[]
  invoices?: Record<string, unknown>[]
  bi_snapshots?: Record<string, unknown>[]
  approval_queue?: Record<string, unknown>[]
  role_workflows?: Record<string, unknown>[]
} = {}) {
  const store: Record<string, Record<string, unknown>[]> = {
    leads: data.leads ?? [],
    proposals: data.proposals ?? [],
    onboardings: data.onboardings ?? [],
    contacts: data.contacts ?? [],
    channel_messages: data.channel_messages ?? [],
    invoices: data.invoices ?? [],
    bi_snapshots: data.bi_snapshots ?? [],
    approval_queue: data.approval_queue ?? [],
    role_workflows: data.role_workflows ?? [],
  }

  const upsertedData: Record<string, Record<string, unknown>[]> = {}
  const insertedData: Record<string, Record<string, unknown>[]> = {}

  function createQueryBuilder(table: string) {
    const filters: Array<{ type: string; args: unknown[] }> = []

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
        } else if (f.type === 'contains') {
          const [_col, _val] = f.args as [string, Record<string, unknown>]
          // Simplified: always pass (contains is complex to mock)
        }
      }
      return result
    }

    let isCountQuery = false

    const builder: Record<string, unknown> = {
      select(_fields?: string, opts?: Record<string, unknown>) {
        if (opts?.count === 'exact' && opts?.head === true) {
          isCountQuery = true
        }
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
      contains(col: string, val: unknown) {
        filters.push({ type: 'contains', args: [col, val] })
        return builder
      },
      order() { return builder },
      limit() { return builder },
      single() {
        const rows = store[table] ?? []
        const filtered = applyFilters(rows)
        if (filtered.length === 0) {
          return Promise.resolve({ data: null, error: { message: 'Not found', code: 'PGRST116' } })
        }
        return Promise.resolve({ data: filtered[0], error: null })
      },
      insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
        if (!insertedData[table]) insertedData[table] = []
        const items = Array.isArray(payload) ? payload : [payload]
        insertedData[table].push(...items)
        return {
          select() {
            return {
              single() {
                return Promise.resolve({ data: items[0], error: null })
              },
            }
          },
        }
      },
      update(payload: Record<string, unknown>) {
        return builder
      },
      upsert(payload: Record<string, unknown>, _opts?: Record<string, unknown>) {
        if (!upsertedData[table]) upsertedData[table] = []
        upsertedData[table].push(payload)
        return Promise.resolve({ data: payload, error: null })
      },
      then(resolve: (val: unknown) => void) {
        const rows = store[table] ?? []
        const filtered = applyFilters(rows)
        if (isCountQuery) {
          resolve({ count: filtered.length, error: null })
        } else {
          resolve({ data: filtered, error: null })
        }
      },
    }

    return builder
  }

  return {
    supabase: {
      from: (table: string) => createQueryBuilder(table),
    },
    upsertedData,
    insertedData,
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
// Tests: Lead Wrapper
// ---------------------------------------------------------------------------

describe('lead-wrapper', () => {
  it('wraps lead swarm tick and translates to role actions/insights', async () => {
    // We test the wrapper by checking it calls runLeadSwarmTick and maps results.
    // Since lead-swarm has its own tests, we mock it here.
    vi.mock('@/lib/agent/lead-swarm', () => ({
      runLeadSwarmTick: vi.fn().mockResolvedValue({
        processed: 5,
        created: 2,
        qualified: 2,
        hot: 1,
        autoApproved: 1,
        failed: 0,
      }),
    }))

    const { runWrappedLeadTick } = await import('../lead-wrapper')

    const ctx = {
      config: { id: 'cfg-1', config: {} },
      state: { state: {} },
      supabase: createMockSupabase().supabase as any,
      orgId: 'org-test-1234',
      autonomyLevel: 'copilot' as const,
    }

    const result = await runWrappedLeadTick(ctx as any)

    expect(result.raw).toBeDefined()
    expect(result.raw!.processed).toBe(5)
    expect(result.raw!.created).toBe(2)

    // Should have lead_created action
    const createAction = result.actions.find((a) => a.type === 'lead_created')
    expect(createAction).toBeDefined()
    expect(createAction!.payload.created).toBe(2)

    // Should have lead_ack_sent action
    const ackAction = result.actions.find((a) => a.type === 'lead_ack_sent')
    expect(ackAction).toBeDefined()

    // Should have hot lead insight
    const hotInsight = result.insights.find((i) => i.summary.includes('hot lead'))
    expect(hotInsight).toBeDefined()
    expect(hotInsight!.priority).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Tests: Stale Lead Detection (Nurture)
// ---------------------------------------------------------------------------

describe('lead-nurture', () => {
  it('detects stale leads based on configurable days', async () => {
    const { checkStaleLeads } = await import('../lead-nurture')

    const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const freshDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()

    const { supabase } = createMockSupabase({
      leads: [
        { id: 'l1', org_id: 'org1', source_channel: 'email', source_detail: 'alice@test.com', status: 'qualified', score: 'hot', updated_at: staleDate, metadata: {} },
        { id: 'l2', org_id: 'org1', source_channel: 'web', source_detail: 'bob@test.com', status: 'qualified', score: 'warm', updated_at: staleDate, metadata: { nurture_attempts: 3 } },
        { id: 'l3', org_id: 'org1', source_channel: 'email', source_detail: 'carol@test.com', status: 'qualified', score: 'cold', updated_at: freshDate, metadata: {} },
      ],
    })

    const stale = await checkStaleLeads(supabase as any, 'org1', 7)

    // l1 is stale and eligible, l2 is maxed out (3 attempts), l3 is fresh
    expect(stale.length).toBe(1)
    expect(stale[0].id).toBe('l1')
    expect(stale[0].score).toBe('hot')
    expect(stale[0].daysSinceLastActivity).toBeGreaterThanOrEqual(10)
  })

  it('detects stale proposals not viewed after N days', async () => {
    const { checkStaleProposals } = await import('../lead-nurture')

    const staleDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()

    const { supabase } = createMockSupabase({
      proposals: [
        { id: 'p1', org_id: 'org1', title: 'Website for Acme', client_contact_id: 'c1', status: 'sent', sent_at: staleDate, metadata: {} },
        { id: 'p2', org_id: 'org1', title: 'App for Beta', client_contact_id: 'c2', status: 'sent', sent_at: staleDate, metadata: { follow_up_count: 2 } },
      ],
      contacts: [
        { id: 'c1', name: 'Acme Corp', email: 'acme@test.com' },
        { id: 'c2', name: 'Beta Inc', email: 'beta@test.com' },
      ],
    })

    const stale = await checkStaleProposals(supabase as any, 'org1', 3)

    // p1 is stale and eligible, p2 is maxed out (2 follow-ups)
    expect(stale.length).toBe(1)
    expect(stale[0].id).toBe('p1')
    expect(stale[0].title).toBe('Website for Acme')
    expect(stale[0].daysSinceSent).toBeGreaterThanOrEqual(5)
  })

  it('creates nurture workflow with correct steps for lead type', async () => {
    const { createNurtureWorkflow, NURTURE_SCHEDULE } = await import('../lead-nurture')

    const lead = {
      id: 'l1',
      contactName: 'Alice',
      contactEmail: 'alice@test.com',
      score: 'hot',
      status: 'qualified',
      daysSinceLastActivity: 10,
      sourceChannel: 'email',
      nurtureAttempts: 0,
    }

    const wf = createNurtureWorkflow(lead, 'lead')

    expect(wf.workflowType).toBe('lead_nurture')
    expect(wf.steps.length).toBe(NURTURE_SCHEDULE.lead_nurture.length)
    expect(wf.steps[0].stepId).toBe('gentle_checkin')
    expect(wf.context.targetId).toBe('l1')
    expect(wf.context.contactEmail).toBe('alice@test.com')
  })
})

// ---------------------------------------------------------------------------
// Tests: Client Onboarding (Conversion Detection)
// ---------------------------------------------------------------------------

describe('client-onboarding', () => {
  it('detects new conversions from accepted proposals', async () => {
    const { checkNewConversions } = await import('../client-onboarding')

    const { supabase } = createMockSupabase({
      proposals: [
        { id: 'p1', org_id: 'org1', title: 'Website Build', client_contact_id: 'c1', project_type: 'website', status: 'accepted', accepted_at: new Date().toISOString() },
        { id: 'p2', org_id: 'org1', title: 'SEO Package', client_contact_id: 'c2', project_type: 'seo', status: 'accepted', accepted_at: new Date().toISOString() },
      ],
      onboardings: [
        // p2 already has an onboarding
        { id: 'o1', org_id: 'org1', proposal_id: 'p2' },
      ],
      contacts: [
        { id: 'c1', name: 'Acme Corp', email: 'acme@test.com' },
        { id: 'c2', name: 'Beta Inc', email: 'beta@test.com' },
      ],
      role_workflows: [],
    })

    const conversions = await checkNewConversions(supabase as any, 'org1')

    // Only p1 should be a new conversion (p2 already has onboarding)
    expect(conversions.length).toBe(1)
    expect(conversions[0].proposalId).toBe('p1')
    expect(conversions[0].clientName).toBe('Acme Corp')
    expect(conversions[0].projectType).toBe('website')
  })

  it('creates onboarding workflow with correct steps', async () => {
    const { createOnboardingWorkflow } = await import('../client-onboarding')

    const conversion = {
      proposalId: 'p1',
      proposalTitle: 'Website Build',
      clientName: 'Acme Corp',
      clientContactId: 'c1',
      clientEmail: 'acme@test.com',
      projectType: 'website',
      acceptedAt: new Date().toISOString(),
    }

    const wf = createOnboardingWorkflow(conversion)

    expect(wf.workflowType).toBe('client_onboarding')
    expect(wf.steps.length).toBe(5)
    expect(wf.steps[0].stepId).toBe('trigger_onboarding')
    expect(wf.steps[1].stepId).toBe('welcome_email')
    expect(wf.context.proposalId).toBe('p1')
    expect(wf.context.clientName).toBe('Acme Corp')
  })
})

// ---------------------------------------------------------------------------
// Tests: Win/Loss Analysis
// ---------------------------------------------------------------------------

describe('win-loss-learner', () => {
  it('analyzes win/loss patterns from proposal outcomes', async () => {
    const { analyzeWinLossPatterns } = await import('../win-loss-learner')

    const { supabase } = createMockSupabase({
      proposals: [
        { id: 'p1', org_id: 'org1', project_type: 'website', status: 'accepted', pricing: JSON.stringify([{ tier: 'Standard', price: 3500 }]), created_at: '2026-01-01T00:00:00Z', accepted_at: '2026-01-05T00:00:00Z', sent_at: '2026-01-02T00:00:00Z' },
        { id: 'p2', org_id: 'org1', project_type: 'website', status: 'accepted', pricing: JSON.stringify([{ tier: 'Standard', price: 4000 }]), created_at: '2026-01-10T00:00:00Z', accepted_at: '2026-01-13T00:00:00Z', sent_at: '2026-01-11T00:00:00Z' },
        { id: 'p3', org_id: 'org1', project_type: 'website', status: 'declined', pricing: JSON.stringify([{ tier: 'Standard', price: 8000 }]), created_at: '2026-01-15T00:00:00Z', sent_at: '2026-01-16T00:00:00Z' },
        { id: 'p4', org_id: 'org1', project_type: 'seo', status: 'accepted', pricing: JSON.stringify([{ tier: 'Standard', price: 2000 }]), created_at: '2026-02-01T00:00:00Z', accepted_at: '2026-02-03T00:00:00Z', sent_at: '2026-02-02T00:00:00Z' },
        { id: 'p5', org_id: 'org1', project_type: 'seo', status: 'declined', pricing: JSON.stringify([{ tier: 'Standard', price: 5000 }]), created_at: '2026-02-10T00:00:00Z', sent_at: '2026-02-11T00:00:00Z' },
      ],
    })

    const result = await analyzeWinLossPatterns(supabase as any, 'org1')

    expect(result.stats.totalWins).toBe(3)
    expect(result.stats.totalLosses).toBe(2)
    expect(result.stats.winRate).toBe(60)
    expect(result.stats.avgWinValue).toBeGreaterThan(0)
    expect(result.stats.avgTimeToClose).toBeGreaterThan(0)

    // Should have pricing patterns for website and seo
    expect(result.pricingPatterns.website).toBeDefined()
    expect(result.pricingPatterns.website.count).toBe(2)
    expect(result.pricingPatterns.seo).toBeDefined()

    // Should have learnings
    expect(result.learnings.length).toBeGreaterThan(0)
    // Win rate learning should be present
    expect(result.learnings.some((l) => l.summary.includes('Win rate'))).toBe(true)
  })

  it('returns empty results when no resolved proposals exist', async () => {
    const { analyzeWinLossPatterns } = await import('../win-loss-learner')

    const { supabase } = createMockSupabase({
      proposals: [
        { id: 'p1', org_id: 'org1', status: 'draft', pricing: '[]' },
      ],
    })

    const result = await analyzeWinLossPatterns(supabase as any, 'org1')

    expect(result.stats.totalWins).toBe(0)
    expect(result.stats.totalLosses).toBe(0)
    expect(result.learnings.length).toBe(0)
    expect(Object.keys(result.pricingPatterns).length).toBe(0)
  })

  it('detects price sensitivity when losses are priced higher', async () => {
    const { analyzeWinLossPatterns } = await import('../win-loss-learner')

    const { supabase } = createMockSupabase({
      proposals: [
        // Wins at moderate prices
        { id: 'w1', org_id: 'org1', project_type: 'website', status: 'accepted', pricing: JSON.stringify([{ tier: 'Standard', price: 3000 }]), created_at: '2026-01-01T00:00:00Z', sent_at: '2026-01-01T00:00:00Z', accepted_at: '2026-01-03T00:00:00Z' },
        { id: 'w2', org_id: 'org1', project_type: 'website', status: 'accepted', pricing: JSON.stringify([{ tier: 'Standard', price: 3500 }]), created_at: '2026-01-05T00:00:00Z', sent_at: '2026-01-05T00:00:00Z', accepted_at: '2026-01-07T00:00:00Z' },
        { id: 'w3', org_id: 'org1', project_type: 'website', status: 'accepted', pricing: JSON.stringify([{ tier: 'Standard', price: 4000 }]), created_at: '2026-01-10T00:00:00Z', sent_at: '2026-01-10T00:00:00Z', accepted_at: '2026-01-12T00:00:00Z' },
        // Losses at high prices
        { id: 'l1', org_id: 'org1', project_type: 'website', status: 'declined', pricing: JSON.stringify([{ tier: 'Standard', price: 8000 }]), created_at: '2026-01-15T00:00:00Z', sent_at: '2026-01-15T00:00:00Z' },
        { id: 'l2', org_id: 'org1', project_type: 'website', status: 'declined', pricing: JSON.stringify([{ tier: 'Standard', price: 9000 }]), created_at: '2026-01-20T00:00:00Z', sent_at: '2026-01-20T00:00:00Z' },
      ],
    })

    const result = await analyzeWinLossPatterns(supabase as any, 'org1')

    // Should detect price sensitivity
    const priceLearning = result.learnings.find((l) => l.summary.includes('Price sensitivity'))
    expect(priceLearning).toBeDefined()
    expect(priceLearning!.priority).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Tests: Pipeline Tracker
// ---------------------------------------------------------------------------

describe('pipeline-tracker', () => {
  it('computes pipeline snapshot with all stages', async () => {
    const { computePipelineSnapshot } = await import('../pipeline-tracker')

    const { supabase } = createMockSupabase({
      leads: [
        { id: 'l1', org_id: 'org1', score: 'hot', estimated_value: 5000, status: 'qualified' },
        { id: 'l2', org_id: 'org1', score: 'warm', estimated_value: 3000, status: 'qualified' },
        { id: 'l3', org_id: 'org1', score: 'cold', estimated_value: 1000, status: 'new' },
        { id: 'l4', org_id: 'org1', score: 'hot', estimated_value: 8000, status: 'converted' },
      ],
      proposals: [
        { id: 'p1', org_id: 'org1', status: 'sent', pricing: JSON.stringify([{ tier: 'Standard', price: 3500 }]) },
        { id: 'p2', org_id: 'org1', status: 'viewed', pricing: JSON.stringify([{ tier: 'Standard', price: 4000 }]) },
        { id: 'p3', org_id: 'org1', status: 'accepted', pricing: JSON.stringify([{ tier: 'Standard', price: 5000 }]) },
        { id: 'p4', org_id: 'org1', status: 'declined', pricing: JSON.stringify([{ tier: 'Standard', price: 6000 }]) },
      ],
      onboardings: [
        { id: 'o1', org_id: 'org1', status: 'active' },
      ],
      bi_snapshots: [], // No cache
    })

    const snapshot = await computePipelineSnapshot(supabase as any, 'org1')

    // Lead counts (only active statuses)
    expect(snapshot.totalLeads).toBe(3) // l1, l2, l3 (l4 is converted)
    expect(snapshot.hotLeads).toBe(1)
    expect(snapshot.warmLeads).toBe(1)
    expect(snapshot.coldLeads).toBe(1)

    // Proposal counts
    expect(snapshot.totalProposals).toBe(4)
    expect(snapshot.proposalsSent).toBe(2) // sent + viewed
    expect(snapshot.proposalsAccepted).toBe(1)
    expect(snapshot.proposalsDeclined).toBe(1)

    // Conversion rate
    expect(snapshot.conversionRate).toBe(50) // 1 accepted / 2 resolved

    // Pipeline value (draft + sent + viewed proposals)
    expect(snapshot.pipelineValue).toBeGreaterThan(0)

    // Active clients
    expect(snapshot.activeClients).toBe(1)
  })

  it('returns cached snapshot when fresh', async () => {
    const { computePipelineSnapshot } = await import('../pipeline-tracker')

    const cachedSnapshot = {
      period: 'current',
      totalLeads: 10,
      hotLeads: 3,
      warmLeads: 4,
      coldLeads: 3,
      totalProposals: 5,
      proposalsSent: 3,
      proposalsAccepted: 2,
      proposalsDeclined: 1,
      activeClients: 2,
      pipelineValue: 15000,
      conversionRate: 67,
      alerts: [],
    }

    const { supabase } = createMockSupabase({
      bi_snapshots: [{
        org_id: 'org1',
        metric_type: 'sales_pipeline',
        data: cachedSnapshot,
        expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      }],
    })

    const result = await computePipelineSnapshot(supabase as any, 'org1')
    expect(result.totalLeads).toBe(10)
    expect(result.conversionRate).toBe(67)
  })

  it('generates alert when pipeline is drying up', async () => {
    const { computePipelineSnapshot } = await import('../pipeline-tracker')

    const { supabase } = createMockSupabase({
      leads: [
        { id: 'l1', org_id: 'org1', score: 'warm', status: 'qualified', estimated_value: 3000 },
      ],
      proposals: [
        { id: 'p1', org_id: 'org1', status: 'sent', pricing: JSON.stringify([{ tier: 'Standard', price: 3000 }]) },
      ],
      onboardings: [],
      bi_snapshots: [],
    })

    const snapshot = await computePipelineSnapshot(supabase as any, 'org1')

    const dryAlert = snapshot.alerts.find((a) => a.summary.includes('dry'))
    expect(dryAlert).toBeDefined()
    expect(dryAlert!.priority).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Tests: Proposal Generator (Pricing Context)
// ---------------------------------------------------------------------------

describe('proposal-generator', () => {
  it('fetches pricing context from historical invoices and proposals', async () => {
    const { fetchPricingContext } = await import('../proposal-generator')

    const { supabase } = createMockSupabase({
      invoices: [
        { id: 'i1', org_id: 'org1', total: 3500, status: 'paid', created_at: '2026-01-15T00:00:00Z', client_contact_id: 'c1', metadata: { project_type: 'website' } },
        { id: 'i2', org_id: 'org1', total: 4000, status: 'sent', created_at: '2026-02-01T00:00:00Z', client_contact_id: 'c2', metadata: { project_type: 'website' } },
      ],
      proposals: [
        { id: 'p1', org_id: 'org1', project_type: 'website', status: 'accepted', pricing: JSON.stringify([{ tier: 'Standard', price: 3800 }]), created_at: '2026-01-20T00:00:00Z', client_contact_id: 'c1' },
      ],
      contacts: [
        { id: 'c1', name: 'Acme Corp' },
        { id: 'c2', name: 'Beta Inc' },
      ],
    })

    const context = await fetchPricingContext(supabase as any, 'org1', 'website')

    expect(context.length).toBeGreaterThan(0)
    expect(context.every((c) => c.amount > 0)).toBe(true)
    expect(context.some((c) => c.source === 'invoice')).toBe(true)
    expect(context.some((c) => c.source === 'proposal')).toBe(true)
  })
})
