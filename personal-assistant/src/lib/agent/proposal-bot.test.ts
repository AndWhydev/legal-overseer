import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  generateScopeDocument,
  generatePricing,
  generateProposalPdf,
  updateProposalStatus,
  recordProposalView,
  listProposals,
  proposalBot,
  type ProposalBrief,
  type ScopeDocument,
  type ProposalRow,
} from './proposal-bot'

// Helper to create a fully chainable mock Supabase query builder
function createMockSupabaseClient() {
  const chainable = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    lt: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
  }

  // Make all chainable methods return the same object for chaining
  chainable.select.mockReturnValue(chainable)
  chainable.insert.mockReturnValue(chainable)
  chainable.update.mockReturnValue(chainable)
  chainable.eq.mockReturnValue(chainable)
  chainable.lt.mockReturnValue(chainable)
  chainable.order.mockReturnValue(chainable)

  // Single returns a promise
  chainable.single.mockResolvedValue({ data: null, error: null })

  return {
    from: vi.fn().mockReturnValue(chainable),
    _chainable: chainable,
  }
}

type MockSupabase = ReturnType<typeof createMockSupabaseClient>

describe('proposal-bot', () => {
  let mockSupabase: MockSupabase

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient()
  })

  // =========================================================================
  // generateScopeDocument Tests
  // =========================================================================

  describe('generateScopeDocument', () => {
    it('generates scope document with all required fields', async () => {
      const brief: ProposalBrief = {
        clientSlug: 'acme-corp',
        projectType: 'website',
        requirements: 'Build responsive website',
      }

      // Setup mock to return contact data
      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: { name: 'ACME Corporation' },
        error: null,
      })

      const scope = await generateScopeDocument(mockSupabase as any, 'org-1', brief)

      expect(scope).toBeDefined()
      expect(scope.clientName).toBe('ACME Corporation')
      expect(scope.projectType).toBe('website')
      expect(scope.requirements).toBeDefined()
      expect(Array.isArray(scope.requirements)).toBe(true)
      expect(scope.deliverables).toBeDefined()
      expect(scope.assumptions).toBeDefined()
      expect(scope.exclusions).toBeDefined()
      expect(scope.timeline).toBe('4-6 weeks')
    })

    it('falls back to slug when contact not found', async () => {
      const brief: ProposalBrief = {
        clientSlug: 'unknown-client',
        projectType: 'mobile_app',
        requirements: 'Build iOS app',
      }

      // Setup mock to return null
      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: null,
        error: new Error('Not found'),
      })

      const scope = await generateScopeDocument(mockSupabase as any, 'org-1', brief)

      expect(scope.clientName).toBe('unknown-client')
      expect(scope.projectType).toBe('mobile_app')
      expect(scope.timeline).toBe('8-12 weeks')
    })

    it('estimates correct timeline for project types', async () => {
      mockSupabase._chainable.single.mockResolvedValue({
        data: { name: 'Test Client' },
        error: null,
      })

      const testCases = [
        ['website', '4-6 weeks'],
        ['mobile_app', '8-12 weeks'],
        ['marketplace', '12-16 weeks'],
        ['ads', '1-2 weeks'],
        ['seo', '3-6 months (ongoing)'],
      ]

      for (const [projectType, expectedTimeline] of testCases) {
        const brief: ProposalBrief = {
          clientSlug: 'test',
          projectType,
          requirements: 'test',
        }

        const scope = await generateScopeDocument(mockSupabase as any, 'org-1', brief)
        expect(scope.timeline).toBe(expectedTimeline)
      }
    })

    it('extracts requirements from text', async () => {
      const brief: ProposalBrief = {
        clientSlug: 'test',
        projectType: 'website',
        requirements: `
- Build responsive website
- SEO optimization
- Contact form
        `,
      }

      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: { name: 'Test Client' },
        error: null,
      })

      const scope = await generateScopeDocument(mockSupabase as any, 'org-1', brief)

      expect(scope.requirements.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // generatePricing Tests
  // =========================================================================

  describe('generatePricing', () => {
    it('generates pricing tiers', async () => {
      const scope: ScopeDocument = {
        title: 'Website Project',
        clientName: 'Test Client',
        projectType: 'website',
        requirements: ['responsive design'],
        deliverables: ['website build'],
        assumptions: [],
        exclusions: [],
        timeline: '4-6 weeks',
      }

      const tiers = await generatePricing(mockSupabase as any, 'org-1', scope)

      expect(Array.isArray(tiers)).toBe(true)
      expect(tiers.length).toBeGreaterThan(0)

      const basicTier = tiers.find((t) => t.tier === 'Basic')
      expect(basicTier).toBeDefined()
      expect(basicTier?.price).toBeGreaterThan(0)
      expect(basicTier?.includes).toBeDefined()
    })

    it('respects budget override', async () => {
      const scope: ScopeDocument = {
        title: 'Project',
        clientName: 'Client',
        projectType: 'website',
        requirements: [],
        deliverables: [],
        assumptions: [],
        exclusions: [],
        timeline: '4 weeks',
      }

      const budget = 5000
      const tiers = await generatePricing(mockSupabase as any, 'org-1', scope, budget)

      const basicTier = tiers.find((t) => t.tier === 'Basic')
      expect(basicTier?.price).toBe(5000)

      const premiumTier = tiers.find((t) => t.tier === 'Premium')
      expect(premiumTier?.price).toBe(Math.round(5000 * 2.2))
    })

    it('generates tiers for different project types', async () => {
      const projectTypes = ['website', 'mobile_app', 'marketplace']

      for (const projectType of projectTypes) {
        const scope: ScopeDocument = {
          title: 'Project',
          clientName: 'Client',
          projectType,
          requirements: [],
          deliverables: [],
          assumptions: [],
          exclusions: [],
          timeline: '4 weeks',
        }

        const tiers = await generatePricing(mockSupabase as any, 'org-1', scope)

        expect(tiers.length).toBeGreaterThan(0)
        expect(tiers[0].price).toBeGreaterThan(0)
      }
    })
  })

  // =========================================================================
  // generateProposalPdf Tests
  // =========================================================================

  describe('generateProposalPdf', () => {
    it('generates proposal PDF HTML', async () => {
      const proposalRow: ProposalRow = {
        id: 'prop-1',
        org_id: 'org-1',
        client_contact_id: null,
        title: 'Website Proposal',
        project_type: 'website',
        scope: 'Build responsive website',
        pricing: JSON.stringify([
          { tier: 'Basic', price: 3500, includes: ['Core deliverables'] },
        ]),
        timeline: '4-6 weeks',
        terms: 'Payment: 50% upfront, 50% on completion.',
        status: 'draft',
        metadata: null,
        created_at: '2026-02-22T00:00:00Z',
        updated_at: '2026-02-22T00:00:00Z',
        sent_at: null,
        viewed_at: null,
        accepted_at: null,
      }

      // Mock: first select is for proposal lookup
      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: proposalRow,
        error: null,
      })

      // Second select is for org lookup (for branding)
      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: { name: 'All Webbed Up', slug: 'all-webbed-up' },
        error: null,
      })

      const result = await generateProposalPdf(mockSupabase as any, 'org-1', 'prop-1')

      expect(result.subject).toBeDefined()
      expect(result.subject).toContain('Website Proposal')
      expect(result.html).toBeDefined()
      expect(result.html).toContain('Proposal')
      expect(result.html).toContain('Pricing Options')
    })

    it('escapes HTML properly', async () => {
      const proposalRow: ProposalRow = {
        id: 'prop-1',
        org_id: 'org-1',
        client_contact_id: null,
        title: 'Website & Design <Script>',
        project_type: 'website',
        scope: 'Scope with "quotes" and <tags>',
        pricing: JSON.stringify([
          { tier: 'Basic', price: 3500, includes: ['Item & Feature'] },
        ]),
        timeline: '4-6 weeks',
        terms: 'Terms',
        status: 'draft',
        metadata: null,
        created_at: '2026-02-22T00:00:00Z',
        updated_at: '2026-02-22T00:00:00Z',
        sent_at: null,
        viewed_at: null,
        accepted_at: null,
      }

      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: proposalRow,
        error: null,
      })

      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: { name: 'Company' },
        error: null,
      })

      const result = await generateProposalPdf(mockSupabase as any, 'org-1', 'prop-1')

      // Should contain escaped characters
      expect(result.html).toContain('&lt;')
      expect(result.html).toContain('&gt;')
      expect(result.html).toContain('&quot;')
      expect(result.html).toContain('&amp;')
    })

    it('formats prices with currency', async () => {
      const proposalRow: ProposalRow = {
        id: 'prop-1',
        org_id: 'org-1',
        client_contact_id: null,
        title: 'Expensive',
        project_type: 'website',
        scope: 'Scope',
        pricing: JSON.stringify([
          { tier: 'Premium', price: 25000, includes: ['Everything'] },
        ]),
        timeline: '4-6 weeks',
        terms: 'Terms',
        status: 'draft',
        metadata: null,
        created_at: '2026-02-22T00:00:00Z',
        updated_at: '2026-02-22T00:00:00Z',
        sent_at: null,
        viewed_at: null,
        accepted_at: null,
      }

      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: proposalRow,
        error: null,
      })

      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: { name: 'Company' },
        error: null,
      })

      const result = await generateProposalPdf(mockSupabase as any, 'org-1', 'prop-1')

      expect(result.html).toContain('$25,000')
    })

    it('handles proposal not found', async () => {
      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: null,
        error: new Error('Proposal not found'),
      })

      await expect(
        generateProposalPdf(mockSupabase as any, 'org-1', 'nonexistent'),
      ).rejects.toThrow('Proposal not found')
    })
  })

  // =========================================================================
  // updateProposalStatus Tests
  // =========================================================================

  describe('updateProposalStatus', () => {
    it('updates status to sent', async () => {
      await updateProposalStatus(mockSupabase as any, 'org-1', 'prop-1', 'sent')

      expect(mockSupabase.from).toHaveBeenCalledWith('proposals')
      expect(mockSupabase._chainable.update).toHaveBeenCalled()
    })

    it('updates status to viewed', async () => {
      await updateProposalStatus(mockSupabase as any, 'org-1', 'prop-1', 'viewed')

      expect(mockSupabase.from).toHaveBeenCalledWith('proposals')
    })

    it('updates status to accepted', async () => {
      await updateProposalStatus(mockSupabase as any, 'org-1', 'prop-1', 'accepted')

      expect(mockSupabase.from).toHaveBeenCalledWith('proposals')
    })

    it('updates status to declined', async () => {
      await updateProposalStatus(mockSupabase as any, 'org-1', 'prop-1', 'declined')

      expect(mockSupabase.from).toHaveBeenCalledWith('proposals')
    })
  })

  // =========================================================================
  // recordProposalView Tests
  // =========================================================================

  describe('recordProposalView', () => {
    it('records proposal view and logs activity', async () => {
      // First call is to check status
      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: { status: 'sent' },
        error: null,
      })

      await recordProposalView(mockSupabase as any, 'org-1', 'prop-1')

      expect(mockSupabase.from).toHaveBeenCalledWith('proposals')
      expect(mockSupabase.from).toHaveBeenCalledWith('activity_feed')
    })

    it('logs view in activity feed even if status not sent', async () => {
      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: { status: 'draft' },
        error: null,
      })

      await recordProposalView(mockSupabase as any, 'org-1', 'prop-1')

      expect(mockSupabase.from).toHaveBeenCalledWith('activity_feed')
    })
  })

  // =========================================================================
  // listProposals Tests
  // =========================================================================

  describe('listProposals', () => {
    it('lists proposals for org', async () => {
      const mockProposals = [
        { id: 'prop-1', title: 'Proposal 1', status: 'draft' },
        { id: 'prop-2', title: 'Proposal 2', status: 'sent' },
      ]

      // Make the final await return the data
      const queryResult = Promise.resolve({ data: mockProposals, error: null })
      Object.defineProperty(queryResult, 'eq', {
        value: vi.fn().mockReturnValue(queryResult),
      })

      mockSupabase._chainable.order = vi.fn().mockReturnValue(queryResult)

      const proposals = await listProposals(mockSupabase as any, 'org-1')

      expect(Array.isArray(proposals)).toBe(true)
      expect(proposals.length).toBe(2)
    })

    it('filters by status', async () => {
      const mockProposals = [{ id: 'prop-1', title: 'Proposal 1', status: 'sent' }]

      const queryResult = Promise.resolve({ data: mockProposals, error: null })
      Object.defineProperty(queryResult, 'eq', {
        value: vi.fn().mockReturnValue(queryResult),
      })

      mockSupabase._chainable.order = vi.fn().mockReturnValue(queryResult)

      const proposals = await listProposals(mockSupabase as any, 'org-1', 'sent')

      expect(proposals.length).toBe(1)
      expect(proposals[0].status).toBe('sent')
    })

    it('throws on database error', async () => {
      const queryResult = Promise.reject(new Error('DB error'))
      Object.defineProperty(queryResult, 'eq', {
        value: vi.fn().mockReturnValue(queryResult),
      })

      mockSupabase._chainable.order = vi.fn().mockReturnValue(queryResult)

      await expect(listProposals(mockSupabase as any, 'org-1')).rejects.toThrow('DB error')
    })
  })

  // =========================================================================
  // Public API Tests
  // =========================================================================

  describe('proposalBot public API', () => {
    it('exports all required functions', () => {
      expect(proposalBot.generate).toBeDefined()
      expect(proposalBot.generateScope).toBeDefined()
      expect(proposalBot.generatePricing).toBeDefined()
      expect(proposalBot.generatePdf).toBeDefined()
      expect(proposalBot.send).toBeDefined()
      expect(proposalBot.updateStatus).toBeDefined()
      expect(proposalBot.recordView).toBeDefined()
      expect(proposalBot.list).toBeDefined()
      expect(proposalBot.tick).toBeDefined()
    })

    it('all API exports are functions', () => {
      expect(typeof proposalBot.generate).toBe('function')
      expect(typeof proposalBot.generateScope).toBe('function')
      expect(typeof proposalBot.generatePricing).toBe('function')
      expect(typeof proposalBot.generatePdf).toBe('function')
      expect(typeof proposalBot.send).toBe('function')
      expect(typeof proposalBot.updateStatus).toBe('function')
      expect(typeof proposalBot.recordView).toBe('function')
      expect(typeof proposalBot.list).toBe('function')
      expect(typeof proposalBot.tick).toBe('function')
    })
  })

  // =========================================================================
  // Type Validation Tests
  // =========================================================================

  describe('proposal types and interfaces', () => {
    it('ProposalBrief has required fields', () => {
      const brief: ProposalBrief = {
        clientSlug: 'test',
        projectType: 'website',
        requirements: 'test',
      }

      expect(brief.clientSlug).toBeDefined()
      expect(brief.projectType).toBeDefined()
      expect(brief.requirements).toBeDefined()
    })

    it('ScopeDocument has all sections', () => {
      const scope: ScopeDocument = {
        title: 'Test',
        clientName: 'Client',
        projectType: 'website',
        requirements: [],
        deliverables: [],
        assumptions: [],
        exclusions: [],
        timeline: '4 weeks',
      }

      expect(scope.title).toBeDefined()
      expect(scope.requirements).toBeDefined()
      expect(scope.deliverables).toBeDefined()
      expect(scope.assumptions).toBeDefined()
      expect(scope.exclusions).toBeDefined()
    })

    it('proposal status values are valid', () => {
      const validStatuses: Array<'draft' | 'sent' | 'viewed' | 'accepted' | 'declined'> = [
        'draft',
        'sent',
        'viewed',
        'accepted',
        'declined',
      ]

      expect(validStatuses).toContain('draft')
      expect(validStatuses).toContain('sent')
      expect(validStatuses).toContain('viewed')
      expect(validStatuses).toContain('accepted')
      expect(validStatuses).toContain('declined')
    })
  })

  // =========================================================================
  // Timeline Tests
  // =========================================================================

  describe('timeline estimation', () => {
    it('estimates timeline for known project types', async () => {
      const testCases = [
        ['website', '4-6 weeks'],
        ['mobile_app', '8-12 weeks'],
        ['ecommerce', '6-8 weeks'],
        ['branding', '2-4 weeks'],
      ]

      mockSupabase._chainable.single.mockResolvedValue({
        data: { name: 'Client' },
        error: null,
      })

      for (const [projectType, expectedTimeline] of testCases) {
        const brief: ProposalBrief = {
          clientSlug: 'test',
          projectType,
          requirements: 'test',
        }

        const scope = await generateScopeDocument(mockSupabase as any, 'org-1', brief)
        expect(scope.timeline).toBe(expectedTimeline)
      }
    })

    it('defaults to 4-8 weeks for unknown types', async () => {
      mockSupabase._chainable.single.mockResolvedValueOnce({
        data: { name: 'Client' },
        error: null,
      })

      const brief: ProposalBrief = {
        clientSlug: 'test',
        projectType: 'unknown_type',
        requirements: 'test',
      }

      const scope = await generateScopeDocument(mockSupabase as any, 'org-1', brief)
      expect(scope.timeline).toBe('4-8 weeks')
    })
  })
})
