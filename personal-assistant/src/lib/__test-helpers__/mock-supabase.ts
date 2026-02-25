import { vi } from 'vitest'

/**
 * Creates a mock Supabase client with chainable query builders.
 * Usage:
 *   const { supabase, setTableData } = createMockSupabase()
 *   setTableData('contacts', [{ id: 'c1', name: 'Alice' }])
 *   // supabase.from('contacts').select('*').eq('org_id', 'org-1') -> resolves to { data: [...], error: null }
 */
export function createMockSupabase() {
  const tableData: Record<string, unknown[]> = {}

  function setTableData(table: string, data: unknown[]) {
    tableData[table] = data
  }

  function buildChain(table: string) {
    const chain: Record<string, unknown> = {}
    const methods = [
      'select', 'insert', 'update', 'delete', 'upsert',
      'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
      'like', 'ilike', 'is', 'in', 'contains', 'overlaps',
      'or', 'and', 'not', 'filter',
      'order', 'limit', 'range', 'single', 'maybeSingle',
    ]
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain)
    }
    // Make thenable
    chain.then = (resolve: (v: unknown) => void) =>
      resolve({ data: tableData[table] ?? [], error: null })
    return chain
  }

  const supabase = {
    from: vi.fn((table: string) => buildChain(table)),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }

  return { supabase: supabase as any, setTableData }
}
