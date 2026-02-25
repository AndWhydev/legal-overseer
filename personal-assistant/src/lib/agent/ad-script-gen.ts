import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Platform = 'reels' | 'tiktok' | 'shorts' | 'feed'
export type HookType = 'curiosity' | 'problem-agitation' | 'social-proof'

export interface PlatformConfig {
  name: Platform
  durationSeconds: number
  label: string
  aspectRatio: string
  maxWords: number
}

export interface AdScript {
  platform: Platform
  hookType: HookType
  script: string
  duration: number
  shotDescriptions: string[]
}

export interface GenerateScriptsParams {
  offerPackageId: string
  platforms: Platform[]
  hookTypes: HookType[]
}

export interface GenerateScriptsResult {
  scripts: AdScript[]
  offerPackageName: string
  generatedAt: string
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

const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  reels: {
    name: 'reels',
    label: 'Instagram Reels',
    durationSeconds: 15,
    aspectRatio: '9:16',
    maxWords: 50,
  },
  tiktok: {
    name: 'tiktok',
    label: 'TikTok',
    durationSeconds: 30,
    aspectRatio: '9:16',
    maxWords: 100,
  },
  shorts: {
    name: 'shorts',
    label: 'YouTube Shorts',
    durationSeconds: 60,
    aspectRatio: '9:16',
    maxWords: 180,
  },
  feed: {
    name: 'feed',
    label: 'Feed (Square/Landscape)',
    durationSeconds: 20,
    aspectRatio: '1:1',
    maxWords: 70,
  },
}

// ---------------------------------------------------------------------------
// Hook templates
// ---------------------------------------------------------------------------

interface HookTemplate {
  openingLine: (offer: OfferPackageRow) => string
  structure: string[]
  callToAction: string
}

const HOOK_TEMPLATES: Record<HookType, HookTemplate> = {
  curiosity: {
    openingLine: (offer) =>
      `What if you could get ${offer.usp[0] ?? offer.name} without the usual hassle?`,
    structure: [
      'Open with a surprising question or bold statement',
      'Tease the core benefit without revealing everything',
      'Show a glimpse of the result',
      'Drive curiosity to learn more',
    ],
    callToAction: 'Find out how — link in bio.',
  },
  'problem-agitation': {
    openingLine: (offer) =>
      `Tired of struggling with ${offer.service_type.replace(/-/g, ' ')} that never delivers?`,
    structure: [
      'Name the pain point directly',
      'Agitate: show how bad it gets without a solution',
      'Position the offer as the relief',
      'Urgency: limited spots / time',
    ],
    callToAction: 'Stop wasting time — book a call today.',
  },
  'social-proof': {
    openingLine: (offer) =>
      `Our clients are seeing real results with ${offer.name} — here's why.`,
    structure: [
      'Lead with a credible result or testimonial stat',
      'Explain what made it possible',
      'Show the before/after transformation',
      'Invite the viewer to join',
    ],
    callToAction: 'Join hundreds who already made the switch — DM us now.',
  },
}

// ---------------------------------------------------------------------------
// Script generation helpers
// ---------------------------------------------------------------------------

function buildScript(
  offer: OfferPackageRow,
  platform: Platform,
  hookType: HookType,
): string {
  const config = PLATFORM_CONFIGS[platform]
  const hook = HOOK_TEMPLATES[hookType]

  const opening = hook.openingLine(offer)
  const uspHighlights = offer.usp.slice(0, 3).map((u) => `• ${u}`).join('\n')
  const inclusions = offer.inclusions.slice(0, 3).join(', ')
  const audience = offer.target_audience ? ` for ${offer.target_audience}` : ''

  const body = `
${opening}

[${config.label} — ${config.durationSeconds}s]

Here's what you get${audience}:
${uspHighlights || `• ${offer.name}: ${offer.description}`}

${inclusions ? `Includes: ${inclusions}` : ''}

Price range: ${offer.price_range}

${hook.callToAction}
`.trim()

  // Trim to max words for the platform
  const words = body.split(/\s+/)
  if (words.length > config.maxWords) {
    return words.slice(0, config.maxWords).join(' ') + '…'
  }
  return body
}

function buildShotDescriptions(
  offer: OfferPackageRow,
  platform: Platform,
  hookType: HookType,
): string[] {
  const config = PLATFORM_CONFIGS[platform]
  const isShortForm = config.durationSeconds <= 15

  const baseShots: string[] = [
    `SHOT 1 [0–2s]: Hook — ${HOOK_TEMPLATES[hookType].openingLine(offer).substring(0, 60)}...`,
  ]

  if (hookType === 'curiosity') {
    baseShots.push(
      `SHOT 2 [2–${isShortForm ? 8 : 10}s]: Visuals of the transformation or end result, no voiceover`,
      `SHOT 3 [${isShortForm ? 8 : 10}–${isShortForm ? 13 : 22}s]: Quick text overlays listing key USPs`,
      `SHOT 4 [${isShortForm ? 13 : 22}–${config.durationSeconds}s]: CTA screen with offer name + price range`,
    )
  } else if (hookType === 'problem-agitation') {
    baseShots.push(
      `SHOT 2 [2–${isShortForm ? 7 : 10}s]: Problem dramatisation — frustrated customer / failed outcome`,
      `SHOT 3 [${isShortForm ? 7 : 10}–${isShortForm ? 12 : 22}s]: Contrast cut — happy client / successful outcome with ${offer.name}`,
      `SHOT 4 [${isShortForm ? 12 : 22}–${config.durationSeconds}s]: Urgency CTA with booking prompt`,
    )
  } else {
    baseShots.push(
      `SHOT 2 [2–${isShortForm ? 7 : 12}s]: Screen recording or photo montage of client results`,
      `SHOT 3 [${isShortForm ? 7 : 12}–${isShortForm ? 12 : 24}s]: Testimonial quote overlay or talking-head clip`,
      `SHOT 4 [${isShortForm ? 12 : 24}–${config.durationSeconds}s]: Social proof numbers (clients, results) + CTA`,
    )
  }

  if (!isShortForm && config.durationSeconds >= 60) {
    baseShots.splice(
      3,
      0,
      `SHOT 3b [22–40s]: Deep-dive: walk through inclusions — ${offer.inclusions.slice(0, 2).join(', ')}`,
    )
  }

  return baseShots
}

// ---------------------------------------------------------------------------
// Public function
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
      scripts.push({
        platform,
        hookType,
        script: buildScript(offer, platform, hookType),
        duration: config.durationSeconds,
        shotDescriptions: buildShotDescriptions(offer, platform, hookType),
      })
    }
  }

  return {
    scripts,
    offerPackageName: offer.name,
    generatedAt: new Date().toISOString(),
  }
}
