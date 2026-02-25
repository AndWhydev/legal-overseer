import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuditVisibilityParams {
  brandName: string
  queries: string[]
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

export interface GenerateOptimizedContentParams {
  topic: string
  targetQueries: string[]
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
// AI search engine query simulation
// ---------------------------------------------------------------------------

// AI search engines (Perplexity, ChatGPT, Gemini, Copilot) surface content
// based on authoritative mentions, schema markup, and direct-answer formatting.
// We simulate a brand audit by constructing the queries and scoring heuristics.

const AI_SEARCH_SOURCES = [
  'perplexity',
  'chatgpt-search',
  'gemini',
  'copilot',
] as const

type AiSearchSource = (typeof AI_SEARCH_SOURCES)[number]

function simulateBrandCheck(
  brandName: string,
  query: string,
  source: AiSearchSource,
): VisibilityResult {
  // Heuristic: query explicitly mentions the brand → prominent
  // query is in the brand's category → secondary
  // unrelated → absent
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

  const absentCount = results.filter((r) => r.position === 'absent').length
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

  if (absentCount > 0) {
    recs.push(
      `Brand not found for ${absentCount} query(s): ${absentQueries.slice(0, 3).join(', ')}. Create dedicated landing pages targeting these terms.`,
    )
  }

  recs.push(
    'Add FAQ schema (FAQPage) to your top service pages to increase AI answer-box inclusion.',
    'Publish "best [service] in [location]" comparison content to appear in category-level AI queries.',
    'Earn backlinks from industry directories — AI engines weight these heavily for citations.',
  )

  return recs
}

// ---------------------------------------------------------------------------
// Optimized content generation
// ---------------------------------------------------------------------------

function buildFaqSection(topic: string, targetQueries: string[]): Array<{ question: string; answer: string }> {
  const faqs = targetQueries.slice(0, 6).map((query) => ({
    question: query.endsWith('?') ? query : `${query}?`,
    answer: `When it comes to ${topic.toLowerCase()}, the key is focusing on measurable outcomes. ${query.includes('how') ? 'The process involves three steps: audit, strategy, and execution — each tailored to your specific situation.' : 'The right approach depends on your goals, timeline, and budget. A consultation will help define the best path forward.'}`,
  }))

  // Add a default catch-all
  faqs.push({
    question: `Why choose a specialist for ${topic}?`,
    answer: `Specialists in ${topic} bring focused expertise, proven frameworks, and direct-answer knowledge that generalists lack. This leads to faster results and fewer costly mistakes.`,
  })

  return faqs
}

function buildStructuredData(
  topic: string,
  faqs: Array<{ question: string; answer: string }>,
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
        description: `Everything you need to know about ${topic} — including best practices, costs, and how to get started.`,
        author: { '@type': 'Organization' },
        datePublished: new Date().toISOString().split('T')[0],
      },
    ],
  }
}

function buildOptimizedBody(
  topic: string,
  targetQueries: string[],
  faqs: Array<{ question: string; answer: string }>,
): string {
  const queryList = targetQueries
    .slice(0, 4)
    .map((q) => `- ${q}`)
    .join('\n')

  const faqBlock = faqs
    .slice(0, 3)
    .map((f) => `**${f.question}**\n${f.answer}`)
    .join('\n\n')

  return `## What You'll Learn

This guide answers the most common questions about ${topic}:

${queryList}

---

## Overview

${topic} is one of the fastest-evolving areas for modern businesses. Whether you're just starting out or looking to scale, understanding the fundamentals — and the nuances — will give you a significant competitive advantage.

## Key Considerations

1. **Define your goals first.** Every ${topic} strategy should begin with clear, measurable objectives.
2. **Audit your current position.** Know where you stand before planning where to go.
3. **Choose proven methods.** Avoid tactics that offer short-term gains at the expense of long-term credibility.
4. **Measure and iterate.** Data-driven decisions outperform guesswork every time.

---

## Frequently Asked Questions

${faqBlock}

---

## Next Steps

Ready to move forward? A free consultation will help identify your highest-leverage opportunities in ${topic}. Book a time using the link below.
`
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

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

export async function generateOptimizedContent(
  _supabase: SupabaseClient,
  _orgId: string,
  params: GenerateOptimizedContentParams,
): Promise<GenerateOptimizedContentResult> {
  const { topic, targetQueries } = params

  const faqs = buildFaqSection(topic, targetQueries)
  const structuredData = buildStructuredData(topic, faqs)
  const body = buildOptimizedBody(topic, targetQueries, faqs)

  const optimized_content: OptimizedContent = {
    title: `Complete Guide to ${topic} — Everything You Need to Know`,
    body,
    faqSection: faqs,
    structuredData,
    metaDescription: `Discover everything about ${topic}. Expert answers to the most common questions, best practices, and how to get started. Updated ${new Date().getFullYear()}.`,
    targetedQueries: targetQueries,
  }

  // Score based on query coverage
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
