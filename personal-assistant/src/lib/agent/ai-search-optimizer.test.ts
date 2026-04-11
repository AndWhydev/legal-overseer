/**
 * AI Search Optimizer Tests
 *
 * Tests the core SEO/AI visibility optimization functions:
 * - auditVisibility: brand visibility scoring across AI search engines
 * - generateOptimizedContent: SEO content generation
 * - generateSchemaMarkup: JSON-LD structured data generation
 * - generateVisibilityReport: cross-audit reporting with trends
 * - runAISearchTick: scheduled audit execution
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./ai-visibility-audit', () => ({
  runVisibilityAudit: vi.fn(),
  getPreviousAudits: vi.fn(),
  checkVisibilityChanges: vi.fn(),
  detectVisibilityChanges: vi.fn(),
}))

vi.mock('./run-logger', () => ({
  logAgentRun: vi.fn().mockResolvedValue(undefined),
}))

import {
  auditVisibility,
  generateOptimizedContent,
  generateSchemaMarkup,
  generateVisibilityReport,
  runAISearchTick,
  type SchemaType,
} from './ai-search-optimizer'

import {
  getPreviousAudits,
  runVisibilityAudit,
  checkVisibilityChanges,
  detectVisibilityChanges,
} from './ai-visibility-audit'

import { logAgentRun } from './run-logger'

const mockSupabase = {} as any

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// auditVisibility
// ---------------------------------------------------------------------------
describe('auditVisibility', () => {
  it('returns visibility score and results for each query across 4 AI sources', async () => {
    const result = await auditVisibility(mockSupabase, 'org-1', {
      brandName: 'All Webbed Up',
      queries: ['best web designer Brisbane'],
    })

    expect(result.visibility_score).toBeDefined()
    expect(typeof result.visibility_score).toBe('number')
    expect(result.visibility_score).toBeGreaterThanOrEqual(0)
    expect(result.visibility_score).toBeLessThanOrEqual(100)

    // 1 query x 4 AI sources = 4 results
    expect(result.results).toHaveLength(4)
    expect(result.auditedAt).toBeTruthy()
  })

  it('marks brand as prominent when query contains brand name', async () => {
    const result = await auditVisibility(mockSupabase, 'org-1', {
      brandName: 'BitBit',
      queries: ['BitBit review'],
    })

    const prominent = result.results.filter(r => r.position === 'prominent')
    expect(prominent.length).toBeGreaterThan(0)
    expect(prominent[0].mentioned).toBe(true)
    expect(prominent[0].snippet).toContain('BitBit')
  })

  it('marks brand as absent when query has no brand overlap', async () => {
    const result = await auditVisibility(mockSupabase, 'org-1', {
      brandName: 'UniqueCompanyXYZ123',
      queries: ['cheap shoes online'],
    })

    const absent = result.results.filter(r => r.position === 'absent')
    expect(absent.length).toBe(4) // All 4 sources should show absent
    expect(absent[0].mentioned).toBe(false)
  })

  it('marks brand as secondary when partial word match exists', async () => {
    const result = await auditVisibility(mockSupabase, 'org-1', {
      brandName: 'webbed',
      queries: ['all webbed design services'],
    })

    // "webbed" appears in query, so at least some results should be prominent/secondary
    const mentioned = result.results.filter(r => r.mentioned)
    expect(mentioned.length).toBeGreaterThan(0)
  })

  it('produces recommendations based on score', async () => {
    const result = await auditVisibility(mockSupabase, 'org-1', {
      brandName: 'NonexistentBrand999',
      queries: ['random unrelated query'],
    })

    expect(result.recommendations.length).toBeGreaterThan(0)
    // Low visibility should get specific advice
    expect(result.recommendations.some(r => r.includes('visibility'))).toBe(true)
  })

  it('handles multiple queries correctly', async () => {
    const result = await auditVisibility(mockSupabase, 'org-1', {
      brandName: 'TestBrand',
      queries: ['query one', 'query two', 'query three'],
    })

    // 3 queries x 4 sources = 12 results
    expect(result.results).toHaveLength(12)
  })

  it('handles empty queries array', async () => {
    const result = await auditVisibility(mockSupabase, 'org-1', {
      brandName: 'TestBrand',
      queries: [],
    })

    expect(result.results).toHaveLength(0)
    expect(result.visibility_score).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// generateOptimizedContent
// ---------------------------------------------------------------------------
describe('generateOptimizedContent', () => {
  it('generates content with title, body, FAQ, schema, and meta description', async () => {
    const result = await generateOptimizedContent(mockSupabase, 'org-1', {
      topic: 'Web Design',
      targetQueries: ['best web design Brisbane', 'affordable web designer'],
    })

    expect(result.visibility_score).toBeDefined()
    expect(result.recommendations.length).toBeGreaterThan(0)
    expect(result.optimized_content.title).toContain('Web Design')
    expect(result.optimized_content.body).toBeTruthy()
    expect(result.optimized_content.faqSection.length).toBeGreaterThan(0)
    expect(result.optimized_content.structuredData['@context']).toBe('https://schema.org')
    expect(result.optimized_content.metaDescription).toBeTruthy()
    expect(result.optimized_content.targetedQueries).toEqual(['best web design Brisbane', 'affordable web designer'])
  })

  it('includes location in title and body when provided', async () => {
    const result = await generateOptimizedContent(mockSupabase, 'org-1', {
      topic: 'SEO Services',
      targetQueries: ['SEO Brisbane'],
      location: 'Brisbane',
    })

    expect(result.optimized_content.title).toContain('Brisbane')
    expect(result.optimized_content.body).toContain('Brisbane')
  })

  it('includes business name in FAQ answers', async () => {
    const result = await generateOptimizedContent(mockSupabase, 'org-1', {
      topic: 'Marketing',
      targetQueries: ['marketing agency'],
      businessName: 'Acme Corp',
    })

    const faqTexts = result.optimized_content.faqSection.map(f => f.answer).join(' ')
    expect(faqTexts).toContain('Acme Corp')
  })

  it('includes credentials in body when provided', async () => {
    const result = await generateOptimizedContent(mockSupabase, 'org-1', {
      topic: 'Consulting',
      targetQueries: ['business consultant'],
      credentials: ['ISO 27001', 'PRINCE2'],
    })

    expect(result.optimized_content.body).toContain('ISO 27001')
    expect(result.optimized_content.body).toContain('PRINCE2')
  })

  it('generates FAQPage schema in structured data', async () => {
    const result = await generateOptimizedContent(mockSupabase, 'org-1', {
      topic: 'Testing',
      targetQueries: ['test query'],
    })

    const graph = result.optimized_content.structuredData['@graph'] as any[]
    expect(graph).toBeDefined()
    const faqPage = graph.find(item => item['@type'] === 'FAQPage')
    expect(faqPage).toBeDefined()
    expect(faqPage.mainEntity.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// generateSchemaMarkup
// ---------------------------------------------------------------------------
describe('generateSchemaMarkup', () => {
  it('generates LocalBusiness schema with required fields', () => {
    const result = generateSchemaMarkup({
      schemaType: 'LocalBusiness',
      data: {
        name: 'Test Business',
        description: 'A test business',
        url: 'https://test.com',
        address: {
          street: '1 Main St',
          city: 'Brisbane',
          state: 'QLD',
          postalCode: '4000',
          country: 'AU',
        },
      },
    })

    expect(result.schemaType).toBe('LocalBusiness')
    expect(result.jsonLd['@context']).toBe('https://schema.org')
    expect(result.jsonLd['@type']).toBe('LocalBusiness')
    expect(result.jsonLd.name).toBe('Test Business')
    expect(result.htmlSnippet).toContain('application/ld+json')
    // LocalBusiness without phone/email gets a recommendation note
    expect(result.validationNotes.some(n => n.includes('telephone') || n.includes('Valid'))).toBe(true)
  })

  it('generates Service schema', () => {
    const result = generateSchemaMarkup({
      schemaType: 'Service',
      data: {
        name: 'Web Design',
        description: 'Custom web design services',
        provider: 'Acme',
        serviceArea: 'Brisbane',
        price: '5000',
        category: 'IT Services',
      },
    })

    expect(result.jsonLd['@type']).toBe('Service')
    expect(result.jsonLd.name).toBe('Web Design')
    expect((result.jsonLd.provider as any).name).toBe('Acme')
  })

  it('generates FAQ schema', () => {
    const result = generateSchemaMarkup({
      schemaType: 'FAQ',
      data: {
        questions: [
          { question: 'What is X?', answer: 'X is a thing.' },
          { question: 'How much?', answer: 'It varies.' },
        ],
      },
    })

    expect(result.jsonLd['@type']).toBe('FAQPage')
    const entities = result.jsonLd.mainEntity as any[]
    expect(entities).toHaveLength(2)
    expect(entities[0]['@type']).toBe('Question')
    expect(entities[0].name).toBe('What is X?')
  })

  it('generates Review schema', () => {
    const result = generateSchemaMarkup({
      schemaType: 'Review',
      data: {
        itemReviewed: 'Acme Corp',
        reviewRating: 4.5,
        bestRating: 5,
        author: 'Jane Doe',
        reviewBody: 'Excellent service.',
        datePublished: '2026-01-15',
      },
    })

    expect(result.jsonLd['@type']).toBe('Review')
    expect((result.jsonLd.reviewRating as any).ratingValue).toBe(4.5)
    expect((result.jsonLd.author as any).name).toBe('Jane Doe')
  })

  it('generates Organization schema', () => {
    const result = generateSchemaMarkup({
      schemaType: 'Organization',
      data: {
        name: 'Acme Corp',
        description: 'Leading web agency',
        url: 'https://acme.com',
        logo: 'https://acme.com/logo.png',
        foundingDate: '2020-01-01',
        founders: ['Alice', 'Bob'],
      },
    })

    expect(result.jsonLd['@type']).toBe('Organization')
    expect(result.jsonLd.name).toBe('Acme Corp')
    expect(result.jsonLd.logo).toBe('https://acme.com/logo.png')
    const founders = result.jsonLd.founder as any[]
    expect(founders).toHaveLength(2)
    expect(founders[0].name).toBe('Alice')
  })

  it('validates missing required fields for LocalBusiness', () => {
    // Pass empty data to trigger validation failures
    const result = generateSchemaMarkup({
      schemaType: 'LocalBusiness',
      data: {
        name: '',
        description: '',
        url: '',
        address: { street: '', city: '', state: '', postalCode: '', country: '' },
      } as any,
    })

    // Should report missing contact info recommendation
    expect(result.validationNotes.some(n => n.includes('telephone') || n.includes('email'))).toBe(true)
  })

  it('HTML snippet wraps JSON-LD in script tag', () => {
    const result = generateSchemaMarkup({
      schemaType: 'Organization',
      data: {
        name: 'Test',
        description: 'Test org',
        url: 'https://test.com',
      },
    })

    expect(result.htmlSnippet).toMatch(/^<script type="application\/ld\+json">/)
    expect(result.htmlSnippet).toMatch(/<\/script>$/)
    // Should be valid JSON inside
    const jsonContent = result.htmlSnippet
      .replace('<script type="application/ld+json">\n', '')
      .replace('\n</script>', '')
    expect(() => JSON.parse(jsonContent)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// generateVisibilityReport
// ---------------------------------------------------------------------------
describe('generateVisibilityReport', () => {
  it('returns null when no previous audits exist', async () => {
    vi.mocked(getPreviousAudits).mockResolvedValue([])

    const result = await generateVisibilityReport(mockSupabase, 'org-1')
    expect(result).toBeNull()
  })

  it('generates report with trend when two audits exist', async () => {
    vi.mocked(getPreviousAudits).mockResolvedValue([
      {
        overallScore: 80,
        brandName: 'Acme',
        domain: 'acme.com',
        queryResults: [
          { query: 'web design', source: 'perplexity', position: 'prominent', score: 1 },
        ],
        competitorScores: { 'Rival Inc': 60 },
        recommendations: ['Keep going'],
      },
      {
        overallScore: 65,
        brandName: 'Acme',
        domain: 'acme.com',
        queryResults: [
          { query: 'web design', source: 'perplexity', position: 'secondary', score: 0.5 },
        ],
        competitorScores: { 'Rival Inc': 55 },
        recommendations: ['Improve content'],
      },
    ] as any)

    vi.mocked(detectVisibilityChanges).mockReturnValue([
      { type: 'improvement', query: 'web design', source: 'perplexity', severity: 'info' },
    ] as any)

    const result = await generateVisibilityReport(mockSupabase, 'org-1')

    expect(result).not.toBeNull()
    expect(result!.currentScore).toBe(80)
    expect(result!.previousScore).toBe(65)
    expect(result!.trend).toBe('improving')
    expect(result!.brandName).toBe('Acme')
    expect(result!.queryBreakdown.length).toBeGreaterThan(0)
    expect(result!.competitorComparison[0].name).toBe('Rival Inc')
    expect(result!.competitorComparison[0].delta).toBe(5) // 60 - 55
    expect(result!.changes).toHaveLength(1)
  })

  it('reports declining trend when score drops', async () => {
    vi.mocked(getPreviousAudits).mockResolvedValue([
      { overallScore: 40, brandName: 'X', domain: 'x.com', queryResults: [], competitorScores: {}, recommendations: [] },
      { overallScore: 60, brandName: 'X', domain: 'x.com', queryResults: [], competitorScores: {}, recommendations: [] },
    ] as any)

    vi.mocked(detectVisibilityChanges).mockReturnValue([])

    const result = await generateVisibilityReport(mockSupabase, 'org-1')

    expect(result!.trend).toBe('declining')
  })

  it('reports stable trend when score barely changes', async () => {
    vi.mocked(getPreviousAudits).mockResolvedValue([
      { overallScore: 72, brandName: 'X', domain: 'x.com', queryResults: [], competitorScores: {}, recommendations: [] },
      { overallScore: 70, brandName: 'X', domain: 'x.com', queryResults: [], competitorScores: {}, recommendations: [] },
    ] as any)

    vi.mocked(detectVisibilityChanges).mockReturnValue([])

    const result = await generateVisibilityReport(mockSupabase, 'org-1')

    expect(result!.trend).toBe('stable')
  })

  it('reports new trend when only one audit exists', async () => {
    vi.mocked(getPreviousAudits).mockResolvedValue([
      { overallScore: 55, brandName: 'NewBrand', domain: 'new.com', queryResults: [], competitorScores: {}, recommendations: [] },
    ] as any)

    const result = await generateVisibilityReport(mockSupabase, 'org-1')

    expect(result!.trend).toBe('new')
    expect(result!.previousScore).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// runAISearchTick
// ---------------------------------------------------------------------------
describe('runAISearchTick', () => {
  it('returns empty result when no agent config found', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any

    const result = await runAISearchTick(supabase, 'org-1', 'config-1')

    expect(result.processed).toBe(0)
    expect(result.auditsRun).toBe(0)
    expect(result.changesDetected).toBe(0)
    expect(result.failed).toBe(0)
  })

  it('returns empty result when policy_rules has no required fields', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { policy_rules: { domain: 'test.com' } }, // Missing brand_name, queries
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any

    const result = await runAISearchTick(supabase, 'org-1', 'config-1')

    expect(result.processed).toBe(0)
    expect(result.auditsRun).toBe(0)
  })

  it('runs audit and detects changes when config is complete', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  policy_rules: {
                    domain: 'acme.com',
                    brand_name: 'Acme',
                    target_queries: ['web design Brisbane'],
                    competitors: ['Rival Inc'],
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any

    vi.mocked(runVisibilityAudit).mockResolvedValue({
      overallScore: 75,
    } as any)

    vi.mocked(checkVisibilityChanges).mockResolvedValue([
      { type: 'improvement', severity: 'info' },
      { type: 'decline', severity: 'warning' },
    ] as any)

    const result = await runAISearchTick(supabase, 'org-1', 'config-1')

    expect(result.processed).toBe(1)
    expect(result.auditsRun).toBe(1)
    expect(result.changesDetected).toBe(2)
    expect(result.alertsSent).toBe(1) // Only non-info severity
    expect(result.failed).toBe(0)

    expect(runVisibilityAudit).toHaveBeenCalledWith(supabase, 'org-1', {
      domain: 'acme.com',
      brandName: 'Acme',
      queries: ['web design Brisbane'],
      competitors: ['Rival Inc'],
    })
  })

  it('handles errors gracefully and sets failed count', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  policy_rules: {
                    domain: 'error.com',
                    brand_name: 'Error',
                    target_queries: ['test'],
                  },
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any

    vi.mocked(runVisibilityAudit).mockRejectedValue(new Error('API timeout'))

    const result = await runAISearchTick(supabase, 'org-1', 'config-1')

    expect(result.failed).toBe(1)
    expect(result.auditsRun).toBe(0)
  })

  it('completes tick without crashing when config has no data', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any

    const result = await runAISearchTick(supabase, 'org-1', 'config-1')

    // Should complete without throwing
    expect(result.processed).toBe(0)
    expect(result.failed).toBe(0)
  })
})
