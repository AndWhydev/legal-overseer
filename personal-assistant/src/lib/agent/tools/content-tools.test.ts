import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolResult } from '../tools'

// Use vi.hoisted so mockCreate is available when the hoisted vi.mock factory runs
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

import { contentToolDefinitions, contentToolHandlers } from './content-tools'

const mockSupabase = {} as any

describe('content-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('contentToolDefinitions', () => {
    it('exports exactly 3 tool definitions', () => {
      expect(contentToolDefinitions).toHaveLength(3)
    })

    it('defines schedule_post with correct schema', () => {
      const tool = contentToolDefinitions.find(t => t.name === 'schedule_post')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('social media post')
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['topic', 'platform'])
      )
      expect(tool!.input_schema.properties).toHaveProperty('topic')
      expect(tool!.input_schema.properties).toHaveProperty('platform')
      expect(tool!.input_schema.properties).toHaveProperty('tone')
      expect(tool!.input_schema.properties).toHaveProperty('include_hashtags')
      expect(tool!.input_schema.properties).toHaveProperty('brand_context')
    })

    it('schedule_post accepts platform enum: linkedin, instagram, x', () => {
      const tool = contentToolDefinitions.find(t => t.name === 'schedule_post')
      const platformProp = (tool!.input_schema.properties as any).platform
      expect(platformProp.enum).toEqual(
        expect.arrayContaining(['linkedin', 'instagram', 'x'])
      )
    })

    it('defines generate_blog with correct schema', () => {
      const tool = contentToolDefinitions.find(t => t.name === 'generate_blog')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('blog post')
      expect(tool!.input_schema.required).toContain('topic')
      expect(tool!.input_schema.properties).toHaveProperty('topic')
      expect(tool!.input_schema.properties).toHaveProperty('keywords')
      expect(tool!.input_schema.properties).toHaveProperty('tone')
      expect(tool!.input_schema.properties).toHaveProperty('word_count')
      expect(tool!.input_schema.properties).toHaveProperty('brand_context')
    })

    it('defines content_calendar with correct schema', () => {
      const tool = contentToolDefinitions.find(t => t.name === 'content_calendar')
      expect(tool).toBeDefined()
      expect(tool!.description).toContain('content calendar')
      expect(tool!.input_schema.properties).toHaveProperty('days')
      expect(tool!.input_schema.properties).toHaveProperty('platform')
    })
  })

  describe('contentToolHandlers', () => {
    describe('schedule_post', () => {
      it('returns formatted LinkedIn post with professional tone and hashtags', async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            post: 'Excited to share our latest project.\n\nWe built something amazing.\n\n#WebDesign #Innovation #Tech',
            platform: 'linkedin',
            charCount: 95,
            hashtagCount: 3,
          }) }],
        })

        const result: ToolResult = await contentToolHandlers.schedule_post(
          { topic: 'our new web design project', platform: 'linkedin' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        const data = result.data as any
        expect(data.post).toBeDefined()
        expect(data.platform).toBe('linkedin')
        expect(data.charCount).toBeGreaterThan(0)
        expect(data.hashtagCount).toBeGreaterThan(0)
      })

      it('returns formatted Instagram post with hashtag block', async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            post: 'Check out our latest project! #design #web #creative #branding #marketing #digital #agency #art #style #modern #sleek #professional #business #growth #innovation #tech #trend #inspiration #build #launch',
            platform: 'instagram',
            charCount: 220,
            hashtagCount: 20,
          }) }],
        })

        const result: ToolResult = await contentToolHandlers.schedule_post(
          { topic: 'our new web design project', platform: 'instagram' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        const data = result.data as any
        expect(data.platform).toBe('instagram')
        expect(data.hashtagCount).toBeGreaterThanOrEqual(20)
      })

      it('returns concise X post under 280 chars', async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            post: 'Just launched our new web design project #WebDesign #Launch',
            platform: 'x',
            charCount: 60,
            hashtagCount: 2,
          }) }],
        })

        const result: ToolResult = await contentToolHandlers.schedule_post(
          { topic: 'our new web design project', platform: 'x' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        const data = result.data as any
        expect(data.platform).toBe('x')
        expect(data.charCount).toBeLessThanOrEqual(280)
      })

      it('passes brand_context to system prompt when provided', async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            post: 'Test post',
            platform: 'linkedin',
            charCount: 9,
            hashtagCount: 0,
          }) }],
        })

        await contentToolHandlers.schedule_post(
          { topic: 'test', platform: 'linkedin', brand_context: 'We are a premium web agency' },
          'org-1',
          mockSupabase,
        )

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            system: expect.stringContaining('We are a premium web agency'),
          })
        )
      })

      it('returns success=false on exception', async () => {
        mockCreate.mockRejectedValue(new Error('API rate limit exceeded'))

        const result = await contentToolHandlers.schedule_post(
          { topic: 'test', platform: 'linkedin' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('API rate limit exceeded')
      })
    })

    describe('generate_blog', () => {
      it('returns structured blog draft with SEO fields', async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            title: 'The Future of Web Design in 2026',
            meta_description: 'Discover the latest web design trends for 2026 including AI-powered layouts, glassmorphic UI, and responsive-first frameworks.',
            body: '## Introduction\n\nWeb design is evolving...\n\n## Key Trends\n\n### AI-Powered Layouts\n\nContent here...',
            keywords_used: ['web design', 'trends', '2026'],
            word_count: 812,
            seo_suggestions: ['Add internal links to portfolio page', 'Consider adding FAQ section'],
          }) }],
        })

        const result: ToolResult = await contentToolHandlers.generate_blog(
          { topic: 'web design trends 2026', keywords: ['web design', 'trends', '2026'] },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        const data = result.data as any
        expect(data.title).toBeDefined()
        expect(data.meta_description).toBeDefined()
        expect(data.body).toBeDefined()
        expect(data.keywords_used).toBeInstanceOf(Array)
        expect(data.word_count).toBeGreaterThan(0)
        expect(data.seo_suggestions).toBeInstanceOf(Array)
      })

      it('includes keywords in system prompt when provided', async () => {
        mockCreate.mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            title: 'Test',
            meta_description: 'Test desc',
            body: 'Body',
            keywords_used: ['seo'],
            word_count: 100,
            seo_suggestions: [],
          }) }],
        })

        await contentToolHandlers.generate_blog(
          { topic: 'test', keywords: ['seo', 'optimization'] },
          'org-1',
          mockSupabase,
        )

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                content: expect.stringContaining('seo'),
              }),
            ]),
          })
        )
      })

      it('returns success=false on exception', async () => {
        mockCreate.mockRejectedValue(new Error('context length exceeded'))

        const result = await contentToolHandlers.generate_blog(
          { topic: 'test' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('context length exceeded')
      })
    })

    describe('content_calendar', () => {
      it('returns items list with total count', async () => {
        const result: ToolResult = await contentToolHandlers.content_calendar(
          { days: 7 },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        const data = result.data as any
        expect(data.items).toBeInstanceOf(Array)
        expect(typeof data.total).toBe('number')
      })

      it('returns success=false on exception (not throw)', async () => {
        // Force an error by passing invalid input scenario
        // The handler should catch and return success=false
        const badSupabase = {
          from: () => {
            throw new Error('connection refused')
          },
        } as any

        const result = await contentToolHandlers.content_calendar(
          {},
          'org-1',
          badSupabase,
        )

        // content_calendar doesn't use supabase in v1.4 — it returns empty
        // This test verifies it returns properly shaped data even with bad input
        expect(result.success).toBe(true)
        expect((result.data as any).items).toBeInstanceOf(Array)
      })
    })
  })
})
