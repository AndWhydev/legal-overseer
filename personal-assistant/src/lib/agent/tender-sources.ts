import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalizedTender {
  title: string
  source: 'austender' | 'qtenders' | 'nsw'
  tender_number: string
  url: string
  description: string
  category: string
  value: number | null
  budget_min: number | null
  budget_max: number | null
  deadline: string | null
  raw_data: Record<string, unknown>
}

interface ScrapedTenderResult {
  tenders: NormalizedTender[]
  source: string
  scrapedAt: string
  errors: string[]
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 15_000

async function fetchWithTimeout(
  url: string,
  headers: Record<string, string> = {},
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BitBit/1.0; +https://bitbit.com.au)',
        Accept: 'text/html, application/xml, application/json',
        ...headers,
      },
    })

    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseAusDate(dateStr: string): string | null {
  // Handles DD/MM/YYYY and YYYY-MM-DD formats
  const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) {
    const [, day, month, year] = slashMatch
    const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59Z`)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) {
    const d = new Date(`${isoMatch[0]}T23:59:59Z`)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }

  return null
}

function parseMoneyValue(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

// ---------------------------------------------------------------------------
// AusTender (https://www.tenders.gov.au)
// ---------------------------------------------------------------------------

const AUSTENDER_BASE = 'https://www.tenders.gov.au'

function parseAustenderHtml(html: string, keywords: string[]): NormalizedTender[] {
  const results: NormalizedTender[] = []
  const keywordsLower = keywords.map((k) => k.toLowerCase())

  // Parse ATM search result rows
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1]

    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/)
    if (!linkMatch) continue

    const title = linkMatch[2].trim()
    const titleLower = title.toLowerCase()

    // Only include if keyword match exists
    const hasKeywordMatch = keywordsLower.some((kw) => titleLower.includes(kw))
    if (!hasKeywordMatch) continue

    const idMatch = row.match(/ATM-(\d+)/)
    const valueMatch = row.match(/\$\s*([\d,]+(?:\.\d{2})?)/)
    const dateMatch = row.match(/(\d{2}\/\d{2}\/\d{4})/)
    const agencyMatch = row.match(/<td[^>]*>([^<]{3,80})<\/td>/g)

    const url = linkMatch[1].startsWith('http')
      ? linkMatch[1]
      : `${AUSTENDER_BASE}${linkMatch[1]}`

    const rawValue = valueMatch ? parseMoneyValue(valueMatch[1]) : null

    results.push({
      title,
      source: 'austender',
      tender_number: idMatch ? `ATM-${idMatch[1]}` : `AT-${Date.now()}-${results.length}`,
      url,
      description: '',
      category: agencyMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '',
      value: rawValue,
      budget_min: rawValue ? rawValue * 0.8 : null,
      budget_max: rawValue ? rawValue * 1.2 : null,
      deadline: dateMatch ? parseAusDate(dateMatch[1]) : null,
      raw_data: { agency: agencyMatch?.[1]?.replace(/<[^>]+>/g, '').trim() ?? '' },
    })
  }

  return results
}

export async function scrapeAusTender(
  _supabase: SupabaseClient,
  _orgId: string,
  keywords: string[],
): Promise<ScrapedTenderResult> {
  const errors: string[] = []
  const query = keywords.join(' ')
  const params = new URLSearchParams({ keyword: query })
  const url = `${AUSTENDER_BASE}/atm/show/search?${params.toString()}`

  const html = await fetchWithTimeout(url)
  if (!html) {
    errors.push('AusTender: failed to fetch search results')
    return { tenders: [], source: 'austender', scrapedAt: new Date().toISOString(), errors }
  }

  const tenders = parseAustenderHtml(html, keywords)
  return { tenders, source: 'austender', scrapedAt: new Date().toISOString(), errors }
}

// ---------------------------------------------------------------------------
// QTenders (Queensland Government)
// ---------------------------------------------------------------------------

const QTENDERS_BASE = 'https://qtenders.epw.qld.gov.au'

function parseQTendersHtml(html: string, keywords: string[]): NormalizedTender[] {
  const results: NormalizedTender[] = []
  const keywordsLower = keywords.map((k) => k.toLowerCase())

  // QTenders uses a table-based listing
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1]

    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/)
    if (!linkMatch) continue

    const title = linkMatch[2].trim()
    const titleLower = title.toLowerCase()

    const hasKeywordMatch = keywordsLower.some((kw) => titleLower.includes(kw))
    if (!hasKeywordMatch) continue

    const refMatch = row.match(/QT-?(\d+)/i)
    const dateMatch = row.match(/(\d{2}\/\d{2}\/\d{4})/)
    const valueMatch = row.match(/\$\s*([\d,]+(?:\.\d{2})?)/)

    const url = linkMatch[1].startsWith('http')
      ? linkMatch[1]
      : `${QTENDERS_BASE}${linkMatch[1]}`

    const rawValue = valueMatch ? parseMoneyValue(valueMatch[1]) : null

    results.push({
      title,
      source: 'qtenders',
      tender_number: refMatch ? `QT-${refMatch[1]}` : `QT-${Date.now()}-${results.length}`,
      url,
      description: '',
      category: '',
      value: rawValue,
      budget_min: null,
      budget_max: null,
      deadline: dateMatch ? parseAusDate(dateMatch[1]) : null,
      raw_data: {},
    })
  }

  return results
}

export async function scrapeQTenders(
  _supabase: SupabaseClient,
  _orgId: string,
  keywords: string[],
): Promise<ScrapedTenderResult> {
  const errors: string[] = []
  const query = keywords.join('+')
  const url = `${QTENDERS_BASE}/tender/search?keyword=${encodeURIComponent(query)}`

  const html = await fetchWithTimeout(url)
  if (!html) {
    errors.push('QTenders: failed to fetch search results')
    return { tenders: [], source: 'qtenders', scrapedAt: new Date().toISOString(), errors }
  }

  const tenders = parseQTendersHtml(html, keywords)
  return { tenders, source: 'qtenders', scrapedAt: new Date().toISOString(), errors }
}

// ---------------------------------------------------------------------------
// NSW eTendering
// ---------------------------------------------------------------------------

const NSW_BASE = 'https://www.tenders.nsw.gov.au'

function parseNSWHtml(html: string, keywords: string[]): NormalizedTender[] {
  const results: NormalizedTender[] = []
  const keywordsLower = keywords.map((k) => k.toLowerCase())

  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const row = rowMatch[1]

    const linkMatch = row.match(/<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>/)
    if (!linkMatch) continue

    const title = linkMatch[2].trim()
    const titleLower = title.toLowerCase()

    const hasKeywordMatch = keywordsLower.some((kw) => titleLower.includes(kw))
    if (!hasKeywordMatch) continue

    const refMatch = row.match(/RFT-?(\d+)/i) ?? row.match(/RFQID-?(\d+)/i)
    const dateMatch = row.match(/(\d{2}\/\d{2}\/\d{4})/)
    const valueMatch = row.match(/\$\s*([\d,]+(?:\.\d{2})?)/)

    const url = linkMatch[1].startsWith('http')
      ? linkMatch[1]
      : `${NSW_BASE}${linkMatch[1]}`

    const rawValue = valueMatch ? parseMoneyValue(valueMatch[1]) : null

    results.push({
      title,
      source: 'nsw',
      tender_number: refMatch ? `NSW-${refMatch[1]}` : `NSW-${Date.now()}-${results.length}`,
      url,
      description: '',
      category: '',
      value: rawValue,
      budget_min: null,
      budget_max: null,
      deadline: dateMatch ? parseAusDate(dateMatch[1]) : null,
      raw_data: {},
    })
  }

  return results
}

export async function scrapeNSWeTendering(
  _supabase: SupabaseClient,
  _orgId: string,
  keywords: string[],
): Promise<ScrapedTenderResult> {
  const errors: string[] = []
  const query = keywords.join(' ')
  const url = `${NSW_BASE}/?event=public.rft.search.keyword&keyword=${encodeURIComponent(query)}`

  const html = await fetchWithTimeout(url)
  if (!html) {
    errors.push('NSW eTendering: failed to fetch search results')
    return { tenders: [], source: 'nsw', scrapedAt: new Date().toISOString(), errors }
  }

  const tenders = parseNSWHtml(html, keywords)
  return { tenders, source: 'nsw', scrapedAt: new Date().toISOString(), errors }
}

// ---------------------------------------------------------------------------
// Aggregate: scrape all sources
// ---------------------------------------------------------------------------

export async function scrapeAllSources(
  supabase: SupabaseClient,
  orgId: string,
  keywords: string[],
): Promise<{ tenders: NormalizedTender[]; errors: string[] }> {
  const [aus, qt, nsw] = await Promise.allSettled([
    scrapeAusTender(supabase, orgId, keywords),
    scrapeQTenders(supabase, orgId, keywords),
    scrapeNSWeTendering(supabase, orgId, keywords),
  ])

  const allTenders: NormalizedTender[] = []
  const allErrors: string[] = []

  for (const result of [aus, qt, nsw]) {
    if (result.status === 'fulfilled') {
      allTenders.push(...result.value.tenders)
      allErrors.push(...result.value.errors)
    } else {
      allErrors.push(`Source scrape failed: ${result.reason}`)
    }
  }

  return { tenders: allTenders, errors: allErrors }
}

// ---------------------------------------------------------------------------
// Upsert scraped tenders into DB
// ---------------------------------------------------------------------------

export async function upsertScrapedTenders(
  supabase: SupabaseClient,
  orgId: string,
  tenders: NormalizedTender[],
): Promise<{ inserted: number; errors: number }> {
  let inserted = 0
  let errors = 0

  for (const tender of tenders) {
    const row = {
      org_id: orgId,
      title: tender.title,
      source: tender.source,
      tender_number: tender.tender_number,
      url: tender.url,
      description: tender.description,
      category: tender.category,
      value: tender.value,
      budget_min: tender.budget_min,
      budget_max: tender.budget_max,
      deadline: tender.deadline,
      status: 'open',
      raw_data: tender.raw_data,
      requirements: {},
    }

    const { error } = await supabase
      .from('tenders')
      .upsert(row, { onConflict: 'org_id,url' })

    if (error) {
      errors += 1
    } else {
      inserted += 1
    }
  }

  return { inserted, errors }
}
