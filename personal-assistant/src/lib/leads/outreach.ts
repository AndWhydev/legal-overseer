/**
 * Outreach intelligence: opportunity notes, angles, priority services.
 * Ported from PCC Python: prospect/scoring/notes.py
 */
import type { ProspectData } from './scoring'
import { DIY_CMS } from './constants'

/** Generate semicolon-delimited opportunity notes by category */
export function generateOpportunityNotes(p: ProspectData): string {
  const notes: string[] = []

  if (!p.website) {
    notes.push('No website — critical gap for online presence')
    return notes.join('; ')
  }

  if (!p.signals) return 'Unable to analyze website'
  const s = p.signals

  // SEO
  if (!p.found_in_organic) {
    notes.push('SEO: not ranking in organic results')
  } else if (p.organic_position != null && p.organic_position > 5) {
    notes.push(`SEO: ranking position ${p.organic_position} — room to improve`)
  }
  if (p.found_in_maps && p.maps_position != null && p.maps_position > 1) {
    notes.push(`SEO: Maps position ${p.maps_position} — not in top spot`)
  }

  // Tracking
  if (s.has_google_analytics === false) notes.push('Tracking: no Google Analytics')
  if (s.has_facebook_pixel === false) notes.push('Tracking: no Facebook Pixel')

  // Conversion
  if (s.has_booking_system === false) notes.push('Conversion: no online booking system')
  if (!s.emails || s.emails.length === 0) notes.push('Conversion: no contact email found on site')

  // Technical
  if (s.cms && DIY_CMS.includes(s.cms)) notes.push(`Technical: using ${s.cms} (DIY platform)`)
  if (s.load_time_ms != null && s.load_time_ms > 3000) notes.push(`Technical: slow site (${s.load_time_ms}ms)`)

  // Positive signals
  if (p.found_in_ads) notes.push('Note: already running Google Ads — understands paid marketing')
  if (s.has_google_analytics === true && s.has_facebook_pixel === true) {
    notes.push('Note: good tracking setup already')
  }

  return notes.length > 0 ? notes.join('; ') : 'Well-optimized — limited obvious opportunities'
}

/** Generate a single prioritized outreach angle */
export function generateOutreachAngle(p: ProspectData): string {
  if (!p.website) return 'Help them build their first website'
  if (!p.signals) return 'Offer a website audit'
  if (p.signals.reachable === false) return 'Offer a website audit — site appears unreachable'

  const s = p.signals

  // Priority cascade
  if (!p.found_in_organic && !p.found_in_maps) return 'Help them get found online'
  if (s.has_google_analytics === false && s.has_facebook_pixel === false) return 'Help them understand their website traffic'
  if (s.has_booking_system === false) return 'Streamline booking with online scheduling'
  if (p.found_in_maps && p.maps_position != null && p.maps_position > 1) return 'Help them reach #1 in local search'
  if (s.cms && DIY_CMS.includes(s.cms)) return `Upgrade from ${s.cms} to a professional platform`
  if (s.load_time_ms != null && s.load_time_ms > 3000) return 'Speed up their website for better conversions'

  return 'General marketing consultation'
}

/** Generate prioritized service recommendations (max 5) */
export function getPriorityServices(p: ProspectData): string[] {
  const services: string[] = []

  if (!p.website) {
    services.push('Website Design', 'SEO', 'Google Business Profile')
    return services
  }

  if (!p.signals) {
    services.push('Website Audit', 'SEO')
    return services
  }

  const s = p.signals

  if (!p.found_in_organic || (p.organic_position != null && p.organic_position > 5)) {
    services.push('SEO')
  }
  if (p.found_in_maps && p.maps_position != null && p.maps_position > 1) {
    services.push('Local SEO')
  }
  if (p.found_in_ads) {
    services.push('Google Ads Management')
  }
  if (s.has_google_analytics === false) {
    services.push('Analytics Setup')
  }
  if (s.has_facebook_pixel === false) {
    services.push('Facebook Ads / Retargeting')
  }
  if (s.has_booking_system === false) {
    services.push('Booking System')
  }
  if (s.cms && DIY_CMS.includes(s.cms)) {
    services.push('Website Redesign')
  }
  if (s.load_time_ms != null && s.load_time_ms > 3000) {
    services.push('Website Optimization')
  }

  return services.slice(0, 5)
}
