// NOTE: next-test-api-route-handler must be the FIRST import per its docs.
import { testApiHandler } from 'next-test-api-route-handler'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────────────────

const { pipelineEvents, pipelineStub } = vi.hoisted(() => {
  const events: unknown[][] = [[]]
  const stub = vi.fn().mockImplementation(async function* (_message: unknown, _ctx: unknown) {
    const next = events.shift() ?? []
    for (const ev of next) yield ev
  })
  return {
    pipelineEvents: events,
    pipelineStub: stub,
  }
})

vi.mock('@/lib/conversation/unified-pipeline', () => ({
  UnifiedConversationPipeline: class {
    handleMessage = pipelineStub
  },
}))

vi.mock('@/lib/agent/registry-loader', () => ({
  loadAllAgents: () => {},
}))

vi.mock('@/lib/supabase/service-client', () => ({
  getServiceClient: () => ({}) as unknown,
}))

vi.mock('@/lib/security/timing-jitter', () => ({
  addTimingJitter: async () => {},
}))

vi.mock('@/lib/agent/injection-guard', () => ({
  detectInjection: () => ({ detected: false, patterns: [] }),
  neutralizeInjection: (m: string) => m,
}))

vi.mock('@/lib/api-rate-limiter', () => ({
  checkUserEndpointLimit: () => null,
}))

// Lazily import the route AFTER mocks are registered
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appHandler = await import('../route')

beforeAll(() => {
  process.env.DEV_BYPASS_AUTH = 'true'
})

afterEach(() => {
  pipelineEvents.length = 0
  pipelineEvents.push([])
  pipelineStub.mockClear()
})

// ── Helpers ───────────────────────────────────────────────────────────────

function enqueueEvents(events: unknown[]) {
  pipelineEvents[0] = events
}

async function readSseFrames(response: Response): Promise<Array<Record<string, unknown>>> {
  const text = await response.text()
  const frames: Array<Record<string, unknown>> = []
  for (const chunk of text.split('\n\n')) {
    const trimmed = chunk.trim()
    if (!trimmed.startsWith('data: ')) continue
    try {
      frames.push(JSON.parse(trimmed.slice('data: '.length)))
    } catch {
      // ignore malformed frames
    }
  }
  return frames
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('/api/agent/chat-legacy route (SSE transport)', () => {
  it('emits content_delta then done for a successful pipeline run', async () => {
    enqueueEvents([
      { type: 'content_delta', data: 'hi' },
      { type: 'done', data: {} },
    ])

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'say hi' }),
        })
        expect(res.status).toBe(200)
        const frames = await readSseFrames(res as unknown as Response)
        expect(frames).toEqual([
          { type: 'content_delta', data: 'hi' },
          { type: 'done', data: {} },
        ])
      },
    })
  })

  it('emits an error frame when the pipeline throws', async () => {
    pipelineStub.mockImplementationOnce(async function* () {
      throw new Error('API error: upstream exploded')
    })

    await testApiHandler({
      appHandler,
      test: async ({ fetch }) => {
        const res = await fetch({
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: 'fail please' }),
        })
        expect(res.status).toBe(200)
        const frames = await readSseFrames(res as unknown as Response)
        const errorFrame = frames.find(f => f.type === 'error')
        expect(errorFrame).toBeDefined()
        // The route intentionally emits a generic string, so we only assert shape + type.
        expect(typeof errorFrame!.data).toBe('string')
        expect((errorFrame!.data as string).length).toBeGreaterThan(0)
      },
    })
  })
})
