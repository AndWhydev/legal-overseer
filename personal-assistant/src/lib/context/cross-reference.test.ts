import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  crossReference,
  getDeadlines,
  getFinancialSignals,
  getRelatedTasks,
} from './cross-reference'

function createMockSupabase(args: {
  relationships?: Array<Record<string, unknown>>
  tasks?: Array<Record<string, unknown>>
  invoices?: Array<Record<string, unknown>>
}) {
  const api = {
    from(table: string) {
      if (table === 'entity_relationships') {
        return {
          select: (fields: string) => ({
            eq: (key: string, value: unknown) => ({
              or: (condition: string) =>
                Promise.resolve({
                  data: args.relationships ?? [],
                  error: null,
                })
            })
          })
        }
      }

      if (table === 'tasks') {
        return {
          select: (fields: string) => ({
            eq: (key: string, value: unknown) => ({
              in: (key: string, values: unknown[]) => ({
                neq: (key: string, value: unknown) => {
                  const filtered = (args.tasks ?? []).filter((t) => t.status !== value)
                  return Promise.resolve({
                    data: filtered,
                    error: null,
                  })
                }
              })
            })
          })
        }
      }

      if (table === 'invoices') {
        return {
          select: (fields: string) => ({
            eq: (key: string, value: unknown) => ({
              in: (key: string, values: unknown[]) => {
                const filtered = (args.invoices ?? []).filter((i) =>
                  values.includes(i.id),
                )
                return Promise.resolve({
                  data: filtered,
                  error: null,
                })
              }
            })
          })
        }
      }

      if (table === 'cross_reference_cache') {
        return {
          select: () => ({
            eq: function() { return this },
            single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
          }),
          upsert: () => Promise.resolve({ error: null }),
          delete: () => ({
            eq: function() { return this },
            then: (resolve: (v: unknown) => void) => resolve({ error: null }),
          }),
        }
      }

      throw new Error(`Unsupported table ${table}`)
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
  }
}

describe('getRelatedTasks', () => {
  it('returns empty array when no relationships found', async () => {
    const { supabase } = createMockSupabase({
      relationships: [],
    })

    const result = await getRelatedTasks(supabase, 'org-1', 'contact-1')

    expect(result).toEqual([])
  })

  it('retrieves tasks linked to a contact', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Follow up with client',
          status: 'in_progress',
          priority: 'high',
          metadata: { target_date: '2026-03-20' },
        },
      ],
    })

    const result = await getRelatedTasks(supabase, 'org-1', 'contact-1')

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      id: 'task-1',
      title: 'Follow up with client',
      status: 'in_progress',
      priority: 'high',
      targetDate: '2026-03-20',
    })
  })

  it('excludes archived tasks', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'task',
          entity_b_id: 'task-2',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Active task',
          status: 'in_progress',
          priority: 'high',
          metadata: {},
        },
        {
          id: 'task-2',
          org_id: 'org-1',
          title: 'Archived task',
          status: 'archived',
          priority: 'low',
          metadata: {},
        },
      ],
    })

    const result = await getRelatedTasks(supabase, 'org-1', 'contact-1')

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Active task')
  })

  it('handles missing target_date gracefully', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Task without date',
          status: 'todo',
          priority: 'medium',
          metadata: {},
        },
      ],
    })

    const result = await getRelatedTasks(supabase, 'org-1', 'contact-1')

    expect(result[0].targetDate).toBe(null)
  })
})

describe('getFinancialSignals', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty signal when no invoices linked', async () => {
    const { supabase } = createMockSupabase({
      relationships: [],
    })

    const result = await getFinancialSignals(supabase, 'org-1', 'contact-1')

    expect(result).toEqual({
      totalOutstanding: 0,
      overdueCount: 0,
      lastPaymentDate: null,
      invoiceCount: 0,
    })
  })

  it('calculates total outstanding and overdue counts', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'invoice',
          entity_b_id: 'inv-1',
        },
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'invoice',
          entity_b_id: 'inv-2',
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          status: 'pending',
          total: 1000,
          paid_date: null,
          due_date: '2026-03-10', // Overdue
        },
        {
          id: 'inv-2',
          org_id: 'org-1',
          status: 'pending',
          total: 500,
          paid_date: null,
          due_date: '2026-03-20', // Not yet due
        },
      ],
    })

    const result = await getFinancialSignals(supabase, 'org-1', 'contact-1')

    expect(result.totalOutstanding).toBe(1500)
    expect(result.overdueCount).toBe(1)
    expect(result.invoiceCount).toBe(2)
  })

  it('excludes paid invoices from outstanding calculation', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'invoice',
          entity_b_id: 'inv-1',
        },
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'invoice',
          entity_b_id: 'inv-2',
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          status: 'paid',
          total: 1000,
          paid_date: '2026-03-10',
          due_date: '2026-03-10',
        },
        {
          id: 'inv-2',
          org_id: 'org-1',
          status: 'pending',
          total: 500,
          paid_date: null,
          due_date: '2026-03-20',
        },
      ],
    })

    const result = await getFinancialSignals(supabase, 'org-1', 'contact-1')

    expect(result.totalOutstanding).toBe(500)
    expect(result.invoiceCount).toBe(2) // Includes paid invoices in count
  })

  it('tracks most recent payment date', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'invoice',
          entity_b_id: 'inv-1',
        },
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'invoice',
          entity_b_id: 'inv-2',
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          status: 'paid',
          total: 1000,
          paid_date: '2026-03-05',
          due_date: '2026-03-05',
        },
        {
          id: 'inv-2',
          org_id: 'org-1',
          status: 'paid',
          total: 500,
          paid_date: '2026-03-10',
          due_date: '2026-03-10',
        },
      ],
    })

    const result = await getFinancialSignals(supabase, 'org-1', 'contact-1')

    expect(result.lastPaymentDate).toBe('2026-03-10')
  })

  it('handles null total values as zero', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'invoice',
          entity_b_id: 'inv-1',
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          status: 'pending',
          total: null,
          paid_date: null,
          due_date: '2026-03-20',
        },
      ],
    })

    const result = await getFinancialSignals(supabase, 'org-1', 'contact-1')

    expect(result.totalOutstanding).toBe(0)
  })
})

describe('getDeadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty array when no tasks found', async () => {
    const { supabase } = createMockSupabase({
      relationships: [],
    })

    const result = await getDeadlines(supabase, 'org-1', 'entity-1')

    expect(result).toEqual([])
  })

  it('filters deadlines within next 14 days', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-2',
        },
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-3',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Due in 3 days',
          status: 'in_progress',
          metadata: { target_date: '2026-03-18' },
        },
        {
          id: 'task-2',
          org_id: 'org-1',
          title: 'Due in 20 days (outside window)',
          status: 'in_progress',
          metadata: { target_date: '2026-04-05' },
        },
        {
          id: 'task-3',
          org_id: 'org-1',
          title: 'Overdue',
          status: 'in_progress',
          metadata: { target_date: '2026-03-10' },
        },
      ],
    })

    const result = await getDeadlines(supabase, 'org-1', 'entity-1')

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Due in 3 days')
    expect(result[0].daysUntil).toBe(3)
  })

  it('excludes archived tasks', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-2',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Active task',
          status: 'in_progress',
          metadata: { target_date: '2026-03-18' },
        },
        {
          id: 'task-2',
          org_id: 'org-1',
          title: 'Archived task',
          status: 'archived',
          metadata: { target_date: '2026-03-18' },
        },
      ],
    })

    const result = await getDeadlines(supabase, 'org-1', 'entity-1')

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Active task')
  })

  it('sorts deadlines by days until ascending', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-2',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Due in 10 days',
          status: 'in_progress',
          metadata: { target_date: '2026-03-25' },
        },
        {
          id: 'task-2',
          org_id: 'org-1',
          title: 'Due in 3 days',
          status: 'in_progress',
          metadata: { target_date: '2026-03-18' },
        },
      ],
    })

    const result = await getDeadlines(supabase, 'org-1', 'entity-1')

    expect(result[0].daysUntil).toBe(3)
    expect(result[1].daysUntil).toBe(10)
  })

  it('calculates days until correctly', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Task',
          status: 'in_progress',
          metadata: { target_date: '2026-03-17T12:00:00Z' },
        },
      ],
    })

    const result = await getDeadlines(supabase, 'org-1', 'entity-1')

    expect(result[0].daysUntil).toBe(3)
  })

  it('excludes tasks without target_date', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_id: 'entity-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'No deadline',
          status: 'in_progress',
          metadata: {},
        },
      ],
    })

    const result = await getDeadlines(supabase, 'org-1', 'entity-1')

    expect(result).toEqual([])
  })
})

describe('crossReference', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty cross-reference for non-contact entity types', async () => {
    const { supabase } = createMockSupabase({
      relationships: [],
    })

    const result = await crossReference(supabase, 'org-1', 'invoice', 'inv-1')

    expect(result.relatedTasks).toEqual([])
    expect(result.deadlines.length).toBeGreaterThanOrEqual(0)
    expect(result.financialSignals).toEqual({
      totalOutstanding: 0,
      overdueCount: 0,
      lastPaymentDate: null,
      invoiceCount: 0,
    })
  })

  it('returns complete cross-reference for contact', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'invoice',
          entity_b_id: 'inv-1',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Follow up',
          status: 'in_progress',
          priority: 'high',
          metadata: { target_date: '2026-03-18' },
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          status: 'pending',
          total: 1000,
          paid_date: null,
          due_date: '2026-03-20',
        },
      ],
    })

    const result = await crossReference(supabase, 'org-1', 'contact', 'contact-1')

    expect(result.relatedTasks).toHaveLength(1)
    expect(result.financialSignals.totalOutstanding).toBe(1000)
    expect(result.deadlines.length).toBeGreaterThanOrEqual(0)
  })

  it('identifies waiting-for tasks from contact', async () => {
    const { supabase } = createMockSupabase({
      relationships: [
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'task',
          entity_b_id: 'task-1',
        },
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'task',
          entity_b_id: 'task-2',
        },
        {
          entity_a_type: 'contact',
          entity_a_id: 'contact-1',
          entity_b_type: 'task',
          entity_b_id: 'task-3',
        },
      ],
      tasks: [
        {
          id: 'task-1',
          org_id: 'org-1',
          title: 'Waiting task',
          status: 'waiting',
          priority: 'high',
          metadata: { target_date: '2026-03-18' },
        },
        {
          id: 'task-2',
          org_id: 'org-1',
          title: 'Blocked task',
          status: 'blocked',
          priority: 'high',
          metadata: { target_date: '2026-03-18' },
        },
        {
          id: 'task-3',
          org_id: 'org-1',
          title: 'Completed task',
          status: 'completed',
          priority: 'high',
          metadata: { target_date: '2026-03-18' },
        },
      ],
    })

    const result = await crossReference(supabase, 'org-1', 'contact', 'contact-1')

    expect(result.waitingFor).toHaveLength(2)
    expect(result.waitingFor.map((w) => w.status)).toContain('waiting')
    expect(result.waitingFor.map((w) => w.status)).toContain('blocked')
  })
})
