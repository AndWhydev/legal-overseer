import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deadLetter, getUnresolvedDeadLetters, resolveDeadLetter, type DeadLetterEntry } from './dead-letter'

function createMockSupabase() {
  const mock: Record<string, ReturnType<typeof vi.fn>> = {}
  const chainMethods = ['from', 'select', 'insert', 'eq', 'is', 'order', 'limit', 'update']
  for (const m of chainMethods) {
    mock[m] = vi.fn().mockImplementation(() => mock)
  }
  mock.single = vi.fn()
  return mock
}

describe('dead-letter', () => {
  describe('deadLetter', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('inserts entry into dead_letter_queue table', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dlq-123' },
        error: null,
      })

      const entry = {
        agent_type: 'lead-swarm',
        org_id: 'org-1',
        error_message: 'Failed to process lead',
        error_stack: 'Error: Network timeout\n    at processLead',
        payload: { leadId: '123', email: 'test@example.com' },
        agent_config_id: 'config-1',
        agent_run_id: 'run-1',
      }

      const result = await deadLetter(mockSupabase as any, entry)

      expect(result).toEqual({ id: 'dlq-123' })
      expect(mockSupabase.from).toHaveBeenCalledWith('dead_letter_queue')
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_type: 'lead-swarm',
          org_id: 'org-1',
          error_message: 'Failed to process lead',
          error_stack: 'Error: Network timeout\n    at processLead',
          payload: { leadId: '123', email: 'test@example.com' },
          agent_config_id: 'config-1',
          agent_run_id: 'run-1',
        }),
      )
    })

    it('handles optional error_stack field', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dlq-456' },
        error: null,
      })

      const entry = {
        agent_type: 'invoice-flow',
        org_id: 'org-2',
        error_message: 'Invoice PDF generation failed',
        payload: { invoiceId: '999' },
      }

      const result = await deadLetter(mockSupabase as any, entry)

      expect(result).toEqual({ id: 'dlq-456' })
      const insertCall = mockSupabase.insert.mock.calls[0]?.[0]
      expect(insertCall?.error_stack).toBeNull()
    })

    it('handles optional agent_config_id and agent_run_id', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dlq-789' },
        error: null,
      })

      const entry = {
        agent_type: 'sentry',
        org_id: 'org-3',
        error_message: 'Alert processing failed',
        payload: { alertId: 'a1' },
      }

      const result = await deadLetter(mockSupabase as any, entry)

      expect(result).toEqual({ id: 'dlq-789' })
      const insertCall = mockSupabase.insert.mock.calls[0]?.[0]
      expect(insertCall?.agent_config_id).toBeNull()
      expect(insertCall?.agent_run_id).toBeNull()
    })

    it('returns null on Supabase error without throwing', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Unique constraint violation' },
      })

      const entry = {
        agent_type: 'lead-swarm',
        org_id: 'org-1',
        error_message: 'Duplicate processing',
        payload: {},
      }

      const result = await deadLetter(mockSupabase as any, entry)

      expect(result).toBeNull()
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('returns null on unexpected exception without throwing', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSupabase.single.mockRejectedValueOnce(new Error('Network error during insert'))

      const entry = {
        agent_type: 'invoice-flow',
        org_id: 'org-1',
        error_message: 'Network failure',
        payload: {},
      }

      const result = await deadLetter(mockSupabase as any, entry)

      expect(result).toBeNull()
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('never throws and allows caller flow to continue', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockSupabase.single.mockRejectedValueOnce(new Error('DB down'))

      const entry = {
        agent_type: 'sentry',
        org_id: 'org-1',
        error_message: 'Processing failed',
        payload: {},
      }

      // Should not throw
      await expect(deadLetter(mockSupabase as any, entry)).resolves.toBeNull()
      spy.mockRestore()
    })

    it('returns the inserted ID in result object', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dlq-uuid-abc123' },
        error: null,
      })

      const entry = {
        agent_type: 'lead-swarm',
        org_id: 'org-1',
        error_message: 'Error',
        payload: {},
      }

      const result = await deadLetter(mockSupabase as any, entry)

      expect(result?.id).toBe('dlq-uuid-abc123')
    })

    it('handles complex nested payload', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dlq-123' },
        error: null,
      })

      const entry = {
        agent_type: 'lead-swarm',
        org_id: 'org-1',
        error_message: 'Complex failure',
        payload: {
          lead: { id: '123', name: 'John', email: 'john@example.com' },
          context: { source: 'webhook', timestamp: '2026-01-15T10:00:00Z' },
          metadata: { retryCount: 3, lastAttempt: '2026-01-15T09:50:00Z' },
        },
      }

      const result = await deadLetter(mockSupabase as any, entry)

      expect(result?.id).toBe('dlq-123')
      const insertCall = mockSupabase.insert.mock.calls[0]?.[0]
      expect(insertCall?.payload).toEqual(entry.payload)
    })
  })

  describe('getUnresolvedDeadLetters', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('fetches unresolved entries for org', async () => {
      const entries = [
        {
          id: 'dlq-1',
          agent_type: 'lead-swarm',
          org_id: 'org-1',
          error_message: 'Error 1',
          payload: {},
          created_at: '2026-01-15T10:00:00Z',
          resolved_at: null,
        },
        {
          id: 'dlq-2',
          agent_type: 'invoice-flow',
          org_id: 'org-1',
          error_message: 'Error 2',
          payload: {},
          created_at: '2026-01-15T09:50:00Z',
          resolved_at: null,
        },
      ]

      mockSupabase.limit.mockResolvedValueOnce({
        data: entries,
        error: null,
      })

      const result = await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      expect(result).toEqual(entries)
      expect(mockSupabase.from).toHaveBeenCalledWith('dead_letter_queue')
      expect(mockSupabase.eq).toHaveBeenCalledWith('org_id', 'org-1')
    })

    it('filters for resolved_at is null', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      expect(mockSupabase.is).toHaveBeenCalledWith('resolved_at', null)
    })

    it('orders by created_at descending', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', { ascending: false })
    })

    it('uses custom limit when provided', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await getUnresolvedDeadLetters(mockSupabase as any, 'org-1', 100)

      expect(mockSupabase.limit).toHaveBeenCalledWith(100)
    })

    it('uses default limit of 50', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [],
        error: null,
      })

      await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      expect(mockSupabase.limit).toHaveBeenCalledWith(50)
    })

    it('returns empty array on error without throwing', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSupabase.limit.mockResolvedValueOnce({
        data: null,
        error: { message: 'Query failed' },
      })

      const result = await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      expect(result).toEqual([])
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('returns empty array on unexpected exception', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSupabase.limit.mockRejectedValueOnce(new Error('Network error'))

      const result = await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      expect(result).toEqual([])
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('handles null data response', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSupabase.limit.mockResolvedValueOnce({
        data: null,
        error: null,
      })

      const result = await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      expect(result).toEqual([])
      spy.mockRestore()
    })

    it('returns entries with all optional fields populated', async () => {
      const entries = [
        {
          id: 'dlq-1',
          agent_type: 'lead-swarm',
          org_id: 'org-1',
          error_message: 'Error details',
          error_stack: 'Stack trace here',
          payload: { key: 'value' },
          agent_config_id: 'config-1',
          agent_run_id: 'run-1',
          created_at: '2026-01-15T10:00:00Z',
          resolved_at: null,
        },
      ]

      mockSupabase.limit.mockResolvedValueOnce({
        data: entries,
        error: null,
      })

      const result = await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(entries[0])
    })
  })

  describe('resolveDeadLetter', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('marks entry as resolved with current timestamp', async () => {
      mockSupabase.eq.mockResolvedValueOnce({
        error: null,
      })

      vi.setSystemTime(new Date('2026-01-15T10:30:00Z'))

      const result = await resolveDeadLetter(mockSupabase as any, 'dlq-123')

      expect(result).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('dead_letter_queue')
      expect(mockSupabase.update).toHaveBeenCalledWith({
        resolved_at: '2026-01-15T10:30:00.000Z',
      })
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'dlq-123')
    })

    it('returns false on Supabase error without throwing', async () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockSupabase.eq.mockResolvedValueOnce({
        error: { message: 'Update failed' },
      })

      const result = await resolveDeadLetter(mockSupabase as any, 'dlq-123')

      expect(result).toBe(false)
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })

    it('returns false on unexpected exception', async () => {
      mockSupabase.eq.mockRejectedValueOnce(new Error('Network error'))

      const result = await resolveDeadLetter(mockSupabase as any, 'dlq-123')

      expect(result).toBe(false)
    })

    it('updates correct record by id', async () => {
      mockSupabase.eq.mockResolvedValueOnce({
        error: null,
      })

      await resolveDeadLetter(mockSupabase as any, 'dlq-specific-id')

      expect(mockSupabase.eq).toHaveBeenCalledWith('id', 'dlq-specific-id')
    })

    it('returns true on successful update', async () => {
      mockSupabase.eq.mockResolvedValueOnce({
        error: null,
      })

      const result = await resolveDeadLetter(mockSupabase as any, 'dlq-123')

      expect(result).toBe(true)
    })

    it('handles various date formats correctly', async () => {
      mockSupabase.eq.mockResolvedValueOnce({
        error: null,
      })

      vi.setSystemTime(new Date('2026-12-31T23:59:59Z'))

      await resolveDeadLetter(mockSupabase as any, 'dlq-123')

      const updateCall = mockSupabase.update.mock.calls[0]?.[0]
      expect(updateCall?.resolved_at).toMatch(/2026-12-31T23:59:59/)
    })
  })

  describe('integration scenarios', () => {
    let mockSupabase: ReturnType<typeof createMockSupabase>

    beforeEach(() => {
      mockSupabase = createMockSupabase()
    })

    it('dead letters an error and retrieves it unresolved', async () => {
      // Insert dead letter
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 'dlq-999' },
        error: null,
      })

      const entry = {
        agent_type: 'lead-swarm',
        org_id: 'org-1',
        error_message: 'Processing failed',
        payload: { leadId: '123' },
      }

      const insertResult = await deadLetter(mockSupabase as any, entry)
      expect(insertResult?.id).toBe('dlq-999')

      // Now fetch unresolved entries
      mockSupabase.limit.mockResolvedValueOnce({
        data: [
          {
            id: 'dlq-999',
            agent_type: 'lead-swarm',
            org_id: 'org-1',
            error_message: 'Processing failed',
            payload: { leadId: '123' },
            created_at: new Date().toISOString(),
            resolved_at: null,
          },
        ],
        error: null,
      })

      const unresolved = await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')
      expect(unresolved).toHaveLength(1)
      expect(unresolved[0].id).toBe('dlq-999')
    })

    it('resolves a dead letter after replay', async () => {
      // Resolve the entry
      mockSupabase.eq.mockResolvedValueOnce({
        error: null,
      })

      const result = await resolveDeadLetter(mockSupabase as any, 'dlq-999')
      expect(result).toBe(true)
    })

    it('filters out resolved entries from unresolved list', async () => {
      const unresolved = [
        {
          id: 'dlq-1',
          agent_type: 'lead-swarm',
          org_id: 'org-1',
          error_message: 'Error 1',
          payload: {},
          created_at: '2026-01-15T10:00:00Z',
          resolved_at: null,
        },
      ]

      mockSupabase.limit.mockResolvedValueOnce({
        data: unresolved,
        error: null,
      })

      const result = await getUnresolvedDeadLetters(mockSupabase as any, 'org-1')

      // Only unresolved (resolved_at is null) should be returned
      expect(result).toHaveLength(1)
      expect(result[0].resolved_at).toBeNull()
    })
  })
})
