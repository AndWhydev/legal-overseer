import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import { createApproval, resolveApproval, getPendingApprovals, expireStaleApprovals } from '@/lib/agent/approval-queue'
import { TEST_ORG_ID, TEST_AGENT_CONFIG_ID, TEST_USER_ID } from '@/lib/__test-helpers__/supabase-integration'

const { dispatchNotificationMock } = vi.hoisted(() => ({
  dispatchNotificationMock: vi.fn().mockResolvedValue({
    dashboard: true,
    whatsapp: false,
    email: false,
  }),
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  dispatchNotification: dispatchNotificationMock,
}))

afterEach(() => vi.restoreAllMocks())
beforeEach(() => {
  dispatchNotificationMock.mockClear()
})

/**
 * End-to-end approval flow integration test.
 * Tests: create -> queue -> approve -> verify status transitions.
 * Uses mock Supabase with in-memory state tracking.
 */

describe('Approval Flow Integration', () => {
  it('creates an approval and resolves it as approved', async () => {
    // Build a supabase mock that returns inserted records properly
    const insertedApprovals: Record<string, unknown>[] = []
    const supabase = {
      from(table: string) {
        if (table === 'approval_queue') {
          return {
            insert(payload: Record<string, unknown>) {
              const record = {
                id: `approval-${insertedApprovals.length + 1}`,
                ...payload,
                status: 'pending',
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
                agent_configs: { name: 'Test Agent' },
              }
              insertedApprovals.push(record)
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: record, error: null }),
                }),
              }
            },
            select(_cols?: string) {
              const filters: Record<string, unknown> = {}
              return {
                eq(k: string, v: unknown) { filters[k] = v; return this },
                order() { return this },
                range() { return this },
                single() {
                  const match = insertedApprovals.find(a =>
                    Object.entries(filters).every(([fk, fv]) => (a as any)[fk] === fv),
                  )
                  return Promise.resolve({ data: match ?? null, error: match ? null : { message: 'Not found' } })
                },
                then(resolve: (v: unknown) => void) {
                  const filtered = insertedApprovals.filter(a =>
                    Object.entries(filters).every(([fk, fv]) => (a as any)[fk] === fv),
                  )
                  return resolve({ data: filtered, error: null })
                },
              }
            },
            update(patch: Record<string, unknown>) {
              const filters: Record<string, unknown> = {}
              return {
                eq(k: string, v: unknown) {
                  filters[k] = v
                  return this
                },
                select() {
                  return {
                    single() {
                      const idx = insertedApprovals.findIndex(a =>
                        Object.entries(filters).every(([fk, fv]) => (a as any)[fk] === fv),
                      )
                      if (idx >= 0) {
                        insertedApprovals[idx] = { ...insertedApprovals[idx], ...patch }
                        return Promise.resolve({ data: insertedApprovals[idx], error: null })
                      }
                      return Promise.resolve({ data: null, error: { message: 'Not found' } })
                    },
                  }
                },
              }
            },
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    } as any

    // 1. Create approval
    const approval = await createApproval(supabase, {
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'send_email',
      action_payload: { to: 'alice@example.com', subject: 'Follow up' },
      action_summary: 'Send proposal follow-up to Alice',
      confidence_score: 0.7,
      routing_decision: 'ask',
      priority: 'normal',
    })

    expect(approval.id).toBeDefined()
    expect(approval.status).toBe('pending')
    expect(approval.action_type).toBe('send_email')
    expect(dispatchNotificationMock).toHaveBeenCalledTimes(1)
    expect(dispatchNotificationMock).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        orgId: TEST_ORG_ID,
        type: 'approval_needed',
        urgency: 'normal',
        metadata: expect.objectContaining({
          approvalId: approval.id,
          actionType: 'send_email',
        }),
      }),
    )

    // 2. Resolve as approved
    const resolved = await resolveApproval(
      supabase,
      approval.id,
      'approved',
      TEST_USER_ID,
      'dashboard',
    )

    expect(resolved.status).toBe('approved')
    expect(resolved.resolved_by).toBe(TEST_USER_ID)
    expect(resolved.resolved_via).toBe('dashboard')
  })

  it('rejects an approval', async () => {
    const approvals: Record<string, unknown>[] = []
    const supabase = {
      from(table: string) {
        return {
          insert(payload: Record<string, unknown>) {
            const record = { id: 'a-1', ...payload, status: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 86400000).toISOString(), agent_configs: { name: 'Agent' } }
            approvals.push(record)
            return { select: () => ({ single: () => Promise.resolve({ data: record, error: null }) }) }
          },
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(k: string, v: unknown) { filters[k] = v; return this },
              single() {
                const match = approvals.find(a => Object.entries(filters).every(([fk, fv]) => (a as any)[fk] === fv))
                return Promise.resolve({ data: match, error: match ? null : { message: 'Not found' } })
              },
            }
          },
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            return {
              eq(k: string, v: unknown) { filters[k] = v; return this },
              select: () => ({
                single() {
                  const idx = approvals.findIndex(a => Object.entries(filters).every(([fk, fv]) => (a as any)[fk] === fv))
                  if (idx >= 0) approvals[idx] = { ...approvals[idx], ...patch }
                  return Promise.resolve({ data: idx >= 0 ? approvals[idx] : null, error: idx >= 0 ? null : { message: 'Not found' } })
                },
              }),
            }
          },
        }
      },
    } as any

    const approval = await createApproval(supabase, {
      org_id: TEST_ORG_ID,
      agent_config_id: TEST_AGENT_CONFIG_ID,
      action_type: 'send_email',
      action_summary: 'Test action',
      confidence_score: 0.6,
      routing_decision: 'ask',
    })

    const rejected = await resolveApproval(supabase, approval.id, 'rejected', TEST_USER_ID, 'whatsapp')
    expect(rejected.status).toBe('rejected')
    expect(rejected.resolved_via).toBe('whatsapp')
    expect(dispatchNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('throws when resolving already-resolved approval', async () => {
    const supabase = {
      from() {
        return {
          select() {
            return {
              eq: function() { return this },
              single: () => Promise.resolve({ data: { id: 'a-1', status: 'approved' }, error: null }),
            }
          },
        }
      },
    } as any

    await expect(resolveApproval(supabase, 'a-1', 'approved', 'user-1', 'dashboard'))
      .rejects.toThrow('APPROVAL_ALREADY_RESOLVED')
  })

  it('lists pending approvals sorted by priority then creation time', async () => {
    const approvals: Record<string, unknown>[] = [
      { id: 'low-old', org_id: TEST_ORG_ID, status: 'pending', priority: 'low', created_at: '2026-03-01T09:00:00.000Z', action_type: 'send_email', agent_configs: { name: 'Agent' } },
      { id: 'urgent-new', org_id: TEST_ORG_ID, status: 'pending', priority: 'urgent', created_at: '2026-03-01T11:00:00.000Z', action_type: 'send_email', agent_configs: { name: 'Agent' } },
      { id: 'normal-old', org_id: TEST_ORG_ID, status: 'pending', priority: 'normal', created_at: '2026-03-01T08:00:00.000Z', action_type: 'send_email', agent_configs: { name: 'Agent' } },
      { id: 'urgent-old', org_id: TEST_ORG_ID, status: 'pending', priority: 'urgent', created_at: '2026-03-01T07:00:00.000Z', action_type: 'send_email', agent_configs: { name: 'Agent' } },
      { id: 'resolved', org_id: TEST_ORG_ID, status: 'approved', priority: 'urgent', created_at: '2026-03-01T06:00:00.000Z', action_type: 'send_email', agent_configs: { name: 'Agent' } },
    ]

    const supabase = {
      from(table: string) {
        if (table !== 'approval_queue') throw new Error(`Unexpected table: ${table}`)

        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              order() { return this },
              range() { return this },
              then(resolve: (value: unknown) => void) {
                const rows = approvals.filter((row) =>
                  Object.entries(filters).every(([k, v]) => (row as any)[k] === v),
                )
                return resolve({ data: rows, error: null })
              },
            }
          },
        }
      },
    } as any

    const pending = await getPendingApprovals(supabase, TEST_ORG_ID)
    expect(pending.map((row) => row.id)).toEqual([
      'urgent-old',
      'urgent-new',
      'normal-old',
      'low-old',
    ])
  })

  it('expires only stale pending approvals for the target org', async () => {
    const approvals: Record<string, unknown>[] = [
      { id: 'exp-1', org_id: TEST_ORG_ID, status: 'pending', expires_at: '2026-03-01T00:00:00.000Z' },
      { id: 'future-1', org_id: TEST_ORG_ID, status: 'pending', expires_at: '2026-12-01T00:00:00.000Z' },
      { id: 'other-org', org_id: 'org-other', status: 'pending', expires_at: '2026-03-01T00:00:00.000Z' },
      { id: 'already-approved', org_id: TEST_ORG_ID, status: 'approved', expires_at: '2026-03-01T00:00:00.000Z' },
    ]

    const supabase = {
      from(table: string) {
        if (table !== 'approval_queue') throw new Error(`Unexpected table: ${table}`)

        return {
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              lt(key: string, value: unknown) {
                filters[`lt:${key}`] = value
                return this
              },
              select() {
                const rows = approvals.filter((row) => {
                  if (filters.org_id && row.org_id !== filters.org_id) return false
                  if (filters.status && row.status !== filters.status) return false
                  const threshold = String(filters['lt:expires_at'] ?? '')
                  if (threshold && String(row.expires_at) >= threshold) return false
                  return true
                })

                for (const row of rows) {
                  Object.assign(row, patch)
                }

                return Promise.resolve({
                  data: rows.map((row) => ({ id: row.id })),
                  error: null,
                })
              },
            }
          },
        }
      },
    } as any

    const expired = await expireStaleApprovals(supabase, TEST_ORG_ID)
    expect(expired).toBe(1)
    expect(approvals.find((row) => row.id === 'exp-1')?.status).toBe('auto_expired')
    expect(approvals.find((row) => row.id === 'future-1')?.status).toBe('pending')
    expect(approvals.find((row) => row.id === 'other-org')?.status).toBe('pending')
  })
})
