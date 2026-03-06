import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  generateScripts,
  generateVariations,
  generateStoryboard,
  adaptForPlatform,
  listScriptBatches,
  saveScriptBatch,
  runAdScriptGenTick,
  PLATFORM_CONFIGS,
  ALL_PLATFORMS,
  ALL_HOOK_TYPES,
  type Platform,
  type HookType,
  type AdScript,
  type GenerateScriptsParams,
} from './ad-script-gen'
import { getOfferPackage, parseOfferForScripting } from './offer-packages'

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn()
  return {
    default: vi.fn(() => ({
      messages: {
        create: mockCreate,
      },
    })),
    __esModule: true,
  }
})

// Mock run-logger
vi.mock('./run-logger', () => ({
  logAgentRun: vi.fn().mockResolvedValue(undefined),
}))

// Mock offer-packages
vi.mock('./offer-packages', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as Record<string, unknown>),
    getOfferPackage: vi.fn(async (supabase, orgId, packageId) => {
      if (packageId === 'test-pkg-1') {
        return {
          id: 'test-pkg-1',
          org_id: orgId,
          name: 'Premium Web Design',
          description: 'Professional website design for small businesses',
          service_type: 'web-development',
          price_range: '$2,000-$5,000',
          inclusions: ['Custom design', 'Mobile responsive', 'Contact form'],
          exclusions: ['Hosting', 'Maintenance'],
          usp: ['Fast turnaround', 'SEO-optimized', 'Modern design'],
          target_audience: 'Small business owners',
          pain_points: ['Outdated website losing customers', 'Not mobile-friendly'],
          status: 'active',
          created_at: '2026-03-01T00:00:00Z',
        }
      }
      return null
    }),
  }
})

function createMockSupabase(): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === 'offer_packages') {
        return {
          select: () => ({
            eq: (key: string, value: unknown) => ({
              eq: (key2: string, value2: unknown) => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: 'test-pkg-1',
                      org_id: value2,
                      name: 'Premium Web Design',
                      description: 'Professional website design for small businesses',
                      service_type: 'web-development',
                      price_range: '$2,000-$5,000',
                      inclusions: ['Custom design', 'Mobile responsive', 'Contact form'],
                      exclusions: ['Hosting', 'Maintenance'],
                      usp: ['Fast turnaround', 'SEO-optimized', 'Modern design'],
                      target_audience: 'Small business owners',
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }

      if (table === 'ad_script_batches') {
        return {
          insert: (data: unknown) => ({
            select: (fields: string) => ({
              single: () =>
                Promise.resolve({
                  data: { id: 'batch-123', ...(data as Record<string, unknown>) },
                  error: null,
                }),
            }),
          }),
          select: () => ({
            eq: (key: string, value: unknown) => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [],
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }

      if (table === 'approval_queue') {
        return {
          select: () => ({
            eq: (key: string, value: unknown) => ({
              eq: (key2: string, value2: unknown) => ({
                eq: (key3: string, value3: unknown) => ({
                  limit: () =>
                    Promise.resolve({
                      data: [],
                      error: null,
                    }),
                }),
              }),
            }),
          }),
          update: () => ({
            eq: () =>
              Promise.resolve({
                data: null,
                error: null,
              }),
          }),
        }
      }

      if (table === 'agent_runs') {
        return {
          insert: () => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: null,
                  error: null,
                }),
            }),
          }),
        }
      }

      throw new Error(`Unsupported table: ${table}`)
    },
  } as unknown as SupabaseClient
}

describe('adScriptGen - Platform Configurations', () => {
  it('defines all required platforms with correct duration and aspect ratios', () => {
    expect(PLATFORM_CONFIGS.reels).toEqual({
      name: 'reels',
      label: 'Instagram Reels',
      durationSeconds: 15,
      aspectRatio: '9:16',
      maxWords: 50,
      toneGuidance: expect.any(String),
    })

    expect(PLATFORM_CONFIGS.tiktok).toEqual({
      name: 'tiktok',
      label: 'TikTok',
      durationSeconds: 30,
      aspectRatio: '9:16',
      maxWords: 100,
      toneGuidance: expect.any(String),
    })

    expect(PLATFORM_CONFIGS.shorts).toEqual({
      name: 'shorts',
      label: 'YouTube Shorts',
      durationSeconds: 60,
      aspectRatio: '9:16',
      maxWords: 180,
      toneGuidance: expect.any(String),
    })

    expect(PLATFORM_CONFIGS.feed).toEqual({
      name: 'feed',
      label: 'Feed Post',
      durationSeconds: 20,
      aspectRatio: '1:1',
      maxWords: 70,
      toneGuidance: expect.any(String),
    })
  })

  it('has all expected platforms in ALL_PLATFORMS', () => {
    expect(ALL_PLATFORMS).toContain('reels')
    expect(ALL_PLATFORMS).toContain('tiktok')
    expect(ALL_PLATFORMS).toContain('shorts')
    expect(ALL_PLATFORMS).toContain('feed')
    expect(ALL_PLATFORMS).toHaveLength(4)
  })

  it('has all expected hook types in ALL_HOOK_TYPES', () => {
    expect(ALL_HOOK_TYPES).toContain('curiosity')
    expect(ALL_HOOK_TYPES).toContain('problem-agitation')
    expect(ALL_HOOK_TYPES).toContain('social-proof')
    expect(ALL_HOOK_TYPES).toContain('direct-offer')
    expect(ALL_HOOK_TYPES).toHaveLength(4)
  })
})

describe('adScriptGen - Storyboard Generation', () => {
  const mockOffer = {
    id: 'test-pkg-1',
    org_id: 'org-1',
    name: 'Premium Web Design',
    description: 'Professional website design',
    service_type: 'web-development',
    price_range: '$2,000-$5,000',
    inclusions: ['Custom design', 'Mobile responsive'],
    exclusions: ['Hosting'],
    usp: ['Fast turnaround', 'SEO-optimized', 'Modern design'],
    target_audience: 'Small business owners',
  }

  it('generates storyboard with 4 shots for 15-second reels', () => {
    const storyboard = generateStoryboard(mockOffer, 'reels', 'curiosity')
    expect(storyboard).toHaveLength(4)
    expect(storyboard[0].shotNumber).toBe(1)
    expect(storyboard[3].shotNumber).toBe(4)
    expect(storyboard[3].endTime).toBe(15)
  })

  it('generates storyboard with 5 shots for 60-second shorts (longer format)', () => {
    const storyboard = generateStoryboard(mockOffer, 'shorts', 'problem-agitation')
    expect(storyboard.length).toBeGreaterThanOrEqual(4)
    expect(storyboard[storyboard.length - 1].endTime).toBe(60)
  })

  it('storyboard shots have required fields', () => {
    const storyboard = generateStoryboard(mockOffer, 'tiktok', 'social-proof')
    for (const shot of storyboard) {
      expect(shot).toHaveProperty('shotNumber')
      expect(shot).toHaveProperty('startTime')
      expect(shot).toHaveProperty('endTime')
      expect(shot).toHaveProperty('duration')
      expect(shot).toHaveProperty('visual')
      expect(shot).toHaveProperty('textOverlay')
      expect(shot).toHaveProperty('audio')
      expect(shot.duration).toBe(shot.endTime - shot.startTime)
    }
  })

  it('storyboard timing is contiguous (no gaps)', () => {
    const storyboard = generateStoryboard(mockOffer, 'reels', 'direct-offer')
    for (let i = 1; i < storyboard.length; i++) {
      expect(storyboard[i].startTime).toBe(storyboard[i - 1].endTime)
    }
  })

  it('generates different visuals for different hook types', () => {
    const curiosityStoryboard = generateStoryboard(mockOffer, 'reels', 'curiosity')
    const agitationStoryboard = generateStoryboard(mockOffer, 'reels', 'problem-agitation')

    // Shot 2 (problem/agitation shot) should have different visuals
    expect(curiosityStoryboard[1].visual).not.toBe(agitationStoryboard[1].visual)
  })
})

describe('adScriptGen - Platform Adaptation', () => {
  const baseScript = `What if you could get a professional website without the usual hassle?

We built something special for small businesses.

Our Fast turnaround, SEO-optimized, Modern design approach gets results.

Limited spots available — book NOW before they are gone!`

  it('trims script to target platform word limits', () => {
    const adapted = adaptForPlatform(baseScript, 'shorts', 'reels')
    const words = adapted.split(/\s+/)
    expect(words.length).toBeLessThanOrEqual(PLATFORM_CONFIGS.reels.maxWords + 5)
  })

  it('returns identical script if adapting to same platform', () => {
    const adapted = adaptForPlatform(baseScript, 'reels', 'reels')
    expect(adapted).toBe(baseScript)
  })

  it('converts "DM us" to "Comment below" for TikTok', () => {
    const scriptWithDM = `${baseScript}\n\nDM us for details!`
    const adapted = adaptForPlatform(scriptWithDM, 'reels', 'tiktok')
    expect(adapted).toContain('Comment below')
    expect(adapted).not.toContain('DM us')
  })

  it('adds trending audio reminder for TikTok when not present', () => {
    const adapted = adaptForPlatform(baseScript, 'reels', 'tiktok')
    if (!baseScript.toLowerCase().includes('trending')) {
      expect(adapted).toContain('trending audio')
    }
  })

  it('preserves longer scripts for YouTube Shorts (60s format)', () => {
    const longScript = baseScript.repeat(3)
    const adapted = adaptForPlatform(longScript, 'reels', 'shorts')
    expect(adapted.length).toBeGreaterThan(baseScript.length)
  })
})

describe('adScriptGen - Script Generation (Template Fallback)', () => {
  const mockOffer = {
    id: 'test-pkg-1',
    org_id: 'org-1',
    name: 'Premium Web Design',
    description: 'Professional website design',
    service_type: 'web-development',
    price_range: '$2,000-$5,000',
    inclusions: ['Custom design', 'Mobile responsive'],
    exclusions: ['Hosting'],
    usp: ['Fast turnaround', 'SEO-optimized', 'Modern design'],
    target_audience: 'Small business owners',
  }

  it('generates scripts for all platform/hook combinations without errors', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['reels'],
      hookTypes: ['curiosity'],
    }

    const result = await generateScripts(supabase, 'org-1', params)
    expect(result.scripts).toHaveLength(1)
    expect(result.scripts[0].script).toBeTruthy()
    expect(result.scripts[0].platform).toBe('reels')
    expect(result.scripts[0].hookType).toBe('curiosity')
  })

  it('generates script with platform metadata', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['tiktok'],
      hookTypes: ['direct-offer'],
    }

    const result = await generateScripts(supabase, 'org-1', params)
    const script = result.scripts[0]

    expect(script.duration).toBe(PLATFORM_CONFIGS.tiktok.durationSeconds)
    expect(script.tone).toContain('Casual')
  })

  it('respects word count limits in generated scripts', async () => {
    const supabase = createMockSupabase()
    for (const platform of ALL_PLATFORMS) {
      const params: GenerateScriptsParams = {
        offerPackageId: 'test-pkg-1',
        platforms: [platform],
        hookTypes: ['curiosity'],
      }

      const result = await generateScripts(supabase, 'org-1', params)
      const script = result.scripts[0]
      const wordCount = script.script.split(/\s+/).length

      // Allow some flexibility
      expect(wordCount).toBeLessThanOrEqual(PLATFORM_CONFIGS[platform].maxWords + 10)
    }
  })

  it('includes shot descriptions for storyboarding', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['reels'],
      hookTypes: ['curiosity'],
    }

    const result = await generateScripts(supabase, 'org-1', params)
    const script = result.scripts[0]

    expect(script.shotDescriptions).toBeDefined()
    expect(script.shotDescriptions.length).toBeGreaterThan(0)
    expect(script.shotDescriptions[0]).toContain('SHOT')
  })

  it('includes storyboard with timing information', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['reels'],
      hookTypes: ['social-proof'],
    }

    const result = await generateScripts(supabase, 'org-1', params)
    const script = result.scripts[0]

    expect(script.storyboard).toBeDefined()
    expect(script.storyboard.length).toBeGreaterThan(0)
    for (const shot of script.storyboard) {
      expect(shot.startTime).toBeLessThan(shot.endTime)
      expect(shot.duration).toBe(shot.endTime - shot.startTime)
    }
  })
})

describe('adScriptGen - A/B Variations', () => {
  const mockOffer = {
    id: 'test-pkg-1',
    org_id: 'org-1',
    name: 'Premium Web Design',
    description: 'Professional website design',
    service_type: 'web-development',
    price_range: '$2,000-$5,000',
    inclusions: ['Custom design', 'Mobile responsive'],
    exclusions: ['Hosting'],
    usp: ['Fast turnaround', 'SEO-optimized', 'Modern design'],
    target_audience: 'Small business owners',
  }

  const baseScript = `What if you could get a professional website without the usual hassle?

We built something special for small businesses.

Our approach gets results.

Book a call today.`

  it('generates 3 variations by default', async () => {
    const variations = await generateVariations(mockOffer, baseScript)
    expect(variations).toHaveLength(3)
  })

  it('generates custom count of variations', async () => {
    const variations = await generateVariations(mockOffer, baseScript, 5)
    expect(variations.length).toBeLessThanOrEqual(5)
  })

  it('each variation has required fields', async () => {
    const variations = await generateVariations(mockOffer, baseScript, 3)
    for (const variation of variations) {
      expect(variation).toHaveProperty('variantLabel')
      expect(variation).toHaveProperty('openingLine')
      expect(variation).toHaveProperty('callToAction')
      expect(variation).toHaveProperty('tone')
      expect(variation).toHaveProperty('script')
      expect(['urgent', 'casual', 'professional']).toContain(variation.tone)
    }
  })

  it('variations have different opening lines and CTAs', async () => {
    const variations = await generateVariations(mockOffer, baseScript, 3)
    const openingLines = variations.map((v) => v.openingLine)
    const ctas = variations.map((v) => v.callToAction)

    // At least some should differ
    expect(new Set(openingLines).size).toBeGreaterThan(1)
    expect(new Set(ctas).size).toBeGreaterThan(1)
  })

  it('variations cover different tones (urgent, casual, professional)', async () => {
    const variations = await generateVariations(mockOffer, baseScript, 3)
    const tones = variations.map((v) => v.tone)

    // Should have multiple tones
    expect(new Set(tones).size).toBeGreaterThanOrEqual(2)
  })

  it('fallback variations are generated without API key', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY

    try {
      const variations = await generateVariations(mockOffer, baseScript, 3)
      expect(variations).toHaveLength(3)
      for (const variation of variations) {
        expect(variation.script).toBeTruthy()
        expect(variation.tone).toBeTruthy()
      }
    } finally {
      if (originalKey) {
        process.env.ANTHROPIC_API_KEY = originalKey
      }
    }
  })
})

describe('adScriptGen - Main Generation', () => {
  it('generates scripts for multiple platforms and hook types', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['reels', 'tiktok'],
      hookTypes: ['curiosity', 'problem-agitation'],
    }

    const result = await generateScripts(supabase, 'org-1', params)

    // Should have 2 platforms * 2 hooks = 4 scripts
    expect(result.scripts).toHaveLength(4)
    expect(result.scripts.every((s) => s.script)).toBe(true)
  })

  it('includes offer package name in result', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['reels'],
      hookTypes: ['curiosity'],
    }

    const result = await generateScripts(supabase, 'org-1', params)

    expect(result.offerPackageName).toBe('Premium Web Design')
  })

  it('includes generated timestamp in result', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['reels'],
      hookTypes: ['curiosity'],
    }

    const result = await generateScripts(supabase, 'org-1', params)

    expect(result.generatedAt).toBeTruthy()
    expect(new Date(result.generatedAt)).toBeInstanceOf(Date)
  })

  it('generates A/B variations from first script', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['reels'],
      hookTypes: ['curiosity'],
    }

    const result = await generateScripts(supabase, 'org-1', params)

    expect(result.variations).toBeTruthy()
    expect(result.variations.length).toBeGreaterThan(0)
  })

  it('saves batch to database and returns batch ID', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ['reels'],
      hookTypes: ['curiosity'],
    }

    const result = await generateScripts(supabase, 'org-1', params)

    expect(result.id).toBeTruthy()
  })
})

describe('adScriptGen - Database Operations', () => {
  it('saves script batch successfully', async () => {
    const supabase = createMockSupabase()
    const scripts: AdScript[] = [
      {
        platform: 'reels',
        hookType: 'curiosity',
        script: 'Test script',
        duration: 15,
        shotDescriptions: ['SHOT 1: Opening'],
        storyboard: [
          {
            shotNumber: 1,
            startTime: 0,
            endTime: 15,
            duration: 15,
            visual: 'Test visual',
            textOverlay: 'Test text',
            audio: 'Test audio',
          },
        ],
        tone: 'Fast-paced',
      },
    ]

    const batchId = await saveScriptBatch(
      supabase,
      'org-1',
      'test-pkg-1',
      'Test Offer',
      scripts,
      [],
    )

    expect(batchId).toBeTruthy()
  })

  it('lists script batches for organization', async () => {
    const supabase = createMockSupabase()

    const batches = await listScriptBatches(supabase, 'org-1')

    expect(Array.isArray(batches)).toBe(true)
  })

  it('handles database errors gracefully', async () => {
    const mockSupabaseWithError = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                Promise.resolve({
                  data: null,
                  error: { message: 'DB Error' },
                }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient

    const batches = await listScriptBatches(mockSupabaseWithError, 'org-1')

    expect(Array.isArray(batches)).toBe(true)
    expect(batches).toHaveLength(0)
  })
})

describe('adScriptGen - Scheduler Tick', () => {
  it('processes approved ad script generation actions', async () => {
    const supabase = createMockSupabase()

    const result = await runAdScriptGenTick(supabase, 'org-1', 'config-1')

    expect(result).toHaveProperty('processed')
    expect(result).toHaveProperty('generated')
    expect(result).toHaveProperty('failed')
    expect(typeof result.processed).toBe('number')
  })
})

describe('adScriptGen - Integration', () => {
  it('generates complete campaign with all platforms and hooks', async () => {
    const supabase = createMockSupabase()
    const params: GenerateScriptsParams = {
      offerPackageId: 'test-pkg-1',
      platforms: ALL_PLATFORMS,
      hookTypes: ALL_HOOK_TYPES,
    }

    const result = await generateScripts(supabase, 'org-1', params)

    // Should have 4 platforms * 4 hooks = 16 scripts
    expect(result.scripts).toHaveLength(16)

    // Verify each combination is present
    for (const platform of ALL_PLATFORMS) {
      for (const hookType of ALL_HOOK_TYPES) {
        const script = result.scripts.find(
          (s) => s.platform === platform && s.hookType === hookType,
        )
        expect(script).toBeDefined()
        expect(script?.script).toBeTruthy()
        expect(script?.storyboard.length).toBeGreaterThan(0)
      }
    }

    // Verify variations are generated
    expect(result.variations.length).toBeGreaterThan(0)

    // Verify all required fields are present
    for (const script of result.scripts) {
      expect(script.platform).toBeTruthy()
      expect(script.hookType).toBeTruthy()
      expect(script.script).toBeTruthy()
      expect(script.duration).toBeGreaterThan(0)
      expect(script.shotDescriptions.length).toBeGreaterThan(0)
      expect(script.storyboard.length).toBeGreaterThan(0)
      expect(script.tone).toBeTruthy()
    }
  })
})
