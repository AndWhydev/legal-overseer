import type { SupabaseClient } from '@supabase/supabase-js'
import type { AgentSchedule } from '@/lib/bitbit-core'
import { logAgentRun } from './run-logger'
import { runLeadSwarmTick } from './lead-swarm'
import { runInvoiceFlowTick } from './invoice-flow'
import { runSentryTick } from './sentry'
import { processSentryEscalations } from './sentry-escalation'
import { runTriage } from './channel-triage'
import { runClientCommsTick } from './client-comms'
import { runProposalBotTick } from './proposal-bot'
import { runOnboardingTick } from './client-onboarding'
import { runAdScriptGenTick } from './ad-script-gen'
import { runAISearchTick } from './ai-search-optimizer'
import { runTenderHunterTick } from './tender-hunter'
import { runQuoteBotTick } from './quote-bot'
import { runJobReminderTick } from './job-reminder'
import { canProceed } from './cost-guard'
import { logAuditEvent } from '@/lib/audit/logger'
import { withCircuitBreaker } from './circuit-breaker'
import { withRetry, isTransientError } from './retry'
import { deadLetter } from './dead-letter'
import { logger } from '@/lib/core/logger';

// ---------------------------------------------------------------------------
// Experimental agents — gated behind ENABLE_EXPERIMENTAL_AGENTS env var
// ---------------------------------------------------------------------------

const EXPERIMENTAL_AGENTS = new Set([
  'tender-hunter',
  'client-onboarding',
  'job-reminder',
  'ad-script-gen',
  'ai-search-optimizer',
])

function isExperimentalEnabled(): boolean {
  return process.env.ENABLE_EXPERIMENTAL_AGENTS === 'true'
}

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
    logger.error('[scheduler] Failed to fetch agent configs:', configError.message)
    return []
  }

  if (!configs || configs.length === 0) return []

  const now = new Date()
  const results: AgentScheduleResult[] = []
  // Track processed orgs per agent type to prevent duplicate runs in same tick
  const processedOrgs = new Map<string, Set<string>>()

  // Agent dispatch map: agent_type → runner function
  type AgentRunner = (sb: SupabaseClient, orgId: string, configId: string) => Promise<string>

  const agentRunners: Record<string, AgentRunner> = {
    'sentry': async (sb, oid, cid) => {
      const r = await runSentryTick(sb, oid, cid)
      const e = await processSentryEscalations(sb, oid)
      return `sentry processed=${r.processed} triggered=${r.triggered} alerts=${r.alertsCreated} escalated=${e.escalated} silenced=${e.silenced} failed=${e.failed}`
    },
    'lead-swarm': async (sb, oid, cid) => {
      const r = await runLeadSwarmTick(sb, oid, cid)
      return `lead-swarm processed=${r.processed} created=${r.created} qualified=${r.qualified} hot=${r.hot} failed=${r.failed}`
    },
    'invoice-flow': async (sb, oid, cid) => {
      const r = await runInvoiceFlowTick(sb, oid, cid)
      return `invoice-flow processed=${r.processed} created=${r.created} duplicates=${r.duplicatesBlocked} sent=${r.sent} overdue=${r.overdue} failed=${r.failed}`
    },
    'channel-triage': async (sb, oid, _cid) => {
      const r = await runTriage(sb, oid)
      return `channel-triage processed=${r.processed} actionable=${r.actionable} informational=${r.informational} spam=${r.spam} routed=${r.routed.length}`
    },
    'client-comms': async (sb, oid, cid) => {
      const r = await runClientCommsTick(sb, oid, cid)
      return `client-comms processed=${r.processed} drafted=${r.drafted} sent=${r.sent} queued=${r.queued} failed=${r.failed}`
    },
    'proposal-bot': async (sb, oid, cid) => {
      const r = await runProposalBotTick(sb, oid, cid)
      return `proposal-bot processed=${r.processed} follow-ups=${r.followUpsSent} failed=${r.failed}`
    },
    'client-onboarding': async (sb, oid, cid) => {
      const r = await runOnboardingTick(sb, oid, cid)
      return `client-onboarding processed=${r.processed} welcomes=${r.welcomesSent} credential-reminders=${r.credentialReminders} projects=${r.projectsCreated} failed=${r.failed}`
    },
    'ad-script-gen': async (sb, oid, cid) => {
      const r = await runAdScriptGenTick(sb, oid, cid)
      return `ad-script-gen processed=${r.processed} generated=${r.generated} failed=${r.failed}`
    },
    'ai-search-optimizer': async (sb, oid, cid) => {
      const r = await runAISearchTick(sb, oid, cid)
      return `ai-search-optimizer audits=${r.auditsRun} changes=${r.changesDetected} alerts=${r.alertsSent} failed=${r.failed}`
    },
    'tender-hunter': async (sb, oid, cid) => {
      const r = await runTenderHunterTick(sb, oid, cid)
      return `tender-hunter scanned=${r.scanned} new=${r.newTenders} evaluated=${r.evaluated} errors=${r.errors}`
    },
    'quote-bot': async (sb, oid, cid) => {
      const r = await runQuoteBotTick(sb, oid, cid)
      return `quote-bot processed=${r.processed} drafted=${r.drafted} failed=${r.failed}`
    },
    'job-reminder': async (sb, oid, cid) => {
      const r = await runJobReminderTick(sb, oid, cid)
      return `job-reminder processed=${r.processed} remindersSent=${r.remindersSent} followUpsSent=${r.followUpsSent} failed=${r.failed}`
    },
  }

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

    // Cost guard: check daily budget before running agent
    const costCheck = await canProceed(supabase, config.org_id)
    if (!costCheck.allowed) {
      logger.warn(`[scheduler] Cost guard halted ${config.agent_type} for org ${config.org_id}: ${costCheck.reason}`)
      results.push({
        agentType: config.agent_type,
        orgId: config.org_id,
        triggered: false,
        reason: 'not_due',
        lastRunAt: lastRunAt?.toISOString(),
      })
      continue
    }

    // Deduplicate: only run each agent type once per org per tick
    if (!processedOrgs.has(config.agent_type)) {
      processedOrgs.set(config.agent_type, new Set())
    }
    const orgSet = processedOrgs.get(config.agent_type)!
    if (orgSet.has(config.org_id)) {
      results.push({
        agentType: config.agent_type,
        orgId: config.org_id,
        triggered: false,
        reason: 'already_running',
        lastRunAt: lastRunAt?.toISOString(),
      })
      continue
    }
    orgSet.add(config.org_id)

    // Skip experimental agents unless explicitly enabled
    if (EXPERIMENTAL_AGENTS.has(config.agent_type) && !isExperimentalEnabled()) {
      results.push({
        agentType: config.agent_type,
        orgId: config.org_id,
        triggered: false,
        reason: 'disabled',
        lastRunAt: lastRunAt?.toISOString(),
      })
      continue
    }

    let outputSummary = 'pending'
    let runStatus = 'success'
    const circuitKey = `agent:${config.agent_type}:${config.org_id}`
    const runner = agentRunners[config.agent_type]
    const startMs = Date.now()

    if (runner) {
      try {
        // Retry with exponential backoff (max 2 retries), then circuit breaker
        outputSummary = await withCircuitBreaker(circuitKey, () =>
          withRetry(
            () => runner(supabase, config.org_id, config.id),
            { maxRetries: 2, baseDelayMs: 1000, isRetryable: isTransientError },
          ),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown'
        const stack = error instanceof Error ? error.stack : undefined
        outputSummary = `${config.agent_type} error=${message}`
        runStatus = 'failed'

        // Push to dead letter queue for manual review
        await deadLetter(supabase, {
          agent_type: config.agent_type,
          org_id: config.org_id,
          error_message: message,
          error_stack: stack ?? null,
          payload: { agent_config_id: config.id, trigger: 'scheduled' },
          agent_config_id: config.id,
        })
      }
    }

    const durationMs = Date.now() - startMs

    // 4. Record scheduler run
    await logAgentRun(supabase, {
      org_id: config.org_id,
      agent_config_id: config.id,
      trigger_type: 'scheduled',
      status: runStatus,
      result_summary: outputSummary,
      tokens_in: 0,
      tokens_out: 0,
      cost_estimate: 0,
      duration_ms: durationMs,
      tool_calls: 0,
      iterations: 1,
      model_purpose: 'classification',
      error_message: runStatus === 'failed' ? outputSummary : undefined,
    })

    // Audit log: record agent execution
    await logAuditEvent(supabase, {
      orgId: config.org_id,
      actorType: 'cron',
      actorId: `scheduler:${config.agent_type}`,
      action: 'executed',
      entityType: 'task',
      entityId: config.id,
      metadata: { agent_type: config.agent_type, output_summary: outputSummary },
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
