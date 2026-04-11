import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVICE_COMPONENTS, type ServiceComponent } from './pricing-templates'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfferPackage {
  id: string
  org_id: string
  name: string
  description: string
  service_type: string
  price_range: string
  inclusions: string[]
  exclusions: string[]
  usp: string[]
  target_audience: string | null
  pain_points: string[]
  status: 'active' | 'draft' | 'archived'
  created_at: string
}

export interface ParsedOffer {
  name: string
  description: string
  serviceType: string
  priceRange: string
  inclusions: string[]
  usp: string[]
  targetAudience: string | null
  painPoints: string[]
}

// ---------------------------------------------------------------------------
// Pain points derived from service type
// ---------------------------------------------------------------------------

const PAIN_POINTS_BY_SERVICE: Record<string, string[]> = {
  'web-development': [
    'Outdated website losing customers',
    'Not mobile-friendly',
    'Slow loading times hurting SEO',
    'No online presence at all',
  ],
  seo: [
    'Invisible on Google',
    'Competitors ranking above you',
    'Spending money on ads with no organic traffic',
    'No idea what keywords to target',
  ],
  ads: [
    'Wasting ad budget with no results',
    'Low click-through rates',
    'No conversion tracking',
    'Competitors stealing your clicks',
  ],
  branding: [
    'Looking unprofessional compared to competitors',
    'Inconsistent brand across platforms',
    'No memorable visual identity',
    'Outdated logo turning customers away',
  ],
  content: [
    'No content strategy',
    'Blog gathering dust',
    'Social media with zero engagement',
    'No authority in your niche',
  ],
  automation: [
    'Manual processes eating your time',
    'Leads falling through the cracks',
    'No follow-up system',
    'Doing everything by hand',
  ],
}

function derivePainPoints(serviceType: string): string[] {
  const normalized = serviceType.toLowerCase().replace(/[_\s]+/g, '-')
  for (const [key, points] of Object.entries(PAIN_POINTS_BY_SERVICE)) {
    if (normalized.includes(key)) return points
  }
  return ['Struggling to grow your business', 'Not seeing results from current efforts']
}

// ---------------------------------------------------------------------------
// Fetch offer packages from DB
// ---------------------------------------------------------------------------

export async function listOfferPackages(
  supabase: SupabaseClient,
  orgId: string,
  status?: 'active' | 'draft' | 'archived',
): Promise<OfferPackage[]> {
  let query = supabase
    .from('offer_packages')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) {
    logger.warn('[offer-packages] Failed to fetch:', error.message)
    return []
  }

  return (data ?? []) as OfferPackage[]
}

export async function getOfferPackage(
  supabase: SupabaseClient,
  orgId: string,
  packageId: string,
): Promise<OfferPackage | null> {
  const { data, error } = await supabase
    .from('offer_packages')
    .select('*')
    .eq('id', packageId)
    .eq('org_id', orgId)
    .single()

  if (error || !data) return null
  return data as OfferPackage
}

// ---------------------------------------------------------------------------
// Parse offer into script-friendly format
// ---------------------------------------------------------------------------

export function parseOfferForScripting(offer: OfferPackage): ParsedOffer {
  return {
    name: offer.name,
    description: offer.description,
    serviceType: offer.service_type,
    priceRange: offer.price_range,
    inclusions: offer.inclusions ?? [],
    usp: offer.usp ?? [],
    targetAudience: offer.target_audience,
    painPoints: offer.pain_points?.length
      ? offer.pain_points
      : derivePainPoints(offer.service_type),
  }
}

// ---------------------------------------------------------------------------
// Build offers from service components (fallback when no DB packages)
// ---------------------------------------------------------------------------

export function buildOfferFromComponents(
  components: ServiceComponent[],
): ParsedOffer {
  const names = components.map((c) => c.name)
  const totalBase = components.reduce((sum, c) => sum + c.basePrice, 0)
  const category = components[0]?.category ?? 'general'

  return {
    name: names.join(' + '),
    description: components.map((c) => c.description).join('. '),
    serviceType: category,
    priceRange: `From $${totalBase.toLocaleString()}`,
    inclusions: components.map((c) => c.description),
    usp: components.map((c) => c.name),
    targetAudience: null,
    painPoints: derivePainPoints(category),
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const offerPackages = {
  list: listOfferPackages,
  get: getOfferPackage,
  parse: parseOfferForScripting,
  buildFromComponents: buildOfferFromComponents,
  derivePainPoints,
}
