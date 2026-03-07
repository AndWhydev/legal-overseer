/**
 * Fit + Opportunity scoring engine.
 * Ported from PCC Python: prospect/scoring/fit.py + opportunity.py
 */
import type { ScoreBreakdown, WebsiteSignals, SerpPresence } from './types'
import { FIT_WEIGHTS, OPPORTUNITY_WEIGHTS, DIY_CMS, PRIORITY_WEIGHTS } from './constants'

export interface ProspectData {
  website?: string | null
  phone?: string | null
  emails?: string[]
  found_in_ads?: boolean
  found_in_maps?: boolean
  maps_position?: number | null
  found_in_organic?: boolean
  organic_position?: number | null
  rating?: number | null
  review_count?: number | null
  signals?: WebsiteSignals | null
}

/** Calculate fit score (0-100): "Can we reach this prospect?" */
export function calculateFitScore(p: ProspectData): number {
  let score = 0
  if (p.website) score += FIT_WEIGHTS.website
  if (p.phone) score += FIT_WEIGHTS.phone
  if (p.emails && p.emails.length > 0) score += FIT_WEIGHTS.email
  if (p.found_in_maps) score += FIT_WEIGHTS.maps_presence
  if (p.rating != null && p.rating >= 4.0) score += FIT_WEIGHTS.good_rating
  if (p.review_count != null && p.review_count >= 10) score += FIT_WEIGHTS.review_count
  if (p.found_in_ads) score += FIT_WEIGHTS.ads_presence
  if (p.found_in_organic && p.organic_position != null && p.organic_position <= 10) {
    score += FIT_WEIGHTS.organic_top10
  }
  return Math.min(score, 100)
}

export function getFitBreakdown(p: ProspectData): ScoreBreakdown {
  const components: ScoreBreakdown['components'] = []
  if (p.website) components.push({ factor: 'Has website', points: FIT_WEIGHTS.website })
  if (p.phone) components.push({ factor: 'Has phone number', points: FIT_WEIGHTS.phone })
  if (p.emails && p.emails.length > 0) components.push({ factor: 'Has email', points: FIT_WEIGHTS.email })
  if (p.found_in_maps) components.push({ factor: 'Found in Google Maps', points: FIT_WEIGHTS.maps_presence })
  if (p.rating != null && p.rating >= 4.0) components.push({ factor: 'Good rating (4.0+)', points: FIT_WEIGHTS.good_rating })
  if (p.review_count != null && p.review_count >= 10) components.push({ factor: 'Has reviews (10+)', points: FIT_WEIGHTS.review_count })
  if (p.found_in_ads) components.push({ factor: 'Running ads', points: FIT_WEIGHTS.ads_presence })
  if (p.found_in_organic && p.organic_position != null && p.organic_position <= 10) {
    components.push({ factor: 'Organic top 10', points: FIT_WEIGHTS.organic_top10 })
  }
  return { total: calculateFitScore(p), components }
}

/** Calculate opportunity score (0-100): "Do they need marketing help?" */
export function calculateOpportunityScore(p: ProspectData): number {
  // No website = huge opportunity
  if (!p.website) return 80
  // No signals = moderate assumption
  if (!p.signals) return 50

  const s = p.signals
  let score = 0

  if (s.has_google_analytics === false) score += OPPORTUNITY_WEIGHTS.no_analytics
  if (s.has_facebook_pixel === false) score += OPPORTUNITY_WEIGHTS.no_pixel
  if (s.has_booking_system === false) score += OPPORTUNITY_WEIGHTS.no_booking
  if (!s.emails || s.emails.length === 0) score += OPPORTUNITY_WEIGHTS.no_contact
  if (s.cms && DIY_CMS.includes(s.cms)) score += OPPORTUNITY_WEIGHTS.weak_cms
  if (s.load_time_ms != null && s.load_time_ms > 3000) score += OPPORTUNITY_WEIGHTS.slow_site

  // Penalties
  if (p.found_in_ads) score += OPPORTUNITY_WEIGHTS.running_ads_penalty
  if (s.has_google_analytics === true && s.has_facebook_pixel === true) {
    score += OPPORTUNITY_WEIGHTS.good_tracking_penalty
  }

  // Maps/organic ranking
  if (p.found_in_maps && p.maps_position != null && p.maps_position > 1) {
    score += OPPORTUNITY_WEIGHTS.poor_maps_ranking
  }
  if (!p.found_in_organic || (p.organic_position != null && p.organic_position > 5)) {
    score += OPPORTUNITY_WEIGHTS.poor_organic_ranking
  }

  return Math.max(0, Math.min(score, 100))
}

export function getOpportunityBreakdown(p: ProspectData): ScoreBreakdown {
  if (!p.website) {
    return { total: 80, components: [{ factor: 'No website', points: 80, note: 'Huge opportunity — they need a web presence' }] }
  }
  if (!p.signals) {
    return { total: 50, components: [{ factor: 'No signals available', points: 50, note: 'Could not analyze website' }] }
  }

  const s = p.signals
  const components: ScoreBreakdown['components'] = []

  if (s.has_google_analytics === false) components.push({ factor: 'No Google Analytics', points: OPPORTUNITY_WEIGHTS.no_analytics })
  if (s.has_facebook_pixel === false) components.push({ factor: 'No Facebook Pixel', points: OPPORTUNITY_WEIGHTS.no_pixel })
  if (s.has_booking_system === false) components.push({ factor: 'No booking system', points: OPPORTUNITY_WEIGHTS.no_booking })
  if (!s.emails || s.emails.length === 0) components.push({ factor: 'No contact email', points: OPPORTUNITY_WEIGHTS.no_contact })
  if (s.cms && DIY_CMS.includes(s.cms)) components.push({ factor: `DIY CMS (${s.cms})`, points: OPPORTUNITY_WEIGHTS.weak_cms })
  if (s.load_time_ms != null && s.load_time_ms > 3000) components.push({ factor: 'Slow website', points: OPPORTUNITY_WEIGHTS.slow_site, note: `${s.load_time_ms}ms` })
  if (p.found_in_ads) components.push({ factor: 'Already running ads', points: OPPORTUNITY_WEIGHTS.running_ads_penalty, note: 'Strength — understands paid marketing' })
  if (s.has_google_analytics === true && s.has_facebook_pixel === true) {
    components.push({ factor: 'Good tracking setup', points: OPPORTUNITY_WEIGHTS.good_tracking_penalty, note: 'Strength — already tracking' })
  }
  if (p.found_in_maps && p.maps_position != null && p.maps_position > 1) {
    components.push({ factor: 'Poor Maps ranking', points: OPPORTUNITY_WEIGHTS.poor_maps_ranking, note: `Position ${p.maps_position}` })
  }
  if (!p.found_in_organic || (p.organic_position != null && p.organic_position > 5)) {
    components.push({ factor: 'Poor/no organic ranking', points: OPPORTUNITY_WEIGHTS.poor_organic_ranking })
  }

  return { total: calculateOpportunityScore(p), components }
}

/** Calculate priority score combining fit + opportunity */
export function calculatePriorityScore(fitScore: number, opportunityScore: number): number {
  return +(fitScore * PRIORITY_WEIGHTS.fit + opportunityScore * PRIORITY_WEIGHTS.opportunity).toFixed(2)
}

/** Build SerpPresence from prospect data */
export function buildSerpPresence(p: ProspectData): SerpPresence {
  return {
    found_in_ads: p.found_in_ads ?? false,
    ad_position: null,
    found_in_maps: p.found_in_maps ?? false,
    maps_position: p.maps_position ?? null,
    found_in_organic: p.found_in_organic ?? false,
    organic_position: p.organic_position ?? null,
  }
}
