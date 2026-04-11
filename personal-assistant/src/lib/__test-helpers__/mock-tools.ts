import { vi } from 'vitest'

/**
 * Mock agent tools: contact lookup, task CRUD, invoice CRUD, approval queue.
 * These mock the shared-tools and approval-queue modules.
 */

export interface MockContactResult {
  contact: { id: string; name: string }
  matchConfidence: number
}

export function createMockTools() {
  const contacts: MockContactResult[] = []
  const tasks: Record<string, unknown>[] = []
  const invoices: Record<string, unknown>[] = []
  const approvals: Record<string, unknown>[] = []

  return {
    // Data setters
    setContacts(data: MockContactResult[]) { contacts.length = 0; contacts.push(...data) },
    setTasks(data: Record<string, unknown>[]) { tasks.length = 0; tasks.push(...data) },
    setInvoices(data: Record<string, unknown>[]) { invoices.length = 0; invoices.push(...data) },
    setApprovals(data: Record<string, unknown>[]) { approvals.length = 0; approvals.push(...data) },

    // Mock implementations
    searchContacts: vi.fn(async (_supabase: unknown, _orgId: string, _query: string) => {
      return contacts
    }),

    createTask: vi.fn(async (_supabase: unknown, _orgId: string, data: Record<string, unknown>) => {
      const task = { id: `task-${tasks.length + 1}`, ...data }
      tasks.push(task)
      return { success: true, data: task }
    }),

    updateTask: vi.fn(async (_supabase: unknown, _orgId: string, taskId: string, data: Record<string, unknown>) => {
      const idx = tasks.findIndex(t => t.id === taskId)
      if (idx >= 0) tasks[idx] = { ...tasks[idx], ...data }
      return { success: idx >= 0, data: idx >= 0 ? tasks[idx] : null }
    }),

    createInvoice: vi.fn(async (_supabase: unknown, _orgId: string, data: Record<string, unknown>) => {
      const inv = { id: `inv-${invoices.length + 1}`, invoice_number: `INV-${String(invoices.length + 1).padStart(3, '0')}`, ...data }
      invoices.push(inv)
      return { success: true, data: inv }
    }),

    createApproval: vi.fn(async (_supabase: unknown, params: Record<string, unknown>) => {
      const approval = { id: `approval-${approvals.length + 1}`, status: 'pending', ...params }
      approvals.push(approval)
      return approval
    }),

    resolveApproval: vi.fn(async (_supabase: unknown, approvalId: string, decision: string) => {
      const idx = approvals.findIndex(a => a.id === approvalId)
      if (idx >= 0) approvals[idx] = { ...approvals[idx], status: decision }
      return idx >= 0 ? approvals[idx] : null
    }),

    // State accessors
    getContacts: () => contacts,
    getTasks: () => tasks,
    getInvoices: () => invoices,
    getApprovals: () => approvals,
  }
}
