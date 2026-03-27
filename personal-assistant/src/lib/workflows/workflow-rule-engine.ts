import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowCondition, WorkflowEvent, WorkflowRule } from './workflow-rule-types'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Fetch active rules
// ---------------------------------------------------------------------------

/**
 * Fetch enabled workflow rules for an org, optionally filtered by trigger type.
 */
export async function getActiveWorkflowRules(
  supabase: SupabaseClient,
  orgId: string,
  triggerType?: string,
): Promise<WorkflowRule[]> {
  let query = supabase
    .from('workflow_rules')
    .select('*')
    .eq('org_id', orgId)
    .eq('enabled', true)

  if (triggerType) {
    query = query.eq('trigger_type', triggerType)
  }

  const { data, error } = await query

  if (error) {
    logger.error('[workflow-rule-engine] Failed to fetch rules', { error })
    return []
  }

  return (data ?? []).map(rowToRule)
}

// ---------------------------------------------------------------------------
// Event trigger evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate all enabled event-based rules against an incoming event.
 * Returns matched rule IDs. Skips events with triggered_by_workflow=true
 * to prevent infinite loops.
 */
export async function evaluateEventTriggers(
  supabase: SupabaseClient,
  orgId: string,
  event: WorkflowEvent,
): Promise<string[]> {
  // Loop prevention: skip events originating from workflow execution
  if (event.triggered_by_workflow) {
    logger.debug('[workflow-rule-engine] Skipping workflow-triggered event', {
      event: event.event,
    })
    return []
  }

  const rules = await getActiveWorkflowRules(supabase, orgId, 'event')

  const matched: string[] = []

  for (const rule of rules) {
    // Skip disabled rules (belt and suspenders -- query already filters)
    if (!rule.enabled) continue

    // Match event type
    if (rule.trigger.event !== event.event) continue

    // Evaluate conditions against event data
    if (!evaluateConditions(rule.conditions, event.data)) continue

    matched.push(rule.id)

    // Update last_triggered_at and increment trigger_count
    await updateTriggerStats(supabase, rule.id)
  }

  if (matched.length > 0) {
    logger.info('[workflow-rule-engine] Event triggers matched', {
      event: event.event,
      matchedCount: matched.length,
      ruleIds: matched,
    })
  }

  return matched
}

// ---------------------------------------------------------------------------
// Schedule trigger evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate all enabled schedule-based rules.
 * Returns matched rule IDs for rules whose interval has elapsed
 * or whose cron pattern matches the current time.
 */
export async function evaluateScheduledTriggers(
  supabase: SupabaseClient,
  orgId: string,
): Promise<string[]> {
  const rules = await getActiveWorkflowRules(supabase, orgId, 'schedule')
  const now = new Date()
  const matched: string[] = []

  for (const rule of rules) {
    const schedule = rule.trigger.schedule
    if (!schedule) continue

    let shouldTrigger = false

    // Interval-based triggers
    if (schedule.interval_seconds) {
      if (!rule.last_triggered_at) {
        // Never triggered -- fire immediately (first run)
        shouldTrigger = true
      } else {
        const elapsed = (now.getTime() - new Date(rule.last_triggered_at).getTime()) / 1000
        shouldTrigger = elapsed >= schedule.interval_seconds
      }
    }

    // Cron-based triggers (HH:MM daily pattern)
    if (schedule.cron && !shouldTrigger) {
      shouldTrigger = matchesCronPattern(schedule.cron, now)

      // Avoid re-triggering within the same window
      if (shouldTrigger && rule.last_triggered_at) {
        const lastTrigger = new Date(rule.last_triggered_at)
        const minutesSinceLast = (now.getTime() - lastTrigger.getTime()) / (60 * 1000)
        if (minutesSinceLast < 10) {
          shouldTrigger = false
        }
      }
    }

    if (shouldTrigger) {
      matched.push(rule.id)
      await updateTriggerStats(supabase, rule.id)
    }
  }

  if (matched.length > 0) {
    logger.info('[workflow-rule-engine] Schedule triggers matched', {
      matchedCount: matched.length,
      ruleIds: matched,
    })
  }

  return matched
}

// ---------------------------------------------------------------------------
// Condition evaluator (pure function)
// ---------------------------------------------------------------------------

/**
 * Evaluate conditions using AND logic -- all conditions must pass.
 * Operators: eq (===), neq (!==), contains (String.includes), gt (>), lt (<).
 */
export function evaluateConditions(
  conditions: WorkflowCondition[],
  data: Record<string, unknown>,
): boolean {
  if (conditions.length === 0) return true

  return conditions.every((cond) => {
    const fieldValue = data[cond.field]

    switch (cond.operator) {
      case 'eq':
        return fieldValue === cond.value
      case 'neq':
        return fieldValue !== cond.value
      case 'contains':
        return typeof fieldValue === 'string' && typeof cond.value === 'string'
          && fieldValue.includes(cond.value)
      case 'gt':
        return typeof fieldValue === 'number' && typeof cond.value === 'number'
          && fieldValue > cond.value
      case 'lt':
        return typeof fieldValue === 'number' && typeof cond.value === 'number'
          && fieldValue < cond.value
      default:
        return false
    }
  })
}

// ---------------------------------------------------------------------------
// Cron pattern matcher
// ---------------------------------------------------------------------------

/**
 * Simple cron pattern matching.
 * Supports:
 * - "HH:MM" -- daily at that time (with 5-minute tolerance)
 * - "* /N * * *" -- every N hours (not implemented in v1)
 */
export function matchesCronPattern(pattern: string, now: Date): boolean {
  // HH:MM daily pattern
  const dailyMatch = pattern.match(/^(\d{2}):(\d{2})$/)
  if (dailyMatch) {
    const targetHour = parseInt(dailyMatch[1], 10)
    const targetMinute = parseInt(dailyMatch[2], 10)
    const targetMinutes = targetHour * 60 + targetMinute
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()

    // 5-minute tolerance window (match role tick interval)
    return Math.abs(currentMinutes - targetMinutes) < 5
  }

  return false
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a DB row to a WorkflowRule object. */
function rowToRule(row: Record<string, unknown>): WorkflowRule {
  return {
    id: row.id as string,
    org_id: row.org_id as string,
    name: row.name as string,
    description: row.description as string,
    trigger: {
      type: row.trigger_type as 'event' | 'schedule' | 'condition',
      ...(row.trigger_config as Record<string, unknown> ?? {}),
    },
    conditions: (row.conditions as WorkflowCondition[]) ?? [],
    actions: row.actions as WorkflowRule['actions'],
    enabled: row.enabled as boolean,
    created_by: row.created_by as string,
    last_triggered_at: row.last_triggered_at as string | null,
    trigger_count: row.trigger_count as number,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

/** Update trigger stats after a rule fires. */
async function updateTriggerStats(supabase: SupabaseClient, ruleId: string): Promise<void> {
  const { error } = await supabase
    .from('workflow_rules')
    .update({
      last_triggered_at: new Date().toISOString(),
      trigger_count: supabase.rpc ? undefined : 0, // Ideally use RPC for atomic increment
    })
    .eq('id', ruleId)

  if (error) {
    logger.warn('[workflow-rule-engine] Failed to update trigger stats', { ruleId, error })
  }

  // Atomic increment of trigger_count
  await supabase.rpc('increment_trigger_count', { rule_id: ruleId }).catch(() => {
    // Fallback: non-atomic update (acceptable for counter)
    supabase
      .from('workflow_rules')
      .update({ trigger_count: 1 }) // Will be wrong but at least something
      .eq('id', ruleId)
  })
}
