import type { SupabaseClient } from '@supabase/supabase-js'

type SentryIssueType = 'error_keyword' | 'uptime' | 'negative_sentiment'
type SentrySeverity = 'low' | 'medium' | 'high' | 'critical'

export interface SentryWatch {
  id: string
  org_id: string
  agent_config_id?: string | null
  watch_type: string
  description: string
  conditions: Record<string, unknown>
  interval_seconds: number
  escalation_minutes?: number
  last_checked_at?: string | null
  next_check_at?: string | null
  status: 'active' | 'paused' | 'triggered' | 'expired'
}

export interface WatchEvaluation {
  triggered: boolean
  issueType: SentryIssueType
  severity: SentrySeverity
  summary: string
  evidence: Record<string, unknown>
}

export interface SentryTickResult {
  processed: number
  triggered: number
  alertsCreated: number
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter(Boolean)
}

function isWatchDue(watch: SentryWatch, now: Date): boolean {
  if (watch.next_check_at) {
    const nextCheck = new Date(watch.next_check_at)
    return !Number.isNaN(nextCheck.getTime()) && nextCheck.getTime() <= now.getTime()
  }

  if (!watch.last_checked_at) return true

  const lastChecked = new Date(watch.last_checked_at)
  if (Number.isNaN(lastChecked.getTime())) return true

  const intervalMs = Math.max(1, watch.interval_seconds || 300) * 1000
  return lastChecked.getTime() + intervalMs <= now.getTime()
}

function checkedSince(watch: SentryWatch, now: Date): string {
  if (watch.last_checked_at) return watch.last_checked_at
  const lookbackMs = Math.max(60, watch.interval_seconds || 300) * 1000
  return new Date(now.getTime() - lookbackMs).toISOString()
}

export function buildRemediationSuggestion(
  issueType: SentryIssueType,
  evidence: Record<string, unknown>,
): string {
  if (issueType === 'uptime') {
    const status = typeof evidence.status === 'number' ? evidence.status : null
    const url = typeof evidence.url === 'string' ? evidence.url : 'endpoint'
    if (status && status >= 500) {
      return `Check deployment health for ${url}, inspect recent release logs, and roll back the latest deploy if errors persist.`
    }
    return `Verify ${url} reachability, inspect service health checks, and restart the affected service if the outage continues.`
  }

  if (issueType === 'error_keyword') {
    const keywords = Array.isArray(evidence.keywords) ? evidence.keywords.join(', ') : 'error keywords'
    return `Inspect logs for ${keywords}, identify the failing subsystem, and restart impacted workers after applying the immediate fix.`
  }

  return 'Acknowledge the client concern, reply with a recovery plan, and assign a follow-up owner to close the issue.'
}

async function evaluateErrorKeywordWatch(
  supabase: SupabaseClient,
  watch: SentryWatch,
  now: Date,
): Promise<WatchEvaluation> {
  const keywords = parseStringList(watch.conditions.keywords)
  const activeKeywords = keywords.length > 0 ? keywords : ['error', 'failed', 'exception', 'down']

  const since = checkedSince(watch, now)
  const { data, error } = await supabase
    .from('channel_messages')
    .select('id, subject, body, received_at')
    .eq('org_id', watch.org_id)
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(100)

  if (error || !data) {
    return {
      triggered: false,
      issueType: 'error_keyword',
      severity: 'low',
      summary: 'No recent error keyword evidence found.',
      evidence: { reason: error?.message ?? 'no_data' },
    }
  }

  const matches = data.filter((message) => {
    const subject = String(message.subject ?? '').toLowerCase()
    const body = String(message.body ?? '').toLowerCase()
    return activeKeywords.some((kw) => subject.includes(kw) || body.includes(kw))
  })

  if (matches.length === 0) {
    return {
      triggered: false,
      issueType: 'error_keyword',
      severity: 'low',
      summary: 'No recent error keyword evidence found.',
      evidence: { keywords: activeKeywords, matchCount: 0 },
    }
  }

  return {
    triggered: true,
    issueType: 'error_keyword',
    severity: matches.length >= 3 ? 'high' : 'medium',
    summary: `Detected ${matches.length} recent message(s) matching error keywords.`,
    evidence: {
      keywords: activeKeywords,
      matchCount: matches.length,
      messageIds: matches.map((match) => match.id),
    },
  }
}

async function evaluateUptimeWatch(
  _supabase: SupabaseClient,
  watch: SentryWatch,
): Promise<WatchEvaluation> {
  const url = typeof watch.conditions.url === 'string' ? watch.conditions.url : ''
  if (!url) {
    return {
      triggered: false,
      issueType: 'uptime',
      severity: 'low',
      summary: 'No uptime URL configured.',
      evidence: { reason: 'missing_url' },
    }
  }

  const timeoutMs =
    typeof watch.conditions.timeout_ms === 'number' && watch.conditions.timeout_ms > 0
      ? watch.conditions.timeout_ms
      : 5000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    if (response.ok) {
      return {
        triggered: false,
        issueType: 'uptime',
        severity: 'low',
        summary: `Endpoint healthy (${response.status}).`,
        evidence: { url, status: response.status },
      }
    }

    return {
      triggered: true,
      issueType: 'uptime',
      severity: response.status >= 500 ? 'critical' : 'high',
      summary: `Endpoint unhealthy (${response.status}).`,
      evidence: { url, status: response.status },
    }
  } catch (error) {
    return {
      triggered: true,
      issueType: 'uptime',
      severity: 'critical',
      summary: 'Endpoint timeout or request failure.',
      evidence: { url, timeoutMs, error: (error as Error).message },
    }
  } finally {
    clearTimeout(timer)
  }
}

async function evaluateNegativeSentimentWatch(
  supabase: SupabaseClient,
  watch: SentryWatch,
  now: Date,
): Promise<WatchEvaluation> {
  const configuredPatterns = parseStringList(watch.conditions.patterns)
  const patterns =
    configuredPatterns.length > 0
      ? configuredPatterns
      : ['refund', 'cancel', 'angry', 'urgent issue', 'unacceptable', 'disappointed']

  const since = checkedSince(watch, now)
  const { data, error } = await supabase
    .from('channel_messages')
    .select('id, sender, subject, body, received_at')
    .eq('org_id', watch.org_id)
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(100)

  if (error || !data) {
    return {
      triggered: false,
      issueType: 'negative_sentiment',
      severity: 'low',
      summary: 'No negative sentiment evidence found.',
      evidence: { reason: error?.message ?? 'no_data' },
    }
  }

  const matches = data.filter((message) => {
    const sender = String(message.sender ?? '').toLowerCase()
    const text = `${String(message.subject ?? '')} ${String(message.body ?? '')}`.toLowerCase()
    const likelyInbound = sender.length > 0
    return likelyInbound && patterns.some((pattern) => text.includes(pattern))
  })

  if (matches.length === 0) {
    return {
      triggered: false,
      issueType: 'negative_sentiment',
      severity: 'low',
      summary: 'No negative sentiment evidence found.',
      evidence: { patterns, matchCount: 0 },
    }
  }

  return {
    triggered: true,
    issueType: 'negative_sentiment',
    severity: matches.length >= 2 ? 'high' : 'medium',
    summary: `Detected ${matches.length} message(s) with negative sentiment patterns.`,
    evidence: {
      patterns,
      matchCount: matches.length,
      messageIds: matches.map((match) => match.id),
    },
  }
}

export async function evaluateWatch(
  supabase: SupabaseClient,
  watch: SentryWatch,
  now: Date,
): Promise<WatchEvaluation> {
  switch (watch.watch_type) {
    case 'error_keyword':
      return evaluateErrorKeywordWatch(supabase, watch, now)
    case 'uptime':
      return evaluateUptimeWatch(supabase, watch)
    case 'negative_sentiment':
      return evaluateNegativeSentimentWatch(supabase, watch, now)
    default:
      return {
        triggered: false,
        issueType: 'error_keyword',
        severity: 'low',
        summary: `Unsupported watch type: ${watch.watch_type}`,
        evidence: { watchType: watch.watch_type },
      }
  }
}

export async function runSentryTick(
  supabase: SupabaseClient,
  orgId: string,
  agentConfigId: string,
): Promise<SentryTickResult> {
  const now = new Date()

  const { data: watches, error } = await supabase
    .from('watches')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'active')

  if (error || !watches) {
    return { processed: 0, triggered: 0, alertsCreated: 0 }
  }

  const dueWatches = (watches as SentryWatch[]).filter((watch) => isWatchDue(watch, now))

  let triggeredCount = 0
  let alertsCreated = 0

  for (const watch of dueWatches) {
    const evaluation = await evaluateWatch(supabase, watch, now)

    const intervalSeconds = Math.max(1, watch.interval_seconds || 300)
    const nextCheckAt = new Date(now.getTime() + intervalSeconds * 1000).toISOString()

    const watchPatch: Record<string, unknown> = {
      last_checked_at: now.toISOString(),
      next_check_at: nextCheckAt,
      status: evaluation.triggered ? 'triggered' : 'active',
    }

    if (evaluation.triggered) {
      triggeredCount += 1
      watchPatch.last_triggered_at = now.toISOString()

      // Dedup: skip creating a new alert if one already exists for this
      // watch that is still pending or escalated (not yet acknowledged/resolved).
      const { data: existingAlert } = await supabase
        .from('sentry_alerts')
        .select('id')
        .eq('watch_id', watch.id)
        .eq('org_id', watch.org_id)
        .in('status', ['pending', 'escalated'])
        .is('acknowledged_at', null)
        .limit(1)
        .maybeSingle()

      if (!existingAlert) {
        const escalationMinutes = Math.max(1, watch.escalation_minutes ?? 15)
        const nextEscalationAt = new Date(now.getTime() + escalationMinutes * 60 * 1000).toISOString()

        const { error: alertError } = await supabase.from('sentry_alerts').insert({
          org_id: watch.org_id,
          watch_id: watch.id,
          agent_config_id: agentConfigId,
          issue_type: evaluation.issueType,
          severity: evaluation.severity,
          issue_summary: evaluation.summary,
          evidence: evaluation.evidence,
          remediation_suggestion: buildRemediationSuggestion(evaluation.issueType, evaluation.evidence),
          status: 'pending',
          escalation_count: 0,
          next_escalation_at: nextEscalationAt,
        })

        if (!alertError) {
          alertsCreated += 1
        }
      }
    }

    await supabase
      .from('watches')
      .update(watchPatch)
      .eq('id', watch.id)
      .eq('org_id', watch.org_id)
  }

  return {
    processed: dueWatches.length,
    triggered: triggeredCount,
    alertsCreated,
  }
}
