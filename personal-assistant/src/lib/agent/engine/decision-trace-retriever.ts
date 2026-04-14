/**
 * Decision Trace Retriever — Reflexion Pattern
 *
 * Queries past decision traces (from decision_log) and agent run outcomes
 * (from agent_runs) to inject few-shot learning context into the TAOR loop.
 *
 * When the agent faces a similar trigger, it reads what it decided before
 * and what the outcome was — closing the feedback loop so it improves
 * over time rather than starting from scratch.
 *
 * Uses two sources:
 * 1. decision_log — rich reasoning chains with outcomes and entity context
 * 2. agent_runs — lightweight execution history with trigger payloads
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DecisionLogEntry } from '@/lib/memory-palace/types'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelevantTrace {
  /** Source: 'decision_log' or 'agent_runs' */
  source: 'decision_log' | 'agent_runs'
  /** What triggered this decision */
  trigger: string
  /** The action/decision taken */
  action: string
  /** The reasoning behind the decision */
  reasoning: string | null
  /** What actually happened */
  outcome: string | null
  /** Entity names involved (for context) */
  entityNames: string[]
  /** When the decision was made */
  timestamp: string
  /** Human feedback if any */
  feedback: string | null
}

export interface TraceRetrievalResult {
  traces: RelevantTrace[]
  /** How long the retrieval took in ms */
  retrievalMs: number
}

// ---------------------------------------------------------------------------
// Core Retrieval
// ---------------------------------------------------------------------------

/**
 * Retrieve relevant past decision traces for the current trigger.
 *
 * Queries decision_log using full-text search and optional entity scoping,
 * plus recent agent_runs with similar trigger payloads.
 *
 * Returns at most `limit` traces, ordered by relevance (decisions first,
 * then recent runs). Never throws — returns empty on failure.
 */
export async function retrieveRelevantTraces(
  supabase: SupabaseClient,
  orgId: string,
  trigger: string,
  options?: {
    entityId?: string
    limit?: number
  },
): Promise<TraceRetrievalResult> {
  const start = Date.now()
  const limit = options?.limit ?? 5
  const entityId = options?.entityId

  try {
    const [decisions, runs] = await Promise.all([
      queryDecisionLog(supabase, orgId, trigger, entityId, Math.ceil(limit * 0.6)),
      queryAgentRuns(supabase, orgId, trigger, Math.ceil(limit * 0.4)),
    ])

    // Merge and deduplicate (decisions take priority)
    const traces: RelevantTrace[] = [
      ...decisions,
      ...runs,
    ].slice(0, limit)

    const retrievalMs = Date.now() - start

    if (traces.length > 0) {
      logger.info('[decision-trace-retriever] Retrieved traces', {
        count: traces.length,
        sources: {
          decisions: decisions.length,
          runs: runs.length,
        },
        retrievalMs,
      })
    }

    return { traces, retrievalMs }
  } catch (err) {
    logger.warn('[decision-trace-retriever] Retrieval failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return { traces: [], retrievalMs: Date.now() - start }
  }
}

// ---------------------------------------------------------------------------
// Decision Log Query
// ---------------------------------------------------------------------------

async function queryDecisionLog(
  supabase: SupabaseClient,
  orgId: string,
  trigger: string,
  entityId: string | undefined,
  limit: number,
): Promise<RelevantTrace[]> {
  try {
    // Extract meaningful keywords from the trigger for search
    const searchTerms = extractSearchTerms(trigger)
    if (searchTerms.length === 0) return []

    // Build a full-text search query
    const tsQuery = searchTerms.join(' & ')

    let query = supabase
      .from('decision_log')
      .select('title, decision, reasoning, outcome, lessons_learned, entity_names, decided_at, status')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .textSearch('content_tsv', tsQuery, { type: 'plain' })
      .order('decided_at', { ascending: false })
      .limit(limit)

    if (entityId) {
      query = query.contains('entity_ids', [entityId])
    }

    const { data, error } = await query

    if (error) {
      logger.warn('[decision-trace-retriever] decision_log query failed', {
        error: error.message,
      })
      return []
    }

    return (data ?? []).map((d: DecisionLogRow): RelevantTrace => ({
      source: 'decision_log',
      trigger: d.title,
      action: d.decision,
      reasoning: d.reasoning,
      outcome: d.outcome ?? d.lessons_learned ?? null,
      entityNames: d.entity_names ?? [],
      timestamp: d.decided_at,
      feedback: null,
    }))
  } catch (err) {
    logger.warn('[decision-trace-retriever] decision_log query threw', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// Minimal row type for query result
interface DecisionLogRow {
  title: string
  decision: string
  reasoning: string
  outcome: string | null
  lessons_learned: string | null
  entity_names: string[] | null
  decided_at: string
  status: string
}

// ---------------------------------------------------------------------------
// Agent Runs Query
// ---------------------------------------------------------------------------

async function queryAgentRuns(
  supabase: SupabaseClient,
  orgId: string,
  trigger: string,
  limit: number,
): Promise<RelevantTrace[]> {
  try {
    // Query recent successful runs that have a result_summary
    // and whose trigger_payload contains a message field
    const { data, error } = await supabase
      .from('agent_runs')
      .select('trigger_payload, result_summary, status, created_at, routing_decision')
      .eq('org_id', orgId)
      .in('status', ['success', 'error'])
      .not('result_summary', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50) // fetch more, filter client-side for relevance

    if (error) {
      logger.warn('[decision-trace-retriever] agent_runs query failed', {
        error: error.message,
      })
      return []
    }

    if (!data || data.length === 0) return []

    // Score each run by trigger similarity
    const triggerTerms = new Set(extractSearchTerms(trigger))
    if (triggerTerms.size === 0) return []

    const scored = data
      .map((run: AgentRunRow) => {
        const runMessage = typeof run.trigger_payload === 'object'
          && run.trigger_payload !== null
          && 'message' in run.trigger_payload
          ? String((run.trigger_payload as { message: string }).message)
          : ''
        if (!runMessage) return null

        const runTerms = new Set(extractSearchTerms(runMessage))
        const overlap = [...triggerTerms].filter(t => runTerms.has(t)).length
        if (overlap === 0) return null

        const score = overlap / Math.max(triggerTerms.size, runTerms.size)
        return { run, score, runMessage }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return scored.map(({ run, runMessage }): RelevantTrace => ({
      source: 'agent_runs',
      trigger: runMessage.slice(0, 200),
      action: run.routing_decision ?? 'act',
      reasoning: null,
      outcome: run.result_summary
        ? `${run.status}: ${run.result_summary.slice(0, 200)}`
        : run.status,
      entityNames: [],
      timestamp: run.created_at,
      feedback: null,
    }))
  } catch (err) {
    logger.warn('[decision-trace-retriever] agent_runs query threw', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// Minimal row type for agent_runs query result
interface AgentRunRow {
  trigger_payload: unknown
  result_summary: string | null
  status: string
  created_at: string
  routing_decision: string | null
}

// ---------------------------------------------------------------------------
// Formatting — Build prompt context block from retrieved traces
// ---------------------------------------------------------------------------

/**
 * Format retrieved traces as a context block for the system prompt.
 * Uses a concise few-shot format that teaches the model from its own history.
 *
 * Returns empty string when no traces are available.
 */
export function formatTracesAsContext(traces: RelevantTrace[]): string {
  if (!traces || traces.length === 0) return ''

  const lines = traces.map((t, i) => {
    const parts: string[] = []

    parts.push(`${i + 1}. Trigger: "${t.trigger}"`)

    if (t.entityNames.length > 0) {
      parts.push(`   Entities: ${t.entityNames.join(', ')}`)
    }

    parts.push(`   Decision: ${t.action}`)

    if (t.reasoning) {
      parts.push(`   Reasoning: ${t.reasoning.slice(0, 200)}`)
    }

    if (t.outcome) {
      parts.push(`   Outcome: ${t.outcome.slice(0, 200)}`)
    }

    if (t.feedback) {
      parts.push(`   Feedback: ${t.feedback}`)
    }

    return parts.join('\n')
  })

  return [
    '## Past Decision Traces',
    'You have made similar decisions before. Use these outcomes to inform your current approach:',
    '',
    ...lines,
    '',
    'Apply lessons from these outcomes. Repeat successful approaches; avoid repeating failures.',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Text Utilities
// ---------------------------------------------------------------------------

/** Stop words to exclude from search term extraction */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
  'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'out',
  'up', 'down', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'than', 'too', 'very',
  'just', 'about', 'also', 'back', 'how', 'its', 'me', 'my', 'our',
  'that', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'what', 'when', 'where', 'which', 'who', 'whom', 'why', 'it', 'i',
  'we', 'you', 'he', 'she', 'your', 'his', 'her', 'their',
  'please', 'thanks', 'thank', 'hey', 'hi', 'hello',
])

/**
 * Extract meaningful search terms from a message.
 * Removes stop words, short terms, and normalizes to lowercase.
 */
export function extractSearchTerms(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t))
    .slice(0, 10) // cap to avoid overly broad queries
}
