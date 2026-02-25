import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseInvoiceIntent,
  detectDuplicateInvoice,
  generateInvoiceNumber,
  type InvoiceIntent,
} from '../invoice-flow'

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// parseInvoiceIntent — NL intent parsing
// ---------------------------------------------------------------------------

describe('parseInvoiceIntent', () => {
  it('parses "send invoice to Sezer for website project $5000"', () => {
    const result = parseInvoiceIntent('send invoice to Sezer for website project $5000')
    expect(result.contact_name).toBe('Sezer')
    expect(result.amount).toBe(5000)
    expect(result.project_reference).toBe('website project')
    expect(result.currency).toBe('AUD')
    expect(result.terms_days).toBe(14)
  })

  it('parses "invoice Bob for SEO audit $2.5k net 30 days"', () => {
    const result = parseInvoiceIntent('invoice Bob for SEO audit $2.5k net 30 days')
    expect(result.contact_name).toBe('Bob')
    expect(result.amount).toBe(2500)
    expect(result.terms_days).toBe(30)
  })

  it('parses amount with $10k suffix', () => {
    const result = parseInvoiceIntent('invoice Alice for branding $10k')
    expect(result.amount).toBe(10000)
  })

  it('extracts 7-day terms', () => {
    const result = parseInvoiceIntent('invoice Test for work $100 7 days')
    expect(result.terms_days).toBe(7)
  })

  it('defaults to 14-day terms when not specified', () => {
    const result = parseInvoiceIntent('invoice Test for work $100')
    expect(result.terms_days).toBe(14)
  })

  it('handles missing contact name', () => {
    const result = parseInvoiceIntent('create an invoice for $500')
    // No explicit "to <name>" pattern
    expect(result.amount).toBe(500)
  })

  it('preserves original source intent', () => {
    const text = 'send invoice to Client for project'
    const result = parseInvoiceIntent(text)
    expect(result.source_intent).toBe(text)
  })

  it('strips money from contact name', () => {
    const result = parseInvoiceIntent('send invoice to Sezer $3000 for website')
    expect(result.contact_name).not.toContain('$')
    expect(result.amount).toBe(3000)
  })
})

// ---------------------------------------------------------------------------
// detectDuplicateInvoice
// ---------------------------------------------------------------------------

describe('detectDuplicateInvoice', () => {
  it('returns isDuplicate=false when no match exists', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: function() { return this },
          neq: function() { return this },
          order: function() { return this },
          limit: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    } as any

    const result = await detectDuplicateInvoice(supabase, 'org-1', 'c1', 'Website', 5000)
    expect(result.isDuplicate).toBe(false)
    expect(result.existingInvoice).toBeNull()
  })

  it('returns isDuplicate=true when matching invoice exists', async () => {
    const existing = { id: 'inv-1', invoice_number: 'AWU-202602-001', status: 'sent', total: 5000, project_reference: 'Website', created_at: '2026-02-20' }
    const supabase = {
      from: () => ({
        select: () => ({
          eq: function() { return this },
          neq: function() { return this },
          order: function() { return this },
          limit: () => Promise.resolve({ data: [existing], error: null }),
        }),
      }),
    } as any

    const result = await detectDuplicateInvoice(supabase, 'org-1', 'c1', 'Website', 5000)
    expect(result.isDuplicate).toBe(true)
    expect(result.existingInvoice?.id).toBe('inv-1')
  })

  it('returns false for empty project reference', async () => {
    const supabase = { from: vi.fn() } as any
    const result = await detectDuplicateInvoice(supabase, 'org-1', 'c1', '', 5000)
    expect(result.isDuplicate).toBe(false)
  })

  it('returns false for zero or negative total', async () => {
    const supabase = { from: vi.fn() } as any
    const result = await detectDuplicateInvoice(supabase, 'org-1', 'c1', 'Project', 0)
    expect(result.isDuplicate).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// generateInvoiceNumber
// ---------------------------------------------------------------------------

describe('generateInvoiceNumber', () => {
  it('generates sequential numbers with org prefix', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'organizations') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { name: 'Andy Wilson Unlimited', slug: 'awu' }, error: null }),
              }),
            }),
          }
        }
        if (table === 'invoices') {
          return {
            select: () => ({
              eq: function() { return this },
              ilike: function() { return this },
              order: function() { return this },
              limit: () => Promise.resolve({ data: [{ invoice_number: 'AWU-202602-003' }], error: null }),
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    } as any

    const result = await generateInvoiceNumber(supabase, 'org-1', new Date('2026-02-25'))
    expect(result).toBe('AWU-202602-004')
  })

  it('starts at 001 when no existing invoices', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'organizations') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { name: 'Test Org', slug: 'test' }, error: null }),
              }),
            }),
          }
        }
        if (table === 'invoices') {
          return {
            select: () => ({
              eq: function() { return this },
              ilike: function() { return this },
              order: function() { return this },
              limit: () => Promise.resolve({ data: [], error: null }),
            }),
          }
        }
        throw new Error(`Unexpected table: ${table}`)
      },
    } as any

    const result = await generateInvoiceNumber(supabase, 'org-1', new Date('2026-03-01'))
    expect(result).toMatch(/^TO-202603-001$/)
  })
})
