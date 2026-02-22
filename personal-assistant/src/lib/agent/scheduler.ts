import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentSchedule } from '@/lib/bitbit-core'
import { logAgentRun } from './run-logger'
import { runLeadSwarmTick } from './lead-swarm'
import { runInvoiceFlowTick } from './invoice-flow'
import { runSentryTick } from './sentry'
import { processSentryEscalations } from './sentry-escalation'

/**
 * Result of checking one agent's schedule.
 */
export interface AgentScheduleResult {
  agentType: string
  orgId: string
  triggered: boolean
  reason: 'due' | 'not_due' | 'disabled' | 'already_running'
  lastRunAt?: string
  nextDueAt?: string
}

// ---------------------------------------------------------------------------
// Minimal cron parser (5-field: min hour dom month dow)
// Supports: *, */N, specific numbers
// ---------------------------------------------------------------------------

function matchCronField(field: string, value: number): boolean {
  if (field === '*') return true
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10)
    if (isNaN(step) || step <= 0) return false
    return value % step === 0
  }
  const num = parseInt(field, 10)
  return !isNaN(num) && num === value
}

function matchesCron(expression: string, now: Date): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false

  const [minF, hourF, domF, monF, dowF] = parts
  const minute = now.getMinutes()
  const hour = now.getHours()
  const dom = now.getDate()
  const month = now.getMonth() + 1 // 1-12
  const dow = now.getDay() // 0=Sun

  return (
    matchCronField(minF, minute) &&
    matchCronField(hourF, hour) &&
    matchCronField(domF, dom) &&
    matchCronField(monF, month) &&
    matchCronField(dowF, dow)
  )
}

// ---------------------------------------------------------------------------
// shouldRunAgent -- pure function, no DB
// ---------------------------------------------------------------------------

/**
 * Determine whether an agent should run based on its schedule config
 * and last run time. Pure function -- no side effects.
 */
export function shouldRunAgent(
  schedule: AgentSchedule,
  lastRunAt: Date | null,
  now: Date,
): boolean {
  switch (schedule.type) {
    case 'continuous':
      return true

    case 'interval': {
      const intervalMs = (schedule.interval_seconds ?? 300) * 1000
      if (!lastRunAt) return true
      return now.getTime() - lastRunAt.getTime() >= intervalMs
    }

    case 'cron': {
      if (!schedule.cron_expression) return false
      return matchesCron(schedule.cron_expression, now)
    }

    default:
      return false
  }
}

// ---------------------------------------------------------------------------
// runScheduledAgents -- checks all agents, triggers those due
// ---------------------------------------------------------------------------

/**
 * Scheduler tick: query enabled agent configs, check which are due,
 * insert placeholder agent_runs for triggered agents.
 *
 * This is a stateless tick function -- no loop, no sleep.
 * The loop is handled by the cron caller (Vercel cron or external).
 */
export async function runScheduledAgents(
  supabase: SupabaseClient,
  orgId?: string,
): Promise<AgentScheduleResult[]> {
  // 1. Fetch enabled agent configs
  let query = supabase
    .from('agent_configs')
    .select('id, org_id, agent_type, schedule, enabled')
    .eq('enabled', true)

  if (orgId) {
    query = query.eq('org_id', orgId)
  }

  const { data: configs, error: configError } = await query

  if (configError) {
    console.error('[scheduler] Failed to fetch agent configs:', configError.message)
    return []
  }

  if (!configs || configs.length === 0) return []

  const now = new Date()
  const results: AgentScheduleResult[] = []
  const processedSentryOrgs = new Set<string>()
  const processedLeadSwarmOrgs = new Set<string>()
  const processedInvoiceFlowOrgs = new Set<string>()

  for (const config of configs) {
    const schedule = config.schedule as AgentSchedule | null
    if (!schedule) {
      results.push({
        agentType: config.agent_type,
        orgId: config.org_id,
        triggered: false,
        reason: 'not_due',
      })
      continue
    }

    // 2. Get last run time
    const { data: lastRuns } = await supabase
      .from('agent_runs')
      .select('created_at')
      .eq('agent_config_id', config.id)
      .eq('org_id', config.org_id)
      .order('created_at', { ascending: false })
      .limit(1)

    const lastRunAt = lastRuns?.[0]?.created_at ? new Date(lastRuns[0].created_at) : null

    // 3. Check if due
    const due = shouldRunAgent(schedule, lastRunAt, now)

    if (!due) {
      results.push({
        agentType: config.agent_type,
        orgId: config.org_id,
        triggered: false,
        reason: 'not_due',
        lastRunAt: lastRunAt?.toISOString(),
      })
      continue
    }

    let outputSummary = 'pending'

    if (config.agent_type === 'sentry') {
      if (processedSentryOrgs.has(config.org_id)) {
        results.push({
          agentType: config.agent_type,
          orgId: config.org_id,
          triggered: false,
          reason: 'already_running',
          lastRunAt: lastRunAt?.toISOString(),
        })
        continue
      }

      processedSentryOrgs.add(config.org_id)

      try {
        const sentryResult = await runSentryTick(supabase, config.org_id, config.id)
        const escalationResult = await processSentryEscalations(supabase, config.org_id)
        outputSummary =
          `sentry processed=${sentryResult.processed} triggered=${sentryResult.triggered} ` +
          `alerts=${sentryResult.alertsCreated} escalated=${escalationResult.escalated} failed=${escalationResult.failed}`
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        outputSummary = `sentry error=${message}`
      }
    } else if (config.agent_type === 'lead-swarm') {
      if (processedLeadSwarmOrgs.has(config.org_id)) {
        results.push({
          agentType: config.agent_type,
          orgId: config.org_id,
          triggered: false,
          reason: 'already_running',
          lastRunAt: lastRunAt?.toISOString(),
        })
        continue
      }

      processedLeadSwarmOrgs.add(config.org_id)

      try {
        const leadResult = await runLeadSwarmTick(supabase, config.org_id, config.id)
        outputSummary =
          `lead-swarm processed=${leadResult.processed} created=${leadResult.created} ` +
          `qualified=${leadResult.qualified} hot=${leadResult.hot} failed=${leadResult.failed}`
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        outputSummary = `lead-swarm error=${message}`
      }
    } else if (config.agent_type === 'invoice-flow') {
      if (processedInvoiceFlowOrgs.has(config.org_id)) {
        results.push({
          agentType: config.agent_type,
          orgId: config.org_id,
          triggered: false,
          reason: 'already_running',
          lastRunAt: lastRunAt?.toISOString(),
        })
        continue
      }

      processedInvoiceFlowOrgs.add(config.org_id)

      try {
        const invoiceResult = await runInvoiceFlowTick(supabase, config.org_id, config.id)
        outputSummary =
          `invoice-flow processed=${invoiceResult.processed} created=${invoiceResult.created} ` +
          `duplicates=${invoiceResult.duplicatesBlocked} sent=${invoiceResult.sent} overdue=${invoiceResult.overdue} failed=${invoiceResult.failed}`
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        outputSummary = `invoice-flow error=${message}`
      }
    }

    // 4. Record scheduler run
    await logAgentRun(supabase, {
      org_id: config.org_id,
      agent_config_id: config.id,
      trigger_type: 'scheduled',
      input_summary: `Scheduled tick at ${now.toISOString()}`,
      output_summary: outputSummary,
      actions_taken: [],
      tools_called: [],
      model_used: 'haiku',
      tokens_in: 0,
      tokens_out: 0,
      confidence_score: 0,
      routing_decision: 'act',
      duration_ms: 0,
    })

    results.push({
      agentType: config.agent_type,
      orgId: config.org_id,
      triggered: true,
      reason: 'due',
      lastRunAt: lastRunAt?.toISOString(),
    })
  }

  return results
}
