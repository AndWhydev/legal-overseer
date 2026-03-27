import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RoleContext } from '../../role-runtime'
import type { RoleConfig, RoleState, AutonomyLevel } from '@/lib/bitbit-core/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const mockRunVisibilityAudit = vi.fn()
const mockGetPreviousAudits = vi.fn()
const mockDetectVisibilityChanges = vi.fn()

vi.mock('@/lib/agent/ai-visibility-audit', () => ({
  runVisibilityAudit: (...args: unknown[]) => mockRunVisibilityAudit(...args),
  getPreviousAudits: (...args: unknown[]) => mockGetPreviousAudits(...args),
  detectVisibilityChanges: (...args: unknown[]) => mockDetectVisibilityChanges(...args),
}))

const mockRunTenderHunterTick = vi.fn()
const mockFilterTenders = vi.fn()

vi.mock('@/lib/agent/tender-hunter', () => ({
  runTenderHunterTick: (...args: unknown[]) => mockRunTenderHunterTick(...args),
  filterTenders: (...args: unknown[]) => mockFilterTenders(...args),
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  dispatchNotification: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { growthRole } from '../growth-role'
import { getRole } from '../../role-registry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(overrides?: {
  config?: Partial<Record<string, unknown>>
  state?: Partial<Record<string, unknown>>
  autonomyLevel?: AutonomyLevel
}): RoleContext {
  return {
    config: {
      id: 'rc-growth-test',
      org_id: 'org-test-123',
      role_type: 'growth',
      enabled: true,
      autonomy_level: 'copilot',
      tick_interval_seconds: 3600,
      daily_budget_cents: 200,
      config: {
        seo_enabled: true,
        tender_enabled: true,
        seo_audit_interval_hours: 24,
        tender_scan_interval_hours: 24,
        seo_brand_name: 'TestBrand',
        seo_domain: 'testbrand.com',
        seo_queries: ['test query 1', 'test query 2'],
        seo_competitors: ['competitor1.com'],
        ...(overrides?.config ?? {}),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as RoleConfig,
    state: {
      id: 'rs-growth-test',
      role_config_id: 'rc-growth-test',
      org_id: 'org-test-123',
      state: {
        last_seo_audit_at: null,
        last_tender_scan_at: null,
        ...(overrides?.state ?? {}),
      },
      version: 1,
      last_tick_at: null,
      next_tick_at: null,
    } as RoleState,
    supabase: {} as RoleContext['supabase'],
    orgId: 'org-test-123',
    autonomyLevel: overrides?.autonomyLevel ?? 'copilot',
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Growth Role', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default mock returns
    mockRunVisibilityAudit.mockResolvedValue({
      id: 'audit-1',
      orgId: 'org-test-123',
      domain: 'testbrand.com',
      brandName: 'TestBrand',
      overallScore: 65,
      queryResults: [],
      competitorScores: {},
      recommendations: ['Improve schema markup', 'Add FAQ content', 'Build citations'],
      auditedAt: new Date().toISOString(),
    })
    mockGetPreviousAudits.mockResolvedValue([])
    mockDetectVisibilityChanges.mockReturnValue([])
    mockRunTenderHunterTick.mockResolvedValue({
      scanned: 10,
      newTenders: 0,
      evaluated: 5,
      errors: 0,
    })
    mockFilterTenders.mockResolvedValue([])
  })

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe('registration', () => {
    it('should register via side-effect import and be discoverable via getRole', () => {
      const role = getRole('growth')
      expect(role).toBeDefined()
      expect(role!.type).toBe('growth')
      expect(role!.name).toBe('Growth')
    })
  })

  // -------------------------------------------------------------------------
  // evaluate() - SEO monitoring
  // -------------------------------------------------------------------------

  describe('evaluate() - SEO monitoring', () => {
    it('should call SEO audit when interval has elapsed (first run, last_seo_audit_at is null)', async () => {
      const ctx = createMockContext()
      await growthRole.evaluate(ctx)

      expect(mockRunVisibilityAudit).toHaveBeenCalledOnce()
      expect(mockRunVisibilityAudit).toHaveBeenCalledWith(
        ctx.supabase,
        'org-test-123',
        expect.objectContaining({
          domain: 'testbrand.com',
          brandName: 'TestBrand',
          queries: ['test query 1', 'test query 2'],
        }),
      )
    })

    it('should skip SEO audit when interval has NOT elapsed', async () => {
      const recentTime = new Date(Date.now() - 1 * 3600000).toISOString() // 1 hour ago
      const ctx = createMockContext({
        state: { last_seo_audit_at: recentTime },
      })
      await growthRole.evaluate(ctx)

      expect(mockRunVisibilityAudit).not.toHaveBeenCalled()
    })

    it('should call SEO audit when enough time has elapsed', async () => {
      const oldTime = new Date(Date.now() - 25 * 3600000).toISOString() // 25 hours ago
      const ctx = createMockContext({
        state: { last_seo_audit_at: oldTime },
      })
      await growthRole.evaluate(ctx)

      expect(mockRunVisibilityAudit).toHaveBeenCalledOnce()
    })

    it('should surface ranking drops as RoleAction with type seo_ranking_drop', async () => {
      const previousAudit = {
        id: 'prev-1',
        orgId: 'org-test-123',
        overallScore: 75,
        queryResults: [],
        competitorScores: {},
        recommendations: [],
        auditedAt: new Date(Date.now() - 86400000).toISOString(),
      }
      mockGetPreviousAudits.mockResolvedValue([previousAudit])
      mockDetectVisibilityChanges.mockReturnValue([
        {
          type: 'lost_mention',
          query: 'test query 1',
          source: 'ChatGPT',
          detail: 'Lost mention for "test query 1" on ChatGPT',
          severity: 'warning',
        },
        {
          type: 'score_change',
          detail: 'Visibility score declined from 75 to 65 (-10)',
          severity: 'warning',
        },
      ])

      const ctx = createMockContext()
      const result = await growthRole.evaluate(ctx)

      const seoActions = result.actions.filter(a => a.type === 'seo_ranking_drop')
      expect(seoActions.length).toBe(2)
      expect(seoActions[0].summary).toContain('Lost mention')
      expect(seoActions[0].confidence).toBe(0.85)
      expect(seoActions[0].payload).toHaveProperty('recommendations')
    })

    it('should surface critically low score as high-priority RoleInsight', async () => {
      mockRunVisibilityAudit.mockResolvedValue({
        id: 'audit-low',
        orgId: 'org-test-123',
        domain: 'testbrand.com',
        brandName: 'TestBrand',
        overallScore: 20,
        queryResults: [],
        competitorScores: {},
        recommendations: ['Urgent: rebuild presence'],
        auditedAt: new Date().toISOString(),
      })

      const ctx = createMockContext()
      const result = await growthRole.evaluate(ctx)

      const highInsights = result.insights.filter(i => i.priority === 'high')
      expect(highInsights.length).toBeGreaterThanOrEqual(1)
      const scoreInsight = highInsights.find(i => i.summary.includes('critically low'))
      expect(scoreInsight).toBeDefined()
      expect(scoreInsight!.details).toHaveProperty('score', 20)
    })

    it('should return empty when seo_enabled is false', async () => {
      const ctx = createMockContext({
        config: { seo_enabled: false, tender_enabled: false },
      })
      const result = await growthRole.evaluate(ctx)

      expect(mockRunVisibilityAudit).not.toHaveBeenCalled()
      expect(mockRunTenderHunterTick).not.toHaveBeenCalled()
      expect(result.actions).toHaveLength(0)
      expect(result.insights).toHaveLength(0)
    })

    it('should return empty when required config fields missing (no brand_name, no queries)', async () => {
      const ctx = createMockContext({
        config: {
          seo_enabled: true,
          tender_enabled: false,
          seo_brand_name: undefined,
          seo_queries: undefined,
        },
      })
      const result = await growthRole.evaluate(ctx)

      expect(mockRunVisibilityAudit).not.toHaveBeenCalled()
      expect(result.actions).toHaveLength(0)
    })
  })

  // -------------------------------------------------------------------------
  // evaluate() - Tender monitoring
  // -------------------------------------------------------------------------

  describe('evaluate() - Tender monitoring', () => {
    it('should call tender scan when interval has elapsed (first run)', async () => {
      const ctx = createMockContext({
        config: { seo_enabled: false },
      })
      await growthRole.evaluate(ctx)

      expect(mockRunTenderHunterTick).toHaveBeenCalledOnce()
      expect(mockRunTenderHunterTick).toHaveBeenCalledWith(
        ctx.supabase,
        'org-test-123',
        'rc-growth-test',
      )
    })

    it('should skip tender scan when interval has NOT elapsed', async () => {
      const recentTime = new Date(Date.now() - 1 * 3600000).toISOString()
      const ctx = createMockContext({
        config: { seo_enabled: false },
        state: { last_tender_scan_at: recentTime },
      })
      await growthRole.evaluate(ctx)

      expect(mockRunTenderHunterTick).not.toHaveBeenCalled()
    })

    it('should surface high-fit tenders as RoleAction with type tender_match', async () => {
      mockRunTenderHunterTick.mockResolvedValue({
        scanned: 15,
        newTenders: 3,
        evaluated: 10,
        errors: 0,
      })
      mockFilterTenders.mockResolvedValue([
        {
          id: 'tender-1',
          title: 'Website Redesign Project',
          source: 'austender',
          value: 50000,
          deadline: '2026-05-01',
          fit_score: 85,
        },
        {
          id: 'tender-2',
          title: 'Mobile App Development',
          source: 'qtenders',
          value: 120000,
          deadline: '2026-06-01',
          fit_score: 60,
        },
        {
          id: 'tender-3',
          title: 'Low Fit Tender',
          source: 'nsw',
          value: 10000,
          deadline: '2026-04-01',
          fit_score: 30,
        },
      ])

      const ctx = createMockContext({ config: { seo_enabled: false } })
      const result = await growthRole.evaluate(ctx)

      const tenderActions = result.actions.filter(a => a.type === 'tender_match')
      expect(tenderActions.length).toBe(2) // Only fit_score >= 50
      expect(tenderActions[0].payload).toHaveProperty('fitScore', 85)
      expect(tenderActions[0].payload).toHaveProperty('title', 'Website Redesign Project')
      expect(tenderActions[0].confidence).toBeCloseTo(0.85)
      expect(tenderActions[1].confidence).toBeCloseTo(0.60)
    })

    it('should produce summary insight with scan totals', async () => {
      mockRunTenderHunterTick.mockResolvedValue({
        scanned: 15,
        newTenders: 3,
        evaluated: 10,
        errors: 0,
      })
      mockFilterTenders.mockResolvedValue([
        { id: 't1', title: 'Good Tender', source: 'austender', value: 50000, deadline: '2026-05-01', fit_score: 70 },
      ])

      const ctx = createMockContext({ config: { seo_enabled: false } })
      const result = await growthRole.evaluate(ctx)

      const summaryInsight = result.insights.find(i => i.summary.includes('Tender scan'))
      expect(summaryInsight).toBeDefined()
      expect(summaryInsight!.summary).toContain('3 new tenders')
      expect(summaryInsight!.details).toHaveProperty('highFitCount', 1)
    })
  })

  // -------------------------------------------------------------------------
  // hasChanges()
  // -------------------------------------------------------------------------

  describe('hasChanges()', () => {
    it('should return false when both intervals have NOT elapsed', async () => {
      const recentTime = new Date(Date.now() - 1 * 3600000).toISOString() // 1 hour ago
      const ctx = createMockContext({
        state: {
          last_seo_audit_at: recentTime,
          last_tender_scan_at: recentTime,
        },
      })
      const result = await growthRole.hasChanges(ctx)
      expect(result).toBe(false)
    })

    it('should return true when SEO interval has elapsed', async () => {
      const oldTime = new Date(Date.now() - 25 * 3600000).toISOString()
      const recentTime = new Date(Date.now() - 1 * 3600000).toISOString()
      const ctx = createMockContext({
        state: {
          last_seo_audit_at: oldTime,
          last_tender_scan_at: recentTime,
        },
      })
      const result = await growthRole.hasChanges(ctx)
      expect(result).toBe(true)
    })

    it('should return true when tender interval has elapsed', async () => {
      const recentTime = new Date(Date.now() - 1 * 3600000).toISOString()
      const oldTime = new Date(Date.now() - 25 * 3600000).toISOString()
      const ctx = createMockContext({
        state: {
          last_seo_audit_at: recentTime,
          last_tender_scan_at: oldTime,
        },
      })
      const result = await growthRole.hasChanges(ctx)
      expect(result).toBe(true)
    })

    it('should return true when neither has ever run (null timestamps)', async () => {
      const ctx = createMockContext({
        state: {
          last_seo_audit_at: null,
          last_tender_scan_at: null,
        },
      })
      const result = await growthRole.hasChanges(ctx)
      expect(result).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // defaultConfig()
  // -------------------------------------------------------------------------

  describe('defaultConfig()', () => {
    it('should return sensible defaults', () => {
      const config = growthRole.defaultConfig()
      expect(config.tick_interval_seconds).toBe(3600)
      expect(config.daily_budget_cents).toBe(200)
      expect(config.autonomy_level).toBe('copilot')
      expect(config.config).toHaveProperty('seo_enabled', true)
      expect(config.config).toHaveProperty('tender_enabled', true)
    })
  })
})
