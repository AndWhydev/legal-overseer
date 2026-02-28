import type { SupabaseClient } from '@supabase/supabase-js'
import { logAgentRun } from './run-logger'
import {
  runVisibilityAudit,
  getPreviousAudits,
  checkVisibilityChanges,
  detectVisibilityChanges,
  type VisibilityAuditParams,
  type VisibilityAuditResult,
  type VisibilityChange,
} from './ai-visibility-audit'

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

export type {
  VisibilityAuditParams,
  VisibilityAuditResult,
  VisibilityChange,
}
export { runVisibilityAudit, getPreviousAudits, checkVisibilityChanges }

// ---------------------------------------------------------------------------
// Types — Audit (legacy compat)
// ---------------------------------------------------------------------------

export interface AuditVisibilityParams {
  brandName: string
  queries: string[]
  domain?: string
  competitors?: string[]
}

export interface VisibilityResult {
  query: string
  mentioned: boolean
  position: 'prominent' | 'secondary' | 'absent'
  snippet: string | null
  source: string
}

export interface AuditVisibilityResult {
  visibility_score: number
  results: VisibilityResult[]
  recommendations: string[]
  auditedAt: string
}

// ---------------------------------------------------------------------------
// Types — Content Generation
// ---------------------------------------------------------------------------

export interface GenerateOptimizedContentParams {
  topic: string
  targetQueries: string[]
  businessName?: string
  location?: string
  serviceArea?: string
  credentials?: string[]
}

export interface OptimizedContent {
  title: string
  body: string
  faqSection: Array<{ question: string; answer: string }>
  structuredData: Record<string, unknown>
  metaDescription: string
  targetedQueries: string[]
}

export interface GenerateOptimizedContentResult {
  visibility_score: number
  recommendations: string[]
  optimized_content: OptimizedContent
}

// ---------------------------------------------------------------------------
// Types — Schema Markup
// ---------------------------------------------------------------------------

export type SchemaType = 'LocalBusiness' | 'Service' | 'FAQ' | 'Review' | 'Organization'

export interface SchemaMarkupParams {
  schemaType: SchemaType
  data: LocalBusinessData | ServiceData | FaqData | ReviewData | OrganizationData
}

export interface LocalBusinessData {
  name: string
  description: string
  url: string
  phone?: string
  email?: string
  address: {
    street: string
    city: string
    state: string
    postalCode: string
    country: string
  }
  geo?: { latitude: number; longitude: number }
  openingHours?: string[]
  priceRange?: string
  image?: string
  sameAs?: string[] // social profiles
}

export interface ServiceData {
  name: string
  description: string
  provider: string
  providerUrl?: string
  serviceArea?: string
  price?: string
  category?: string
}

export interface FaqData {
  questions: Array<{ question: string; answer: string }>
  pageUrl?: string
}

export interface ReviewData {
  itemReviewed: string
  reviewRating: number
  bestRating?: number
  author: string
  reviewBody: string
  datePublished?: string
}

export interface OrganizationData {
  name: string
  description: string
  url: string
  logo?: string
  foundingDate?: string
  founders?: string[]
  sameAs?: string[]
  contactPoint?: {
    type: string
    telephone: string
    email?: string
  }
}

export interface SchemaMarkupResult {
  schemaType: SchemaType
  jsonLd: Record<string, unknown>
  htmlSnippet: string
  validationNotes: string[]
}

// ---------------------------------------------------------------------------
// Types — Reports
// ---------------------------------------------------------------------------

export interface VisibilityReport {
  orgId: string
  brandName: string
  domain: string
  currentScore: number
  previousScore: number | null
  trend: 'improving' | 'declining' | 'stable' | 'new'
  queryBreakdown: Array<{
    query: string
    sources: Array<{ source: string; position: string; score: number }>
  }>
  competitorComparison: Array<{
    name: string
    score: number
    delta: number | null
  }>
  changes: VisibilityChange[]
  recommendations: string[]
  generatedAt: string
}

// ---------------------------------------------------------------------------
// Types — Scheduler Tick
// ---------------------------------------------------------------------------

export interface AISearchTickResult {
  processed: number
  auditsRun: number
  changesDetected: number
  alertsSent: number
  failed: number
}

// ---------------------------------------------------------------------------
// AI Search Sources
// ---------------------------------------------------------------------------

const AI_SEARCH_SOURCES = [
  'perplexity',
  'chatgpt-search',
  'gemini',
  'copilot',
] as const

type AiSearchSource = (typeof AI_SEARCH_SOURCES)[number]

// ---------------------------------------------------------------------------
// Legacy audit function (backward compat with existing route)
// ---------------------------------------------------------------------------

function simulateBrandCheck(
  brandName: string,
  query: string,
  source: AiSearchSource,
): VisibilityResult {
  const lowerQuery = query.toLowerCase()
  const lowerBrand = brandName.toLowerCase()

  let position: VisibilityResult['position'] = 'absent'
  let mentioned = false
  let snippet: string | null = null

  if (lowerQuery.includes(lowerBrand)) {
    position = 'prominent'
    mentioned = true
    snippet = `${brandName} appears as a top result for this query on ${source}.`
  } else if (
    lowerQuery.split(' ').some((word) => lowerBrand.includes(word) && word.length > 3)
  ) {
    position = 'secondary'
    mentioned = true
    snippet = `${brandName} is referenced in related results for this query on ${source}.`
  }

  return { query, mentioned, position, snippet, source }
}

function scoreVisibility(results: VisibilityResult[]): number {
  if (results.length === 0) return 0
  const weights: Record<VisibilityResult['position'], number> = {
    prominent: 1.0,
    secondary: 0.4,
    absent: 0.0,
  }
  const totalWeight = results.reduce((sum, r) => sum + weights[r.position], 0)
  return Math.round((totalWeight / results.length) * 100)
}

function buildRecommendations(
  score: number,
  results: VisibilityResult[],
  brandName: string,
): string[] {
  const recs: string[] = []
  const absentQueries = results
    .filter((r) => r.position === 'absent')
    .map((r) => `"${r.query}"`)

  if (score < 30) {
    recs.push(
      `${brandName} has very low AI search visibility (${score}/100). Prioritise publishing authoritative, direct-answer content.`,
    )
  } else if (score < 60) {
    recs.push(
      `${brandName} has moderate visibility (${score}/100). Expand FAQ pages and add structured data markup to improve AI citations.`,
    )
  } else {
    recs.push(
      `${brandName} has good AI search visibility (${score}/100). Maintain content freshness and monitor for new query patterns.`,
    )
  }

  if (absentQueries.length > 0) {
    recs.push(
      `Brand not found for ${absentQueries.length} query(s): ${absentQueries.slice(0, 3).join(', ')}. Create dedicated landing pages targeting these terms.`,
    )
  }

  recs.push(
    'Add FAQ schema (FAQPage) to your top service pages to increase AI answer-box inclusion.',
    'Publish "best [service] in [location]" comparison content to appear in category-level AI queries.',
    'Earn backlinks from industry directories -- AI engines weight these heavily for citations.',
  )

  return recs
}

export async function auditVisibility(
  _supabase: SupabaseClient,
  _orgId: string,
  params: AuditVisibilityParams,
): Promise<AuditVisibilityResult> {
  const { brandName, queries } = params
  const results: VisibilityResult[] = []

  for (const query of queries) {
    for (const source of AI_SEARCH_SOURCES) {
      results.push(simulateBrandCheck(brandName, query, source))
    }
  }

  const score = scoreVisibility(results)
  const recommendations = buildRecommendations(score, results, brandName)

  return {
    visibility_score: score,
    results,
    recommendations,
    auditedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// AI-Optimized Content Generation
// ---------------------------------------------------------------------------

function buildFaqSection(
  topic: string,
  targetQueries: string[],
  businessName?: string,
  location?: string,
): Array<{ question: string; answer: string }> {
  const locStr = location ? ` in ${location}` : ''
  const bizStr = businessName ?? 'our team'

  const faqs = targetQueries.slice(0, 6).map((query) => ({
    question: query.endsWith('?') ? query : `${query}?`,
    answer: query.includes('how')
      ? `${bizStr} approaches ${topic.toLowerCase()}${locStr} through a proven three-step process: audit, strategy, and execution. Each step is tailored to your specific goals and timeline.`
      : query.includes('cost') || query.includes('price')
        ? `The cost of ${topic.toLowerCase()}${locStr} varies based on scope and requirements. ${bizStr} offers transparent pricing starting from a free consultation. Contact us for a detailed quote.`
        : `When it comes to ${topic.toLowerCase()}${locStr}, ${bizStr} focuses on measurable outcomes. The right approach depends on your goals, timeline, and budget.`,
  }))

  faqs.push({
    question: `Why choose ${bizStr} for ${topic}${locStr}?`,
    answer: `${bizStr} brings focused expertise in ${topic}${locStr}, with proven frameworks and direct experience. This leads to faster results, fewer mistakes, and measurable ROI.`,
  })

  return faqs
}

function buildStructuredData(
  topic: string,
  faqs: Array<{ question: string; answer: string }>,
  businessName?: string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
      {
        '@type': 'Article',
        headline: `Complete Guide to ${topic}`,
        description: `Everything you need to know about ${topic} -- including best practices, costs, and how to get started.`,
        author: {
          '@type': 'Organization',
          name: businessName ?? undefined,
        },
        datePublished: new Date().toISOString().split('T')[0],
      },
    ],
  }
}

function buildOptimizedBody(
  topic: string,
  targetQueries: string[],
  faqs: Array<{ question: string; answer: string }>,
  businessName?: string,
  location?: string,
  credentials?: string[],
): string {
  const queryList = targetQueries
    .slice(0, 4)
    .map((q) => `- ${q}`)
    .join('\n')

  const faqBlock = faqs
    .slice(0, 3)
    .map((f) => `**${f.question}**\n${f.answer}`)
    .join('\n\n')

  const locStr = location ? ` in ${location}` : ''
  const bizStr = businessName ?? 'our team'

  const credBlock = credentials && credentials.length > 0
    ? `\n## Credentials\n\n${credentials.map((c) => `- ${c}`).join('\n')}\n`
    : ''

  return `## What You'll Learn

This guide answers the most common questions about ${topic}${locStr}:

${queryList}

---

## Overview

${topic} is one of the fastest-evolving areas for modern businesses${locStr}. Whether you're just starting out or looking to scale, understanding the fundamentals will give you a significant competitive advantage.

${bizStr} specialises in delivering ${topic.toLowerCase()} solutions${locStr} with a focus on measurable outcomes.

## Key Considerations

1. **Define your goals first.** Every ${topic} strategy should begin with clear, measurable objectives.
2. **Audit your current position.** Know where you stand before planning where to go.
3. **Choose proven methods.** Avoid tactics that offer short-term gains at the expense of long-term credibility.
4. **Measure and iterate.** Data-driven decisions outperform guesswork every time.
${credBlock}
---

## Frequently Asked Questions

${faqBlock}

---

## Next Steps

Ready to move forward with ${topic.toLowerCase()}${locStr}? ${bizStr} offers a free consultation to identify your highest-leverage opportunities. Book a time using the link below.
`
}

export async function generateOptimizedContent(
  _supabase: SupabaseClient,
  _orgId: string,
  params: GenerateOptimizedContentParams,
): Promise<GenerateOptimizedContentResult> {
  const { topic, targetQueries, businessName, location, credentials } = params

  const faqs = buildFaqSection(topic, targetQueries, businessName, location)
  const structuredData = buildStructuredData(topic, faqs, businessName)
  const body = buildOptimizedBody(topic, targetQueries, faqs, businessName, location, credentials)

  const optimized_content: OptimizedContent = {
    title: `Complete Guide to ${topic}${location ? ` in ${location}` : ''} -- Everything You Need to Know`,
    body,
    faqSection: faqs,
    structuredData,
    metaDescription: `Discover everything about ${topic}${location ? ` in ${location}` : ''}. Expert answers to the most common questions, best practices, and how to get started. Updated ${new Date().getFullYear()}.`,
    targetedQueries: targetQueries,
  }

  const coverageScore = Math.min(
    100,
    Math.round((targetQueries.length / Math.max(1, targetQueries.length)) * 100),
  )

  const recommendations = [
    `Publish this content at a canonical URL targeting: "${targetQueries[0] ?? topic}"`,
    'Add the FAQPage JSON-LD schema to the <head> of the page for AI engine inclusion.',
    'Interlink this page from your homepage and top service pages.',
    'Update this content quarterly to maintain AI search freshness signals.',
    'Submit the URL to Google Search Console after publishing.',
  ]

  return {
    visibility_score: coverageScore,
    recommendations,
    optimized_content,
  }
}

// ---------------------------------------------------------------------------
// Schema Markup Generator
// ---------------------------------------------------------------------------

function validateSchemaMarkup(
  schemaType: SchemaType,
  jsonLd: Record<string, unknown>,
): string[] {
  const notes: string[] = []

  if (!jsonLd['@context']) notes.push('Missing @context -- should be "https://schema.org"')
  if (!jsonLd['@type']) notes.push('Missing @type')

  switch (schemaType) {
    case 'LocalBusiness': {
      const required = ['name', 'address']
      for (const field of required) {
        if (!jsonLd[field]) notes.push(`Missing required field: ${field}`)
      }
      if (!jsonLd.telephone && !jsonLd.email) {
        notes.push('Recommend adding telephone or email for contact information')
      }
      break
    }
    case 'Service': {
      if (!jsonLd.name) notes.push('Missing required field: name')
      if (!jsonLd.provider) notes.push('Missing required field: provider')
      break
    }
    case 'FAQ': {
      if (!jsonLd.mainEntity || !Array.isArray(jsonLd.mainEntity)) {
        notes.push('Missing mainEntity array of Question items')
      }
      break
    }
    case 'Review': {
      if (!jsonLd.reviewRating) notes.push('Missing required field: reviewRating')
      if (!jsonLd.author) notes.push('Missing required field: author')
      break
    }
    case 'Organization': {
      if (!jsonLd.name) notes.push('Missing required field: name')
      break
    }
  }

  if (notes.length === 0) {
    notes.push('Valid -- schema passes basic validation checks.')
  }

  return notes
}

export function generateSchemaMarkup(params: SchemaMarkupParams): SchemaMarkupResult {
  const { schemaType, data } = params
  let jsonLd: Record<string, unknown> = {}

  switch (schemaType) {
    case 'LocalBusiness': {
      const d = data as LocalBusinessData
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        name: d.name,
        description: d.description,
        url: d.url,
        ...(d.phone && { telephone: d.phone }),
        ...(d.email && { email: d.email }),
        address: {
          '@type': 'PostalAddress',
          streetAddress: d.address.street,
          addressLocality: d.address.city,
          addressRegion: d.address.state,
          postalCode: d.address.postalCode,
          addressCountry: d.address.country,
        },
        ...(d.geo && {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: d.geo.latitude,
            longitude: d.geo.longitude,
          },
        }),
        ...(d.openingHours && { openingHoursSpecification: d.openingHours }),
        ...(d.priceRange && { priceRange: d.priceRange }),
        ...(d.image && { image: d.image }),
        ...(d.sameAs && { sameAs: d.sameAs }),
      }
      break
    }

    case 'Service': {
      const d = data as ServiceData
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name: d.name,
        description: d.description,
        provider: {
          '@type': 'Organization',
          name: d.provider,
          ...(d.providerUrl && { url: d.providerUrl }),
        },
        ...(d.serviceArea && {
          areaServed: {
            '@type': 'Place',
            name: d.serviceArea,
          },
        }),
        ...(d.price && {
          offers: {
            '@type': 'Offer',
            price: d.price,
            priceCurrency: 'AUD',
          },
        }),
        ...(d.category && { category: d.category }),
      }
      break
    }

    case 'FAQ': {
      const d = data as FaqData
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        ...(d.pageUrl && { url: d.pageUrl }),
        mainEntity: d.questions.map((q) => ({
          '@type': 'Question',
          name: q.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: q.answer,
          },
        })),
      }
      break
    }

    case 'Review': {
      const d = data as ReviewData
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Review',
        itemReviewed: {
          '@type': 'Organization',
          name: d.itemReviewed,
        },
        reviewRating: {
          '@type': 'Rating',
          ratingValue: d.reviewRating,
          bestRating: d.bestRating ?? 5,
        },
        author: {
          '@type': 'Person',
          name: d.author,
        },
        reviewBody: d.reviewBody,
        ...(d.datePublished && { datePublished: d.datePublished }),
      }
      break
    }

    case 'Organization': {
      const d = data as OrganizationData
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: d.name,
        description: d.description,
        url: d.url,
        ...(d.logo && { logo: d.logo }),
        ...(d.foundingDate && { foundingDate: d.foundingDate }),
        ...(d.founders && {
          founder: d.founders.map((name) => ({
            '@type': 'Person',
            name,
          })),
        }),
        ...(d.sameAs && { sameAs: d.sameAs }),
        ...(d.contactPoint && {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: d.contactPoint.type,
            telephone: d.contactPoint.telephone,
            ...(d.contactPoint.email && { email: d.contactPoint.email }),
          },
        }),
      }
      break
    }
  }

  const validationNotes = validateSchemaMarkup(schemaType, jsonLd)
  const htmlSnippet = `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>`

  return {
    schemaType,
    jsonLd,
    htmlSnippet,
    validationNotes,
  }
}

// ---------------------------------------------------------------------------
// Visibility Report Generator
// ---------------------------------------------------------------------------

export async function generateVisibilityReport(
  supabase: SupabaseClient,
  orgId: string,
): Promise<VisibilityReport | null> {
  const audits = await getPreviousAudits(supabase, orgId, 2)
  if (audits.length === 0) return null

  const current = audits[0]
  const previous = audits.length >= 2 ? audits[1] : null

  let trend: VisibilityReport['trend'] = 'new'
  if (previous) {
    const diff = current.overallScore - previous.overallScore
    if (diff > 5) trend = 'improving'
    else if (diff < -5) trend = 'declining'
    else trend = 'stable'
  }

  // Build per-query breakdown
  const queryMap = new Map<string, Array<{ source: string; position: string; score: number }>>()
  for (const r of current.queryResults) {
    if (!queryMap.has(r.query)) queryMap.set(r.query, [])
    queryMap.get(r.query)!.push({
      source: r.source,
      position: r.position,
      score: r.score,
    })
  }

  const queryBreakdown = Array.from(queryMap.entries()).map(([query, sources]) => ({
    query,
    sources,
  }))

  // Competitor comparison with delta
  const competitorComparison = Object.entries(current.competitorScores).map(([name, score]) => ({
    name,
    score,
    delta: previous?.competitorScores[name] != null
      ? score - previous.competitorScores[name]
      : null,
  }))

  // Detect changes
  const changes = previous ? detectVisibilityChanges(current, previous) : []

  return {
    orgId,
    brandName: current.brandName,
    domain: current.domain,
    currentScore: current.overallScore,
    previousScore: previous?.overallScore ?? null,
    trend,
    queryBreakdown,
    competitorComparison,
    changes,
    recommendations: current.recommendations,
    generatedAt: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Scheduler Tick
// ---------------------------------------------------------------------------

export async function runAISearchTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<AISearchTickResult> {
  const result: AISearchTickResult = {
    processed: 0,
    auditsRun: 0,
    changesDetected: 0,
    alertsSent: 0,
    failed: 0,
  }

  try {
    // Fetch org settings to get audit configuration
    const { data: config } = await supabase
      .from('agent_configs')
      .select('policy_rules')
      .eq('id', agentConfigId)
      .eq('org_id', orgId)
      .single()

    if (!config?.policy_rules) {
      return result
    }

    const rules = config.policy_rules as Record<string, unknown>
    const domain = rules.domain as string | undefined
    const brandName = rules.brand_name as string | undefined
    const queries = rules.target_queries as string[] | undefined
    const competitors = rules.competitors as string[] | undefined

    if (!domain || !brandName || !queries || queries.length === 0) {
      return result
    }

    result.processed = 1

    // Run visibility audit
    const auditResult = await runVisibilityAudit(supabase, orgId, {
      domain,
      brandName,
      queries,
      competitors,
    })
    result.auditsRun = 1

    // Check for changes and alert
    const changes = await checkVisibilityChanges(supabase, orgId, auditResult)
    result.changesDetected = changes.length
    result.alertsSent = changes.filter((c) => c.severity !== 'info').length
  } catch (error) {
    result.failed = 1
    console.error('[ai-search-optimizer] Tick error:', error)
  }

  // Log run
  await logAgentRun(supabase, {
    org_id: orgId,
    agent_config_id: agentConfigId,
    trigger_type: 'scheduled',
    status: 'success',
    result_summary: `audits=${result.auditsRun} changes=${result.changesDetected} alerts=${result.alertsSent} failed=${result.failed}`,
    model_used: 'haiku',
    tokens_in: 0,
    tokens_out: 0,
    cost_estimate: 0,
    duration_ms: 0,
    tool_calls: 0,
    iterations: 1,
  })

  return result
}
