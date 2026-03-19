import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolResult } from '../tools'

// Mock ai-search-optimizer before importing the module under test
vi.mock('../ai-search-optimizer', () => ({
  auditVisibility: vi.fn(),
  generateOptimizedContent: vi.fn(),
  generateSchemaMarkup: vi.fn(),
  generateVisibilityReport: vi.fn(),
}))

import { seoToolDefinitions, seoToolHandlers } from './seo-tools'
import {
  auditVisibility,
  generateOptimizedContent,
  generateSchemaMarkup,
  generateVisibilityReport,
} from '../ai-search-optimizer'

const mockSupabase = {} as any

describe('seo-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('seoToolDefinitions', () => {
    it('exports 4 tool definitions', () => {
      expect(seoToolDefinitions).toHaveLength(4)
    })

    it('defines audit_visibility with correct required fields', () => {
      const tool = seoToolDefinitions.find(t => t.name === 'audit_visibility')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['brand_name', 'queries'])
      )
      expect(tool!.input_schema.properties).toHaveProperty('brand_name')
      expect(tool!.input_schema.properties).toHaveProperty('queries')
      expect(tool!.input_schema.properties).toHaveProperty('domain')
      expect(tool!.input_schema.properties).toHaveProperty('competitors')
    })

    it('defines generate_seo_content with correct required fields', () => {
      const tool = seoToolDefinitions.find(t => t.name === 'generate_seo_content')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['topic', 'target_queries'])
      )
      expect(tool!.input_schema.properties).toHaveProperty('topic')
      expect(tool!.input_schema.properties).toHaveProperty('target_queries')
      expect(tool!.input_schema.properties).toHaveProperty('business_name')
      expect(tool!.input_schema.properties).toHaveProperty('location')
      expect(tool!.input_schema.properties).toHaveProperty('service_area')
      expect(tool!.input_schema.properties).toHaveProperty('credentials')
    })

    it('defines generate_schema_markup with correct required fields', () => {
      const tool = seoToolDefinitions.find(t => t.name === 'generate_schema_markup')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['schema_type', 'data'])
      )
      expect(tool!.input_schema.properties).toHaveProperty('schema_type')
      expect(tool!.input_schema.properties).toHaveProperty('data')
    })

    it('defines visibility_report with no required params', () => {
      const tool = seoToolDefinitions.find(t => t.name === 'visibility_report')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.properties).toBeDefined()
    })
  })

  describe('seoToolHandlers', () => {
    describe('audit_visibility', () => {
      it('calls auditVisibility with mapped params and returns correct shape', async () => {
        const mockResult = {
          visibility_score: 75,
          results: [
            { query: 'best web designer', mentioned: true, position: 'prominent', snippet: 'Top result', source: 'perplexity' },
          ],
          recommendations: ['Add FAQ schema to your pages'],
          auditedAt: '2026-03-18T00:00:00Z',
        }
        vi.mocked(auditVisibility).mockResolvedValue(mockResult as any)

        const result: ToolResult = await seoToolHandlers.audit_visibility(
          {
            brand_name: 'All Webbed Up',
            queries: ['best web designer Brisbane'],
            domain: 'allwebbedup.com.au',
            competitors: ['Competitor A'],
          },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(auditVisibility).toHaveBeenCalledWith(
          mockSupabase,
          'org-1',
          {
            brandName: 'All Webbed Up',
            queries: ['best web designer Brisbane'],
            domain: 'allwebbedup.com.au',
            competitors: ['Competitor A'],
          },
        )
        expect((result.data as any).visibility_score).toBe(75)
        expect((result.data as any).results).toEqual(mockResult.results)
        expect((result.data as any).recommendations).toEqual(mockResult.recommendations)
        expect((result.data as any).auditedAt).toBe('2026-03-18T00:00:00Z')
      })

      it('returns success=false on exception', async () => {
        vi.mocked(auditVisibility).mockRejectedValue(new Error('DB connection failed'))

        const result = await seoToolHandlers.audit_visibility(
          { brand_name: 'Test', queries: ['test query'] },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('DB connection failed')
      })
    })

    describe('generate_seo_content', () => {
      it('calls generateOptimizedContent with mapped params and returns result', async () => {
        const mockResult = {
          visibility_score: 100,
          recommendations: ['Publish at canonical URL'],
          optimized_content: {
            title: 'Guide to Web Design',
            body: 'Content body here',
            faqSection: [{ question: 'How much?', answer: 'Varies' }],
            structuredData: { '@context': 'https://schema.org' },
            metaDescription: 'Discover web design',
            targetedQueries: ['web design Brisbane'],
          },
        }
        vi.mocked(generateOptimizedContent).mockResolvedValue(mockResult as any)

        const result = await seoToolHandlers.generate_seo_content(
          {
            topic: 'Web Design',
            target_queries: ['web design Brisbane'],
            business_name: 'All Webbed Up',
            location: 'Brisbane',
            service_area: 'South East QLD',
            credentials: ['Google Partner'],
          },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(generateOptimizedContent).toHaveBeenCalledWith(
          mockSupabase,
          'org-1',
          {
            topic: 'Web Design',
            targetQueries: ['web design Brisbane'],
            businessName: 'All Webbed Up',
            location: 'Brisbane',
            serviceArea: 'South East QLD',
            credentials: ['Google Partner'],
          },
        )
        expect((result.data as any)).toEqual(mockResult)
      })

      it('returns success=false on exception', async () => {
        vi.mocked(generateOptimizedContent).mockRejectedValue(new Error('generation failed'))

        const result = await seoToolHandlers.generate_seo_content(
          { topic: 'Test', target_queries: ['test'] },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('generation failed')
      })
    })

    describe('generate_schema_markup', () => {
      it('calls generateSchemaMarkup and returns jsonLd and htmlSnippet', async () => {
        const mockResult = {
          schemaType: 'LocalBusiness',
          jsonLd: { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: 'Test Biz' },
          htmlSnippet: '<script type="application/ld+json">...</script>',
          validationNotes: ['Valid -- schema passes basic validation checks.'],
        }
        vi.mocked(generateSchemaMarkup).mockReturnValue(mockResult as any)

        const result = await seoToolHandlers.generate_schema_markup(
          {
            schema_type: 'LocalBusiness',
            data: { name: 'Test Biz', description: 'A test', url: 'https://test.com', address: { street: '1 Main St', city: 'Brisbane', state: 'QLD', postalCode: '4000', country: 'AU' } },
          },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(generateSchemaMarkup).toHaveBeenCalledWith({
          schemaType: 'LocalBusiness',
          data: expect.objectContaining({ name: 'Test Biz' }),
        })
        expect((result.data as any).schemaType).toBe('LocalBusiness')
        expect((result.data as any).jsonLd).toEqual(mockResult.jsonLd)
        expect((result.data as any).htmlSnippet).toBe(mockResult.htmlSnippet)
        expect((result.data as any).validationNotes).toEqual(mockResult.validationNotes)
      })

      it('returns success=false on exception', async () => {
        vi.mocked(generateSchemaMarkup).mockImplementation(() => {
          throw new Error('invalid schema type')
        })

        const result = await seoToolHandlers.generate_schema_markup(
          { schema_type: 'Invalid', data: {} },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('invalid schema type')
      })
    })

    describe('visibility_report', () => {
      it('returns report data when audits exist', async () => {
        const mockReport = {
          orgId: 'org-1',
          brandName: 'All Webbed Up',
          domain: 'allwebbedup.com.au',
          currentScore: 82,
          previousScore: 68,
          trend: 'improving',
          queryBreakdown: [{ query: 'web design Brisbane', sources: [{ source: 'perplexity', position: 'prominent', score: 1 }] }],
          competitorComparison: [{ name: 'Competitor A', score: 65, delta: -3 }],
          changes: [],
          recommendations: ['Maintain content freshness'],
          generatedAt: '2026-03-18T00:00:00Z',
        }
        vi.mocked(generateVisibilityReport).mockResolvedValue(mockReport as any)

        const result = await seoToolHandlers.visibility_report(
          {},
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(generateVisibilityReport).toHaveBeenCalledWith(mockSupabase, 'org-1')
        expect((result.data as any)).toEqual(mockReport)
      })

      it('returns error when no audits exist', async () => {
        vi.mocked(generateVisibilityReport).mockResolvedValue(null)

        const result = await seoToolHandlers.visibility_report(
          {},
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('No previous audits found')
      })

      it('returns success=false on exception', async () => {
        vi.mocked(generateVisibilityReport).mockRejectedValue(new Error('query timeout'))

        const result = await seoToolHandlers.visibility_report(
          {},
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('query timeout')
      })
    })
  })
})
