import { describe, it, expect, vi } from 'vitest'
import { exportEntities, type ExportEntityType, type ExportFormat } from './data-export'

function createMockSupabase(args: { data: Array<Record<string, unknown>>; error?: boolean }) {
  const api = {
    from(table: string) {
      return {
        select(fields: string) {
          return {
            eq: (key: string, value: unknown) => {
              return {
                order: (column: string, opts: any) => {
                  return {
                    limit: (n: number) => {
                      if (args.error) {
                        return Promise.resolve({
                          data: null,
                          error: { message: 'Database error' },
                        })
                      }
                      return Promise.resolve({
                        data: args.data.slice(0, n),
                        error: null,
                      })
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
  }
}

describe('exportEntities', () => {
  it('exports contacts as JSON', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'contact-1',
          org_id: 'org-1',
          name: 'John Doe',
          email: 'john@example.com',
          created_at: '2026-03-01',
        },
        {
          id: 'contact-2',
          org_id: 'org-1',
          name: 'Jane Smith',
          email: 'jane@example.com',
          created_at: '2026-03-02',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'contacts', 'json')

    expect(result.contentType).toBe('application/json')
    expect(result.filename).toMatch(/^contacts_\d{4}-\d{2}-\d{2}\.json$/)

    const parsed = JSON.parse(result.data)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].name).toBe('John Doe')
    expect(parsed[1].name).toBe('Jane Smith')
  })

  it('exports invoices as CSV', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          amount: 1000,
          status: 'paid',
          created_at: '2026-03-01',
        },
        {
          id: 'inv-2',
          org_id: 'org-1',
          amount: 1500,
          status: 'pending',
          created_at: '2026-03-02',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'invoices', 'csv')

    expect(result.contentType).toBe('text/csv')
    expect(result.filename).toMatch(/^invoices_\d{4}-\d{2}-\d{2}\.csv$/)

    const lines = result.data.split('\n')
    expect(lines[0]).toContain('id')
    expect(lines[0]).toContain('org_id')
    expect(lines[0]).toContain('amount')
    expect(lines[1]).toContain('inv-1')
    expect(lines[2]).toContain('inv-2')
  })

  it('escapes CSV special characters', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'contact-1',
          name: 'John "The Boss" Doe',
          email: 'john@example.com,secondary@example.com',
          note: 'Great client,\nmultiline note',
          created_at: '2026-03-01',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'contacts', 'csv')

    expect(result.data).toContain('"John ""The Boss"" Doe"')
    expect(result.data).toContain('"john@example.com,secondary@example.com"')
    expect(result.data).toContain('"Great client,\nmultiline note"')
  })

  it('returns empty CSV for no data', async () => {
    const { supabase } = createMockSupabase({
      data: [],
    })

    const result = await exportEntities(supabase, 'org-1', 'contacts', 'csv')

    expect(result.data).toBe('')
  })

  it('returns empty JSON array for no data', async () => {
    const { supabase } = createMockSupabase({
      data: [],
    })

    const result = await exportEntities(supabase, 'org-1', 'leads', 'json')

    expect(result.data).toBe('[]')
  })

  it('includes correct timestamp in filename', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00.000Z'))

    const { supabase } = createMockSupabase({
      data: [],
    })

    const result = await exportEntities(supabase, 'org-1', 'projects', 'json')

    expect(result.filename).toContain('2026-03-15')

    vi.useRealTimers()
  })

  it('validates entity type', async () => {
    const { supabase } = createMockSupabase({
      data: [],
    })

    await expect(
      exportEntities(supabase, 'org-1', 'invalid_entity' as ExportEntityType, 'json'),
    ).rejects.toThrow('Invalid entity type')
  })

  it('exports all valid entity types', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'entity-1',
          org_id: 'org-1',
          name: 'Test Entity',
        },
      ],
    })

    const validTypes: ExportEntityType[] = [
      'contacts',
      'projects',
      'invoices',
      'leads',
      'agent_runs',
      'audit_log',
    ]

    for (const entityType of validTypes) {
      const result = await exportEntities(supabase, 'org-1', entityType, 'json')
      expect(result.filename).toContain(entityType)
      expect(result.contentType).toBe('application/json')
    }
  })

  it('handles database error gracefully', async () => {
    const { supabase } = createMockSupabase({
      data: [],
      error: true,
    })

    await expect(
      exportEntities(supabase, 'org-1', 'contacts', 'json'),
    ).rejects.toThrow('Export failed: Database error')
  })

  it('applies 10000 record limit', async () => {
    const largeData = Array.from({ length: 15000 }, (_, i) => ({
      id: `entity-${i}`,
      org_id: 'org-1',
      name: `Entity ${i}`,
    }))

    const { supabase } = createMockSupabase({
      data: largeData,
    })

    const result = await exportEntities(supabase, 'org-1', 'contacts', 'json')

    const parsed = JSON.parse(result.data)
    expect(parsed.length).toBeLessThanOrEqual(10000)
  })

  it('preserves data types in JSON export', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          amount: 1000.5,
          is_paid: true,
          notes: null,
          created_at: '2026-03-01T10:00:00Z',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'invoices', 'json')

    const parsed = JSON.parse(result.data)
    expect(parsed[0].amount).toBe(1000.5)
    expect(parsed[0].is_paid).toBe(true)
    expect(parsed[0].notes).toBe(null)
    expect(typeof parsed[0].created_at).toBe('string')
  })

  it('handles special characters in CSV correctly', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'contact-1',
          name: "O'Reilly",
          description: 'A description',
          status: 'active',
        },
        {
          id: 'contact-2',
          name: 'Test, Inc.',
          description: 'Another description',
          status: 'inactive',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'contacts', 'csv')

    const lines = result.data.split('\n').filter(l => l.trim())
    expect(lines.length).toBeGreaterThanOrEqual(2) // At least header + data rows
    expect(lines[0]).toContain('id')
    expect(lines[0]).toContain('name')
  })

  it('exports projects with all fields', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'proj-1',
          org_id: 'org-1',
          name: 'Website Redesign',
          status: 'active',
          budget: 50000,
          spent: 35000,
          created_at: '2026-03-01',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'projects', 'json')

    const parsed = JSON.parse(result.data)
    expect(parsed[0]).toHaveProperty('id')
    expect(parsed[0]).toHaveProperty('org_id')
    expect(parsed[0]).toHaveProperty('name')
    expect(parsed[0]).toHaveProperty('budget')
  })

  it('exports leads with all metadata', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'lead-1',
          org_id: 'org-1',
          contact_name: 'Alice Johnson',
          contact_email: 'alice@acme.com',
          source: 'website',
          status: 'new',
          value: 5000,
          created_at: '2026-03-01',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'leads', 'json')

    const parsed = JSON.parse(result.data)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].source).toBe('website')
  })

  it('exports agent runs with execution data', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'run-1',
          org_id: 'org-1',
          agent_type: 'lead_swarm',
          status: 'completed',
          input_tokens: 1000,
          output_tokens: 500,
          created_at: '2026-03-01',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'agent_runs', 'csv')

    expect(result.filename).toContain('agent_runs')
    expect(result.contentType).toBe('text/csv')
  })

  it('exports audit log with all fields', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'audit-1',
          org_id: 'org-1',
          user_id: 'user-1',
          action: 'invoice_sent',
          entity_type: 'invoice',
          entity_id: 'inv-1',
          created_at: '2026-03-01',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'audit_log', 'json')

    const parsed = JSON.parse(result.data)
    expect(parsed[0].action).toBe('invoice_sent')
  })

  it('handles both CSV and JSON format requests', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'entity-1',
          name: 'Test',
        },
      ],
    })

    const csvResult = await exportEntities(supabase, 'org-1', 'contacts', 'csv')
    const jsonResult = await exportEntities(supabase, 'org-1', 'contacts', 'json')

    expect(csvResult.contentType).toBe('text/csv')
    expect(jsonResult.contentType).toBe('application/json')
    expect(csvResult.filename).toContain('.csv')
    expect(jsonResult.filename).toContain('.json')
  })

  it('defaults to JSON format when not specified', async () => {
    const { supabase } = createMockSupabase({
      data: [
        {
          id: 'entity-1',
          name: 'Test',
        },
      ],
    })

    const result = await exportEntities(supabase, 'org-1', 'contacts')

    expect(result.contentType).toBe('application/json')
    expect(result.filename).toContain('.json')
  })
})
