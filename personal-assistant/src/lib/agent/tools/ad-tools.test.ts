import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolResult } from '../tools'

// Mock adScriptGen before importing the module under test
vi.mock('../ad-script-gen', () => ({
  adScriptGen: {
    generate: vi.fn(),
    listBatches: vi.fn(),
    adaptForPlatform: vi.fn(),
    ALL_PLATFORMS: ['reels', 'tiktok', 'shorts', 'feed'],
    ALL_HOOK_TYPES: ['curiosity', 'problem-agitation', 'social-proof', 'direct-offer'],
    PLATFORM_CONFIGS: {
      reels: { name: 'reels', label: 'Instagram Reels', durationSeconds: 15, aspectRatio: '9:16', maxWords: 50, toneGuidance: 'Fast-paced' },
      tiktok: { name: 'tiktok', label: 'TikTok', durationSeconds: 30, aspectRatio: '9:16', maxWords: 100, toneGuidance: 'Casual' },
      shorts: { name: 'shorts', label: 'YouTube Shorts', durationSeconds: 60, aspectRatio: '9:16', maxWords: 180, toneGuidance: 'Educational' },
      feed: { name: 'feed', label: 'Feed Post', durationSeconds: 20, aspectRatio: '1:1', maxWords: 70, toneGuidance: 'Polished' },
    },
  },
}))

import { adToolDefinitions, adToolHandlers } from './ad-tools'
import { adScriptGen } from '../ad-script-gen'

const mockSupabase = {} as any

describe('ad-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('adToolDefinitions', () => {
    it('exports 3 tool definitions', () => {
      expect(adToolDefinitions).toHaveLength(3)
    })

    it('defines generate_ad_scripts with correct schema', () => {
      const tool = adToolDefinitions.find(t => t.name === 'generate_ad_scripts')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toContain('description')
      expect(tool!.input_schema.properties).toHaveProperty('platforms')
      expect(tool!.input_schema.properties).toHaveProperty('hook_types')
      expect(tool!.input_schema.properties).toHaveProperty('tone')
      expect(tool!.input_schema.properties).toHaveProperty('offer_package_id')
    })

    it('defines list_ad_batches with optional limit', () => {
      const tool = adToolDefinitions.find(t => t.name === 'list_ad_batches')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.properties).toHaveProperty('limit')
    })

    it('defines adapt_script with required fields', () => {
      const tool = adToolDefinitions.find(t => t.name === 'adapt_script')
      expect(tool).toBeDefined()
      expect(tool!.input_schema.required).toEqual(
        expect.arrayContaining(['script_text', 'from_platform', 'to_platform'])
      )
    })
  })

  describe('adToolHandlers', () => {
    describe('generate_ad_scripts', () => {
      it('calls adScriptGen.generate with offer_package_id when provided', async () => {
        const mockResult = {
          scripts: [{ platform: 'reels', script: 'test' }],
          variations: [{ variantLabel: 'A', script: 'var' }],
          offerPackageName: 'Test Offer',
          generatedAt: '2026-03-18',
        }
        vi.mocked(adScriptGen.generate).mockResolvedValue(mockResult as any)

        const result: ToolResult = await adToolHandlers.generate_ad_scripts(
          {
            description: 'A web design package',
            offer_package_id: 'offer-123',
            platforms: ['reels', 'tiktok'],
            hook_types: ['curiosity'],
          },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(adScriptGen.generate).toHaveBeenCalledWith(
          mockSupabase,
          'org-1',
          expect.objectContaining({ offerPackageId: 'offer-123' }),
        )
        expect((result.data as any).scripts).toEqual(mockResult.scripts)
        expect((result.data as any).variations).toEqual(mockResult.variations)
      })

      it('calls adScriptGen.generate with description when no offer_package_id', async () => {
        const mockResult = {
          scripts: [{ platform: 'tiktok', script: 'desc-script' }],
          variations: [],
          offerPackageName: 'Web design for small businesses',
          generatedAt: '2026-03-18',
        }
        vi.mocked(adScriptGen.generate).mockResolvedValue(mockResult as any)

        const result = await adToolHandlers.generate_ad_scripts(
          { description: 'Web design for small businesses' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect(adScriptGen.generate).toHaveBeenCalledWith(
          mockSupabase,
          'org-1',
          expect.objectContaining({
            offerPackageId: 'chat-generated',
            platforms: ['reels', 'tiktok', 'shorts', 'feed'],
            hookTypes: ['curiosity', 'problem-agitation', 'social-proof', 'direct-offer'],
          }),
        )
      })

      it('returns success=false on exception', async () => {
        vi.mocked(adScriptGen.generate).mockRejectedValue(new Error('DB connection failed'))

        const result = await adToolHandlers.generate_ad_scripts(
          { description: 'Test' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('DB connection failed')
      })
    })

    describe('list_ad_batches', () => {
      it('returns batches with correct shape', async () => {
        const mockBatches = [
          { id: 'b1', offer_name: 'Offer A', scripts: [], created_at: '2026-03-18' },
          { id: 'b2', offer_name: 'Offer B', scripts: [], created_at: '2026-03-17' },
        ]
        vi.mocked(adScriptGen.listBatches).mockResolvedValue(mockBatches as any)

        const result = await adToolHandlers.list_ad_batches(
          { limit: 5 },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect((result.data as any).batches).toEqual(mockBatches)
        expect((result.data as any).count).toBe(2)
        expect(adScriptGen.listBatches).toHaveBeenCalledWith(mockSupabase, 'org-1', 5)
      })

      it('defaults limit to 10', async () => {
        vi.mocked(adScriptGen.listBatches).mockResolvedValue([])

        await adToolHandlers.list_ad_batches({}, 'org-1', mockSupabase)

        expect(adScriptGen.listBatches).toHaveBeenCalledWith(mockSupabase, 'org-1', 10)
      })

      it('returns success=false on exception', async () => {
        vi.mocked(adScriptGen.listBatches).mockRejectedValue(new Error('timeout'))

        const result = await adToolHandlers.list_ad_batches({}, 'org-1', mockSupabase)

        expect(result.success).toBe(false)
        expect(result.error).toContain('timeout')
      })
    })

    describe('adapt_script', () => {
      it('adapts script between platforms', async () => {
        vi.mocked(adScriptGen.adaptForPlatform).mockReturnValue('adapted script text')

        const result = await adToolHandlers.adapt_script(
          { script_text: 'original script', from_platform: 'reels', to_platform: 'tiktok' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(true)
        expect((result.data as any).adaptedScript).toBe('adapted script text')
        expect((result.data as any).fromPlatform).toBe('reels')
        expect((result.data as any).toPlatform).toBe('tiktok')
        expect(adScriptGen.adaptForPlatform).toHaveBeenCalledWith(
          'original script',
          'reels',
          'tiktok',
        )
      })

      it('returns success=false on exception', async () => {
        vi.mocked(adScriptGen.adaptForPlatform).mockImplementation(() => {
          throw new Error('invalid platform')
        })

        const result = await adToolHandlers.adapt_script(
          { script_text: 'test', from_platform: 'invalid', to_platform: 'reels' },
          'org-1',
          mockSupabase,
        )

        expect(result.success).toBe(false)
        expect(result.error).toContain('invalid platform')
      })
    })
  })
})
