import { describe, expect, it } from 'vitest'
import { listUserThreads } from './thread-resolver'

function createSupabaseMock(options: {
  rpcData?: Array<Record<string, unknown>>
  rpcError?: { message?: string } | null
  fallbackData?: Array<Record<string, unknown>>
}) {
  const fallbackBuilder = {
    eq() {
      return this
    },
    order() {
      return this
    },
    limit() {
      return this
    },
    then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
      return Promise.resolve(resolve({ data: options.fallbackData ?? [], error: null }))
    },
  }

  return {
    rpc: async () => ({ data: options.rpcData ?? null, error: options.rpcError ?? null }),
    from: () => ({
      select: () => fallbackBuilder,
    }),
  }
}

describe('listUserThreads', () => {
  it('keeps archived threads returned by the RPC so saved chats remain visible', async () => {
    const supabase = createSupabaseMock({
      rpcData: [
        {
          id: 'thread-active',
          title: 'Active chat',
          status: 'active',
          last_channel: 'web',
          message_count: 4,
          last_activity_at: '2026-03-31T09:00:00.000Z',
          preview: 'Latest active preview',
        },
        {
          id: 'thread-archived',
          title: 'Saved chat',
          status: 'archived',
          last_channel: 'web',
          message_count: 8,
          last_activity_at: '2026-03-30T09:00:00.000Z',
          preview: 'Older saved preview',
        },
      ],
    })

    const threads = await listUserThreads(supabase as never, 'user-1', 'org-1', 'web')

    expect(threads).toHaveLength(2)
    expect(threads.map(thread => thread.id)).toEqual(['thread-active', 'thread-archived'])
    expect(threads[1]?.status).toBe('archived')
  })

  it('keeps archived threads in the direct-query fallback as well', async () => {
    const supabase = createSupabaseMock({
      rpcError: { message: 'function list_user_threads does not exist' },
      fallbackData: [
        {
          id: 'thread-archived',
          title: 'Saved chat',
          status: 'archived',
          last_channel: 'web',
          message_count: 5,
          last_activity_at: '2026-03-30T09:00:00.000Z',
        },
      ],
    })

    const threads = await listUserThreads(supabase as never, 'user-1', 'org-1', 'web')

    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({
      id: 'thread-archived',
      status: 'archived',
      preview: null,
    })
  })
})
