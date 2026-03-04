import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createInvoiceFromIntent,
  parseInvoiceIntent,
} from '@/lib/agent/invoice-flow'
import {
  isValidInvoiceStatusTransition,
  markInvoicePaid,
  processApprovedInvoiceSends,
} from '@/lib/agent/invoice-sender'

const {
  createInvoiceMock,
  searchContactsMock,
  resolveEntityRankedMock,
  crossReferenceMock,
  createApprovalMock,
  generateInvoicePdfMock,
  sendInvoiceEmailMock,
} = vi.hoisted(() => ({
  createInvoiceMock: vi.fn(),
  searchContactsMock: vi.fn(),
  resolveEntityRankedMock: vi.fn(),
  crossReferenceMock: vi.fn(),
  createApprovalMock: vi.fn(),
  generateInvoicePdfMock: vi.fn(),
  sendInvoiceEmailMock: vi.fn(),
}))

vi.mock('@/lib/agent/shared-tools', () => ({
  createInvoice: createInvoiceMock,
  searchContacts: searchContactsMock,
}))

vi.mock('@/lib/context/entity-resolver', () => ({
  resolveEntityRanked: resolveEntityRankedMock,
}))

vi.mock('@/lib/context/cross-reference', () => ({
  crossReference: crossReferenceMock,
}))

vi.mock('@/lib/agent/approval-queue', () => ({
  createApproval: createApprovalMock,
}))

vi.mock('@/lib/agent/invoice-pdf', () => ({
  generateInvoicePdf: generateInvoicePdfMock,
}))

vi.mock('@/lib/email/send-invoice', () => ({
  sendInvoiceEmail: sendInvoiceEmailMock,
}))

type InvoiceRow = {
  id: string
  org_id: string
  invoice_number: string
  client_contact_id: string | null
  status: 'draft' | 'sent' | 'viewed' | 'overdue' | 'paid' | 'cancelled'
  items: Array<{ description: string; quantity: number; unit_price: number; total: number }>
  subtotal: number
  tax: number
  total: number
  currency: string
  issued_date: string | null
  due_date: string | null
  reminder_count: number
  project_reference: string | null
  payment_method?: string
  payment_reference?: string
}

type ContactRow = {
  id: string
  org_id: string
  name: string
  emails: string[]
}

type ApprovalRow = {
  id: string
  org_id: string
  action_type: string
  status: string
  action_payload: Record<string, unknown>
}

type OrganizationRow = {
  id: string
  name: string
  slug: string
  settings?: Record<string, unknown> | null
}

function createInvoiceSupabase(seed?: {
  invoices?: InvoiceRow[]
  contacts?: ContactRow[]
  approvals?: ApprovalRow[]
  organizations?: OrganizationRow[]
}) {
  const state = {
    invoices: [...(seed?.invoices ?? [])],
    contacts: [...(seed?.contacts ?? [])],
    approvals: [...(seed?.approvals ?? [])],
    organizations: [...(seed?.organizations ?? [])],
  }

  const supabase = {
    from(table: string) {
      if (table === 'invoices') {
        return {
          select() {
            const filters: Record<string, unknown> = {}

            const query = {
              eq(key: string, value: unknown) {
                filters[`eq:${key}`] = value
                return query
              },
              neq(key: string, value: unknown) {
                filters[`neq:${key}`] = value
                return query
              },
              gte(key: string, value: unknown) {
                filters[`gte:${key}`] = value
                return query
              },
              ilike(key: string, value: unknown) {
                filters[`ilike:${key}`] = value
                return query
              },
              in(key: string, value: unknown[]) {
                filters[`in:${key}`] = value
                return query
              },
              lt(key: string, value: unknown) {
                filters[`lt:${key}`] = value
                return query
              },
              order() {
                return query
              },
              limit(count: number) {
                const rows = filterInvoices(state.invoices, filters).slice(0, count)
                return Promise.resolve({ data: rows, error: null })
              },
              single() {
                const row = filterInvoices(state.invoices, filters)[0] ?? null
                return Promise.resolve({ data: row, error: row ? null : { message: 'not found' } })
              },
              then(resolve: (value: unknown) => void) {
                const rows = filterInvoices(state.invoices, filters)
                return resolve({ data: rows, error: null })
              },
            }

            return query
          },
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}

            const query = {
              eq(key: string, value: unknown) {
                filters[`eq:${key}`] = value
                return query
              },
              then(resolve: (value: unknown) => void) {
                for (const invoice of state.invoices) {
                  if (filters['eq:id'] && invoice.id !== filters['eq:id']) continue
                  if (filters['eq:org_id'] && invoice.org_id !== filters['eq:org_id']) continue
                  Object.assign(invoice, patch)
                }
                return resolve({ data: null, error: null })
              },
            }

            return query
          },
        }
      }

      if (table === 'contacts') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              single() {
                const row = state.contacts.find((contact) =>
                  (!filters.id || contact.id === filters.id) &&
                  (!filters.org_id || contact.org_id === filters.org_id),
                )
                return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'not found' } })
              },
            }
          },
        }
      }

      if (table === 'approval_queue') {
        return {
          select() {
            const filters: Record<string, unknown> = {}

            const query = {
              eq(key: string, value: unknown) {
                filters[key] = value
                return query
              },
              then(resolve: (value: unknown) => void) {
                const rows = state.approvals.filter((approval) => {
                  if (filters.org_id && approval.org_id !== filters.org_id) return false
                  if (filters.action_type && approval.action_type !== filters.action_type) return false
                  if (filters.status && approval.status !== filters.status) return false
                  return true
                })
                return resolve({ data: rows, error: null })
              },
            }

            return query
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
                const row = state.organizations.find((org) => org.id === filters.id)
                return Promise.resolve({ data: row ?? null, error: row ? null : { message: 'not found' } })
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return {
    supabase,
    state,
  }
}

function filterInvoices(rows: InvoiceRow[], filters: Record<string, unknown>): InvoiceRow[] {
  return rows.filter((row) => {
    for (const [key, value] of Object.entries(filters)) {
      if (key === 'eq:org_id' && row.org_id !== value) return false
      if (key === 'eq:id' && row.id !== value) return false
      if (key === 'eq:client_contact_id' && row.client_contact_id !== value) return false
      if (key === 'neq:status' && row.status === value) return false

      if (key === 'gte:created_at') {
        const threshold = new Date(String(value)).getTime()
        const createdAt = new Date(row.issued_date ?? '1970-01-01').getTime()
        if (createdAt < threshold) return false
      }

      if (key === 'ilike:invoice_number') {
        const pattern = String(value).replace(/%/g, '').toLowerCase()
        if (!row.invoice_number.toLowerCase().includes(pattern)) return false
      }

      if (key === 'in:status') {
        const statuses = Array.isArray(value) ? value : []
        if (!statuses.includes(row.status)) return false
      }

      if (key === 'lt:due_date') {
        const due = row.due_date ?? ''
        if (!(due < String(value))) return false
      }
    }

    return true
  })
}

function applyPartialPayment(invoice: { total: number; amount_paid: number; status: 'sent' | 'paid' }, paymentAmount: number) {
  const nextAmount = Math.max(0, invoice.amount_paid + paymentAmount)
  const cappedAmount = Math.min(invoice.total, nextAmount)
  return {
    ...invoice,
    amount_paid: cappedAmount,
    status: cappedAmount >= invoice.total ? 'paid' as const : 'sent' as const,
  }
}

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  createInvoiceMock.mockReset()
  searchContactsMock.mockReset()
  resolveEntityRankedMock.mockReset()
  crossReferenceMock.mockReset()
  createApprovalMock.mockReset()
  generateInvoicePdfMock.mockReset()
  sendInvoiceEmailMock.mockReset()

  createInvoiceMock.mockResolvedValue({
    success: true,
    data: {
      id: 'inv-created',
      invoice_number: 'AWU-202603-001',
      total: 500,
      status: 'draft',
    },
  })
  searchContactsMock.mockResolvedValue([{ contact: { id: 'contact-1', name: 'Steve West' }, matchConfidence: 0.95 }])
  resolveEntityRankedMock.mockResolvedValue([])
  crossReferenceMock.mockResolvedValue({
    relatedTasks: [],
    deadlines: [],
    financialSignals: { totalOutstanding: 0, overdueCount: 0, lastPaymentDate: null, invoiceCount: 0 },
    waitingFor: [],
  })

  generateInvoicePdfMock.mockReturnValue({
    subject: 'Invoice AWU-202603-001',
    html: '<html>invoice</html>',
  })
  sendInvoiceEmailMock.mockResolvedValue({ success: true })
})

describe('Invoice Flow Pipeline Integration', () => {
  it('creates invoice with line items and calculates total', async () => {
    const { supabase } = createInvoiceSupabase({
      organizations: [{ id: 'org-1', name: 'All Webbed Up', slug: 'awu', settings: null }],
      invoices: [],
    })

    const intent = parseInvoiceIntent('invoice Steve West $500 for website')

    const result = await createInvoiceFromIntent(
      supabase as any,
      'org-1',
      intent,
      'agent-1',
      { requireApproval: false, allowDuplicateOverride: false },
    )

    expect(result.status).toBe('created')
    expect(createInvoiceMock).toHaveBeenCalledWith(
      supabase,
      'org-1',
      expect.objectContaining({
        client_contact_id: 'contact-1',
        currency: 'AUD',
        items: [
          expect.objectContaining({
            quantity: 1,
            unit_price: 500,
            total: 500,
          }),
        ],
      }),
    )
  })

  it('generates PDF data from invoice', async () => {
    const { supabase } = createInvoiceSupabase({
      organizations: [{ id: 'org-1', name: 'All Webbed Up', slug: 'awu', settings: null }],
      approvals: [
        {
          id: 'approval-send-1',
          org_id: 'org-1',
          action_type: 'invoice_send',
          status: 'approved',
          action_payload: { invoice_id: 'inv-1' },
        },
      ],
      contacts: [
        {
          id: 'contact-1',
          org_id: 'org-1',
          name: 'Steve West',
          emails: ['steve@example.com'],
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          invoice_number: 'AWU-202603-001',
          client_contact_id: 'contact-1',
          status: 'draft',
          items: [{ description: 'Website', quantity: 1, unit_price: 500, total: 500 }],
          subtotal: 500,
          tax: 50,
          total: 550,
          currency: 'AUD',
          issued_date: '2026-03-01',
          due_date: '2026-03-15',
          reminder_count: 0,
          project_reference: 'Website',
        },
      ],
    })

    const result = await processApprovedInvoiceSends(supabase as any, 'org-1')

    expect(result.sent).toBe(1)
    expect(generateInvoicePdfMock).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice_number: 'AWU-202603-001',
        total: 550,
        client_email: 'steve@example.com',
      }),
      expect.any(Object),
    )
  })

  it('sends invoice via email channel', async () => {
    const { supabase } = createInvoiceSupabase({
      organizations: [{ id: 'org-1', name: 'All Webbed Up', slug: 'awu', settings: null }],
      approvals: [
        {
          id: 'approval-send-2',
          org_id: 'org-1',
          action_type: 'invoice_send',
          status: 'approved',
          action_payload: { invoice_id: 'inv-2' },
        },
      ],
      contacts: [
        {
          id: 'contact-2',
          org_id: 'org-1',
          name: 'Steve West',
          emails: ['billing@stevewest.com'],
        },
      ],
      invoices: [
        {
          id: 'inv-2',
          org_id: 'org-1',
          invoice_number: 'AWU-202603-002',
          client_contact_id: 'contact-2',
          status: 'draft',
          items: [{ description: 'Website', quantity: 1, unit_price: 600, total: 600 }],
          subtotal: 600,
          tax: 60,
          total: 660,
          currency: 'AUD',
          issued_date: '2026-03-02',
          due_date: '2026-03-16',
          reminder_count: 0,
          project_reference: 'Website',
        },
      ],
    })

    const result = await processApprovedInvoiceSends(supabase as any, 'org-1')

    expect(result.sent).toBe(1)
    expect(sendInvoiceEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@stevewest.com',
        invoiceNumber: 'AWU-202603-002',
      }),
    )
  })

  it('tracks invoice status transitions', async () => {
    const { supabase, state } = createInvoiceSupabase({
      organizations: [{ id: 'org-1', name: 'All Webbed Up', slug: 'awu', settings: null }],
      approvals: [
        {
          id: 'approval-send-3',
          org_id: 'org-1',
          action_type: 'invoice_send',
          status: 'approved',
          action_payload: { invoice_id: 'inv-3' },
        },
      ],
      contacts: [
        {
          id: 'contact-3',
          org_id: 'org-1',
          name: 'Steve West',
          emails: ['finance@stevewest.com'],
        },
      ],
      invoices: [
        {
          id: 'inv-3',
          org_id: 'org-1',
          invoice_number: 'AWU-202603-003',
          client_contact_id: 'contact-3',
          status: 'draft',
          items: [{ description: 'Website', quantity: 1, unit_price: 700, total: 700 }],
          subtotal: 700,
          tax: 70,
          total: 770,
          currency: 'AUD',
          issued_date: '2026-03-03',
          due_date: '2026-03-17',
          reminder_count: 0,
          project_reference: 'Website',
        },
      ],
    })

    expect(isValidInvoiceStatusTransition('draft', 'sent')).toBe(true)
    expect(isValidInvoiceStatusTransition('sent', 'paid')).toBe(true)
    expect(isValidInvoiceStatusTransition('paid', 'draft')).toBe(false)

    await processApprovedInvoiceSends(supabase as any, 'org-1')
    expect(state.invoices[0].status).toBe('sent')

    const paid = await markInvoicePaid(supabase as any, 'org-1', 'inv-3', {
      method: 'bank_transfer',
      reference: 'PAY-003',
    })

    expect(paid.updated).toBe(true)
    expect(state.invoices[0].status).toBe('paid')
  })

  it('handles partial payment updates', () => {
    const initial = { total: 1000, amount_paid: 0, status: 'sent' as const }

    const partial = applyPartialPayment(initial, 400)
    expect(partial.amount_paid).toBe(400)
    expect(partial.status).toBe('sent')

    const final = applyPartialPayment(partial, 600)
    expect(final.amount_paid).toBe(1000)
    expect(final.status).toBe('paid')
  })
})
