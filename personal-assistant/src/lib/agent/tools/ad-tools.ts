import Anthropic from '@anthropic-ai/sdk'
import type { AgentToolHandler, ToolResult } from '../tools'
import { adScriptGen } from '../ad-script-gen'
import type { Platform, HookType } from '../ad-script-gen'

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const adToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'generate_ad_scripts',
    description:
      'Generate video ad scripts for social media platforms. Produces structured scripts with hook variations, body, CTA, and shot-by-shot storyboard with timing guidance. Supports Reels, TikTok, YouTube Shorts, and Feed formats.',
    input_schema: {
      type: 'object' as const,
      properties: {
        description: {
          type: 'string',
          description: 'What the ad is for -- service, product, or offer being promoted',
        },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['reels', 'tiktok', 'shorts', 'feed'] },
          description: 'Target platforms (default: all)',
        },
        hook_types: {
          type: 'array',
          items: { type: 'string', enum: ['curiosity', 'problem-agitation', 'social-proof', 'direct-offer'] },
          description: 'Hook approaches to generate (default: all)',
        },
        tone: {
          type: 'string',
          description: 'Desired tone -- urgent, casual, professional. If not specified, adapts to platform',
        },
        offer_package_id: {
          type: 'string',
          description: 'Existing offer package ID. If not provided, generates from description',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'list_ad_batches',
    description:
      'List previously generated ad script batches for this organization. Shows batch IDs, offer names, and creation dates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Max batches to return (default 10)',
        },
      },
    },
  },
  {
    name: 'adapt_script',
    description:
      'Adapt an existing ad script from one platform format to another. Adjusts duration, pacing, and format to match the target platform\'s conventions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        script_text: {
          type: 'string',
          description: 'The original script text',
        },
        from_platform: {
          type: 'string',
          enum: ['reels', 'tiktok', 'shorts', 'feed'],
          description: 'Original platform format',
        },
        to_platform: {
          type: 'string',
          enum: ['reels', 'tiktok', 'shorts', 'feed'],
          description: 'Target platform format',
        },
      },
      required: ['script_text', 'from_platform', 'to_platform'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export const adToolHandlers: Record<string, AgentToolHandler> = {
  async generate_ad_scripts(input, orgId, supabase): Promise<ToolResult> {
    try {
      const description = input.description as string
      const platforms = (input.platforms as Platform[]) || adScriptGen.ALL_PLATFORMS
      const hookTypes = (input.hook_types as HookType[]) || adScriptGen.ALL_HOOK_TYPES
      const offerPackageId = input.offer_package_id as string | undefined

      const result = await adScriptGen.generate(supabase, orgId, {
        offerPackageId: offerPackageId || 'chat-generated',
        platforms,
        hookTypes,
      })

      return {
        success: true,
        data: {
          scripts: result.scripts,
          variations: result.variations,
          offerName: result.offerPackageName,
          platforms,
          hookTypes,
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async list_ad_batches(input, orgId, supabase): Promise<ToolResult> {
    try {
      const limit = (input.limit as number) || 10
      const batches = await adScriptGen.listBatches(supabase, orgId, limit)

      return {
        success: true,
        data: { batches, count: batches.length },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async adapt_script(input, _orgId, _supabase): Promise<ToolResult> {
    try {
      const scriptText = input.script_text as string
      const fromPlatform = input.from_platform as Platform
      const toPlatform = input.to_platform as Platform

      const adaptedScript = adScriptGen.adaptForPlatform(scriptText, fromPlatform, toPlatform)

      return {
        success: true,
        data: { adaptedScript, fromPlatform, toPlatform },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },
}
