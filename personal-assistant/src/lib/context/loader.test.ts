import { describe, expect, it, vi } from 'vitest'

import { loadContext } from './loader'

function chain(data: unknown) {
  const api: Record<string, unknown> = {}
  api.select = vi.fn().mockReturnValue(api)
  api.eq = vi.fn().mockReturnValue(api)
  api.in = vi.fn().mockReturnValue(api)
  api.order = vi.fn().mockReturnValue(api)
  api.limit = vi.fn().mockReturnValue(api)
  api.neq = vi.fn().mockReturnValue(api)
  api.then = (resolve: (value: unknown) => void) => resolve({ data, error: null })
  return api
}

describe('loadContext', () => {
  it('prioritizes active contacts when contactLimit is set', async () => {
    const supabase = {
      from: vi.fn((table: string) => {
        switch (table) {
          case 'goals':
          case 'tasks':
          case 'kanban_columns':
          case 'activity_feed':
            return chain([])
          case 'entity_relationships':
            return chain([{ entity_id: 'c-2' }])
          case 'contacts':
            return chain([
              { id: 'c-1', name: 'Alpha', slug: 'alpha', type: 'client' },
              { id: 'c-2', name: 'Zulu', slug: 'zulu', type: 'lead' },
            ])
          default:
            throw new Error(`Unexpected table: ${table}`)
        }
      }),
    } as never

    const ctx = await loadContext(supabase, 'org-1', { contactLimit: 1 })

    expect(ctx.contacts).toEqual([{ name: 'Zulu', slug: 'zulu', type: 'lead' }])
  })
})
