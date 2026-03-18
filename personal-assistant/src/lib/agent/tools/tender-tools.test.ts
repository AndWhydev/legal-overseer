import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolResult } from '../tools'

// Mock tender-hunter before importing the module under test
vi.mock('../tender-hunter', () => ({
  searchTenders: vi.fn(),
  scoreTenderFit: vi.fn(),
  generateTenderResponse: vi.fn(),
}))

import { tenderToolDefinitions, tenderToolHandlers } from './tender-tools'
import {
  searchTenders,
  scoreTenderFit,
  generateTenderResponse,
} from '../tender-hunter'

const mockSupabase = {} as any

describe('tender-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('tenderToolDefinitions', () => {
    it('exports 3 tool definitions', () => {
      expect(tenderToolDefinitions).toHaveLength(3)
    })

    it('defines search_tenders with correct required fields', () => {
      const tool = tenderToolDefinitions.find(t => t.name === 'search_tenders')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['keywords'])
      )
      expect(tool!.input_schema.properties).toHaveProperty('keywords')
      expect(tool!.input_schema.properties).toHaveProperty('region')
      expect(tool!.input_schema.properties).toHaveProperty('min_value')
    })

    it('defines score_tender with correct required fields', () => {
      const tool = tenderToolDefinitions.find(t => t.name === 'score_tender')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['tender_id'])
      )
      expect(tool!.input_schema.properties).toHaveProperty('tender_id')
    })

    it('defines generate_tender_response with correct required fields', () => {
      const tool = tenderToolDefinitions.find(t => t.name === 'generate_tender_response')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['tender_id'])
      )
      expect(tool!.input_schema.properties).toHaveProperty('tender_id')
    })
  })

  describe('tenderToolHandlers', () => {
    describe('search_tenders', () => {
      it('calls searchTenders with mapped params and returns correct shape', async () => {
        const mockResult = {
          tenders: [
            { id: 't1', title: 'Web Design Services', source: 'austender', value: 150000, deadline: '2026-04-15', category: 'IT Services' },
            { id: 't2', title: 'Digital Transformation', source: 'austender', value: 500000, deadline: '2026-05-01', category: 'IT Services' },
          ],
          count: 2,
          source: 'all',
          searchedAt: '2026-03-18T00:00:00Z',
        }
        vi.mocked(searchTenders).mockResolvedValue(mockResult as any)

        const result: ToolResult = await tenderToolHandlers.search_tenders(
          {
            keywords: ['web design', 'digital'],
            region: 'Brisbane',
            min_value: 100000,
          },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(searchTenders).toHaveBeenCalledWith(
          mockSupabase,
          'org-1',
          {
            keywords: ['web design', 'digital'],
            region: 'Brisbane',
            minValue: 100000,
          },
        )
        expect((result.data as any).tenders).toEqual(mockResult.tenders)
        expect((result.data as any).count).toBe(2)
        expect((result.data as any).source).toBe('all')
        expect((result.data as any).searchedAt).toBe('2026-03-18T00:00:00Z')
      })

      it('passes undefined for optional params when not provided', async () => {
        const mockResult = {
          tenders: [],
          count: 0,
          source: 'all',
          searchedAt: '2026-03-18T00:00:00Z',
        }
        vi.mocked(searchTenders).mockResolvedValue(mockResult as any)

        await tenderToolHandlers.search_tenders(
          { keywords: ['IT services'] },
          'org-1',
          mockSupabase,
        )

        expect(searchTenders).toHaveBeenCalledWith(
          mockSupabase,
          'org-1',
          {
            keywords: ['IT services'],
            region: undefined,
            minValue: undefined,
          },
        )
      })

      it('returns success=false on exception', async () => {
        vi.mocked(searchTenders).mockRejectedValue(new Error('scrape failed'))

        const result = await tenderToolHandlers.search_tenders(
          { keywords: ['test'] },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('scrape failed')
      })
    })

    describe('score_tender', () => {
      it('calls scoreTenderFit with tender_id and returns fit score', async () => {
        const mockScore = {
          tenderId: 'tender-123',
          fitScore: 72,
          complianceScore: 80,
          effortVsValue: 65,
          winProbability: 58,
          recommendation: 'pursue',
          reasoning: 'Strong fit (72/100). Compliance at 80%, good effort-to-value ratio.',
          matchedKeywords: ['web design', 'responsive'],
          gaps: ['government security clearance'],
        }
        vi.mocked(scoreTenderFit).mockResolvedValue(mockScore as any)

        const result: ToolResult = await tenderToolHandlers.score_tender(
          { tender_id: 'tender-123' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(scoreTenderFit).toHaveBeenCalledWith(
          mockSupabase,
          'org-1',
          'tender-123',
        )
        expect((result.data as any).fitScore).toBe(72)
        expect((result.data as any).recommendation).toBe('pursue')
        expect((result.data as any).reasoning).toContain('Strong fit')
        expect((result.data as any).gaps).toEqual(['government security clearance'])
      })

      it('returns success=false on exception', async () => {
        vi.mocked(scoreTenderFit).mockRejectedValue(new Error('Tender not found'))

        const result = await tenderToolHandlers.score_tender(
          { tender_id: 'nonexistent' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('Tender not found')
      })
    })

    describe('generate_tender_response', () => {
      it('calls generateTenderResponse and returns response sections', async () => {
        const mockResponse = {
          id: 'resp-1',
          org_id: 'org-1',
          tender_id: 'tender-456',
          status: 'draft',
          content: {
            sections: [
              { title: 'Executive Summary', content: 'We are pleased to submit...' },
              { title: 'Methodology', content: 'Our approach follows...' },
            ],
            requirements_checklist: [
              { id: 'REQ-001', description: 'Must have ISO cert', type: 'mandatory', weight: 2, source_text: 'ISO certification is required' },
            ],
            compliance_matrix: [
              { requirement_id: 'REQ-001', requirement: 'Must have ISO cert', status: 'met', evidence: 'ISO 27001 certified', notes: '' },
            ],
          },
          compliance_score: 85,
          fit_score: 72,
          estimated_effort_hours: 40,
          created_at: '2026-03-18T00:00:00Z',
          updated_at: '2026-03-18T00:00:00Z',
        }
        vi.mocked(generateTenderResponse).mockResolvedValue(mockResponse as any)

        const result: ToolResult = await tenderToolHandlers.generate_tender_response(
          { tender_id: 'tender-456' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(generateTenderResponse).toHaveBeenCalledWith(
          mockSupabase,
          'org-1',
          'tender-456',
        )
        expect((result.data as any).id).toBe('resp-1')
        expect((result.data as any).tender_id).toBe('tender-456')
        expect((result.data as any).status).toBe('draft')
        expect((result.data as any).sections).toHaveLength(2)
        expect((result.data as any).requirements_checklist).toHaveLength(1)
        expect((result.data as any).compliance_matrix).toHaveLength(1)
        expect((result.data as any).compliance_score).toBe(85)
        expect((result.data as any).fit_score).toBe(72)
        expect((result.data as any).estimated_effort_hours).toBe(40)
      })

      it('returns success=false on exception', async () => {
        vi.mocked(generateTenderResponse).mockRejectedValue(new Error('Failed to save tender response'))

        const result = await tenderToolHandlers.generate_tender_response(
          { tender_id: 'tender-789' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('Failed to save tender response')
      })
    })
  })
})
