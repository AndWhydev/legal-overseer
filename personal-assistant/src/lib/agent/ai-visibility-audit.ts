import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VisibilityAuditParams {
  domain: string
  brandName: string
  queries: string[]
  location?: string
  competitors?: string[]
}

export interface QueryVisibilityResult {
  query: string
  source: AiSearchSource
  score: number // 0.0 | 0.5 | 1.0
  position: 'mentioned' | 'partial' | 'absent'
  snippet: string | null
  competitorsMentioned: string[]
}

export interface VisibilityAuditResult {
  id: string
  orgId: string
  domain: string
  brandName: string
  overallScore: number
  queryResults: QueryVisibilityResult[]
  competitorScores: Record<string, number>
  recommendations: string[]
  auditedAt: string
}

export interface VisibilitySnapshot {
  auditId: string
  orgId: string
  overallScore: number
  queryCount: number
  mentionedCount: number
  partialCount: number
  absentCount: number
  competitorScores: Record<string, number>
  snapshotDate: string
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
// Brand visibility simulation
// ---------------------------------------------------------------------------
// In production, this would call actual AI search APIs or use a scraping
// service. For now we use heuristic simulation that checks brand presence
// against query patterns. The scoring model is designed to be swapped out
// for real API calls without changing the interface.

function simulateQueryCheck(
  brandName: string,
  domain: string,
  query: string,
  source: AiSearchSource,
): QueryVisibilityResult {
  const lowerQuery = query.toLowerCase()
  const lowerBrand = brandName.toLowerCase()
  const domainBase = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].toLowerCase()

  let score = 0.0
  let position: QueryVisibilityResult['position'] = 'absent'
  let snippet: string | null = null

  // Direct brand mention in query
  if (lowerQuery.includes(lowerBrand) || lowerQuery.includes(domainBase)) {
    score = 1.0
    position = 'mentioned'
    snippet = `${brandName} appears as a direct result for "${query}" on ${source}.`
  } else {
    // Check for partial overlap (shared significant words)
    const brandWords = lowerBrand.split(/\s+/).filter((w) => w.length > 3)
    const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 3)
    const overlap = brandWords.filter((bw) => queryWords.some((qw) => qw.includes(bw) || bw.includes(qw)))

    if (overlap.length > 0) {
      score = 0.5
      position = 'partial'
      snippet = `${brandName} is partially referenced in results for "${query}" on ${source}.`
    }
  }

  return {
    query,
    source,
    score,
    position,
    snippet,
    competitorsMentioned: [],
  }
}

function simulateCompetitorCheck(
  competitors: string[],
  query: string,
  source: AiSearchSource,
): string[] {
  // Simulate which competitors appear for a given query
  const lowerQuery = query.toLowerCase()
  return competitors.filter((comp) => {
    const lowerComp = comp.toLowerCase()
    const compWords = lowerComp.split(/\s+/).filter((w) => w.length > 3)
    return compWords.some((cw) => lowerQuery.includes(cw))
  })
}

function calculateOverallScore(results: QueryVisibilityResult[]): number {
  if (results.length === 0) return 0
  const totalScore = results.reduce((sum, r) => sum + r.score, 0)
  return Math.round((totalScore / results.length) * 100)
}

function buildCompetitorScores(
  results: QueryVisibilityResult[],
  competitors: string[],
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const comp of competitors) {
    const mentionCount = results.filter((r) =>
      r.competitorsMentioned.includes(comp),
    ).length
    scores[comp] = results.length > 0 ? Math.round((mentionCount / results.length) * 100) : 0
  }
  return scores
}

function buildAuditRecommendations(
  score: number,
  results: QueryVisibilityResult[],
  brandName: string,
  competitorScores: Record<string, number>,
): string[] {
  const recs: string[] = []

  if (score < 30) {
    recs.push(
      `${brandName} has very low AI search visibility (${score}/100). Prioritize publishing authoritative, direct-answer content for your target queries.`,
    )
  } else if (score < 60) {
    recs.push(
      `${brandName} has moderate AI visibility (${score}/100). Expand FAQ pages and add structured data markup to improve AI citations.`,
    )
  } else {
    recs.push(
      `${brandName} has strong AI search visibility (${score}/100). Focus on maintaining freshness and monitoring new query patterns.`,
    )
  }

  const absentQueries = results
    .filter((r) => r.position === 'absent')
    .map((r) => r.query)
  const uniqueAbsent = [...new Set(absentQueries)]

  if (uniqueAbsent.length > 0) {
    recs.push(
      `Not found for ${uniqueAbsent.length} query(s): ${uniqueAbsent.slice(0, 3).map((q) => `"${q}"`).join(', ')}. Create dedicated landing pages targeting these terms.`,
    )
  }

  // Competitor insights
  const topCompetitors = Object.entries(competitorScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)

  if (topCompetitors.length > 0 && topCompetitors[0][1] > score) {
    recs.push(
      `Competitor "${topCompetitors[0][0]}" scores ${topCompetitors[0][1]}/100, higher than your ${score}/100. Analyze their content strategy.`,
    )
  }

  recs.push(
    'Add FAQ schema (FAQPage) to your top service pages to increase AI answer-box inclusion.',
    'Publish "best [service] in [location]" comparison content to appear in category-level AI queries.',
    'Earn backlinks from industry directories -- AI engines weight these heavily for citations.',
  )

  return recs
}

// ---------------------------------------------------------------------------
// Core audit function
// ---------------------------------------------------------------------------

export async function runVisibilityAudit(
  supabase: SupabaseClient,
  orgId: string,
  params: VisibilityAuditParams,
): Promise<VisibilityAuditResult> {
  const { domain, brandName, queries, competitors = [] } = params

  const queryResults: QueryVisibilityResult[] = []

  for (const query of queries) {
    for (const source of AI_SEARCH_SOURCES) {
      const result = simulateQueryCheck(brandName, domain, query, source)

      // Check competitor mentions for this query+source
      result.competitorsMentioned = simulateCompetitorCheck(competitors, query, source)

      queryResults.push(result)
    }
  }

  const overallScore = calculateOverallScore(queryResults)
  const competitorScores = buildCompetitorScores(queryResults, competitors)
  const recommendations = buildAuditRecommendations(overallScore, queryResults, brandName, competitorScores)

  const auditedAt = new Date().toISOString()

  // Persist audit to agent_runs metadata
  const { data: runData } = await supabase
    .from('agent_runs')
    .insert({
      org_id: orgId,
      agent_config_id: `ai-search-${orgId}`,
      trigger_type: 'manual',
      input_summary: `AI visibility audit for ${brandName} (${domain}) across ${queries.length} queries`,
      output_summary: `Score: ${overallScore}/100, ${queryResults.filter((r) => r.position === 'mentioned').length} mentioned, ${queryResults.filter((r) => r.position === 'absent').length} absent`,
      actions_taken: [],
      tools_called: ['ai-visibility-audit'],
      model_used: 'classification',
      tokens_in: 0,
      tokens_out: 0,
      confidence_score: 0.9,
      routing_decision: 'act',
      duration_ms: 0,
      metadata: {
        audit_type: 'ai-visibility',
        domain,
        brand_name: brandName,
        overall_score: overallScore,
        query_results: queryResults,
        competitor_scores: competitorScores,
        recommendations,
      },
    })
    .select('id')
    .single()

  const auditId = runData?.id ?? crypto.randomUUID()

  return {
    id: auditId,
    orgId,
    domain,
    brandName,
    overallScore,
    queryResults,
    competitorScores,
    recommendations,
    auditedAt,
  }
}

// ---------------------------------------------------------------------------
// Fetch previous audits for comparison
// ---------------------------------------------------------------------------

export async function getPreviousAudits(
  supabase: SupabaseClient,
  orgId: string,
  limit: number = 10,
): Promise<VisibilityAuditResult[]> {
  const { data, error } = await supabase
    .from('agent_runs')
    .select('id, metadata, created_at')
    .eq('org_id', orgId)
    .eq('metadata->>audit_type', 'ai-visibility')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []

  return data.map((row: Record<string, unknown>) => {
    const meta = row.metadata as Record<string, unknown>
    return {
      id: row.id as string,
      orgId,
      domain: (meta.domain as string) ?? '',
      brandName: (meta.brand_name as string) ?? '',
      overallScore: (meta.overall_score as number) ?? 0,
      queryResults: (meta.query_results as QueryVisibilityResult[]) ?? [],
      competitorScores: (meta.competitor_scores as Record<string, number>) ?? {},
      recommendations: (meta.recommendations as string[]) ?? [],
      auditedAt: row.created_at as string,
    }
  })
}

// ---------------------------------------------------------------------------
// Monitoring: detect changes between audits
// ---------------------------------------------------------------------------

export interface VisibilityChange {
  type: 'new_mention' | 'lost_mention' | 'competitor_gained' | 'competitor_lost' | 'score_change'
  query?: string
  source?: string
  detail: string
  severity: 'info' | 'warning' | 'critical'
}

export function detectVisibilityChanges(
  current: VisibilityAuditResult,
  previous: VisibilityAuditResult,
): VisibilityChange[] {
  const changes: VisibilityChange[] = []

  // Overall score change
  const scoreDiff = current.overallScore - previous.overallScore
  if (Math.abs(scoreDiff) >= 5) {
    changes.push({
      type: 'score_change',
      detail: `Visibility score ${scoreDiff > 0 ? 'improved' : 'declined'} from ${previous.overallScore} to ${current.overallScore} (${scoreDiff > 0 ? '+' : ''}${scoreDiff})`,
      severity: scoreDiff < -10 ? 'critical' : scoreDiff < 0 ? 'warning' : 'info',
    })
  }

  // Per-query changes
  for (const curr of current.queryResults) {
    const prev = previous.queryResults.find(
      (p) => p.query === curr.query && p.source === curr.source,
    )

    if (!prev) continue

    if (prev.position === 'absent' && curr.position !== 'absent') {
      changes.push({
        type: 'new_mention',
        query: curr.query,
        source: curr.source,
        detail: `Now ${curr.position} for "${curr.query}" on ${curr.source}`,
        severity: 'info',
      })
    } else if (prev.position !== 'absent' && curr.position === 'absent') {
      changes.push({
        type: 'lost_mention',
        query: curr.query,
        source: curr.source,
        detail: `Lost visibility for "${curr.query}" on ${curr.source}`,
        severity: 'warning',
      })
    }

    // Competitor changes
    const newCompetitors = curr.competitorsMentioned.filter(
      (c) => !prev.competitorsMentioned.includes(c),
    )
    const lostCompetitors = prev.competitorsMentioned.filter(
      (c) => !curr.competitorsMentioned.includes(c),
    )

    for (const comp of newCompetitors) {
      changes.push({
        type: 'competitor_gained',
        query: curr.query,
        source: curr.source,
        detail: `Competitor "${comp}" now appears for "${curr.query}" on ${curr.source}`,
        severity: 'warning',
      })
    }

    for (const comp of lostCompetitors) {
      changes.push({
        type: 'competitor_lost',
        query: curr.query,
        source: curr.source,
        detail: `Competitor "${comp}" no longer appears for "${curr.query}" on ${curr.source}`,
        severity: 'info',
      })
    }
  }

  return changes
}

// ---------------------------------------------------------------------------
// Check and alert on visibility changes
// ---------------------------------------------------------------------------

export async function checkVisibilityChanges(
  supabase: SupabaseClient,
  orgId: string,
  currentAudit: VisibilityAuditResult,
): Promise<VisibilityChange[]> {
  const previousAudits = await getPreviousAudits(supabase, orgId, 2)

  // Need at least 2 audits (current + previous) to compare
  // The first one in the list is the current one we just saved
  const previous = previousAudits.length >= 2 ? previousAudits[1] : null
  if (!previous) return []

  const changes = detectVisibilityChanges(currentAudit, previous)

  // Create notifications for significant changes
  const significantChanges = changes.filter((c) => c.severity !== 'info')

  if (significantChanges.length > 0) {
    await supabase.from('notifications').insert(
      significantChanges.map((change) => ({
        org_id: orgId,
        type: 'ai-visibility-change',
        title: `AI Visibility: ${change.type.replace(/_/g, ' ')}`,
        body: change.detail,
        severity: change.severity,
        metadata: { change },
        read: false,
      })),
    )
  }

  return changes
}
