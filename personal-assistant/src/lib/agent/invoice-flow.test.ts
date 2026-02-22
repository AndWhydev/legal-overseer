import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInvoiceFromIntent,
  detectDuplicateInvoice,
  generateInvoiceNumber,
  parseInvoiceIntent,
  runInvoiceFlowTick,
} from './invoice-flow'

const {
  createInvoiceMock,
  searchContactsMock,
  createApprovalMock,
  resolveEntityRankedMock,
  crossReferenceMock,
  processApprovedInvoiceSendsMock,
  checkOverdueInvoicesMock,
} = vi.hoisted(() => ({
  createInvoiceMock: vi.fn().mockResolvedValue({
    success: true,
    data: { id: 'inv-created', invoice_number: 'AWU-202602-003', status: 'draft', total: 110 },
  }),
  searchContactsMock: vi.fn().mockResolvedValue([]),
  createApprovalMock: vi.fn().mockResolvedValue({ id: 'approval-1' }),
  resolveEntityRankedMock: vi.fn().mockResolvedValue([]),
  crossReferenceMock: vi.fn().mockResolvedValue({
    relatedTasks: [],
    deadlines: [],
    financialSignals: { totalOutstanding: 0, overdueCount: 0, lastPaymentDate: null, invoiceCount: 0 },
    waitingFor: [],
  }),
  processApprovedInvoiceSendsMock: vi.fn().mockResolvedValue({ processed: 1, sent: 1, failed: 0 }),
  checkOverdueInvoicesMock: vi.fn().mockResolvedValue({ overdue: 2, failed: 0 }),
}))

vi.mock('./shared-tools', () => ({
  createInvoice: createInvoiceMock,
  searchContacts: searchContactsMock,
}))

vi.mock('./approval-queue', () => ({
  createApproval: createApprovalMock,
}))

vi.mock('@/lib/context/entity-resolver', () => ({
  resolveEntityRanked: resolveEntityRankedMock,
}))

vi.mock('@/lib/context/cross-reference', () => ({
  crossReference: crossReferenceMock,
}))

vi.mock('./invoice-sender', () => ({
  processApprovedInvoiceSends: processApprovedInvoiceSendsMock,
  checkOverdueInvoices: checkOverdueInvoicesMock,
}))

interface InvoiceRow {
  id: string
  org_id: string
  client_contact_id: string
  project_reference: string | null
  total: number
  status: string
  invoice_number: string
  created_at: string
}

function createMockSupabase(input?: {
  invoices?: InvoiceRow[]
  organizations?: Array<{ id: string; name: string | null; slug: string | null }>
  approvals?: Array<{ id: string; org_id: string; action_type: string; status: string; action_payload: Record<string, unknown> }>
}) {
  const state = {
    invoices: [...(input?.invoices ?? [])],
    organizations: [...(input?.organizations ?? [])],
    approvals: [...(input?.approvals ?? [])],
  }

  const api = {
    from(table: string) {
      if (table === 'invoices') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            const chain = {
              eq(key: string, value: unknown) {
                filters[key] = value
                return chain
              },
              neq(key: string, value: unknown) {
                filters[`neq:${key}`] = value
                return chain
              },
              ilike(key: string, value: unknown) {
                filters[`ilike:${key}`] = value
                return chain
              },
              order() {
                return chain
              },
              limit(count: number) {
                let rows = state.invoices.filter((invoice) => {
                  if (filters.org_id && invoice.org_id !== String(filters.org_id)) return false
                  if (filters.client_contact_id && invoice.client_contact_id !== String(filters.client_contact_id)) return false
                  if (filters.project_reference && (invoice.project_reference ?? '') !== String(filters.project_reference)) return false
                  if (filters.total !== undefined && Number(invoice.total) !== Number(filters.total)) return false
                  if (filters['neq:status'] && invoice.status === String(filters['neq:status'])) return false
                  if (filters['ilike:invoice_number']) {
                    const pattern = String(filters['ilike:invoice_number']).replace(/%/g, '').toLowerCase()
                    if (!invoice.invoice_number.toLowerCase().includes(pattern)) return false
                  }
                  return true
                })

                rows = rows
                  .slice()
                  .sort((a, b) => b.invoice_number.localeCompare(a.invoice_number))
                  .slice(0, count)

                return Promise.resolve({ data: rows, error: null })
              },
            }

            return chain
          },
        }
      }

      if (table === 'organizations') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              single() {
                const row = state.organizations.find((org) => org.id === String(filters.id))
                if (!row) return Promise.resolve({ data: null, error: { message: 'not found' } })
                return Promise.resolve({ data: row, error: null })
              },
            }
          },
        }
      }

      if (table === 'approval_queue') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                if (Object.keys(filters).length >= 3) {
                  const rows = state.approvals.filter((approval) => {
                    if (filters.org_id && approval.org_id !== String(filters.org_id)) return false
                    if (filters.action_type && approval.action_type !== String(filters.action_type)) return false
                    if (filters.status && approval.status !== String(filters.status)) return false
                    return true
                  })
                  return Promise.resolve({ data: rows, error: null })
                }
                return this
              },
            }
          },
        }
      }

      return {
        select() {
          return {
            eq() {
              return Promise.resolve({ data: [], error: null })
            },
          }
        },
      }
    },
  }

  return api as unknown as import('@supabase/supabase-js').SupabaseClient
}

beforeEach(() => {
  createInvoiceMock.mockClear()
  searchContactsMock.mockReset()
  searchContactsMock.mockResolvedValue([])
  createApprovalMock.mockClear()
  resolveEntityRankedMock.mockReset()
  resolveEntityRankedMock.mockResolvedValue([])
  crossReferenceMock.mockClear()
  processApprovedInvoiceSendsMock.mockClear()
  checkOverdueInvoicesMock.mockClear()
})

describe('parseInvoiceIntent', () => {
  it('parses "Invoice X for Y" phrasing', () => {
    const parsed = parseInvoiceIntent('Invoice Sezer for the White House RE work')
    expect(parsed.contact_name).toBe('Sezer')
    expect(parsed.project_reference?.toLowerCase()).toContain('white house re')
    expect(parsed.amount).toBeNull()
  })

  it('parses "Send invoice to X for Y work" phrasing', () => {
    const parsed = parseInvoiceIntent('Send invoice to Andy for White House changes 7-day terms')
    expect(parsed.contact_name).toBe('Andy')
    expect(parsed.project_reference?.toLowerCase()).toContain('white house changes')
    expect(parsed.terms_days).toBe(7)
  })

  it('parses "Bill X $500 for Y" phrasing', () => {
    const parsed = parseInvoiceIntent('Bill Andy $500 for White House updates')
    expect(parsed.contact_name).toBe('Andy')
    expect(parsed.amount).toBe(500)
    expect(parsed.project_reference?.toLowerCase()).toContain('white house updates')
  })
})

describe('detectDuplicateInvoice', () => {
  it('flags duplicate when contact + project + total match active invoice', async () => {
    const supabase = createMockSupabase({
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          client_contact_id: 'contact-1',
          project_reference: 'White House updates',
          total: 550,
          status: 'sent',
          invoice_number: 'AWU-202602-001',
          created_at: '2026-02-22T00:00:00.000Z',
        },
      ],
    })

    const result = await detectDuplicateInvoice(supabase, 'org-1', 'contact-1', 'White House updates', 550)

    expect(result.isDuplicate).toBe(true)
    expect(result.existingInvoice?.id).toBe('inv-1')
  })

  it('does not flag duplicate when total differs', async () => {
    const supabase = createMockSupabase({
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          client_contact_id: 'contact-1',
          project_reference: 'White House updates',
          total: 550,
          status: 'sent',
          invoice_number: 'AWU-202602-001',
          created_at: '2026-02-22T00:00:00.000Z',
        },
      ],
    })

    const result = await detectDuplicateInvoice(supabase, 'org-1', 'contact-1', 'White House updates', 650)
    expect(result.isDuplicate).toBe(false)
  })

  it('does not flag duplicate when matching invoice is cancelled', async () => {
    const supabase = createMockSupabase({
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          client_contact_id: 'contact-1',
          project_reference: 'White House updates',
          total: 550,
          status: 'cancelled',
          invoice_number: 'AWU-202602-001',
          created_at: '2026-02-22T00:00:00.000Z',
        },
      ],
    })

    const result = await detectDuplicateInvoice(supabase, 'org-1', 'contact-1', 'White House updates', 550)
    expect(result.isDuplicate).toBe(false)
  })
})

describe('generateInvoiceNumber', () => {
  it('increments sequence per org per month', async () => {
    const now = new Date('2026-02-22T10:00:00.000Z')
    const supabase = createMockSupabase({
      organizations: [{ id: 'org-1', name: 'All Webbed Up', slug: 'all-webbed-up' }],
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          client_contact_id: 'contact-1',
          project_reference: 'x',
          total: 100,
          status: 'sent',
          invoice_number: 'AWU-202602-001',
          created_at: '2026-02-01T00:00:00.000Z',
        },
        {
          id: 'inv-2',
          org_id: 'org-1',
          client_contact_id: 'contact-2',
          project_reference: 'y',
          total: 200,
          status: 'sent',
          invoice_number: 'AWU-202602-002',
          created_at: '2026-02-02T00:00:00.000Z',
        },
      ],
    })

    const number = await generateInvoiceNumber(supabase, 'org-1', now)
    expect(number).toBe('AWU-202602-003')
  })
})

describe('createInvoiceFromIntent', () => {
  it('returns structured error when contact cannot be resolved', async () => {
    const supabase = createMockSupabase()

    const result = await createInvoiceFromIntent(
      supabase,
      'org-1',
      {
        source_intent: 'Invoice Unknown for project',
        contact_name: 'Unknown Person',
        project_reference: 'project',
        amount: 500,
        currency: 'AUD',
        terms_days: 14,
      },
      'cfg-1',
      { requireApproval: false },
    )

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.error).toBe('unknown_contact')
    }
  })
})

describe('runInvoiceFlowTick', () => {
  it('includes send + overdue counters from lifecycle processors', async () => {
    const supabase = createMockSupabase({ approvals: [] })

    const result = await runInvoiceFlowTick(supabase, 'org-1', 'cfg-1')

    expect(result.sent).toBe(1)
    expect(result.overdue).toBe(2)
    expect(result.failed).toBe(0)
    expect(processApprovedInvoiceSendsMock).toHaveBeenCalledWith(supabase, 'org-1')
    expect(checkOverdueInvoicesMock).toHaveBeenCalledWith(supabase, 'org-1')
  })
})
