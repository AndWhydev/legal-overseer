/**
 * Proactive Agent Layer — Main Entry Point
 *
 * Orchestrates the full proactive analysis pipeline:
 *   1. Gather signals from intelligence sources
 *   2. Aggregate and deduplicate
 *   3. Classify signals into decisions
 *   4. Execute actions based on autonomy levels
 *
 * Called by the cron route (every 15 minutes) or on-demand.
 *
 * @module proactive
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'
import { aggregateSignals } from './aggregator'
import { classifySignals } from './classifier'
import { executeAction } from './executor'
import type {
  ProactiveSignal,
  ProactiveAction,
  OrgProactiveConfig,
  ExecutionConfig,
} from './types'

// Re-export all public types and functions
export type {
  ProactiveSignal,
  ProactiveDecision,
  ProactiveAction,
  ProactiveActionType,
  DeliveryChannel,
  OrgProactiveConfig,
  ExecutionConfig,
  ExecutionResult,
  ProactiveActionStatus,
} from './types'
export { classifySignals } from './classifier'
export { executeAction } from './executor'
export { aggregateSignals } from './aggregator'

// ---------------------------------------------------------------------------
// Default Configuration
// ---------------------------------------------------------------------------

const DEFAULT_ORG_CONFIG: OrgProactiveConfig = {
  enabled: true,
  maxActionsPerHour: 10,
  minConfidenceForAutoAction: 0.75,
  minConfidenceForSuggestion: 0.45,
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Run the full proactive analysis pipeline for an organisation.
 *
 * @param orgId - Organisation ID
 * @param supabase - Service-role Supabase client
 * @returns Array of proactive actions taken (or queued)
 */
export async function runProactiveAnalysis(
  orgId: string,
  supabase: SupabaseClient,
): Promise<ProactiveAction[]> {
  const startTime = Date.now()

  logger.info('[proactive] Starting analysis', { orgId })

  try {
    // 1. Load org configuration
    const orgConfig = await loadOrgConfig(supabase, orgId)
    if (!orgConfig.enabled) {
      logger.info('[proactive] Proactive intelligence disabled for org', { orgId })
      return []
    }

    // 2. Get agent config for this org (needed for approval queue)
    const agentConfigId = await getOrCreateAgentConfigId(supabase, orgId)

    // 3. Gather signals from all intelligence sources
    const rawSignals = await gatherSignals(supabase, orgId)
    if (rawSignals.length === 0) {
      logger.info('[proactive] No signals to process', { orgId })
      return []
    }

    logger.info('[proactive] Gathered signals', { orgId, count: rawSignals.length })

    // 4. Aggregate and deduplicate
    const aggregated = await aggregateSignals(
      rawSignals,
      orgId,
      supabase,
      orgConfig.maxActionsPerHour,
    )

    if (aggregated.length === 0) {
      logger.info('[proactive] All signals filtered by aggregation', { orgId })
      return []
    }

    // 5. Apply hardcoded rules for obvious high-severity signals
    const { hardcodedDecisions, remainingSignals } = applyHardcodedRules(aggregated)

    // 6. Classify remaining signals via LLM
    const llmDecisions = await classifySignals(remainingSignals, orgConfig)
    const decisions = [...hardcodedDecisions, ...llmDecisions]

    logger.info('[proactive] Classification complete', {
      orgId,
      signalCount: aggregated.length,
      decisionCount: decisions.length,
      actCount: decisions.filter((d) => d.shouldAct).length,
    })

    // 7. Execute each decision
    const executionConfig: ExecutionConfig = {
      orgId,
      agentConfigId,
    }

    const actions: ProactiveAction[] = []

    for (const decision of decisions) {
      if (!decision.shouldAct) continue

      const result = await executeAction(supabase, decision, executionConfig)
      actions.push({
        id: result.actionId,
        decision,
        status: result.status,
        payload: result.details ?? {},
        orgId,
        createdAt: new Date().toISOString(),
      })
    }

    const durationMs = Date.now() - startTime
    logger.info('[proactive] Analysis complete', {
      orgId,
      durationMs,
      actionsCount: actions.length,
    })

    return actions
  } catch (err) {
    const durationMs = Date.now() - startTime
    logger.error('[proactive] Analysis failed', {
      orgId,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}


// ---------------------------------------------------------------------------
// Hardcoded Signal Rules (bypass LLM for obvious high-severity signals)
// ---------------------------------------------------------------------------

/**
 * Apply deterministic rules for signals that should ALWAYS produce a decision.
 * These bypass the LLM classifier to avoid false negatives on critical signals.
 *
 * Returns decisions for matched signals and the remaining unmatched signals
 * that still need LLM classification.
 */
function applyHardcodedRules(signals: ProactiveSignal[]): {
  hardcodedDecisions: import('./types').ProactiveDecision[]
  remainingSignals: ProactiveSignal[]
} {
  const hardcodedDecisions: import('./types').ProactiveDecision[] = []
  const remainingSignals: ProactiveSignal[] = []

  for (const signal of signals) {
    const decision = matchHardcodedRule(signal)
    if (decision) {
      hardcodedDecisions.push(decision)
      logger.info('[proactive] Hardcoded rule matched', {
        signalType: signal.type,
        action: decision.action,
        urgency: decision.urgency,
      })
    } else {
      remainingSignals.push(signal)
    }
  }

  return { hardcodedDecisions, remainingSignals }
}

function matchHardcodedRule(signal: ProactiveSignal): import('./types').ProactiveDecision | null {
  const data = signal.data as Record<string, unknown>

  // Rule 1: Blocked project stale > 30 days → always alert
  if (signal.type === 'project_blocked_stale') {
    const daysBlocked = (data.days_blocked as number) ?? 0
    if (daysBlocked > 30) {
      return {
        shouldAct: true,
        action: 'alert_user',
        confidence: 0.95,
        reasoning: `Project "${String(data.project_name)}" has been blocked for ${String(data.days_blocked)} days: ${String(data.blocker_description ?? "unknown blocker")}. Requires attention.`,
        urgency: 'today',
        channel: 'chat_whisper',
        autonomyLevel: 3,
      }
    }
  }

  // Rule 2: Project action overdue → always create task
  if (signal.type === 'project_action_overdue') {
    return {
      shouldAct: true,
      action: 'create_task',
      confidence: 0.9,
      reasoning: `Project "${String(data.project_name)}" has overdue action: ${String(data.next_action ?? "unspecified")}. Was due ${String(data.next_action_due)}.`,
      urgency: 'today',
      channel: 'chat_whisper',
      autonomyLevel: 3,
    }
  }

  // Rule 3: Invoice overdue with total > 500 → always alert
  if (signal.type === 'invoice_overdue') {
    const total = (data.total as number) ?? 0
    if (total > 500) {
      return {
        shouldAct: true,
        action: 'alert_user',
        confidence: 0.95,
        reasoning: `Invoice ${String(data.invoice_number)} for ${String(data.contact_name)} is overdue. Amount: $${String(total)}.`,
        urgency: 'immediate',
        channel: 'chat_whisper',
        autonomyLevel: 2,
      }
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Signal Gathering
// ---------------------------------------------------------------------------

/**
 * Gather proactive signals from all intelligence sources.
 *
 * Pulls from:
 * - Overdue invoices
 * - Hot leads
 * - Unanswered messages (stale conversations)
 * - Upcoming deadlines (tasks due soon)
 * - Negative sentiment flags
 */
async function gatherSignals(
  supabase: SupabaseClient,
  orgId: string,
): Promise<ProactiveSignal[]> {
  const signals: ProactiveSignal[] = []
  const now = new Date().toISOString()

  // Run all signal sources concurrently
  const [
    overdueInvoices,
    hotLeads,
    staleConversations,
    upcomingDeadlines,
    projectDeadlines,
  ] = await Promise.all([
    gatherOverdueInvoiceSignals(supabase, orgId, now),
    gatherHotLeadSignals(supabase, orgId, now),
    gatherStaleConversationSignals(supabase, orgId, now),
    gatherUpcomingDeadlineSignals(supabase, orgId, now),
    gatherProjectDeadlineSignals(supabase, orgId, now),
  ])

  signals.push(...overdueInvoices, ...hotLeads, ...staleConversations, ...upcomingDeadlines, ...projectDeadlines)

  return signals
}

async function gatherOverdueInvoiceSignals(
  supabase: SupabaseClient,
  orgId: string,
  now: string,
): Promise<ProactiveSignal[]> {
  try {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, total, due_date, client_contact_id, contacts(name)')
      .eq('org_id', orgId)
      .eq('status', 'overdue')
      .limit(10)

    if (!data?.length) return []

    return data.map((inv: Record<string, unknown>) => {
      const contact = inv.contacts as { name: string } | null
      const total = inv.total as number
      return {
        type: 'invoice_overdue',
        source: 'invoices',
        severity: (total > 5000 ? 'critical' : total > 1000 ? 'high' : 'medium') as ProactiveSignal['severity'],
        data: {
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          total: inv.total,
          due_date: inv.due_date,
          contact_name: contact?.name ?? 'Unknown',
          contact_id: inv.client_contact_id,
        },
        timestamp: now,
      }
    })
  } catch (err) {
    logger.warn('[proactive] Failed to gather overdue invoice signals', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

async function gatherHotLeadSignals(
  supabase: SupabaseClient,
  orgId: string,
  now: string,
): Promise<ProactiveSignal[]> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('leads')
      .select('id, score, source_channel, metadata')
      .eq('org_id', orgId)
      .gte('created_at', oneHourAgo)
      .eq('score', 'hot')
      .limit(5)

    if (!data?.length) return []

    return data.map((lead: Record<string, unknown>) => {
      const meta = (lead.metadata || {}) as Record<string, unknown>
      return {
        type: 'lead_hot',
        source: 'leads',
        severity: 'high' as const,
        data: {
          lead_id: lead.id,
          score: lead.score,
          source_channel: lead.source_channel,
          name: meta.name ?? meta.company ?? 'Unknown',
        },
        timestamp: now,
      }
    })
  } catch (err) {
    logger.warn('[proactive] Failed to gather hot lead signals', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

async function gatherStaleConversationSignals(
  supabase: SupabaseClient,
  orgId: string,
  now: string,
): Promise<ProactiveSignal[]> {
  try {
    // Find messages received > 4 hours ago that have no reply
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('messages')
      .select('id, sender_name, channel, subject, received_at')
      .eq('org_id', orgId)
      .eq('direction', 'inbound')
      .eq('replied', false)
      .gte('received_at', twentyFourHoursAgo)
      .lte('received_at', fourHoursAgo)
      .limit(10)

    if (!data?.length) return []

    return data.map((msg: Record<string, unknown>) => ({
      type: 'stale_conversation',
      source: 'messages',
      severity: 'medium' as const,
      data: {
        message_id: msg.id,
        sender_name: msg.sender_name,
        channel: msg.channel,
        subject: msg.subject,
        received_at: msg.received_at,
      },
      timestamp: now,
    }))
  } catch (err) {
    logger.warn('[proactive] Failed to gather stale conversation signals', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

async function gatherUpcomingDeadlineSignals(
  supabase: SupabaseClient,
  orgId: string,
  now: string,
): Promise<ProactiveSignal[]> {
  try {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data } = await supabase
      .from('tasks')
      .select('id, title, due_date, priority, status')
      .eq('org_id', orgId)
      .in('status', ['todo', 'in_progress'])
      .lte('due_date', tomorrow)
      .gte('due_date', now)
      .limit(10)

    if (!data?.length) return []

    return data.map((task: Record<string, unknown>) => ({
      type: 'deadline_approaching',
      source: 'tasks',
      severity: (task.priority === 'high' ? 'high' : 'medium') as ProactiveSignal['severity'],
      data: {
        task_id: task.id,
        title: task.title,
        due_date: task.due_date,
        priority: task.priority,
        status: task.status,
      },
      timestamp: now,
    }))
  } catch (err) {
    logger.warn('[proactive] Failed to gather upcoming deadline signals', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

async function gatherProjectDeadlineSignals(
  supabase: SupabaseClient,
  orgId: string,
  now: string,
): Promise<ProactiveSignal[]> {
  try {
    const { data } = await supabase
      .from('projects')
      .select('id, name, status, contact_id, metadata')
      .eq('org_id', orgId)
      .in('status', ['active', 'blocked'])
      .limit(20)

    if (!data?.length) return []

    const signals: ProactiveSignal[] = []

    for (const project of data) {
      const meta = (project.metadata ?? {}) as Record<string, unknown>
      const nextAction = meta.next_action as string | undefined
      const nextActionDue = meta.next_action_due as string | undefined
      const blockers = Array.isArray(meta.blockers) ? meta.blockers : []
      const priority = meta.priority as string || 'medium'

      // Signal 1: overdue next_action_due
      if (nextActionDue && new Date(nextActionDue) < new Date(now)) {
        signals.push({
          type: 'project_action_overdue',
          source: 'projects',
          severity: (priority === 'high' || priority === 'critical' ? 'high' : 'medium') as ProactiveSignal['severity'],
          data: {
            project_id: project.id,
            project_name: project.name,
            next_action: nextAction,
            next_action_due: nextActionDue,
            contact_id: project.contact_id,
            priority,
          },
          timestamp: now,
        })
      }

      // Signal 2: blocked project with stale blockers (>7 days)
      for (const blocker of blockers) {
        const b = blocker as Record<string, unknown>
        const since = b.since as string | undefined
        if (since) {
          const daysSinceBlocked = Math.floor((Date.now() - new Date(since).getTime()) / 86400000)
          if (daysSinceBlocked > 7) {
            signals.push({
              type: 'project_blocked_stale',
              source: 'projects',
              severity: 'high' as ProactiveSignal['severity'],
              data: {
                project_id: project.id,
                project_name: project.name,
                blocker_description: b.description,
                days_blocked: daysSinceBlocked,
                contact_id: project.contact_id,
              },
              timestamp: now,
            })
          }
        }
      }
    }

    return signals
  } catch (err) {
    logger.warn('[proactive] Failed to gather project deadline signals', {
      error: err instanceof Error ? err.message : String(err),
    })
    return []
  }
}

// ---------------------------------------------------------------------------
// Configuration Loading
// ---------------------------------------------------------------------------

async function loadOrgConfig(
  supabase: SupabaseClient,
  orgId: string,
): Promise<OrgProactiveConfig> {
  try {
    const { data } = await supabase
      .from('organisations')
      .select('settings')
      .eq('id', orgId)
      .single()

    const settings = (data?.settings ?? {}) as Record<string, unknown>
    const proactiveSettings = (settings.proactive ?? {}) as Record<string, unknown>

    return {
      enabled: proactiveSettings.enabled !== false, // Default: enabled
      maxActionsPerHour: (proactiveSettings.max_actions_per_hour as number) ?? DEFAULT_ORG_CONFIG.maxActionsPerHour,
      minConfidenceForAutoAction: (proactiveSettings.min_confidence_auto as number) ?? DEFAULT_ORG_CONFIG.minConfidenceForAutoAction,
      minConfidenceForSuggestion: (proactiveSettings.min_confidence_suggest as number) ?? DEFAULT_ORG_CONFIG.minConfidenceForSuggestion,
      autonomyOverrides: (settings.autonomy_overrides as Record<string, string>) ?? undefined,
    }
  } catch (err) {
    logger.warn('[proactive] Failed to load org config, using defaults', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return DEFAULT_ORG_CONFIG
  }
}

/**
 * Get or create a generic agent config ID for the proactive engine.
 * The approval queue requires an agent_config_id to associate approvals with.
 */
async function getOrCreateAgentConfigId(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string> {
  try {
    // Try to find existing proactive engine config
    const { data: existing } = await supabase
      .from('agent_configs')
      .select('id')
      .eq('org_id', orgId)
      .eq('agent_type', 'proactive_engine')
      .eq('enabled', true)
      .limit(1)
      .single()

    if (existing?.id) return existing.id

    // Create one if it doesn't exist
    const { data: created, error } = await supabase
      .from('agent_configs')
      .insert({
        org_id: orgId,
        agent_type: 'proactive_engine',
        name: 'Proactive Intelligence Engine',
        enabled: true,
      })
      .select('id')
      .single()

    if (error || !created) {
      // Fallback: use any agent config for this org
      const { data: fallback } = await supabase
        .from('agent_configs')
        .select('id')
        .eq('org_id', orgId)
        .eq('enabled', true)
        .limit(1)
        .single()

      return fallback?.id ?? orgId // Last resort: use orgId as placeholder
    }

    return created.id
  } catch (err) {
    logger.warn('[proactive] Failed to get agent config', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    })
    return orgId // Fallback
  }
}
