import { vi } from 'vitest'

/**
 * Supabase integration test helpers.
 * Provides seed data, cleanup, and transaction-like isolation for integration tests.
 *
 * NOTE: These use mock Supabase for CI — real Supabase integration tests
 * require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

export const TEST_ORG_ID = 'org-integration-test'
export const TEST_AGENT_CONFIG_ID = 'agent-config-integration'
export const TEST_USER_ID = 'user-integration-test'

export interface SeedData {
  contacts: Record<string, unknown>[]
  tasks: Record<string, unknown>[]
  invoices: Record<string, unknown>[]
  approvals: Record<string, unknown>[]
  messages: Record<string, unknown>[]
  watches: Record<string, unknown>[]
}

const DEFAULT_SEED: SeedData = {
  contacts: [
    { id: 'contact-int-1', org_id: TEST_ORG_ID, name: 'Alice Chen', emails: ['alice@example.com'], type: 'individual', aliases: ['alice'] },
    { id: 'contact-int-2', org_id: TEST_ORG_ID, name: 'Bob Wilson', emails: ['bob@example.com'], type: 'individual', aliases: ['bob'] },
  ],
  tasks: [
    { id: 'task-int-1', org_id: TEST_ORG_ID, title: 'Follow up with Alice', status: 'pending', priority: 'normal' },
  ],
  invoices: [
    { id: 'inv-int-1', org_id: TEST_ORG_ID, invoice_number: 'INT-202602-001', client_contact_id: 'contact-int-1', status: 'sent', total: 3000 },
  ],
  approvals: [],
  messages: [],
  watches: [],
}

/**
 * Creates an in-memory mock Supabase that tracks all operations
 * for integration test verification.
 */
export function createIntegrationSupabase(seed: Partial<SeedData> = {}) {
  const data: SeedData = { ...DEFAULT_SEED, ...seed }
  const operations: Array<{ table: string; op: string; payload?: unknown }> = []

  function buildChain(table: string) {
    const filters: Record<string, unknown> = {}
    let isInsert = false
    let isUpdate = false
    let insertPayload: unknown = null
    let updatePayload: unknown = null

    const chain: Record<string, unknown> = {}
    const filterMethods = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'ilike', 'contains']

    for (const m of filterMethods) {
      chain[m] = vi.fn((key: string, value: unknown) => {
        filters[key] = value
        return chain
      })
    }

    chain.select = vi.fn((_cols?: string, _opts?: unknown) => {
      operations.push({ table, op: 'select' })
      return chain
    })

    chain.insert = vi.fn((payload: unknown) => {
      isInsert = true
      insertPayload = payload
      operations.push({ table, op: 'insert', payload })
      const tableData = (data as unknown as Record<string, unknown[]>)[table] ?? []
      if (Array.isArray(payload)) {
        tableData.push(...payload)
      } else {
        tableData.push(payload as Record<string, unknown>)
      }
      return chain
    })

    chain.update = vi.fn((payload: unknown) => {
      isUpdate = true
      updatePayload = payload
      operations.push({ table, op: 'update', payload })
      return chain
    })

    chain.upsert = vi.fn((payload: unknown) => {
      operations.push({ table, op: 'upsert', payload })
      return chain
    })

    chain.delete = vi.fn(() => {
      operations.push({ table, op: 'delete' })
      return chain
    })

    chain.order = vi.fn(() => chain)
    chain.limit = vi.fn(() => chain)
    chain.range = vi.fn(() => chain)

    chain.single = vi.fn(() => {
      const tableData = ((data as unknown as Record<string, unknown[]>)[table] ?? []) as Record<string, unknown>[]
      const match = tableData.find(row =>
        Object.entries(filters).every(([k, v]) => row[k] === v),
      )
      if (isInsert) return Promise.resolve({ data: insertPayload, error: null })
      if (isUpdate) return Promise.resolve({ data: { ...match, ...(updatePayload as object) }, error: null })
      return Promise.resolve({ data: match ?? null, error: match ? null : { message: 'Not found' } })
    })

    chain.maybeSingle = chain.single

    // Make thenable for queries without .single()
    chain.then = (resolve: (v: unknown) => void) => {
      const tableData = ((data as unknown as Record<string, unknown[]>)[table] ?? []) as Record<string, unknown>[]
      const filtered = tableData.filter(row =>
        Object.entries(filters).every(([k, v]) => {
          if (Array.isArray(v)) return v.includes(row[k])
          return row[k] === v
        }),
      )
      return resolve({ data: isInsert ? insertPayload : filtered, error: null, count: filtered.length })
    }

    return chain
  }

  const supabase = {
    from: vi.fn((table: string) => buildChain(table)),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: TEST_USER_ID } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'int-tok' } }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return {
    supabase: supabase as any,
    data,
    operations,
    /** Reset all data back to seed state */
    reset() {
      Object.assign(data, DEFAULT_SEED, seed)
      operations.length = 0
    },
    /** Get operations for a specific table */
    opsFor(table: string) {
      return operations.filter(op => op.table === table)
    },
  }
}
