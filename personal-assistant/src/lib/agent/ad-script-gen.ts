import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { logAgentRun } from './run-logger'
import { getOfferPackage, parseOfferForScripting, type ParsedOffer } from './offer-packages'
import { resolveModel } from '@/lib/agent/model-registry'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Platform = 'reels' | 'tiktok' | 'shorts' | 'feed'
export type HookType = 'curiosity' | 'problem-agitation' | 'social-proof' | 'direct-offer'

export interface PlatformConfig {
  name: Platform
  durationSeconds: number
  label: string
  aspectRatio: string
  maxWords: number
  toneGuidance: string
}

export interface StoryboardShot {
  shotNumber: number
  startTime: number
  endTime: number
  duration: number
  visual: string
  textOverlay: string
  audio: string
}

export interface AdScript {
  id?: string
  platform: Platform
  hookType: HookType
  script: string
  duration: number
  shotDescriptions: string[]
  storyboard: StoryboardShot[]
  tone: string
}

export interface AdScriptVariation {
  variantLabel: string
  openingLine: string
  callToAction: string
  tone: 'urgent' | 'casual' | 'professional'
  script: string
}

export interface GenerateScriptsParams {
  offerPackageId: string
  platforms: Platform[]
  hookTypes: HookType[]
}

export interface GenerateScriptsResult {
  id?: string
  scripts: AdScript[]
  variations: AdScriptVariation[]
  offerPackageName: string
  generatedAt: string
}

export interface SavedScriptBatch {
  id: string
  org_id: string
  offer_package_id: string
  offer_name: string
  scripts: AdScript[]
  variations: AdScriptVariation[]
  created_at: string
}

export interface AdScriptTickResult {
  processed: number
  generated: number
  failed: number
}

interface OfferPackageRow {
  id: string
  name: string
  description: string
  service_type: string
  price_range: string
  inclusions: string[]
  exclusions: string[]
  usp: string[]
  target_audience: string | null
}

// ---------------------------------------------------------------------------
// Platform config
// ---------------------------------------------------------------------------

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  reels: {
    name: 'reels',
    label: 'Instagram Reels',
    durationSeconds: 15,
    aspectRatio: '9:16',
    maxWords: 50,
    toneGuidance: 'Fast-paced, visual-first, trending audio. Hook in first 1 second.',
  },
  tiktok: {
    name: 'tiktok',
    label: 'TikTok',
    durationSeconds: 30,
    aspectRatio: '9:16',
    maxWords: 100,
    toneGuidance: 'Casual, authentic, trending. Reference popular sounds. Speak directly to camera.',
  },
  shorts: {
    name: 'shorts',
    label: 'YouTube Shorts',
    durationSeconds: 60,
    aspectRatio: '9:16',
    maxWords: 180,
    toneGuidance: 'More detail allowed. Educational or story-driven. Can build suspense.',
  },
  feed: {
    name: 'feed',
    label: 'Feed Post',
    durationSeconds: 20,
    aspectRatio: '1:1',
    maxWords: 70,
    toneGuidance: 'Polished, professional. Can be square format. Clear messaging.',
  },
}

export const ALL_PLATFORMS: Platform[] = ['reels', 'tiktok', 'shorts', 'feed']
export const ALL_HOOK_TYPES: HookType[] = ['curiosity', 'problem-agitation', 'social-proof', 'direct-offer']

// ---------------------------------------------------------------------------
// Hook templates
// ---------------------------------------------------------------------------

interface HookTemplate {
  openingLine: (offer: OfferPackageRow | ParsedOffer) => string
  structure: string[]
  callToAction: string
}

const HOOK_TEMPLATES: Record<HookType, HookTemplate> = {
  curiosity: {
    openingLine: (offer) =>
      `What if you could get ${offer.usp[0] ?? offer.name} without the usual hassle?`,
    structure: [
      'Hook [0-3s]: Open with a surprising question or bold statement',
      'Problem [3-8s]: Tease the core benefit without revealing everything',
      'Solution [8-13s]: Show a glimpse of the result',
      'CTA [13-15s]: Drive curiosity to learn more',
    ],
    callToAction: 'Find out how — link in bio.',
  },
  'problem-agitation': {
    openingLine: (offer) =>
      `Tired of struggling with ${(offer as OfferPackageRow).service_type?.replace(/-/g, ' ') ?? 'results'} that never delivers?`,
    structure: [
      'Hook [0-3s]: Name the pain point directly',
      'Problem [3-8s]: Agitate — show how bad it gets without a solution',
      'Solution [8-13s]: Position the offer as the relief',
      'CTA [13-15s]: Urgency — limited spots / time',
    ],
    callToAction: 'Stop wasting time — book a call today.',
  },
  'social-proof': {
    openingLine: (offer) =>
      `Our clients are seeing real results with ${offer.name} — here's why.`,
    structure: [
      'Hook [0-3s]: Lead with a credible result or testimonial stat',
      'Problem [3-8s]: Explain what made it possible',
      'Solution [8-13s]: Show the before/after transformation',
      'CTA [13-15s]: Invite the viewer to join',
    ],
    callToAction: 'Join hundreds who already made the switch — DM us now.',
  },
  'direct-offer': {
    openingLine: (offer) =>
      `Get ${offer.name} — ${(offer as OfferPackageRow).price_range ?? 'affordable packages available'}.`,
    structure: [
      'Hook [0-3s]: State the benefit and price upfront',
      'Problem [3-8s]: What is included',
      'Solution [8-13s]: Show deliverables and timeline',
      'CTA [13-15s]: Book now / Limited time offer',
    ],
    callToAction: 'Book your spot today — limited availability.',
  },
}

// ---------------------------------------------------------------------------
// Script generation (template-based fallback)
// ---------------------------------------------------------------------------

function buildScript(
  offer: OfferPackageRow | ParsedOffer,
  platform: Platform,
  hookType: HookType,
): string {
  const config = PLATFORM_CONFIGS[platform]
  const hook = HOOK_TEMPLATES[hookType]

  const opening = hook.openingLine(offer)
  const uspHighlights = offer.usp.slice(0, 3).map((u) => `- ${u}`).join('\n')
  const inclusions = ('inclusions' in offer ? offer.inclusions : []).slice(0, 3).join(', ')
  const audience = ('target_audience' in offer ? offer.target_audience : null)
    ? ` for ${('target_audience' in offer ? offer.target_audience : '')}`
    : ''

  const body = `
${opening}

[${config.label} | ${config.durationSeconds}s | ${config.aspectRatio}]

Here's what you get${audience}:
${uspHighlights || `- ${offer.name}: ${offer.description}`}

${inclusions ? `Includes: ${inclusions}` : ''}

${'price_range' in offer ? `Price range: ${offer.price_range}` : ''}

${hook.callToAction}
`.trim()

  const words = body.split(/\s+/)
  if (words.length > config.maxWords) {
    return words.slice(0, config.maxWords).join(' ') + '...'
  }
  return body
}

// ---------------------------------------------------------------------------
// Storyboard generation
// ---------------------------------------------------------------------------

export function generateStoryboard(
  offer: OfferPackageRow | ParsedOffer,
  platform: Platform,
  hookType: HookType,
): StoryboardShot[] {
  const config = PLATFORM_CONFIGS[platform]
  const hook = HOOK_TEMPLATES[hookType]
  const totalDuration = config.durationSeconds

  // Proportional timing: Hook 20%, Problem 33%, Solution 33%, CTA 14%
  const hookEnd = Math.round(totalDuration * 0.2)
  const problemEnd = Math.round(totalDuration * 0.53)
  const solutionEnd = Math.round(totalDuration * 0.86)

  const shots: StoryboardShot[] = [
    {
      shotNumber: 1,
      startTime: 0,
      endTime: hookEnd,
      duration: hookEnd,
      visual: 'Close-up of talent speaking to camera OR bold text animation on branded background',
      textOverlay: hook.openingLine(offer).substring(0, 60),
      audio: `Voiceover: "${hook.openingLine(offer)}"`,
    },
    {
      shotNumber: 2,
      startTime: hookEnd,
      endTime: problemEnd,
      duration: problemEnd - hookEnd,
      visual: hookType === 'problem-agitation'
        ? 'B-roll of frustrated business owner, slow website loading, empty inbox'
        : hookType === 'social-proof'
          ? 'Screen recording or photo montage of client results'
          : 'Visuals of the transformation or end result',
      textOverlay: offer.usp[0] ?? offer.name,
      audio: `Voiceover describing the ${hookType === 'problem-agitation' ? 'pain point' : 'opportunity'}`,
    },
    {
      shotNumber: 3,
      startTime: problemEnd,
      endTime: solutionEnd,
      duration: solutionEnd - problemEnd,
      visual: `Service showcase: ${offer.name} in action — mockups, dashboards, before/after`,
      textOverlay: offer.usp.slice(0, 2).join(' | ') || offer.description.substring(0, 40),
      audio: `Voiceover: "With ${offer.name}, you get..."`,
    },
    {
      shotNumber: 4,
      startTime: solutionEnd,
      endTime: totalDuration,
      duration: totalDuration - solutionEnd,
      visual: 'CTA screen — branded slide with logo, contact info, and action button',
      textOverlay: hook.callToAction,
      audio: `Voiceover: "${hook.callToAction}"`,
    },
  ]

  // For longer formats, add a deep-dive shot
  if (totalDuration >= 45) {
    const inclusions = (offer.usp ?? []).slice(0, 3)
    shots.splice(3, 0, {
      shotNumber: 4,
      startTime: solutionEnd,
      endTime: solutionEnd + 15,
      duration: 15,
      visual: `Detail breakdown: list inclusions with animated checkmarks — ${inclusions.join(', ')}`,
      textOverlay: inclusions.join(' | '),
      audio: 'Voiceover walking through what is included',
    })
    // Adjust last shot
    shots[shots.length - 1].startTime = solutionEnd + 15
    shots[shots.length - 1].endTime = totalDuration
    shots[shots.length - 1].duration = totalDuration - (solutionEnd + 15)
    // Renumber
    shots.forEach((s, i) => { s.shotNumber = i + 1 })
  }

  return shots
}

// ---------------------------------------------------------------------------
// Shot descriptions (legacy compat)
// ---------------------------------------------------------------------------

function buildShotDescriptions(
  offer: OfferPackageRow | ParsedOffer,
  platform: Platform,
  hookType: HookType,
): string[] {
  const storyboard = generateStoryboard(offer, platform, hookType)
  return storyboard.map(
    (s) => `SHOT ${s.shotNumber} [${s.startTime}-${s.endTime}s]: ${s.visual}`,
  )
}

// ---------------------------------------------------------------------------
// LLM-powered script generation (Opus for creative quality)
// ---------------------------------------------------------------------------

async function generateScriptWithLLM(
  offer: OfferPackageRow | ParsedOffer,
  platform: Platform,
  hookType: HookType,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const config = PLATFORM_CONFIGS[platform]
  const hook = HOOK_TEMPLATES[hookType]
  const painPoints = 'pain_points' in offer
    ? (offer as ParsedOffer).painPoints
    : []

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: resolveModel('synthesis'),
      max_tokens: 600,
      system: `You are an expert video ad scriptwriter for short-form social media content.
Write scripts that are punchy, engaging, and optimized for ${config.label}.

Platform constraints:
- Maximum duration: ${config.durationSeconds} seconds
- Aspect ratio: ${config.aspectRatio}
- Max word count: ${config.maxWords} words
- Tone: ${config.toneGuidance}

Script structure:
${hook.structure.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Return ONLY the script text. No metadata, no shot numbers, no formatting instructions.`,
      messages: [{
        role: 'user',
        content: `Write a ${hookType} style video ad script for:

Service: ${offer.name}
Description: ${offer.description}
Key selling points: ${offer.usp.join(', ')}
Target audience: ${('target_audience' in offer ? offer.target_audience : null) || 'Small-medium business owners'}
Pain points: ${painPoints.length > 0 ? painPoints.join(', ') : 'General business challenges'}
${'price_range' in offer ? `Price: ${offer.price_range}` : ''}

End with CTA: "${hook.callToAction}"`,
      }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock?.type === 'text' ? textBlock.text : null
  } catch (err) {
    logger.warn('[ad-script-gen] LLM generation failed:', err)
    return null
  }
}

// ---------------------------------------------------------------------------
// A/B Variations (Sonnet for speed)
// ---------------------------------------------------------------------------

export async function generateVariations(
  offer: OfferPackageRow | ParsedOffer,
  baseScript: string,
  count: number = 3,
): Promise<AdScriptVariation[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return buildFallbackVariations(offer, baseScript)

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: resolveModel('conversation'),
      max_tokens: 1000,
      system: `You generate A/B test variations of video ad scripts.
Return a JSON array of ${count} variations. Each object has:
- variantLabel: string (e.g. "Variant A - Urgent")
- openingLine: string
- callToAction: string
- tone: "urgent" | "casual" | "professional"
- script: string (full rewritten script)

Return ONLY valid JSON, no markdown fences.`,
      messages: [{
        role: 'user',
        content: `Create ${count} variations of this ad script for "${offer.name}":

${baseScript}

Vary the opening hook, CTA, and tone. Keep each under ${baseScript.split(/\s+/).length + 20} words.`,
      }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (textBlock?.type !== 'text') return buildFallbackVariations(offer, baseScript)

    const parsed = JSON.parse(textBlock.text) as AdScriptVariation[]
    if (Array.isArray(parsed)) return parsed.slice(0, count)
    return buildFallbackVariations(offer, baseScript)
  } catch {
    return buildFallbackVariations(offer, baseScript)
  }
}

function buildFallbackVariations(
  offer: OfferPackageRow | ParsedOffer,
  baseScript: string,
): AdScriptVariation[] {
  const tones: Array<'urgent' | 'casual' | 'professional'> = ['urgent', 'casual', 'professional']
  const ctas = [
    'Limited spots available — book NOW before they are gone!',
    'Hey, want to chat about it? DM us anytime.',
    'Schedule your free consultation today.',
  ]
  const openings = [
    `LAST CHANCE: ${offer.name} at this price!`,
    `So... we built something cool called ${offer.name}.`,
    `Introducing ${offer.name} — professional results, guaranteed.`,
  ]

  return tones.map((tone, i) => ({
    variantLabel: `Variant ${String.fromCharCode(65 + i)} - ${tone.charAt(0).toUpperCase() + tone.slice(1)}`,
    openingLine: openings[i],
    callToAction: ctas[i],
    tone,
    script: `${openings[i]}\n\n${baseScript.split('\n').slice(1).join('\n')}\n\n${ctas[i]}`,
  }))
}

// ---------------------------------------------------------------------------
// Platform adaptation
// ---------------------------------------------------------------------------

export function adaptForPlatform(
  script: string,
  fromPlatform: Platform,
  toPlatform: Platform,
): string {
  if (fromPlatform === toPlatform) return script

  const toConfig = PLATFORM_CONFIGS[toPlatform]
  const words = script.split(/\s+/)

  // Trim to target platform word count
  let adapted = words.length > toConfig.maxWords
    ? words.slice(0, toConfig.maxWords).join(' ') + '...'
    : script

  // Platform-specific adjustments
  if (toPlatform === 'tiktok') {
    adapted = adapted.replace(/\bDM us\b/gi, 'Comment below')
    if (!adapted.toLowerCase().includes('trending')) {
      adapted += '\n\n[Use trending audio]'
    }
  } else if (toPlatform === 'reels') {
    // Even more concise
    const lines = adapted.split('\n').filter(Boolean)
    if (lines.length > 4) {
      adapted = lines.slice(0, 4).join('\n')
    }
  } else if (toPlatform === 'shorts') {
    // Can be more detailed — no trimming needed
  }

  return adapted
}

// ---------------------------------------------------------------------------
// Save and list generated scripts
// ---------------------------------------------------------------------------

export async function saveScriptBatch(
  supabase: SupabaseClient,
  orgId: string,
  offerPackageId: string,
  offerName: string,
  scripts: AdScript[],
  variations: AdScriptVariation[],
): Promise<string> {
  const { data, error } = await supabase
    .from('ad_script_batches')
    .insert({
      org_id: orgId,
      offer_package_id: offerPackageId,
      offer_name: offerName,
      scripts: JSON.stringify(scripts),
      variations: JSON.stringify(variations),
    })
    .select('id')
    .single()

  if (error) {
    logger.warn('[ad-script-gen] Failed to save batch:', error.message)
    // Non-fatal — return empty string
    return ''
  }

  return data?.id ?? ''
}

export async function listScriptBatches(
  supabase: SupabaseClient,
  orgId: string,
  limit: number = 20,
): Promise<SavedScriptBatch[]> {
  const { data, error } = await supabase
    .from('ad_script_batches')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    logger.warn('[ad-script-gen] Failed to list batches:', error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    ...row,
    scripts: typeof row.scripts === 'string' ? JSON.parse(row.scripts) : row.scripts,
    variations: typeof row.variations === 'string' ? JSON.parse(row.variations) : row.variations,
  })) as SavedScriptBatch[]
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

export async function generateScripts(
  supabase: SupabaseClient,
  orgId: string,
  params: GenerateScriptsParams,
): Promise<GenerateScriptsResult> {
  const { offerPackageId, platforms, hookTypes } = params

  // Fetch the offer package
  const { data: offerData, error: offerError } = await supabase
    .from('offer_packages')
    .select('id, name, description, service_type, price_range, inclusions, exclusions, usp, target_audience')
    .eq('id', offerPackageId)
    .eq('org_id', orgId)
    .single()

  if (offerError || !offerData) {
    throw new Error(
      offerError?.message ?? `Offer package ${offerPackageId} not found for org ${orgId}`,
    )
  }

  const offer = offerData as OfferPackageRow

  // Generate all combinations
  const scripts: AdScript[] = []
  for (const platform of platforms) {
    for (const hookType of hookTypes) {
      const config = PLATFORM_CONFIGS[platform]

      // Try LLM generation first, fall back to template
      const llmScript = await generateScriptWithLLM(offer, platform, hookType)
      const script = llmScript ?? buildScript(offer, platform, hookType)

      scripts.push({
        platform,
        hookType,
        script,
        duration: config.durationSeconds,
        shotDescriptions: buildShotDescriptions(offer, platform, hookType),
        storyboard: generateStoryboard(offer, platform, hookType),
        tone: config.toneGuidance,
      })
    }
  }

  // Generate A/B variations from the first script
  const variations = scripts.length > 0
    ? await generateVariations(offer, scripts[0].script, 3)
    : []

  // Save to DB (non-blocking — do not await failures)
  const batchId = await saveScriptBatch(
    supabase, orgId, offerPackageId, offer.name, scripts, variations,
  )

  return {
    id: batchId || undefined,
    scripts,
    variations,
    offerPackageName: offer.name,
    generatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Scheduler tick
// ---------------------------------------------------------------------------

export async function runAdScriptGenTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<AdScriptTickResult> {
  const result: AdScriptTickResult = { processed: 0, generated: 0, failed: 0 }
  const startTime = Date.now()

  try {
    // Check for queued script generation requests in approval_queue
    const { data: approvedActions } = await supabase
      .from('approval_queue')
      .select('id, action_payload')
      .eq('org_id', orgId)
      .eq('action_type', 'ad_script_generate')
      .eq('status', 'approved')
      .limit(5)

    for (const action of approvedActions ?? []) {
      result.processed++
      try {
        const payload = action.action_payload as GenerateScriptsParams
        if (!payload?.offerPackageId) continue

        await generateScripts(supabase, orgId, payload)
        result.generated++

        // Mark processed
        await supabase
          .from('approval_queue')
          .update({ status: 'approved', resolved_at: new Date().toISOString() })
          .eq('id', action.id)
      } catch {
        result.failed++
      }
    }
  } catch {
    result.failed++
  }

  // Log the run
  await logAgentRun(supabase, {
    org_id: orgId,
    agent_config_id: agentConfigId,
    trigger_type: 'scheduled',
    status: 'success',
    result_summary: `processed=${result.processed} generated=${result.generated} failed=${result.failed}`,
    model_purpose: 'synthesis',
    tokens_in: 0,
    tokens_out: 0,
    cost_estimate: 0,
    duration_ms: Date.now() - startTime,
    tool_calls: 0,
    iterations: 1,
  })

  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const adScriptGen = {
  generate: generateScripts,
  generateVariations,
  generateStoryboard,
  adaptForPlatform,
  listBatches: listScriptBatches,
  saveBatch: saveScriptBatch,
  tick: runAdScriptGenTick,
  PLATFORM_CONFIGS,
  ALL_PLATFORMS,
  ALL_HOOK_TYPES,
}
