/**
 * Website enrichment: crawl, CMS detection, tracking detection, booking detection, contact extraction.
 * Ported from PCC Python: prospect/enrichment/
 */
import type { WebsiteSignals } from './types'
import {
  CMS_SIGNATURES, TRACKING_SIGNATURES, BOOKING_SIGNATURES,
  PHONE_PATTERNS, EMAIL_PATTERN, SPAM_EMAIL_DOMAINS, SPAM_EMAIL_PATTERNS,
} from './constants'

interface CrawlResult {
  url: string
  success: boolean
  html: string
  loadTimeMs: number
  statusCode?: number
  error?: string
  finalUrl?: string
}

/** Fetch a website and return its HTML */
export async function crawlWebsite(url: string, timeoutMs = 10_000): Promise<CrawlResult> {
  const fullUrl = url.startsWith('http') ? url : `https://${url}`
  const start = Date.now()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetch(fullUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-AU,en;q=0.9',
      },
      redirect: 'follow',
    })

    clearTimeout(timer)
    const html = await response.text()
    const loadTimeMs = Date.now() - start

    return {
      url: fullUrl,
      success: response.ok,
      html,
      loadTimeMs,
      statusCode: response.status,
      finalUrl: response.url !== fullUrl ? response.url : undefined,
    }
  } catch (err) {
    return {
      url: fullUrl,
      success: false,
      html: '',
      loadTimeMs: Date.now() - start,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}

/** Detect CMS from HTML (case-insensitive substring matching) */
export function detectCms(html: string): string | null {
  const lower = html.toLowerCase()
  for (const [cms, signatures] of Object.entries(CMS_SIGNATURES)) {
    for (const sig of signatures) {
      if (lower.includes(sig.toLowerCase())) return cms
    }
  }
  return null
}

/** Detect tracking tools from HTML */
export function detectTracking(html: string): {
  google_analytics: boolean
  facebook_pixel: boolean
  google_ads: boolean
} {
  const lower = html.toLowerCase()
  const result = { google_analytics: false, facebook_pixel: false, google_ads: false }

  for (const [tracker, signatures] of Object.entries(TRACKING_SIGNATURES)) {
    for (const sig of signatures) {
      if (lower.includes(sig.toLowerCase())) {
        result[tracker as keyof typeof result] = true
        break
      }
    }
  }

  return result
}

/** Detect booking system presence */
export function detectBookingSystem(html: string): boolean {
  const lower = html.toLowerCase()
  return BOOKING_SIGNATURES.some((sig) => lower.includes(sig.toLowerCase()))
}

/** Check if an email is spam/system-generated */
export function isSpamEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase()
  if (domain && SPAM_EMAIL_DOMAINS.has(domain)) return true
  return SPAM_EMAIL_PATTERNS.some((pattern) => pattern.test(email))
}

const EXCLUDE_EMAIL_PATTERNS = [
  /@example\./i, /@test\./i, /@localhost/i, /@domain\./i,
  /cloudflare/i, /googleapis/i, /jquery/i, /bootstrap/i, /fontawesome/i,
  /\.png$/i, /\.jpg$/i, /\.gif$/i, /\.css$/i, /\.js$/i, /\.svg$/i, /\.woff/i, /\.webp$/i,
  /@2x/i, /@3x/i,
]

/** Extract emails from HTML with spam/noise filtering */
export function extractEmails(html: string): string[] {
  const matches = html.match(EMAIL_PATTERN) ?? []
  const seen = new Set<string>()
  const results: string[] = []

  for (const email of matches) {
    const lower = email.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)

    if (email.length > 100) continue
    if (isSpamEmail(email)) continue
    if (EXCLUDE_EMAIL_PATTERNS.some((p) => p.test(email))) continue

    // Skip hash-like local parts
    const local = email.split('@')[0]
    if (local.length > 15) {
      const hexChars = (local.match(/[a-f0-9]/gi) ?? []).length
      if (hexChars / local.length > 0.7) continue
    }

    results.push(email)
    if (results.length >= 5) break
  }

  return results
}

/** Extract Australian phone numbers from HTML */
export function extractPhones(html: string): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  for (const pattern of PHONE_PATTERNS) {
    // Reset global regex
    const regex = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = regex.exec(html)) !== null) {
      const normalized = normalizePhone(match[0])
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized)
        results.push(normalized)
      }
    }
  }

  return results
}

/** Normalize an Australian phone number */
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, '')
  const cleaned = digits.replace(/^\+61/, '0')

  // Mobile: 04XX XXX XXX
  if (cleaned.startsWith('04') && cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`
  }
  // Landline: 0X XXXX XXXX
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`
  }
  // 1300/1800
  if (/^1[38]00/.test(cleaned) && cleaned.length === 10) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`
  }
  // 13 XX XX
  if (cleaned.startsWith('13') && cleaned.length === 6) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 4)} ${cleaned.slice(4)}`
  }

  return phone.trim() || null
}

/** Full website analysis: crawl + detect everything */
export async function analyzeWebsite(url: string): Promise<WebsiteSignals> {
  const crawl = await crawlWebsite(url)

  if (!crawl.success) {
    return {
      url: crawl.url,
      reachable: false,
      cms: null,
      has_google_analytics: null,
      has_facebook_pixel: null,
      has_google_ads: null,
      has_booking_system: null,
      load_time_ms: crawl.loadTimeMs,
      emails: [],
      phones: [],
    }
  }

  const tracking = detectTracking(crawl.html)
  const emails = extractEmails(crawl.html)
  const phones = extractPhones(crawl.html)

  return {
    url: crawl.finalUrl ?? crawl.url,
    reachable: true,
    cms: detectCms(crawl.html),
    has_google_analytics: tracking.google_analytics,
    has_facebook_pixel: tracking.facebook_pixel,
    has_google_ads: tracking.google_ads,
    has_booking_system: detectBookingSystem(crawl.html),
    load_time_ms: crawl.loadTimeMs,
    emails,
    phones,
  }
}
