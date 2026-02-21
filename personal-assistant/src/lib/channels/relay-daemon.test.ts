import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pollChannel, processNewMessages } from './relay-daemon'

// Mock gmail adapter
vi.mock('./gmail', () => ({
  gmailAdapter: {
    type: 'gmail',
    name: 'Gmail',
    description: 'Mock Gmail',
    icon: 'Mail',
    pull: vi.fn(),
    isAvailable: vi.fn(),
  },
}))

function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  }
  return {
    from: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  } as unknown as ReturnType<typeof createMockSupabase> & { _chain: typeof mockChain }
}

describe('relay-daemon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('pollChannel', () => {
    it('returns skipped when relay_enabled is false', async () => {
      const supabase = createMockSupabase()
      ;(supabase._chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { relay_enabled: false, config: {} },
        error: null,
      })

      const result = await pollChannel(supabase as any, 'org-1', 'gmail')
      expect(result.skipped).toBe(true)
      expect(result.messagesFound).toBe(0)
    })

    it('upserts messages from adapter', async () => {
      const { gmailAdapter } = await import('./gmail')
      ;(gmailAdapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'gmail-1',
          channel: 'gmail',
          externalId: 'msg-1',
          sender: 'Alice',
          senderEmail: 'alice@test.com',
          subject: 'Test',
          body: 'Hello',
          receivedAt: new Date('2026-01-01'),
          isActionable: false,
          priority: 'medium',
          metadata: {},
        },
      ])

      const supabase = createMockSupabase()
      ;(supabase._chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { relay_enabled: true, config: {}, poll_cursor: null },
        error: null,
      })

      const result = await pollChannel(supabase as any, 'org-1', 'gmail')
      expect(result.skipped).toBe(false)
      expect(result.messagesFound).toBe(1)
      expect(result.messagesInserted).toBe(1)
      expect(supabase.from).toHaveBeenCalledWith('channel_messages')
    })

    it('updates poll_cursor after successful poll', async () => {
      const { gmailAdapter } = await import('./gmail')
      const msgDate = new Date('2026-01-15T10:00:00Z')
      ;(gmailAdapter.pull as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'gmail-2',
          channel: 'gmail',
          externalId: 'msg-2',
          sender: 'Bob',
          body: 'Hi',
          receivedAt: msgDate,
          isActionable: false,
          priority: 'medium',
          metadata: {},
        },
      ])

      const supabase = createMockSupabase()
      ;(supabase._chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { relay_enabled: true, config: {}, poll_cursor: null },
        error: null,
      })

      await pollChannel(supabase as any, 'org-1', 'gmail')

      // Verify update was called on channel_connections
      expect(supabase.from).toHaveBeenCalledWith('channel_connections')
    })

    it('handles adapter errors gracefully', async () => {
      const { gmailAdapter } = await import('./gmail')
      ;(gmailAdapter.pull as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('IMAP timeout'))

      const supabase = createMockSupabase()
      ;(supabase._chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { relay_enabled: true, config: {}, poll_cursor: null },
        error: null,
      })

      const result = await pollChannel(supabase as any, 'org-1', 'gmail')
      expect(result.error).toBe('IMAP timeout')
      expect(result.messagesFound).toBe(0)
    })
  })

  describe('processNewMessages', () => {
    it('returns only unprocessed messages', async () => {
      const supabase = createMockSupabase()
      ;(supabase._chain.limit as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [
          {
            id: 'uuid-1',
            channel: 'gmail',
            external_id: 'msg-1',
            sender: 'Alice',
            sender_email: 'alice@test.com',
            subject: 'Test',
            body: 'Hello',
            received_at: '2026-01-01T00:00:00Z',
            is_actionable: false,
            priority: 'medium',
            processed: false,
            metadata: {},
          },
        ],
        error: null,
      })

      const messages = await processNewMessages(supabase as any, 'org-1')
      expect(messages).toHaveLength(1)
      expect(messages[0].externalId).toBe('msg-1')
      expect(messages[0].channel).toBe('gmail')
    })
  })
})
