import { describe, expect, it, vi } from 'vitest'
import { acknowledgeSentryAlert, processSentryEscalations } from './sentry-escalation'

interface MockAlert {
  id: string
  org_id: string
  watch_id: string
  agent_config_id: string | null
  issue_type: string
  severity: string
  issue_summary: string
  evidence: Record<string, unknown>
  remediation_suggestion: string
  status: 'pending' | 'escalated' | 'acknowledged' | 'resolved'
  escalation_count: number
  next_escalation_at: string | null
  acknowledged_at: string | null
  watches: { escalation_minutes: number }
}

function createMockSupabase(initialAlerts: MockAlert[]) {
  const state = {
    alerts: [...initialAlerts],
    approvals: [] as Array<Record<string, unknown>>,
  }

  const api = {
    from(table: string) {
      if (table === 'sentry_alerts') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              in(key: string, values: unknown[]) {
                filters[key] = values
                return this
              },
              is(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              lte(key: string, value: unknown) {
                filters[key] = value
                const rows = state.alerts.filter((alert) => {
                  if (filters.org_id && alert.org_id !== String(filters.org_id)) return false
                  const statuses = Array.isArray(filters.status) ? filters.status.map(String) : null
                  if (statuses && !statuses.includes(alert.status)) return false
                  if (filters.acknowledged_at === null && alert.acknowledged_at !== null) return false
                  if (key === 'next_escalation_at') {
                    const threshold = new Date(String(value)).getTime()
                    const scheduled = alert.next_escalation_at
                      ? new Date(alert.next_escalation_at).getTime()
                      : Number.POSITIVE_INFINITY
                    if (scheduled > threshold) return false
                  }
                  return true
                })
                return Promise.resolve({ data: rows, error: null })
              },
              single() {
                const id = filters.id ? String(filters.id) : ''
                const row = state.alerts.find((alert) => alert.id === id)
                if (!row) {
                  return Promise.resolve({ data: null, error: { message: 'not found' } })
                }
                return Promise.resolve({
                  data: {
                    id: row.id,
                    status: row.status,
                    acknowledged_at: row.acknowledged_at,
                  },
                  error: null,
                })
              },
            }
          },
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              is(key: string, value: unknown) {
                filters[key] = value
                const id = filters.id ? String(filters.id) : null
                const orgId = filters.org_id ? String(filters.org_id) : null
                const alert = state.alerts.find(
                  (candidate) =>
                    (id ? candidate.id === id : true) &&
                    (orgId ? candidate.org_id === orgId : true) &&
                    (key === 'acknowledged_at' ? candidate.acknowledged_at === value : true),
                )

                if (!alert) {
                  return Promise.resolve({ data: null, error: { message: 'not found' } })
                }

                Object.assign(alert, patch)
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      }

      if (table === 'approval_queue') {
        return {
          insert(payload: Record<string, unknown>) {
            state.approvals.push(payload)
            return Promise.resolve({ data: null, error: null })
          },
        }
      }

      throw new Error(`Unsupported table: ${table}`)
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
    state,
  }
}

describe('processSentryEscalations', () => {
  it('escalates only due unacknowledged alerts and creates urgent approvals', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T12:00:00.000Z'))

    const { supabase, state } = createMockSupabase([
      {
        id: 'alert-due',
        org_id: 'org-1',
        watch_id: 'watch-1',
        agent_config_id: 'cfg-1',
        issue_type: 'error_keyword',
        severity: 'high',
        issue_summary: 'Checkout errors spiked',
        evidence: { count: 3 },
        remediation_suggestion: 'Roll back latest deploy',
        status: 'pending',
        escalation_count: 0,
        next_escalation_at: '2026-02-22T11:59:00.000Z',
        acknowledged_at: null,
        watches: { escalation_minutes: 10 },
      },
      {
        id: 'alert-future',
        org_id: 'org-1',
        watch_id: 'watch-2',
        agent_config_id: 'cfg-1',
        issue_type: 'uptime',
        severity: 'critical',
        issue_summary: 'Service unavailable',
        evidence: { status: 503 },
        remediation_suggestion: 'Restart service',
        status: 'pending',
        escalation_count: 1,
        next_escalation_at: '2026-02-22T12:30:00.000Z',
        acknowledged_at: null,
        watches: { escalation_minutes: 5 },
      },
      {
        id: 'alert-acked',
        org_id: 'org-1',
        watch_id: 'watch-3',
        agent_config_id: 'cfg-1',
        issue_type: 'negative_sentiment',
        severity: 'medium',
        issue_summary: 'Customer complaint',
        evidence: { sender: 'client@example.com' },
        remediation_suggestion: 'Respond with mitigation plan',
        status: 'escalated',
        escalation_count: 1,
        next_escalation_at: '2026-02-22T11:55:00.000Z',
        acknowledged_at: '2026-02-22T11:56:00.000Z',
        watches: { escalation_minutes: 15 },
      },
    ])

    const result = await processSentryEscalations(supabase, 'org-1')

    expect(result).toEqual({ processed: 1, escalated: 1, failed: 0 })
    expect(state.approvals).toHaveLength(1)
    expect(state.approvals[0].priority).toBe('urgent')

    const escalated = state.alerts.find((alert) => alert.id === 'alert-due')
    expect(escalated?.status).toBe('escalated')
    expect(escalated?.escalation_count).toBe(1)

    vi.useRealTimers()
  })

  it('schedules next escalation using watch escalation_minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-22T13:00:00.000Z'))

    const { supabase, state } = createMockSupabase([
      {
        id: 'alert-window',
        org_id: 'org-1',
        watch_id: 'watch-4',
        agent_config_id: 'cfg-2',
        issue_type: 'uptime',
        severity: 'critical',
        issue_summary: 'Ping failures',
        evidence: { status: 500 },
        remediation_suggestion: 'Scale service',
        status: 'pending',
        escalation_count: 2,
        next_escalation_at: '2026-02-22T12:59:00.000Z',
        acknowledged_at: null,
        watches: { escalation_minutes: 7 },
      },
    ])

    const result = await processSentryEscalations(supabase, 'org-1')

    expect(result.escalated).toBe(1)
    const updated = state.alerts.find((alert) => alert.id === 'alert-window')
    expect(updated?.next_escalation_at).toBe('2026-02-22T13:07:00.000Z')

    vi.useRealTimers()
  })
})

describe('acknowledgeSentryAlert', () => {
  it('acknowledges alert and clears next escalation window', async () => {
    const { supabase, state } = createMockSupabase([
      {
        id: 'alert-1',
        org_id: 'org-1',
        watch_id: 'watch-1',
        agent_config_id: 'cfg-1',
        issue_type: 'error_keyword',
        severity: 'high',
        issue_summary: 'Error spike',
        evidence: {},
        remediation_suggestion: 'Restart queue',
        status: 'pending',
        escalation_count: 0,
        next_escalation_at: '2026-02-22T13:15:00.000Z',
        acknowledged_at: null,
        watches: { escalation_minutes: 10 },
      },
    ])

    const result = await acknowledgeSentryAlert(supabase, 'alert-1', 'user-1')

    expect(result).toEqual({ ok: true, alertId: 'alert-1' })
    expect(state.alerts[0].status).toBe('acknowledged')
    expect(state.alerts[0].next_escalation_at).toBeNull()
  })

  it('returns explicit already-acknowledged error', async () => {
    const { supabase } = createMockSupabase([
      {
        id: 'alert-2',
        org_id: 'org-1',
        watch_id: 'watch-2',
        agent_config_id: 'cfg-1',
        issue_type: 'error_keyword',
        severity: 'high',
        issue_summary: 'Error spike',
        evidence: {},
        remediation_suggestion: 'Restart queue',
        status: 'acknowledged',
        escalation_count: 1,
        next_escalation_at: null,
        acknowledged_at: '2026-02-22T13:00:00.000Z',
        watches: { escalation_minutes: 10 },
      },
    ])

    const result = await acknowledgeSentryAlert(supabase, 'alert-2', 'user-1')
    expect(result).toEqual({ ok: false, error: 'ALREADY_ACKNOWLEDGED' })
  })
})
