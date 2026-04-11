import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                { id: '1', agent_type: 'invoice-flow', error_message: 'timeout', created_at: '2026-03-11T00:00:00Z' }
              ],
              error: null
            })
          })
        })
      })
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) }
  }))
}))

describe('GET /api/admin/dlq', () => {
  it('returns unresolved DLQ entries ordered by created_at desc', async () => {
    const { GET } = await import('./route')
    const response = await GET()
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].agent_type).toBe('invoice-flow')
  })
})
