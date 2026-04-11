/**
 * RAG Backfill Service Integration Tests — Task #49
 *
 * Tests the end-to-end backfill pipeline:
 * - createBackfillJob() inserts a pending job
 * - runBackfill() reads channel_messages, embeds, updates progress
 * - Status transitions: pending → in_progress → completed / failed
 * - Cursor-based pagination (batches of 100)
 * - Resumability: job with existing cursor resumes from last position
 * - Error recovery: failures set status=failed with error_message
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../embedding-service', () => ({
  embedAndUpsert: vi.fn(),
}))

// ─── Imports ──────────────────────────────────────────────────────────────────

import { runBackfill, createBackfillJob, getBackfillStatus } from '../backfill-service'
import { embedAndUpsert } from '../embedding-service'

// ─── Supabase mock utilities ──────────────────────────────────────────────────

/**
 * Creates a "thenable chain" that mimics the Supabase query builder.
 *
 * Key insight: The backfill code builds the query lazily (no await on intermediate
 * chain calls), then conditionally calls .gt() after .limit(), and finally
 * awaits the whole chain. So the chain itself must be a Promise (have .then()).
 *
 * This factory returns a chain object that:
 * - Returns itself for all builder methods (.select, .eq, .gte, .gt, .order, .limit)
 * - Has a .then() so it can be awaited directly
 * - Has a .single() that resolves immediately (used for job loading)
 * - Has .update() that calls an optional callback and returns itself
 */
function makeQueryChain(
  resolveWith: { data: any; error: any },
  onUpdate?: (data: any) => void,
  onGt?: (col: string, val: string) => void
): any {
  const chain: any = {}

  // Builder methods — all return self for chaining
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.gte = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)

  chain.gt = vi.fn((col: string, val: string) => {
    onGt?.(col, val)
    return chain
  })

  // .limit() returns self (not a Promise) so .gt() can be called after it
  chain.limit = vi.fn(() => chain)

  // Make the chain itself awaitable: await chain resolves to resolveWith
  chain.then = (resolve: (v: any) => any, reject: (e: any) => any) => {
    return Promise.resolve(resolveWith).then(resolve, reject)
  }

  // .single() resolves immediately (used for job loading)
  chain.single = vi.fn(() => Promise.resolve(resolveWith))

  // .update() calls the optional callback and returns self for .eq() chaining
  chain.update = vi.fn((data: any) => {
    onUpdate?.(data)
    return chain
  })

  // .insert() chain for createBackfillJob
  chain.insert = vi.fn(() => chain)

  return chain
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const JOB_ID = 'job-abc-001'
const ORG_ID = 'org-test-123'
const CHANNEL = 'gmail'

function makePendingJob(overrides?: Record<string, any>) {
  return {
    id: JOB_ID,
    org_id: ORG_ID,
    channel_type: CHANNEL,
    status: 'pending',
    cursor: null,
    total_messages: 0,
    embedded_messages: 0,
    failed_messages: 0,
    backfill_days: 90,
    ...overrides,
  }
}

function makeMessages(count: number, baseDate = '2026-03-01T00:00:00Z') {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(baseDate)
    d.setMinutes(d.getMinutes() + i)
    return {
      id: `db-msg-${i}`,
      external_id: `ext-msg-${i}`,
      channel: CHANNEL,
      sender: `sender${i}@acme.com`,
      sender_email: `sender${i}@acme.com`,
      subject: `Subject ${i}`,
      body: `Message body for message ${i}.`,
      body_full: null as string | null,
      received_at: d.toISOString(),
    }
  })
}

/**
 * Builds a Supabase mock that serves a fixed job and a sequence of message batches.
 *
 * Each call to `from('channel_messages')` will consume the next batch from
 * `messageBatches`. When batches are exhausted, returns empty data.
 *
 * @param job        The backfill_jobs row to return on load
 * @param messageBatches  Array of message arrays — one per pagination call
 * @param callbacks  Optional hooks for observing update/gt calls
 */
function buildBackfillSupabase(
  job: ReturnType<typeof makePendingJob>,
  messageBatches: ReturnType<typeof makeMessages>[],
  callbacks: {
    onJobUpdate?: (data: any) => void
    onGt?: (col: string, val: string) => void
  } = {}
) {
  let batchIndex = 0

  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === 'backfill_jobs') {
        return makeQueryChain(
          { data: job, error: null },
          callbacks.onJobUpdate
        )
      }

      if (table === 'channel_messages') {
        const batch = batchIndex < messageBatches.length
          ? messageBatches[batchIndex++]
          : []
        return makeQueryChain(
          { data: batch, error: null },
          undefined,
          callbacks.onGt
        )
      }

      return makeQueryChain({ data: null, error: null })
    }),
  }

  return supabase
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Backfill Service — end-to-end integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 0, failed: 0, errors: [] })
  })

  // ── createBackfillJob ─────────────────────────────────────────────────────

  describe('createBackfillJob', () => {
    it('inserts a pending job and returns the new ID', async () => {
      const chain = makeQueryChain({ data: { id: JOB_ID }, error: null })
      const supabase: any = { from: vi.fn(() => chain) }

      const id = await createBackfillJob(supabase, ORG_ID, CHANNEL, 90)

      expect(id).toBe(JOB_ID)
      expect(supabase.from).toHaveBeenCalledWith('backfill_jobs')
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: ORG_ID,
          channel_type: CHANNEL,
          status: 'pending',
          backfill_days: 90,
        })
      )
    })

    it('throws when insert returns an error', async () => {
      const chain = makeQueryChain({ data: null, error: new Error('DB error') })
      const supabase: any = { from: vi.fn(() => chain) }

      await expect(createBackfillJob(supabase, ORG_ID, CHANNEL)).rejects.toThrow(
        'Failed to create backfill job'
      )
    })
  })

  // ── getBackfillStatus ─────────────────────────────────────────────────────

  describe('getBackfillStatus', () => {
    it('returns the job when found', async () => {
      const job = makePendingJob({ status: 'completed' })
      const chain = makeQueryChain({ data: job, error: null })
      const supabase: any = { from: vi.fn(() => chain) }

      const result = await getBackfillStatus(supabase, JOB_ID)

      expect(result).toMatchObject({ id: JOB_ID, status: 'completed' })
    })

    it('returns null when job is not found', async () => {
      const chain = makeQueryChain({ data: null, error: null })
      const supabase: any = { from: vi.fn(() => chain) }

      const result = await getBackfillStatus(supabase, 'nonexistent-job')

      expect(result).toBeNull()
    })
  })

  // ── runBackfill — happy path ──────────────────────────────────────────────

  describe('runBackfill — single batch', () => {
    it('marks job in_progress, embeds messages, then marks completed', async () => {
      const job = makePendingJob()
      const messages = makeMessages(3)

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 3, failed: 0, errors: [] })

      const updateCalls: any[] = []
      const supabase = buildBackfillSupabase(job, [messages, []], {
        onJobUpdate: (data) => updateCalls.push(data),
      })

      const result = await runBackfill(supabase, JOB_ID)

      expect(result.embedded).toBe(3)
      expect(result.failed).toBe(0)

      // embedAndUpsert called with docs for this org/channel
      expect(embedAndUpsert).toHaveBeenCalledOnce()
      const [docs] = vi.mocked(embedAndUpsert).mock.calls[0]
      expect(docs).toHaveLength(3)
      expect(docs[0].orgId).toBe(ORG_ID)
      expect(docs[0].metadata.channel).toBe(CHANNEL)

      // Status transitions
      expect(updateCalls.some(u => u?.status === 'in_progress')).toBe(true)
      expect(updateCalls.some(u => u?.status === 'completed')).toBe(true)
    })

    it('uses external_id as messageId when available', async () => {
      const job = makePendingJob()
      const messages = makeMessages(1)
      messages[0].external_id = 'gmail-external-id-abc'

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 1, failed: 0, errors: [] })

      const supabase = buildBackfillSupabase(job, [messages, []])
      await runBackfill(supabase, JOB_ID)

      const [docs] = vi.mocked(embedAndUpsert).mock.calls[0]
      expect(docs[0].messageId).toBe('gmail-external-id-abc')
      expect(docs[0].metadata.message_id).toBe('gmail-external-id-abc')
    })

    it('uses body_full when available, falls back to body', async () => {
      const job = makePendingJob()
      const messages = makeMessages(2)
      messages[0].body_full = 'Full body content'
      messages[0].body = 'Truncated body'
      messages[1].body_full = null
      messages[1].body = 'Only body content'

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 2, failed: 0, errors: [] })

      const supabase = buildBackfillSupabase(job, [messages, []])
      await runBackfill(supabase, JOB_ID)

      const [docs] = vi.mocked(embedAndUpsert).mock.calls[0]
      expect(docs[0].content).toBe('Full body content')
      expect(docs[0].metadata.is_full_body).toBe(true)
      expect(docs[1].content).toBe('Only body content')
      expect(docs[1].metadata.is_full_body).toBe(false)
    })
  })

  // ── runBackfill — cursor pagination ───────────────────────────────────────

  describe('runBackfill — cursor-based pagination', () => {
    it('processes messages across multiple batches, updating cursor after each', async () => {
      const job = makePendingJob()
      // Batch 1: 100 messages (full batch → continues)
      // Batch 2: 50 messages (partial → stops after this batch)
      const batch1 = makeMessages(100, '2026-03-01T00:00:00Z')
      const batch2 = makeMessages(50, '2026-03-02T00:00:00Z')

      const updatedCursors: string[] = []

      vi.mocked(embedAndUpsert)
        .mockResolvedValueOnce({ embedded: 100, failed: 0, errors: [] })
        .mockResolvedValueOnce({ embedded: 50, failed: 0, errors: [] })

      const supabase = buildBackfillSupabase(job, [batch1, batch2], {
        onJobUpdate: (data) => {
          if (data?.cursor !== undefined) updatedCursors.push(data.cursor)
        },
      })

      const result = await runBackfill(supabase, JOB_ID)

      // Two batches processed, each with its own embedAndUpsert call
      expect(embedAndUpsert).toHaveBeenCalledTimes(2)
      expect(result.embedded).toBe(150)
      expect(result.failed).toBe(0)

      // Cursor updated twice (once per batch)
      expect(updatedCursors).toHaveLength(2)
      expect(updatedCursors[0]).toBe(batch1[99].received_at)
      expect(updatedCursors[1]).toBe(batch2[49].received_at)
    })

    it('stops pagination when batch is smaller than batchSize (100)', async () => {
      const job = makePendingJob()
      // 30 messages < 100 batchSize → stops immediately after first batch
      const smallBatch = makeMessages(30)

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 30, failed: 0, errors: [] })

      // Only provide one batch — if a second fetch occurred it would return empty
      const supabase = buildBackfillSupabase(job, [smallBatch])

      await runBackfill(supabase, JOB_ID)

      // Only one embedAndUpsert call (no second batch)
      expect(embedAndUpsert).toHaveBeenCalledOnce()
    })

    it('stops pagination when batch returns empty results', async () => {
      const job = makePendingJob()
      const batch1 = makeMessages(100, '2026-03-01T00:00:00Z')
      // Second fetch returns empty → loop stops

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 100, failed: 0, errors: [] })

      const supabase = buildBackfillSupabase(job, [batch1, []])

      await runBackfill(supabase, JOB_ID)

      expect(embedAndUpsert).toHaveBeenCalledOnce()
    })
  })

  // ── runBackfill — resumability ────────────────────────────────────────────

  describe('runBackfill — resumability', () => {
    it('applies gt filter when job has an existing cursor', async () => {
      const existingCursor = '2026-03-05T12:00:00Z'
      const jobWithCursor = makePendingJob({
        cursor: existingCursor,
        embedded_messages: 200,
        failed_messages: 0,
        status: 'in_progress',
      })
      const resumeBatch = makeMessages(5, '2026-03-05T12:01:00Z')

      const gtCalls: Array<[string, string]> = []

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 5, failed: 0, errors: [] })

      const supabase = buildBackfillSupabase(jobWithCursor, [resumeBatch], {
        onGt: (col, val) => gtCalls.push([col, val]),
      })

      const result = await runBackfill(supabase, JOB_ID)

      // gt('received_at', cursor) must have been called
      expect(gtCalls).toContainEqual(['received_at', existingCursor])

      // embedded = pre-existing 200 + 5 new = 205
      expect(result.embedded).toBe(205)
      expect(result.failed).toBe(0)
    })

    it('accumulates embedded_messages on top of job initial state', async () => {
      const jobWithProgress = makePendingJob({
        cursor: '2026-03-03T00:00:00Z',
        embedded_messages: 150,
        failed_messages: 5,
      })
      const moreMsgs = makeMessages(10, '2026-03-03T01:00:00Z')

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 10, failed: 0, errors: [] })

      const supabase = buildBackfillSupabase(jobWithProgress, [moreMsgs])

      const result = await runBackfill(supabase, JOB_ID)

      // 150 pre-existing + 10 new = 160
      expect(result.embedded).toBe(160)
      // 5 pre-existing failures + 0 new = 5
      expect(result.failed).toBe(5)
    })

    it('does not apply gt filter when cursor is null (fresh job)', async () => {
      const freshJob = makePendingJob({ cursor: null })
      const messages = makeMessages(5)

      const gtCalls: Array<[string, string]> = []

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 5, failed: 0, errors: [] })

      const supabase = buildBackfillSupabase(freshJob, [messages], {
        onGt: (col, val) => gtCalls.push([col, val]),
      })

      await runBackfill(supabase, JOB_ID)

      // No gt call when cursor is null
      expect(gtCalls).toHaveLength(0)
    })
  })

  // ── runBackfill — error recovery ──────────────────────────────────────────

  describe('runBackfill — error recovery', () => {
    it('sets status=failed with error_message when embedAndUpsert throws', async () => {
      const job = makePendingJob()
      const messages = makeMessages(5)

      vi.mocked(embedAndUpsert).mockRejectedValue(new Error('Voyage API timeout'))

      const updateCalls: any[] = []
      const supabase = buildBackfillSupabase(job, [messages], {
        onJobUpdate: (data) => updateCalls.push(data),
      })

      // runBackfill catches the error internally and persists it
      await runBackfill(supabase, JOB_ID)

      const failedUpdate = updateCalls.find(u => u?.status === 'failed')
      expect(failedUpdate).toBeDefined()
      expect(failedUpdate.error_message).toContain('Voyage API timeout')
    })

    it('throws when job is not found', async () => {
      const chain = makeQueryChain({ data: null, error: null })
      const supabase: any = { from: vi.fn(() => chain) }

      await expect(runBackfill(supabase, 'nonexistent-id')).rejects.toThrow(
        'Backfill job nonexistent-id not found'
      )
    })

    it('exits loop and completes gracefully when channel_messages query errors', async () => {
      const job = makePendingJob()

      // Build a supabase that returns an error for channel_messages
      const jobChain = makeQueryChain({ data: job, error: null })
      const errorChain = makeQueryChain({ data: null, error: new Error('DB connection lost') })

      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'backfill_jobs') return jobChain
          if (table === 'channel_messages') return errorChain
          return makeQueryChain({ data: null, error: null })
        }),
      }

      // Should not throw — query errors cause the loop to break
      const result = await runBackfill(supabase, JOB_ID)

      expect(typeof result.embedded).toBe('number')
      expect(typeof result.failed).toBe('number')
    })
  })

  // ── runBackfill — filtering ───────────────────────────────────────────────

  describe('runBackfill — channel and org filtering', () => {
    it('queries channel_messages with correct org_id and channel filters', async () => {
      const job = makePendingJob()

      const eqCalls: Array<[string, string]> = []

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 0, failed: 0, errors: [] })

      // Intercept eq() calls on the channel_messages chain
      let batchIndex = 0
      const batches: ReturnType<typeof makeMessages>[] = [[], []]
      const supabase: any = {
        from: vi.fn((table: string) => {
          if (table === 'backfill_jobs') {
            return makeQueryChain({ data: job, error: null })
          }
          if (table === 'channel_messages') {
            const batch = batchIndex < batches.length ? batches[batchIndex++] : []
            const chain = makeQueryChain({ data: batch, error: null })
            // Wrap eq to intercept calls
            const origEq = chain.eq
            chain.eq = vi.fn((col: string, val: string) => {
              eqCalls.push([col, val])
              return origEq(col, val)
            })
            return chain
          }
          return makeQueryChain({ data: null, error: null })
        }),
      }

      await runBackfill(supabase, JOB_ID)

      expect(eqCalls).toContainEqual(['org_id', ORG_ID])
      expect(eqCalls).toContainEqual(['channel', CHANNEL])
    })

    it('skips messages with empty body', async () => {
      const job = makePendingJob()
      const messages = makeMessages(3)
      // Nullify body for middle message
      messages[1].body = ''
      messages[1].body_full = null

      vi.mocked(embedAndUpsert).mockResolvedValue({ embedded: 2, failed: 0, errors: [] })

      const supabase = buildBackfillSupabase(job, [messages])
      await runBackfill(supabase, JOB_ID)

      const [docs] = vi.mocked(embedAndUpsert).mock.calls[0]
      // Empty-body message should be filtered out
      expect(docs).toHaveLength(2)
      expect(docs.every(d => d.content.length > 0)).toBe(true)
    })

    it('does not call embedAndUpsert when all messages have empty bodies', async () => {
      const job = makePendingJob()
      const messages = makeMessages(2)
      messages[0].body = ''
      messages[0].body_full = null
      messages[1].body = ''
      messages[1].body_full = null

      const supabase = buildBackfillSupabase(job, [messages])
      await runBackfill(supabase, JOB_ID)

      // No docs to embed → embedAndUpsert should NOT be called
      expect(embedAndUpsert).not.toHaveBeenCalled()
    })
  })
})
