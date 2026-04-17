/**
 * Sleep Consolidation Pipeline — 7-stage nightly process that:
 * 1. SUMMARIZE: Per-entity daily digest via Haiku
 * 2. RESOLVE CONFLICTS: Temporal precedence for duplicate edges
 * 3. DISCOVER RELATIONSHIPS: Latent edges from co-occurring events
 * 4. PRUNE: Archive low-confidence entityless memories
 * 5. MORNING BRIEFING: Compile actionable intel for the next day
 * 6. SYSTEM LEARNING: Analyze quality scores, track precision, tune thresholds (Sub-project D)
 * 7. FIDUCIARY EVALUATION: Game Theory LTV analysis, generate per-entity fiduciary constraints
 *
 * Designed to run as a daily cron job (e.g. 3am UTC).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { models } from '@/lib/ai'
import { logger } from '@/lib/core/logger'
import { evaluateProjectLifecycles } from '@/lib/intelligence/project-lifecycle'
import type { LifecycleAction } from '@/lib/intelligence/project-lifecycle'
import { MemoryPalaceService } from './service'
import { MemoryWriter } from './memory-writer'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SleepConsolidationReport {
  orgId: string
  summarized: number
  patternsPromoted: number
  conflictsResolved: number
  relationshipsDiscovered: number
  communitiesDetected: number
  pruned: number
  briefingGenerated: boolean
  systemLearningInsights: number
  fiduciaryConstraintsGenerated: number
  delegatedActionsAggregated: number
  startedAt: string
  completedAt: string
}

interface CommunityCluster {
  memberIds: string[]
  mutualEdgeCount: number
  sharedEventCount: number
}

interface DelegatedActionSummary {
  entityId: string
  entityName: string
  actions: Array<{ actionType: string; summary: string; createdAt: string }>
  totalFinancialImpact: number
}

interface MorningBriefing {
  generatedAt: string
  upcomingDeadlines: Array<{ entityName: string; verb: string; objectText: string | null; occurredAt: string }>
  blockedEntities: Array<{ sourceId: string; targetId: string; relationType: string }>
  newDiscoveries: number
  pendingApprovals: number
  lifecycleActions: Array<{ projectName: string; action: string; reason: string; confidence: number }>
  delegatedActions: DelegatedActionSummary[]
  systemInsights?: {
    avgToolEfficiency: number | null
    avgContextUtilisation: number | null
    consolidationPrecision: number | null
    totalEvaluatedRuns: number
    insights: string[]
  }
}

// ─── System Learning Types (Sub-project D) ─────────────────────────────────

interface SystemInsight {
  content: string
  confidence: number
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ENTITY_BATCH_SIZE = 10
const MAX_DISCOVERY_PAIRS = 5

// ─── Main Pipeline ───────────────────────────────────────────────────────────

export async function runSleepConsolidation(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SleepConsolidationReport> {
  const report: SleepConsolidationReport = {
    orgId,
    summarized: 0,
    patternsPromoted: 0,
    conflictsResolved: 0,
    relationshipsDiscovered: 0,
    communitiesDetected: 0,
    pruned: 0,
    briefingGenerated: false,
    systemLearningInsights: 0,
    fiduciaryConstraintsGenerated: 0,
    delegatedActionsAggregated: 0,
    startedAt: new Date().toISOString(),
    completedAt: '',
  }

  // Stage 1: SUMMARIZE
  try {
    report.summarized = await stageSummarize(supabase, orgId)
    logger.info('[sleep-consolidation] Stage 1 SUMMARIZE complete', {
      orgId,
      summarized: report.summarized,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 1 SUMMARIZE failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Stage 1.5: PROMOTE PATTERNS
  try {
    report.patternsPromoted = await stagePromotePatterns(supabase, orgId)
    logger.info('[sleep-consolidation] Stage 1.5 PROMOTE PATTERNS complete', {
      orgId, patternsPromoted: report.patternsPromoted,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 1.5 PROMOTE PATTERNS failed', {
      orgId, error: err instanceof Error ? err.message : String(err),
    })
  }

  // Stage 2: RESOLVE CONFLICTS
  try {
    report.conflictsResolved = await stageResolveConflicts(supabase, orgId)
    logger.info('[sleep-consolidation] Stage 2 RESOLVE CONFLICTS complete', {
      orgId,
      conflictsResolved: report.conflictsResolved,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 2 RESOLVE CONFLICTS failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Stage 3: DISCOVER RELATIONSHIPS
  try {
    report.relationshipsDiscovered = await stageDiscoverRelationships(supabase, orgId)
    logger.info('[sleep-consolidation] Stage 3 DISCOVER RELATIONSHIPS complete', {
      orgId,
      relationshipsDiscovered: report.relationshipsDiscovered,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 3 DISCOVER RELATIONSHIPS failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Stage 3.5: DETECT COMMUNITIES
  try {
    report.communitiesDetected = await stageCommunityDetection(supabase, orgId)
    logger.info('[sleep-consolidation] Stage 3.5 DETECT COMMUNITIES complete', {
      orgId,
      communitiesDetected: report.communitiesDetected,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 3.5 DETECT COMMUNITIES failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Stage 4: PRUNE
  try {
    report.pruned = await stagePrune(supabase, orgId)
    logger.info('[sleep-consolidation] Stage 4 PRUNE complete', {
      orgId,
      pruned: report.pruned,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 4 PRUNE failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Stage 5: MORNING BRIEFING
  try {
    const briefingResult = await stageMorningBriefing(supabase, orgId)
    report.briefingGenerated = briefingResult.briefingGenerated
    report.delegatedActionsAggregated = briefingResult.delegatedActionsAggregated
    logger.info('[sleep-consolidation] Stage 5 MORNING BRIEFING complete', {
      orgId,
      briefingGenerated: report.briefingGenerated,
      delegatedActionsAggregated: report.delegatedActionsAggregated,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 5 MORNING BRIEFING failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Stage 6: SYSTEM LEARNING (Sub-project D)
  try {
    report.systemLearningInsights = await stageSystemLearning(supabase, orgId)
    logger.info('[sleep-consolidation] Stage 6 SYSTEM LEARNING complete', {
      orgId,
      systemLearningInsights: report.systemLearningInsights,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 6 SYSTEM LEARNING failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Stage 7: FIDUCIARY EVALUATION (Game Theory LTV)
  try {
    report.fiduciaryConstraintsGenerated = await stageFiduciaryEvaluation(supabase, orgId)
    logger.info('[sleep-consolidation] Stage 7 FIDUCIARY EVALUATION complete', {
      orgId,
      fiduciaryConstraintsGenerated: report.fiduciaryConstraintsGenerated,
    })
  } catch (err) {
    logger.error('[sleep-consolidation] Stage 7 FIDUCIARY EVALUATION failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  report.completedAt = new Date().toISOString()
  logger.info('[sleep-consolidation] Full cycle completed', report)

  return report
}

// ─── Stage 1.5: PROMOTE PATTERNS ────────────────────────────────────────────

async function stagePromotePatterns(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const { data: candidates, error } = await supabase
    .from('memory_patterns')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .gte('confidence', 0.7)
    .gte('sample_count', 3)

  if (error || !candidates || candidates.length === 0) return 0

  const eligible = candidates.filter(
    (p: { confidence: number; promotion_threshold: number }) => p.confidence >= p.promotion_threshold
  )

  let promoted = 0

  for (const pattern of eligible) {
    const { data: newMemory, error: insertErr } = await supabase
      .from('memory_palace_entries')
      .insert({
        org_id: orgId,
        category: 'convention',
        title: `Learned: ${(pattern.pattern_type as string).replace(/_/g, ' ')}`,
        content: pattern.description,
        confidence: pattern.confidence,
        decay_rate: 'never',
        corroboration_count: pattern.sample_count,
        entity_ids: pattern.entity_ids,
        entity_names: pattern.entity_names,
        source: 'consolidation',
        is_active: true,
        tags: ['auto-promoted', pattern.pattern_type],
        metadata: {
          promoted_from_pattern_id: pattern.id,
          promotion_date: new Date().toISOString(),
          evidence_count: pattern.sample_count,
          pattern_data: pattern.pattern_data,
          first_observed: pattern.first_observed_at,
          last_observed: pattern.last_observed_at,
        },
      })
      .select('id')
      .single()

    if (insertErr || !newMemory) continue

    await supabase
      .from('memory_patterns')
      .update({ status: 'promoted', promoted_to_memory_id: newMemory.id })
      .eq('id', pattern.id)
      .eq('org_id', orgId)

    promoted++
  }

  return promoted
}

// ─── Stage 1: SUMMARIZE ──────────────────────────────────────────────────────

async function stageSummarize(supabase: SupabaseClient, orgId: string): Promise<number> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  // Find entities that have event_tuples occurring today
  const { data: entityRows, error: entityErr } = await supabase
    .from('event_tuples')
    .select('subject_id')
    .eq('org_id', orgId)
    .gte('occurred_at', todayISO)

  if (entityErr || !entityRows || entityRows.length === 0) return 0

  // Deduplicate entity IDs
  const entityIds = [...new Set(entityRows.map((r) => r.subject_id))]

  let summarized = 0

  // Process in batches
  for (let i = 0; i < entityIds.length; i += ENTITY_BATCH_SIZE) {
    const batch = entityIds.slice(i, i + ENTITY_BATCH_SIZE)

    for (const entityId of batch) {
      // Fetch entity name
      const { data: entity } = await supabase
        .from('entity_nodes')
        .select('id, name, properties')
        .eq('id', entityId)
        .eq('org_id', orgId)
        .single()

      if (!entity) continue

      // Fetch today's events for this entity
      const { data: events } = await supabase
        .from('event_tuples')
        .select('verb, object_text, occurred_at')
        .eq('org_id', orgId)
        .eq('subject_id', entityId)
        .gte('occurred_at', todayISO)
        .order('occurred_at', { ascending: true })

      if (!events || events.length === 0) continue

      const eventLines = events
        .map((e) => `- ${e.verb}${e.object_text ? `: ${e.object_text}` : ''} (${e.occurred_at})`)
        .join('\n')

      const { text: summary } = await generateText({
        model: models.fast,
        prompt: `Summarize today's activity for "${entity.name}" in 1-2 sentences. Be concise and factual.\n\nEvents:\n${eventLines}`,
        maxOutputTokens: 150,
      })

      // Merge into entity_nodes.properties via JSONB
      const now = new Date().toISOString()
      const updatedProperties = {
        ...(entity.properties as Record<string, unknown>),
        daily_summary: summary.trim(),
        last_summarized: now,
      }

      const { error: updateErr } = await supabase
        .from('entity_nodes')
        .update({ properties: updatedProperties })
        .eq('id', entityId)
        .eq('org_id', orgId)

      if (!updateErr) summarized++
    }
  }

  return summarized
}

// ─── Stage 2: RESOLVE CONFLICTS ─────────────────────────────────────────────

async function stageResolveConflicts(supabase: SupabaseClient, orgId: string): Promise<number> {
  // Find duplicate active edges: same (source_id, target_id, relation_type)
  // Using RPC or raw query to do GROUP BY HAVING
  // Try RPC first, fall back to JS-based duplicate detection
  let conflicts: Array<{ source_id: string; target_id: string; relation_type: string }> | null = null
  try {
    const { data, error } = await supabase.rpc(
      'find_duplicate_edges',
      { p_org_id: orgId },
    )
    if (!error && data) {
      conflicts = data as Array<{ source_id: string; target_id: string; relation_type: string }>
    }
  } catch {
    // RPC not available, fall through to fallback
  }

  // Fallback: query all active edges and detect duplicates in JS
  if (!conflicts) {
    return await resolveConflictsFallback(supabase, orgId)
  }

  let resolved = 0
  for (const conflict of conflicts as Array<{ source_id: string; target_id: string; relation_type: string }>) {
    resolved += await resolveConflictGroup(supabase, orgId, conflict)
  }

  return resolved
}

async function resolveConflictsFallback(supabase: SupabaseClient, orgId: string): Promise<number> {
  const { data: edges, error } = await supabase
    .from('entity_edges')
    .select('id, source_id, target_id, relation_type, valid_from')
    .eq('org_id', orgId)
    .is('valid_until', null)
    .order('valid_from', { ascending: false })

  if (error || !edges) return 0

  // Group by composite key
  const groups = new Map<string, Array<{ id: string; valid_from: string }>>()
  for (const edge of edges) {
    const key = `${edge.source_id}|${edge.target_id}|${edge.relation_type}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push({ id: edge.id, valid_from: edge.valid_from })
  }

  let resolved = 0
  const now = new Date().toISOString()

  for (const [, group] of groups) {
    if (group.length <= 1) continue

    // Sort by valid_from DESC — keep the most recent
    group.sort((a, b) => new Date(b.valid_from).getTime() - new Date(a.valid_from).getTime())

    // Invalidate all but the first (most recent)
    const toInvalidate = group.slice(1).map((e) => e.id)

    const { error: updateErr } = await supabase
      .from('entity_edges')
      .update({ valid_until: now })
      .in('id', toInvalidate)
      .eq('org_id', orgId)

    if (!updateErr) resolved += toInvalidate.length
  }

  return resolved
}

async function resolveConflictGroup(
  supabase: SupabaseClient,
  orgId: string,
  conflict: { source_id: string; target_id: string; relation_type: string },
): Promise<number> {
  const { data: edges, error } = await supabase
    .from('entity_edges')
    .select('id, valid_from')
    .eq('org_id', orgId)
    .eq('source_id', conflict.source_id)
    .eq('target_id', conflict.target_id)
    .eq('relation_type', conflict.relation_type)
    .is('valid_until', null)
    .order('valid_from', { ascending: false })

  if (error || !edges || edges.length <= 1) return 0

  // Keep most recent, invalidate the rest
  const toInvalidate = edges.slice(1).map((e) => e.id)
  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('entity_edges')
    .update({ valid_until: now })
    .in('id', toInvalidate)
    .eq('org_id', orgId)

  return updateErr ? 0 : toInvalidate.length
}

// ─── Stage 3: DISCOVER RELATIONSHIPS ─────────────────────────────────────────

async function stageDiscoverRelationships(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  // Adaptive confidence threshold (Sub-project D)
  const confidenceThreshold = await getRelationshipDiscoveryThreshold(supabase, orgId)

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  // Find entity pairs that co-occur in today's event_tuples
  // Approach: get all today's events, group by time proximity, find co-occurring pairs
  const { data: todayEvents, error: evtErr } = await supabase
    .from('event_tuples')
    .select('subject_id, occurred_at')
    .eq('org_id', orgId)
    .gte('occurred_at', todayISO)

  if (evtErr || !todayEvents || todayEvents.length < 2) return 0

  // Group by date of occurred_at to find co-occurring entities
  const dateEntityMap = new Map<string, Set<string>>()
  for (const evt of todayEvents) {
    const dateKey = evt.occurred_at.slice(0, 10) // YYYY-MM-DD
    if (!dateEntityMap.has(dateKey)) dateEntityMap.set(dateKey, new Set())
    dateEntityMap.get(dateKey)!.add(evt.subject_id)
  }

  // Collect candidate pairs (entities that co-occur on the same date)
  const pairsSeen = new Set<string>()
  const candidatePairs: Array<{ a: string; b: string }> = []

  for (const [, entitySet] of dateEntityMap) {
    const entities = Array.from(entitySet)
    for (let i = 0; i < entities.length && candidatePairs.length < MAX_DISCOVERY_PAIRS * 3; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const key = [entities[i], entities[j]].sort().join('|')
        if (pairsSeen.has(key)) continue
        pairsSeen.add(key)
        candidatePairs.push({ a: entities[i], b: entities[j] })
      }
    }
  }

  if (candidatePairs.length === 0) return 0

  // Filter out pairs that already have a direct edge
  const pairsWithoutEdge: Array<{ a: string; b: string }> = []
  for (const pair of candidatePairs) {
    if (pairsWithoutEdge.length >= MAX_DISCOVERY_PAIRS) break

    const { data: existingEdge } = await supabase
      .from('entity_edges')
      .select('id')
      .eq('org_id', orgId)
      .or(
        `and(source_id.eq.${pair.a},target_id.eq.${pair.b}),and(source_id.eq.${pair.b},target_id.eq.${pair.a})`,
      )
      .is('valid_until', null)
      .limit(1)

    if (!existingEdge || existingEdge.length === 0) {
      pairsWithoutEdge.push(pair)
    }
  }

  if (pairsWithoutEdge.length === 0) return 0

  // For each candidate pair, fetch entity names and ask Haiku
  let discovered = 0
  for (const pair of pairsWithoutEdge) {
    const { data: entityA } = await supabase
      .from('entity_nodes')
      .select('name, entity_type')
      .eq('id', pair.a)
      .single()
    const { data: entityB } = await supabase
      .from('entity_nodes')
      .select('name, entity_type')
      .eq('id', pair.b)
      .single()

    if (!entityA || !entityB) continue

    const { text: evaluation } = await generateText({
      model: models.fast,
      prompt: `Two entities appeared in related events today:\n- "${entityA.name}" (${entityA.entity_type})\n- "${entityB.name}" (${entityB.entity_type})\n\nIs there likely a meaningful relationship? Reply with ONLY "yes: <relation_type>" or "no". Keep relation_type short (e.g. "collaborates_with", "client_of", "related_to").`,
      maxOutputTokens: 30,
    })

    const trimmed = evaluation.trim().toLowerCase()
    if (trimmed.startsWith('yes:')) {
      const relationType = trimmed.slice(4).trim().replace(/[^a-z_]/g, '') || 'related_to'

      const { data: newEdge, error: edgeErr } = await supabase
        .from('entity_edges')
        .insert({
          org_id: orgId,
          source_id: pair.a,
          target_id: pair.b,
          relation_type: relationType,
          properties: { source: 'consolidation' },
          valid_from: new Date().toISOString(),
          confidence: confidenceThreshold,
          source_memory_id: null,
        })
        .select('id')
        .single()

      if (!edgeErr && newEdge) discovered++
    }
  }

  return discovered
}

// ─── Stage 3.5: DETECT COMMUNITIES ──────────────────────────────────────────

async function stageCommunityDetection(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  // Step 1: Build adjacency data from active edges
  const { data: edges, error: edgeErr } = await supabase
    .from('entity_edges')
    .select('source_id, target_id, relation_type')
    .eq('org_id', orgId)
    .is('valid_until', null)
    .order('ingested_at', { ascending: false })
    .limit(1000)

  if (edgeErr || !edges || edges.length < 3) return 0

  const adjacency = new Map<string, Set<string>>()
  for (const edge of edges) {
    if (!adjacency.has(edge.source_id)) adjacency.set(edge.source_id, new Set())
    if (!adjacency.has(edge.target_id)) adjacency.set(edge.target_id, new Set())
    adjacency.get(edge.source_id)!.add(edge.target_id)
    adjacency.get(edge.target_id)!.add(edge.source_id)
  }

  // Step 2: Find dense clusters via shared neighbors
  const candidateClusters: CommunityCluster[] = []
  const processedPairs = new Set<string>()

  for (const edge of edges) {
    const pairKey = [edge.source_id, edge.target_id].sort().join('|')
    if (processedPairs.has(pairKey)) continue
    processedPairs.add(pairKey)

    const neighborsA = adjacency.get(edge.source_id) ?? new Set()
    const neighborsB = adjacency.get(edge.target_id) ?? new Set()
    const intersection = new Set([...neighborsA].filter(n => neighborsB.has(n)))

    if (intersection.size < 1) continue

    const memberIds = new Set([edge.source_id, edge.target_id, ...intersection])
    const memberArray = [...memberIds].slice(0, 10) // Cap at 10

    // Count mutual edges between cluster members
    let mutualEdgeCount = 0
    for (const e of edges) {
      if (memberIds.has(e.source_id) && memberIds.has(e.target_id)) {
        mutualEdgeCount++
      }
    }

    if (mutualEdgeCount < 3) continue

    candidateClusters.push({
      memberIds: memberArray,
      mutualEdgeCount,
      sharedEventCount: 0, // Will be computed below
    })
  }

  if (candidateClusters.length === 0) return 0

  // Filter by shared event count (>= 5 in past 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const qualifiedClusters: CommunityCluster[] = []

  for (const cluster of candidateClusters) {
    const { data: eventData } = await supabase
      .from('event_tuples')
      .select('id')
      .eq('org_id', orgId)
      .in('subject_id', cluster.memberIds)
      .gte('occurred_at', thirtyDaysAgo)

    const sharedEventCount = eventData?.length ?? 0
    if (sharedEventCount < 5) continue

    cluster.sharedEventCount = sharedEventCount
    qualifiedClusters.push(cluster)
  }

  if (qualifiedClusters.length === 0) return 0

  // Greedy merge: if two clusters share >= 2 members, merge them
  const merged: CommunityCluster[] = []
  const used = new Set<number>()

  for (let i = 0; i < qualifiedClusters.length; i++) {
    if (used.has(i)) continue
    const current = { ...qualifiedClusters[i], memberIds: [...qualifiedClusters[i].memberIds] }
    for (let j = i + 1; j < qualifiedClusters.length; j++) {
      if (used.has(j)) continue
      const overlap = current.memberIds.filter(m => qualifiedClusters[j].memberIds.includes(m))
      if (overlap.length >= 2) {
        const combined = new Set([...current.memberIds, ...qualifiedClusters[j].memberIds])
        current.memberIds = [...combined].slice(0, 10)
        current.mutualEdgeCount += qualifiedClusters[j].mutualEdgeCount
        current.sharedEventCount += qualifiedClusters[j].sharedEventCount
        used.add(j)
      }
    }
    merged.push(current)
  }

  // Step 3 & 4: Generate summaries and persist community nodes
  let detected = 0
  const refreshedCommunityNames: string[] = []

  for (const cluster of merged) {
    // Fetch member names
    const { data: members } = await supabase
      .from('entity_nodes')
      .select('name')
      .in('id', cluster.memberIds)
      .eq('org_id', orgId)

    if (!members || members.length === 0) continue
    const memberNames = members.map(m => m.name)

    // Fetch recent event verbs
    const { data: recentEvents } = await supabase
      .from('event_tuples')
      .select('verb')
      .eq('org_id', orgId)
      .in('subject_id', cluster.memberIds)
      .gte('occurred_at', thirtyDaysAgo)
      .limit(20)

    const recentVerbs = [...new Set((recentEvents ?? []).map(e => e.verb))]

    // Fetch edge types between members
    const edgeTypes = [...new Set(
      edges
        .filter(e => cluster.memberIds.includes(e.source_id) && cluster.memberIds.includes(e.target_id))
        .map(e => e.relation_type)
    )]

    // Generate summary via Haiku
    let summary: string
    try {
      const { text } = await generateText({
        model: models.fast,
        prompt: `Summarize this entity cluster in 1 sentence. Be specific about what connects them.\n\nEntities: ${memberNames.join(', ')}\nRecent activity: ${recentVerbs.join(', ')}\nRelationship types: ${edgeTypes.join(', ')}`,
        maxOutputTokens: 100,
      })
      summary = text.trim()
    } catch {
      continue // Skip cluster if summary generation fails
    }

    const communityName = `Community: ${memberNames.slice(0, 3).join(', ')}`
    refreshedCommunityNames.push(communityName)

    // Upsert community entity node
    const { data: communityNode, error: upsertErr } = await supabase
      .from('entity_nodes')
      .upsert({
        org_id: orgId,
        entity_type: 'community',
        name: communityName,
        aliases: [],
        properties: {
          summary,
          member_ids: cluster.memberIds,
          member_count: cluster.memberIds.length,
          mutual_edge_count: cluster.mutualEdgeCount,
          shared_event_count: cluster.sharedEventCount,
          detected_at: new Date().toISOString(),
        },
        is_active: true,
      }, {
        onConflict: 'org_id,name',
      })
      .select('id')
      .single()

    if (upsertErr || !communityNode) continue

    // Create member_of edges (skip if already exists)
    for (const memberId of cluster.memberIds) {
      const { data: existing } = await supabase
        .from('entity_edges')
        .select('id')
        .eq('org_id', orgId)
        .eq('source_id', memberId)
        .eq('target_id', communityNode.id)
        .eq('relation_type', 'member_of')
        .is('valid_until', null)
        .limit(1)

      if (!existing || existing.length === 0) {
        await supabase.from('entity_edges').insert({
          org_id: orgId,
          source_id: memberId,
          target_id: communityNode.id,
          relation_type: 'member_of',
          properties: { source: 'consolidation' },
          valid_from: new Date().toISOString(),
          confidence: 0.9,
        })
      }
    }

    detected++
  }

  // Step 5: Expire stale communities (>7 days without refresh)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: staleCommunities } = await supabase
    .from('entity_nodes')
    .select('id, name, properties')
    .eq('org_id', orgId)
    .eq('entity_type', 'community')
    .eq('is_active', true)

  if (staleCommunities) {
    for (const community of staleCommunities) {
      if (refreshedCommunityNames.includes(community.name)) continue
      const detectedAt = (community.properties as Record<string, unknown>)?.detected_at as string | undefined
      if (detectedAt && detectedAt < sevenDaysAgo) {
        await supabase
          .from('entity_nodes')
          .update({ is_active: false })
          .eq('id', community.id)
          .eq('org_id', orgId)
      }
    }
  }

  return detected
}

// ─── Stage 4: PRUNE ──────────────────────────────────────────────────────────

async function stagePrune(supabase: SupabaseClient, orgId: string): Promise<number> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  // Find low-confidence memories created today with no entity links
  const { data: toPrune, error: pruneErr } = await supabase
    .from('memory_palace_entries')
    .select('id')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .lt('confidence', 0.3)
    .gte('created_at', todayISO)
    .or('entity_ids.is.null,entity_ids.eq.{}')

  if (pruneErr || !toPrune || toPrune.length === 0) return 0

  const ids = toPrune.map((r) => r.id)

  const { error: updateErr } = await supabase
    .from('memory_palace_entries')
    .update({
      is_active: false,
      metadata: {
        archive_reason: 'low_confidence_no_entities',
      },
    })
    .in('id', ids)
    .eq('org_id', orgId)

  return updateErr ? 0 : ids.length
}

// ─── Stage 5: MORNING BRIEFING ───────────────────────────────────────────────

async function stageMorningBriefing(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ briefingGenerated: boolean; delegatedActionsAggregated: number }> {
  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  // Upcoming deadlines: event_tuples with occurred_at in next 48h
  const { data: deadlines } = await supabase
    .from('event_tuples')
    .select('subject_id, verb, object_text, occurred_at')
    .eq('org_id', orgId)
    .gte('occurred_at', now.toISOString())
    .lte('occurred_at', in48h.toISOString())
    .order('occurred_at', { ascending: true })
    .limit(20)

  // Resolve entity names for deadlines
  const deadlineItems: MorningBriefing['upcomingDeadlines'] = []
  for (const d of deadlines || []) {
    const { data: entity } = await supabase
      .from('entity_nodes')
      .select('name')
      .eq('id', d.subject_id)
      .single()

    deadlineItems.push({
      entityName: entity?.name || d.subject_id,
      verb: d.verb,
      objectText: d.object_text,
      occurredAt: d.occurred_at,
    })
  }

  // Blocked entities
  const { data: blockedEdges } = await supabase
    .from('entity_edges')
    .select('source_id, target_id, relation_type')
    .eq('org_id', orgId)
    .like('relation_type', '%block%')
    .is('valid_until', null)
    .limit(20)

  // New discoveries from Stage 3
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const { data: discoveries } = await supabase
    .from('entity_edges')
    .select('id')
    .eq('org_id', orgId)
    .gte('ingested_at', todayStart.toISOString())
    .eq('properties->>source', 'consolidation')

  // Pending approvals count (convention: edges with relation_type containing 'approval' or 'pending')
  const { data: pendingApprovals } = await supabase
    .from('entity_edges')
    .select('id')
    .eq('org_id', orgId)
    .like('relation_type', '%approv%')
    .is('valid_until', null)

  // Evaluate project lifecycle actions for the briefing
  let lifecycleActions: LifecycleAction[] = []
  try {
    lifecycleActions = await evaluateProjectLifecycles(supabase, orgId)
    if (lifecycleActions.length > 0) {
      logger.info('[sleep-consolidation] Stage 5 lifecycle actions found', {
        orgId,
        count: lifecycleActions.length,
      })
    }
  } catch (err) {
    logger.warn('[sleep-consolidation] Stage 5 lifecycle evaluation failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // System insights from quality evaluation (Sub-project D — Task 4)
  let systemInsights: MorningBriefing['systemInsights'] = undefined
  try {
    const { data: evaluatedRuns } = await supabase
      .from('agent_runs')
      .select('quality_tool_efficiency, quality_context_utilisation, quality_overall')
      .eq('org_id', orgId)
      .gte('created_at', todayStart.toISOString())
      .not('quality_overall', 'is', null)

    if (evaluatedRuns && evaluatedRuns.length > 0) {
      const avgTool = mean(evaluatedRuns.map(r => r.quality_tool_efficiency).filter(Boolean))
      const ctxScores = evaluatedRuns.map(r => r.quality_context_utilisation).filter(Boolean)
      const avgCtx = ctxScores.length > 0 ? mean(ctxScores) : null

      // Get latest consolidation precision
      const { data: latestPrecision } = await supabase
        .from('consolidation_metrics')
        .select('precision')
        .eq('org_id', orgId)
        .eq('stage', 'discover_relationships')
        .order('date', { ascending: false })
        .limit(1)

      const insightLines: string[] = []
      if (avgTool < 0.6) insightLines.push(`Tool efficiency averaged ${avgTool.toFixed(2)} — review tool selection patterns`)
      if (latestPrecision?.[0]) {
        const p = latestPrecision[0].precision
        if (p < 0.7) insightLines.push(`Relationship discovery precision: ${(p * 100).toFixed(0)}% — threshold auto-adjusted`)
      }

      systemInsights = {
        avgToolEfficiency: avgTool,
        avgContextUtilisation: avgCtx,
        consolidationPrecision: latestPrecision?.[0]?.precision ?? null,
        totalEvaluatedRuns: evaluatedRuns.length,
        insights: insightLines,
      }
    }
  } catch (err) {
    logger.warn('[sleep-consolidation] Stage 5 system insights failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // Aggregate delegated actions from the last 24h
  const delegatedActionSummaries: DelegatedActionSummary[] = []
  try {
    const { getRecentDelegatedActions } = await import('@/lib/agent/delegation-mandate')
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const actions = await getRecentDelegatedActions(supabase, orgId, since)

    if (actions.length > 0) {
      // Group actions by entity_id
      const byEntity = groupBy(actions, (a) => a.entity_id)

      // Resolve entity names and compute financial impact per entity
      for (const [entityId, entityActions] of Object.entries(byEntity)) {
        const { data: entity } = await supabase
          .from('entity_nodes')
          .select('name')
          .eq('id', entityId)
          .single()

        let totalFinancial = 0
        for (const action of entityActions) {
          if (action.financial_impact) {
            const amount = (action.financial_impact as Record<string, unknown>).amount
            if (typeof amount === 'number') totalFinancial += amount
          }
        }

        delegatedActionSummaries.push({
          entityId,
          entityName: entity?.name ?? entityId,
          actions: entityActions.map((a) => ({
            actionType: a.action_type,
            summary: a.action_summary,
            createdAt: a.created_at,
          })),
          totalFinancialImpact: totalFinancial,
        })
      }

      logger.info('[sleep-consolidation] Stage 5 delegated actions aggregated', {
        orgId,
        entityCount: delegatedActionSummaries.length,
        totalActions: actions.length,
      })
    }
  } catch (err) {
    logger.warn('[sleep-consolidation] Stage 5 delegated actions aggregation failed', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const briefing: MorningBriefing = {
    generatedAt: now.toISOString(),
    upcomingDeadlines: deadlineItems,
    blockedEntities: (blockedEdges || []).map((e) => ({
      sourceId: e.source_id,
      targetId: e.target_id,
      relationType: e.relation_type,
    })),
    newDiscoveries: discoveries?.length ?? 0,
    pendingApprovals: pendingApprovals?.length ?? 0,
    lifecycleActions: lifecycleActions.map((a) => ({
      projectName: a.projectName,
      action: a.action,
      reason: a.reason,
      confidence: a.confidence,
    })),
    delegatedActions: delegatedActionSummaries,
    systemInsights,
  }

  // Store in organisations.settings via JSONB merge
  const { data: org } = await supabase
    .from('organisations')
    .select('settings')
    .eq('id', orgId)
    .single()

  if (!org) return { briefingGenerated: false, delegatedActionsAggregated: 0 }

  const currentSettings = (org.settings as Record<string, unknown>) || {}
  const updatedSettings = {
    ...currentSettings,
    morning_briefing: briefing,
  }

  const { error: updateErr } = await supabase
    .from('organisations')
    .update({ settings: updatedSettings })
    .eq('id', orgId)

  return {
    briefingGenerated: !updateErr,
    delegatedActionsAggregated: delegatedActionSummaries.reduce(
      (sum, s) => sum + s.actions.length, 0
    ),
  }
}

// ─── Utility: mean ──────────────────────────────────────────────────────────

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const item of arr) {
    const key = keyFn(item)
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}

// ─── Stage 6: SYSTEM LEARNING (Sub-project D) ──────────────────────────────

async function stageSystemLearning(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // 1. Aggregate today's quality scores
  const { data: todayRuns } = await supabase
    .from('agent_runs')
    .select('quality_tool_efficiency, quality_context_utilisation, quality_confidence_calibration, quality_overall, model_used, trigger_payload')
    .eq('org_id', orgId)
    .gte('created_at', todayStart.toISOString())
    .not('quality_overall', 'is', null)

  if (!todayRuns || todayRuns.length < 3) {
    logger.info('[sleep-consolidation] Stage 6 skipped — insufficient data', {
      orgId, runCount: todayRuns?.length ?? 0,
    })
    return 0
  }

  const allInsights: SystemInsight[] = []

  // 2. Tool efficiency analysis
  const toolInsights = analyzeToolEfficiency(todayRuns)
  allInsights.push(...toolInsights)

  // 3. Consolidation precision
  const consolidationInsights = await analyzeConsolidationPrecision(supabase, orgId)
  allInsights.push(...consolidationInsights)

  // 4. Model routing feedback
  const routingInsights = analyzeModelRouting(todayRuns)
  allInsights.push(...routingInsights)

  // 5. Write insights as lesson_learned memories
  const palace = new MemoryPalaceService(supabase, orgId)
  let written = 0

  for (const insight of allInsights) {
    try {
      await palace.createMemory({
        memoryType: 'lesson_learned',
        title: `System insight: ${insight.content.slice(0, 60)}`,
        content: insight.content,
        typeMetadata: {
          source_stage: 'system_learning',
          generated_date: todayStart.toISOString().slice(0, 10),
          evaluated_run_count: todayRuns.length,
        },
        confidence: insight.confidence,
        decayRate: 'never',
        sourceType: 'agent_reflection',
      })
      written++
    } catch {
      // Individual insight failure is non-critical
    }
  }

  return written
}

// ─── Tool Efficiency Analysis ───────────────────────────────────────────────

function analyzeToolEfficiency(
  runs: Array<{ quality_tool_efficiency: number | null; [key: string]: unknown }>,
): SystemInsight[] {
  const insights: SystemInsight[] = []
  const scores = runs
    .map(r => r.quality_tool_efficiency)
    .filter((s): s is number => s !== null)

  if (scores.length === 0) return insights

  const avgEfficiency = mean(scores)

  if (avgEfficiency < 0.6) {
    insights.push({
      content: `Tool efficiency averaged ${avgEfficiency.toFixed(2)} today across ${scores.length} evaluated runs. Review tool selection patterns — agents may be making redundant tool calls.`,
      confidence: 0.7,
    })
  }

  return insights
}

// ─── Consolidation Precision Analysis ───────────────────────────────────────

async function analyzeConsolidationPrecision(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SystemInsight[]> {
  const insights: SystemInsight[] = []

  const yesterdayStart = new Date()
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1)
  yesterdayStart.setUTCHours(0, 0, 0, 0)

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  // Find edges created by Stage 3 yesterday
  const { data: inferredEdges } = await supabase
    .from('entity_edges')
    .select('id, confidence, relation_type, valid_until')
    .eq('org_id', orgId)
    .eq('properties->>source', 'consolidation')
    .gte('ingested_at', yesterdayStart.toISOString())
    .lt('ingested_at', todayStart.toISOString())

  if (!inferredEdges || inferredEdges.length === 0) return insights

  // Check how many were invalidated (valid_until set)
  const invalidated = inferredEdges.filter(
    e => e.valid_until && new Date(e.valid_until) <= new Date()
  )
  const precision = 1 - (invalidated.length / inferredEdges.length)

  // Store precision metric for threshold tuning
  try {
    await supabase.from('consolidation_metrics').upsert({
      org_id: orgId,
      date: todayStart.toISOString().slice(0, 10),
      stage: 'discover_relationships',
      precision,
      total_inferred: inferredEdges.length,
      total_invalidated: invalidated.length,
    }, {
      onConflict: 'org_id,date,stage',
    })
  } catch (err) {
    logger.warn('[sleep-consolidation] Stage 6 precision metric upsert failed', {
      orgId, error: err instanceof Error ? err.message : String(err),
    })
  }

  if (precision < 0.6) {
    insights.push({
      content: `Relationship discovery precision was ${(precision * 100).toFixed(0)}% yesterday (${invalidated.length}/${inferredEdges.length} invalidated). Confidence threshold has been auto-raised to reduce false positives.`,
      confidence: 0.8,
    })
  }

  return insights
}

// ─── Model Routing Feedback ─────────────────────────────────────────────────

function analyzeModelRouting(
  runs: Array<{ quality_overall: number | null; trigger_payload: unknown; [key: string]: unknown }>,
): SystemInsight[] {
  const insights: SystemInsight[] = []

  // Group runs by complexity level (stored in trigger_payload or metadata)
  const byComplexity = groupBy(runs, r => {
    const payload = r.trigger_payload as Record<string, unknown> | null
    return (payload?.complexity as string) ?? 'medium'
  })

  for (const [complexity, complexityRuns] of Object.entries(byComplexity)) {
    const scores = complexityRuns
      .map(r => r.quality_overall)
      .filter((s): s is number => s !== null)

    if (scores.length === 0) continue

    const avgQuality = mean(scores)

    if (complexity === 'high' && avgQuality < 0.5) {
      insights.push({
        content: `High-complexity turns averaged ${avgQuality.toFixed(2)} quality across ${scores.length} runs. Consider escalating high-complexity to Opus more aggressively.`,
        confidence: 0.7,
      })
    }

    if (complexity === 'medium' && avgQuality > 0.85 && scores.length >= 5) {
      insights.push({
        content: `Medium-complexity turns averaged ${avgQuality.toFixed(2)} quality across ${scores.length} runs. Some may be safe to classify as low-complexity to save cost.`,
        confidence: 0.6,
      })
    }
  }

  return insights
}

// ─── Adaptive Relationship Discovery Threshold (Sub-project D) ──────────────

async function getRelationshipDiscoveryThreshold(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  const DEFAULT_THRESHOLD = 0.7

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)

  const { data: metrics } = await supabase
    .from('consolidation_metrics')
    .select('precision')
    .eq('org_id', orgId)
    .eq('stage', 'discover_relationships')
    .gte('date', sevenDaysAgo.toISOString().slice(0, 10))
    .order('date', { ascending: false })

  if (!metrics || metrics.length < 3) return DEFAULT_THRESHOLD

  const avgPrecision = mean(metrics.map(m => m.precision))

  // Precision below 0.6 -> raise threshold (be more conservative)
  // Precision above 0.8 -> lower threshold (be more exploratory)
  // Clamp to [0.5, 0.9] range
  if (avgPrecision < 0.6) return Math.min(DEFAULT_THRESHOLD + 0.1, 0.9)
  if (avgPrecision > 0.8) return Math.max(DEFAULT_THRESHOLD - 0.1, 0.5)
  return DEFAULT_THRESHOLD
}

// ─── Stage 7: FIDUCIARY EVALUATION (Game Theory LTV) ───────────────────────

async function stageFiduciaryEvaluation(
  supabase: SupabaseClient,
  orgId: string,
): Promise<number> {
  // 1. Query entities with sufficient signal data
  const { data: entitySignals, error: entityErr } = await supabase
    .from('memory_palace_entries')
    .select('entity_ids, entity_names')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .not('entity_ids', 'eq', '{}')

  if (entityErr || !entitySignals || entitySignals.length === 0) return 0

  // Aggregate entity frequency — only evaluate entities with sufficient data
  const entityCounts = new Map<string, { count: number; name: string }>()
  for (const row of entitySignals) {
    const ids: string[] = row.entity_ids ?? []
    const names: string[] = row.entity_names ?? []
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const existing = entityCounts.get(id)
      if (existing) {
        existing.count++
      } else {
        entityCounts.set(id, { count: 1, name: names[i] ?? id.slice(0, 8) })
      }
    }
  }

  // Filter to entities with 5+ memories (sufficient signal)
  const significantEntities = [...entityCounts.entries()]
    .filter(([, v]) => v.count >= 5)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, ENTITY_BATCH_SIZE)

  if (significantEntities.length === 0) return 0

  let constraintsGenerated = 0
  const writer = new MemoryWriter(supabase)

  for (const [entityId, { name: entityName }] of significantEntities) {
    try {
      // 2. Gather signals for this entity
      const { data: entityMemories } = await supabase
        .from('memory_palace_entries')
        .select('category, content, confidence, tags, metadata, created_at')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .contains('entity_ids', [entityId])
        .order('created_at', { ascending: false })
        .limit(20)

      if (!entityMemories || entityMemories.length < 5) continue

      // 3. Gather patterns for this entity
      const { data: entityPatterns } = await supabase
        .from('memory_patterns')
        .select('pattern_type, description, confidence, sample_count, pattern_data')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .contains('entity_ids', [entityId])
        .limit(10)

      // 4. Check for existing fiduciary constraints (avoid regenerating)
      const { data: existingConstraints } = await supabase
        .from('memory_palace_entries')
        .select('content')
        .eq('org_id', orgId)
        .eq('category', 'fiduciary_constraint')
        .eq('is_active', true)
        .contains('entity_ids', [entityId])

      const existingConstraintTexts = (existingConstraints ?? []).map(c => c.content).join('\n')

      // 5. Use Claude to reason about fiduciary constraints from signals
      const signalSummary = entityMemories.map(m =>
        `[${m.category}] ${m.content.slice(0, 150)} (confidence: ${m.confidence})`
      ).join('\n')

      const patternSummary = (entityPatterns ?? []).map(p =>
        `[${p.pattern_type}] ${p.description} (confidence: ${p.confidence}, samples: ${p.sample_count})`
      ).join('\n')

      const { text: constraintText } = await generateText({
        model: models.fast,
        system: `You are a fiduciary analyst for a personal AI assistant. Your job is to identify constraints that protect the user's financial interests, time, and business relationships.

Analyze the entity signals and generate 0-3 fiduciary constraints. Each constraint should be:
- Actionable (tells the AI what to do or watch for)
- Specific to this entity (references their behavior patterns)
- Protective of user interests (revenue, time, relationship health)

Output format: One constraint per line. If no constraints warranted, output "NONE".
Do NOT regenerate constraints that already exist.

Categories of constraints:
- FINANCIAL: Revenue leakage, unpaid work, undercharging, scope creep
- RELATIONSHIP: Responsiveness issues, payment patterns, churn risk
- STRATEGIC: Time allocation vs value returned, opportunity cost`,
        prompt: `Entity: ${entityName} (ID: ${entityId})

Signals (recent memories):
${signalSummary}

Patterns:
${patternSummary || 'No patterns detected yet.'}

Existing constraints (do NOT duplicate):
${existingConstraintTexts || 'None yet.'}

Generate fiduciary constraints for this entity:`,
        maxOutputTokens: 500,
      })

      if (!constraintText || constraintText.trim() === 'NONE') continue

      // 6. Parse and store each constraint
      const constraints = constraintText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 10 && line !== 'NONE')

      for (const constraint of constraints.slice(0, 3)) {
        const stored = await writer.storeMemory({
          orgId,
          category: 'fiduciary_constraint',
          title: `${entityName}: Fiduciary constraint`,
          content: constraint,
          confidence: 0.7,
          entityIds: [entityId],
          entityNames: [entityName],
          source: 'consolidation',
          tags: ['auto-generated', 'fiduciary', 'ltv-evaluation'],
          metadata: {
            generated_by: 'sleep_consolidation_stage_7',
            generated_at: new Date().toISOString(),
            signal_count: entityMemories.length,
            pattern_count: (entityPatterns ?? []).length,
          },
        })

        if (stored) constraintsGenerated++
      }
    } catch (err) {
      logger.warn('[sleep-consolidation] Fiduciary evaluation failed for entity', {
        entityId,
        entityName,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return constraintsGenerated
}
