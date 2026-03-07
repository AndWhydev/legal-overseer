/**
 * SerpAPI search integration + deduplication + orchestration.
 * Ported from PCC Python: prospect/scraper/serpapi.py + prospect/dedup.py
 */
import type { ProspectResult, WebsiteSignals } from './types'
import { DIRECTORY_DOMAINS, DIRECTORY_URL_PATTERNS, AU_STATES } from './constants'
import { calculateFitScore, calculateOpportunityScore, calculatePriorityScore, getFitBreakdown, getOpportunityBreakdown, buildSerpPresence } from './scoring'
import type { ProspectData } from './scoring'
import { generateOpportunityNotes, generateOutreachAngle, getPriorityServices } from './outreach'
import { analyzeWebsite } from './enrichment'

interface SerpAd {
  position: number
  title: string
  displayed_link: string
  link: string
  description: string
}

interface SerpLocalResult {
  position: number
  title: string
  rating?: number
  reviews?: number
  type?: string
  address?: string
  phone?: string
  website?: string
}

interface SerpOrganicResult {
  position: number
  title: string
  link: string
  domain: string
  snippet: string
}

interface RawProspect {
  name: string
  domain: string | null
  website: string | null
  phone: string | null
  address: string | null
  rating: number | null
  review_count: number | null
  found_in_ads: boolean
  ad_position: number | null
  found_in_maps: boolean
  maps_position: number | null
  found_in_organic: boolean
  organic_position: number | null
}

/** Normalize a URL to its bare domain */
export function normalizeDomain(url: string): string | null {
  try {
    let normalized = url.trim()
    if (!normalized.includes('://')) normalized = `https://${normalized}`
    const parsed = new URL(normalized)
    let domain = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (!domain.includes('.') || domain.length < 4) return null
    return domain
  } catch {
    return null
  }
}

/** Check if a URL/domain is a directory site */
export function isDirectoryUrl(url: string, domain: string): boolean {
  if (DIRECTORY_DOMAINS.has(domain)) return true
  // Check subdomain
  for (const dir of DIRECTORY_DOMAINS) {
    if (domain.endsWith(`.${dir}`)) return true
  }
  return DIRECTORY_URL_PATTERNS.some((pattern) => url.includes(pattern))
}

/** Normalize Australian location for SerpAPI query */
export function normalizeAuLocation(location: string): string {
  const parts = location.split(',').map((p) => p.trim())
  if (parts.length >= 2) {
    const stateAbbr = parts[1].toUpperCase()
    if (AU_STATES[stateAbbr]) {
      return `${parts[0]}, ${AU_STATES[stateAbbr]}, Australia`
    }
  }
  if (!location.toLowerCase().includes('australia')) {
    return `${location}, Australia`
  }
  return location
}

/** Clean business name by removing marketing suffixes */
function cleanBusinessName(name: string): string {
  let cleaned = name
    .replace(/⭐/g, '')
    .replace(/\d+\+?\s*reviews?/gi, '')
    .trim()

  // Split at delimiters and take first part
  const delimiters = ['|', ' - ', ':']
  for (const d of delimiters) {
    const idx = cleaned.indexOf(d)
    if (idx > 3) cleaned = cleaned.substring(0, idx).trim()
  }

  // Remove marketing suffixes
  const suffixPatterns = [
    /\s*[-–]\s*(local|reliable|trusted|best|reviewed|same[- ]day|#1|rated|fast|affordable|professional|expert|your local|licensed|insured|24\/7|free quotes?).*$/i,
  ]
  for (const pattern of suffixPatterns) {
    cleaned = cleaned.replace(pattern, '').trim()
  }

  return cleaned
}

/** Deduplicate SERP results into unique prospects. Priority: Maps > Ads > Organic */
function deduplicateResults(
  ads: SerpAd[],
  maps: SerpLocalResult[],
  organics: SerpOrganicResult[],
): RawProspect[] {
  const byDomain = new Map<string, RawProspect>()
  const byName = new Map<string, RawProspect>()

  // Maps first (most reliable for contact info)
  for (const m of maps) {
    const domain = m.website ? normalizeDomain(m.website) : null
    if (domain && isDirectoryUrl(m.website ?? '', domain)) continue

    const name = cleanBusinessName(m.title)
    const prospect: RawProspect = {
      name,
      domain,
      website: m.website ?? null,
      phone: m.phone ?? null,
      address: m.address ?? null,
      rating: m.rating ?? null,
      review_count: m.reviews ?? null,
      found_in_ads: false,
      ad_position: null,
      found_in_maps: true,
      maps_position: m.position,
      found_in_organic: false,
      organic_position: null,
    }

    if (domain) {
      byDomain.set(domain, prospect)
    } else {
      byName.set(name.toLowerCase(), prospect)
    }
  }

  // Ads
  for (const a of ads) {
    const domain = normalizeDomain(a.link)
    if (!domain || isDirectoryUrl(a.link, domain)) continue

    const existing = byDomain.get(domain)
    if (existing) {
      existing.found_in_ads = true
      existing.ad_position = a.position
    } else {
      byDomain.set(domain, {
        name: cleanBusinessName(a.title),
        domain,
        website: a.link,
        phone: null,
        address: null,
        rating: null,
        review_count: null,
        found_in_ads: true,
        ad_position: a.position,
        found_in_maps: false,
        maps_position: null,
        found_in_organic: false,
        organic_position: null,
      })
    }
  }

  // Organic
  for (const o of organics) {
    const domain = normalizeDomain(o.link)
    if (!domain || isDirectoryUrl(o.link, domain)) continue

    const existing = byDomain.get(domain)
    if (existing) {
      existing.found_in_organic = true
      existing.organic_position = o.position
    } else {
      byDomain.set(domain, {
        name: cleanBusinessName(o.title),
        domain,
        website: o.link,
        phone: null,
        address: null,
        rating: null,
        review_count: null,
        found_in_ads: false,
        ad_position: null,
        found_in_maps: false,
        maps_position: null,
        found_in_organic: true,
        organic_position: o.position,
      })
    }
  }

  return [...byDomain.values(), ...byName.values()]
}

/** Call SerpAPI and return parsed SERP results */
async function searchSerp(
  businessType: string,
  location: string,
  apiKey: string,
  numResults = 20,
): Promise<{ ads: SerpAd[]; maps: SerpLocalResult[]; organics: SerpOrganicResult[] }> {
  const query = `${businessType} ${location}`
  const normalizedLocation = normalizeAuLocation(location)

  const params = new URLSearchParams({
    q: query,
    location: normalizedLocation,
    google_domain: 'google.com.au',
    gl: 'au',
    hl: 'en',
    num: String(numResults),
    api_key: apiKey,
    engine: 'google',
  })

  const response = await fetch(`https://serpapi.com/search?${params}`)
  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Parse ads
  const ads: SerpAd[] = (data.ads ?? []).map((a: Record<string, unknown>, i: number) => ({
    position: i + 1,
    title: String(a.title ?? ''),
    displayed_link: String(a.displayed_link ?? ''),
    link: String(a.link ?? ''),
    description: String(a.description ?? ''),
  }))

  // Parse local/maps results
  const localResults = data.local_results?.places ?? data.local_results ?? []
  const maps: SerpLocalResult[] = (Array.isArray(localResults) ? localResults : []).map(
    (m: Record<string, unknown>, i: number) => ({
      position: (m.position as number) ?? i + 1,
      title: String(m.title ?? ''),
      rating: m.rating != null ? Number(m.rating) : undefined,
      reviews: m.reviews != null ? Number(m.reviews) : undefined,
      type: m.type != null ? String(m.type) : undefined,
      address: m.address != null ? String(m.address) : undefined,
      phone: m.phone != null ? String(m.phone) : undefined,
      website: m.website != null ? String(m.website) : undefined,
    }),
  )

  // Parse organic results
  const organics: SerpOrganicResult[] = (data.organic_results ?? []).map(
    (o: Record<string, unknown>) => {
      const link = String(o.link ?? '')
      const domain = normalizeDomain(link) ?? ''
      return {
        position: Number(o.position ?? 0),
        title: String(o.title ?? ''),
        link,
        domain,
        snippet: String(o.snippet ?? ''),
      }
    },
  ).filter((o: SerpOrganicResult) => !isDirectoryUrl(o.link, o.domain))

  return { ads, maps, organics }
}

export interface DiscoveryOptions {
  businessType: string
  location: string
  limit?: number
  apiKey: string
  enrichWebsites?: boolean
  onProgress?: (phase: string, message: string, progress: number) => void
}

/**
 * Full discovery pipeline: search → deduplicate → enrich → score → generate outreach
 */
export async function runDiscovery(options: DiscoveryOptions): Promise<ProspectResult[]> {
  const { businessType, location, limit = 20, apiKey, enrichWebsites = true, onProgress } = options

  // Phase 1: Search
  onProgress?.('searching', `Searching for "${businessType}" in ${location}...`, 10)
  const serp = await searchSerp(businessType, location, apiKey, limit)

  // Phase 2: Deduplicate
  onProgress?.('searching', 'Deduplicating results...', 25)
  const rawProspects = deduplicateResults(serp.ads, serp.maps, serp.organics)

  // Phase 3: Enrich
  const results: ProspectResult[] = []
  const total = Math.min(rawProspects.length, limit)

  for (let i = 0; i < total; i++) {
    const raw = rawProspects[i]
    onProgress?.('enriching', `Enriching ${raw.name} (${i + 1}/${total})...`, 30 + Math.round((i / total) * 40))

    let signals: WebsiteSignals | null = null
    if (enrichWebsites && raw.website) {
      try {
        signals = await analyzeWebsite(raw.website)
      } catch {
        // Continue without enrichment
      }
    }

    // Phase 4: Score
    const prospectData: ProspectData = {
      website: raw.website,
      phone: raw.phone,
      emails: signals?.emails ?? [],
      found_in_ads: raw.found_in_ads,
      found_in_maps: raw.found_in_maps,
      maps_position: raw.maps_position,
      found_in_organic: raw.found_in_organic,
      organic_position: raw.organic_position,
      rating: raw.rating,
      review_count: raw.review_count,
      signals,
    }

    const fitScore = calculateFitScore(prospectData)
    const opportunityScore = calculateOpportunityScore(prospectData)
    const priorityScore = calculatePriorityScore(fitScore, opportunityScore)

    onProgress?.('scoring', `Scoring ${raw.name}...`, 70 + Math.round((i / total) * 25))

    results.push({
      name: raw.name,
      domain: raw.domain,
      website: raw.website,
      phone: raw.phone,
      address: raw.address,
      emails: signals?.emails ?? [],
      rating: raw.rating,
      review_count: raw.review_count,
      fit_score: fitScore,
      opportunity_score: opportunityScore,
      priority_score: priorityScore,
      fit_breakdown: getFitBreakdown(prospectData),
      opportunity_breakdown: getOpportunityBreakdown(prospectData),
      opportunity_notes: generateOpportunityNotes(prospectData),
      outreach_angle: generateOutreachAngle(prospectData),
      priority_services: getPriorityServices(prospectData),
      website_signals: signals,
      serp_presence: buildSerpPresence(prospectData),
    })
  }

  // Sort by priority score descending
  results.sort((a, b) => b.priority_score - a.priority_score)

  onProgress?.('complete', `Found ${results.length} prospects`, 100)
  return results
}
