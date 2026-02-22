import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkOverdueInvoices,
  isValidInvoiceStatusTransition,
  processApprovedInvoiceSends,
  queueInvoiceSend,
} from './invoice-sender'

const { createApprovalMock } = vi.hoisted(() => ({
  createApprovalMock: vi.fn().mockResolvedValue({ id: 'approval-1' }),
}))

vi.mock('./approval-queue', () => ({
  createApproval: createApprovalMock,
}))

interface InvoiceRow {
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
  sent_via?: string | null
  pdf_url?: string | null
}

interface ApprovalRow {
  id: string
  org_id: string
  action_type: string
  status: string
  action_payload: Record<string, unknown>
}

function createMockSupabase(input: {
  invoices?: InvoiceRow[]
  approvals?: ApprovalRow[]
  contacts?: Array<{ id: string; org_id: string; name: string; emails: string[] }>
  organizations?: Array<{ id: string; name: string; settings: Record<string, unknown> }>
  agentConfigs?: Array<{ id: string; org_id: string; agent_type: string }>
}) {
  const state = {
    invoices: [...(input.invoices ?? [])],
    approvals: [...(input.approvals ?? [])],
    contacts: [...(input.contacts ?? [])],
    organizations: [...(input.organizations ?? [])],
    agentConfigs: [...(input.agentConfigs ?? [])],
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
              in(key: string, value: unknown[]) {
                filters[key] = value
                return chain
              },
              lt(key: string, value: unknown) {
                filters[key] = { op: 'lt', value }
                return Promise.resolve({
                  data: state.invoices.filter((invoice) => {
                    if (filters.org_id && invoice.org_id !== String(filters.org_id)) return false
                    if (filters.status && Array.isArray(filters.status)) {
                      if (!(filters.status as string[]).includes(invoice.status)) return false
                    }
                    const dueFilter = filters[key] as { op: string; value: unknown }
                    if (dueFilter?.op === 'lt') {
                      const dueDate = invoice.due_date ?? ''
                      return dueDate < String(dueFilter.value)
                    }
                    return true
                  }),
                  error: null,
                })
              },
              order() {
                return chain
              },
              limit() {
                return Promise.resolve({
                  data: state.invoices.filter((invoice) => {
                    if (filters.org_id && invoice.org_id !== String(filters.org_id)) return false
                    if (filters.client_contact_id && invoice.client_contact_id !== String(filters.client_contact_id)) return false
                    return true
                  }),
                  error: null,
                })
              },
              single() {
                const invoice = state.invoices.find((candidate) => {
                  if (filters.org_id && candidate.org_id !== String(filters.org_id)) return false
                  if (filters.id && candidate.id !== String(filters.id)) return false
                  return true
                })
                if (!invoice) {
                  return Promise.resolve({ data: null, error: { message: 'not found' } })
                }
                return Promise.resolve({ data: invoice, error: null })
              },
            }
            return chain
          },
          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            const chain = {
              eq(key: string, value: unknown) {
                filters[key] = value
                if (filters.id && filters.org_id) {
                  const invoice = state.invoices.find((candidate) => candidate.id === String(filters.id) && candidate.org_id === String(filters.org_id))
                  if (!invoice) return Promise.resolve({ data: null, error: { message: 'not found' } })
                  Object.assign(invoice, patch)
                  return Promise.resolve({ data: null, error: null })
                }
                return chain
              },
            }
            return chain
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
                const row = state.contacts.find((contact) => {
                  if (filters.org_id && contact.org_id !== String(filters.org_id)) return false
                  if (filters.id && contact.id !== String(filters.id)) return false
                  return true
                })
                if (!row) return Promise.resolve({ data: null, error: { message: 'not found' } })
                return Promise.resolve({ data: row, error: null })
              },
            }
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

      if (table === 'agent_configs') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              limit(count: number) {
                const rows = state.agentConfigs
                  .filter((config) => {
                    if (filters.org_id && config.org_id !== String(filters.org_id)) return false
                    if (filters.agent_type && config.agent_type !== String(filters.agent_type)) return false
                    return true
                  })
                  .slice(0, count)
                return Promise.resolve({ data: rows, error: null })
              },
            }
          },
        }
      }

      throw new Error(`Unsupported table ${table}`)
    },
  }

  return {
    supabase: api as unknown as import('@supabase/supabase-js').SupabaseClient,
    state,
  }
}

beforeEach(() => {
  createApprovalMock.mockClear()
})

describe('queueInvoiceSend', () => {
  it('creates an invoice_send approval entry', async () => {
    const { supabase } = createMockSupabase({
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          invoice_number: 'INV-001',
          client_contact_id: 'contact-1',
          status: 'draft',
          items: [{ description: 'Work', quantity: 1, unit_price: 100, total: 100 }],
          subtotal: 100,
          tax: 10,
          total: 110,
          currency: 'AUD',
          issued_date: '2026-02-22',
          due_date: '2026-03-08',
          reminder_count: 0,
          project_reference: 'Work',
        },
      ],
    })

    const result = await queueInvoiceSend(supabase, 'org-1', 'inv-1', 'cfg-1')

    expect(result.queued).toBe(true)
    expect(createApprovalMock).toHaveBeenCalledTimes(1)
    expect(createApprovalMock.mock.calls[0]?.[1]).toMatchObject({
      action_type: 'invoice_send',
      routing_decision: 'ask',
      confidence_score: 0,
    })
  })
})

describe('processApprovedInvoiceSends', () => {
  it('sends approved invoice drafts and updates lifecycle fields', async () => {
    const { supabase, state } = createMockSupabase({
      approvals: [
        {
          id: 'appr-1',
          org_id: 'org-1',
          action_type: 'invoice_send',
          status: 'approved',
          action_payload: { invoice_id: 'inv-1' },
        },
      ],
      invoices: [
        {
          id: 'inv-1',
          org_id: 'org-1',
          invoice_number: 'INV-001',
          client_contact_id: 'contact-1',
          status: 'draft',
          items: [{ description: 'Work', quantity: 1, unit_price: 100, total: 100 }],
          subtotal: 100,
          tax: 10,
          total: 110,
          currency: 'AUD',
          issued_date: '2026-02-22',
          due_date: '2026-03-08',
          reminder_count: 0,
          project_reference: 'Work',
        },
      ],
      contacts: [
        { id: 'contact-1', org_id: 'org-1', name: 'Client', emails: ['client@example.com'] },
      ],
      organizations: [
        { id: 'org-1', name: 'BitBit', settings: { branding: { company_name: 'BitBit' } } },
      ],
    })

    const result = await processApprovedInvoiceSends(supabase, 'org-1')

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0 })
    expect(state.invoices[0].status).toBe('sent')
    expect(state.invoices[0].sent_via).toBe('email')
    expect(String(state.invoices[0].pdf_url)).toContain('inline:invoice-INV-001')
  })
})

describe('checkOverdueInvoices', () => {
  it('moves past-due invoices to overdue and queues reminder approval', async () => {
    const { supabase, state } = createMockSupabase({
      invoices: [
        {
          id: 'inv-2',
          org_id: 'org-1',
          invoice_number: 'INV-002',
          client_contact_id: 'contact-1',
          status: 'sent',
          items: [{ description: 'Support', quantity: 1, unit_price: 200, total: 200 }],
          subtotal: 200,
          tax: 20,
          total: 220,
          currency: 'AUD',
          issued_date: '2026-01-01',
          due_date: '2026-01-15',
          reminder_count: 0,
          project_reference: 'Support',
        },
      ],
      agentConfigs: [{ id: 'cfg-1', org_id: 'org-1', agent_type: 'invoice-flow' }],
    })

    const result = await checkOverdueInvoices(supabase, 'org-1')

    expect(result).toEqual({ overdue: 1, failed: 0 })
    expect(state.invoices[0].status).toBe('overdue')
    expect(state.invoices[0].reminder_count).toBe(1)
    expect(createApprovalMock).toHaveBeenCalledTimes(1)
    expect(createApprovalMock.mock.calls[0]?.[1]).toMatchObject({
      action_type: 'invoice_overdue_notify',
      routing_decision: 'ask',
    })
  })
})

describe('isValidInvoiceStatusTransition', () => {
  it('enforces lifecycle transitions without skipping', () => {
    expect(isValidInvoiceStatusTransition('draft', 'sent')).toBe(true)
    expect(isValidInvoiceStatusTransition('sent', 'paid')).toBe(true)
    expect(isValidInvoiceStatusTransition('draft', 'paid')).toBe(false)
    expect(isValidInvoiceStatusTransition('cancelled', 'sent')).toBe(false)
  })
})
