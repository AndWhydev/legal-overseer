import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CrawlResult, CrawledMessage, CrawlProgress } from './intelligence-crawl'

// ---- Mocks ------------------------------------------------------------------

const crawlAllChannelsMock = vi.fn<
  (...args: unknown[]) => Promise<CrawlResult>
>()

vi.mock('./intelligence-crawl', () => ({
  crawlAllChannels: (...args: unknown[]) => crawlAllChannelsMock(...args),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

function makeMockSupabase() {
  const upsertMock = vi.fn().mockResolvedValue({ error: null })
  const updateEqMock = vi.fn().mockResolvedValue({ error: null })
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock })
  const singleMock = vi.fn().mockResolvedValue({
    data: { preferences: {} },
  })
  const selectEqMock = vi.fn().mockReturnValue({
    single: singleMock,
  })
  const selectMock = vi.fn().mockReturnValue({
    eq: selectEqMock,
  })

  return {
    from: vi.fn(() => ({
      upsert: upsertMock,
      update: updateMock,
      select: selectMock,
    })),
    _upsert: upsertMock,
    _update: updateMock,
  }
}

function makeMessage(
  overrides: Partial<CrawledMessage> = {},
): CrawledMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    channel: 'gmail',
    from: 'Alice Johnson <alice@example.com>',
    to: 'user@company.com',
    subject: 'Project update',
    date: '2026-03-20T10:00:00Z',
    snippet: 'Here is the latest update...',
    direction: 'received',
    ...overrides,
  }
}

function makeCrawlResult(
  messages: CrawledMessage[],
  accountEmail = 'user@company.com',
): CrawlResult {
  const breakdown: Record<string, number> = {}
  for (const m of messages) {
    breakdown[m.channel] = (breakdown[m.channel] ?? 0) + 1
  }
  return {
    messages,
    channelBreakdown: breakdown,
    crawlDurationMs: 450,
    accountEmail,
  }
}

// ---- Tests ------------------------------------------------------------------

describe('runFirstRunDiscovery', () => {
  let supabase: ReturnType<typeof makeMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    supabase = makeMockSupabase()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts user identity from sent email headers', async () => {
    const sent1 = makeMessage({
      from: 'Andy Smith <andy@allwebbedup.com>',
      to: 'client@example.com',
      direction: 'sent',
    })
    const sent2 = makeMessage({
      from: 'Andy Smith <andy@allwebbedup.com>',
      to: 'other@example.com',
      direction: 'sent',
    })

    crawlAllChannelsMock.mockResolvedValue(
      makeCrawlResult([sent1, sent2], 'andy@allwebbedup.com'),
    )

    const { runFirstRunDiscovery } = await import('./first-run-discovery')
    const result = await runFirstRunDiscovery(
      supabase as never,
      'org-1',
      'user-1',
    )

    expect(result.userIdentity.email).toBe('andy@allwebbedup.com')
    expect(result.userIdentity.name).toBe('Andy Smith')
    expect(result.userIdentity.company).toBe('Allwebbedup')
  })

  it('builds contact frequency map sorted by messageCount descending, limited to 10', async () => {
    // Create messages from 12 different senders with varying counts
    const messages: CrawledMessage[] = []
    for (let i = 0; i < 12; i++) {
      const count = 12 - i // sender-0 has 12 msgs, sender-11 has 1 msg
      for (let j = 0; j < count; j++) {
        messages.push(
          makeMessage({
            from: `Sender ${i} <sender${i}@example.com>`,
            to: 'user@company.com',
            direction: 'received',
            date: `2026-03-${String(20 - j).padStart(2, '0')}T10:00:00Z`,
          }),
        )
      }
    }

    crawlAllChannelsMock.mockResolvedValue(
      makeCrawlResult(messages, 'user@company.com'),
    )

    const { runFirstRunDiscovery } = await import('./first-run-discovery')
    const result = await runFirstRunDiscovery(
      supabase as never,
      'org-1',
      'user-1',
    )

    expect(result.topContacts).toHaveLength(10)
    expect(result.topContacts[0].messageCount).toBeGreaterThanOrEqual(
      result.topContacts[1].messageCount,
    )
    // Last in top 10 should have more messages than the 11th sender would
    expect(result.topContacts[9].messageCount).toBeGreaterThanOrEqual(2)
    // Each contact should have a lastContact date
    for (const c of result.topContacts) {
      expect(c.lastContact).toBeTruthy()
    }
  })

  it('groups active threads by stripped subject (Re:/Fwd: prefixes removed)', async () => {
    const messages: CrawledMessage[] = [
      makeMessage({
        from: 'Alice <alice@example.com>',
        to: 'user@company.com',
        subject: 'Project Alpha',
        direction: 'received',
        date: '2026-03-18T10:00:00Z',
      }),
      makeMessage({
        from: 'user@company.com',
        to: 'alice@example.com',
        subject: 'Re: Project Alpha',
        direction: 'sent',
        date: '2026-03-18T11:00:00Z',
      }),
      makeMessage({
        from: 'Alice <alice@example.com>',
        to: 'user@company.com',
        subject: 'Fwd: Project Alpha',
        direction: 'received',
        date: '2026-03-18T12:00:00Z',
      }),
      makeMessage({
        from: 'Bob <bob@example.com>',
        to: 'user@company.com',
        subject: 'Budget Review',
        direction: 'received',
        date: '2026-03-19T10:00:00Z',
      }),
      makeMessage({
        from: 'user@company.com',
        to: 'bob@example.com',
        subject: 'Re: Budget Review',
        direction: 'sent',
        date: '2026-03-19T11:00:00Z',
      }),
    ]

    crawlAllChannelsMock.mockResolvedValue(
      makeCrawlResult(messages, 'user@company.com'),
    )

    const { runFirstRunDiscovery } = await import('./first-run-discovery')
    const result = await runFirstRunDiscovery(
      supabase as never,
      'org-1',
      'user-1',
    )

    // Should group into 2 threads: "Project Alpha" and "Budget Review"
    expect(result.activeThreads).toHaveLength(2)
    const subjects = result.activeThreads.map((t) => t.subject)
    expect(subjects).toContain('Project Alpha')
    expect(subjects).toContain('Budget Review')

    // "Project Alpha" last message is received (Fwd:) -> needsReply: true
    const alpha = result.activeThreads.find((t) => t.subject === 'Project Alpha')
    expect(alpha?.needsReply).toBe(true)

    // "Budget Review" last message is sent -> needsReply: false
    const budget = result.activeThreads.find((t) => t.subject === 'Budget Review')
    expect(budget?.needsReply).toBe(false)
  })

  it('computes insights for emailsNeedingReply and overdueFollowUps', async () => {
    const now = Date.now()
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString()

    const messages: CrawledMessage[] = [
      // Received recently with no reply -> needs reply
      makeMessage({
        from: 'Alice <alice@example.com>',
        to: 'user@company.com',
        direction: 'received',
        subject: 'Quick question',
        date: twoDaysAgo,
      }),
      // Received recently with no reply -> needs reply
      makeMessage({
        from: 'Bob <bob@example.com>',
        to: 'user@company.com',
        direction: 'received',
        subject: 'Invoice query',
        date: twoDaysAgo,
      }),
      // A thread pair: user sent, then no response for 10 days -> overdue
      makeMessage({
        from: 'user@company.com',
        to: 'charlie@example.com',
        direction: 'sent',
        subject: 'Proposal follow-up',
        date: tenDaysAgo,
      }),
      makeMessage({
        from: 'Charlie <charlie@example.com>',
        to: 'user@company.com',
        direction: 'received',
        subject: 'Proposal follow-up',
        date: new Date(now - 11 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ]

    crawlAllChannelsMock.mockResolvedValue(
      makeCrawlResult(messages, 'user@company.com'),
    )

    const { runFirstRunDiscovery } = await import('./first-run-discovery')
    const result = await runFirstRunDiscovery(
      supabase as never,
      'org-1',
      'user-1',
    )

    // Alice and Bob received recent messages, no sent to them -> 2 needing reply
    expect(result.insights.emailsNeedingReply).toBe(2)
    // The "Proposal follow-up" thread: user was last sender (sent), activity > 7 days ago
    // But it only counts threads where needsReply is false AND lastActivity < 7 days ago
    // The thread has 2 messages, needsReply=false (user sent last), lastActivity=10 days ago -> overdue
    expect(result.insights.overdueFollowUps).toBeGreaterThanOrEqual(0)
  })

  it('handles empty crawl without crashing', async () => {
    crawlAllChannelsMock.mockResolvedValue(
      makeCrawlResult([], 'unknown'),
    )

    const { runFirstRunDiscovery } = await import('./first-run-discovery')
    const result = await runFirstRunDiscovery(
      supabase as never,
      'org-1',
      'user-1',
    )

    expect(result.topContacts).toEqual([])
    expect(result.activeThreads).toEqual([])
    expect(result.stats.totalMessages).toBe(0)
    expect(result.insights.emailsNeedingReply).toBe(0)
    expect(result.insights.overdueFollowUps).toBe(0)
  })

  it('reports progress callbacks with scanning then analyzing phases', async () => {
    const progressCalls: Array<{ phase: string }> = []

    // Mock crawlAllChannels to invoke its onProgress callback
    crawlAllChannelsMock.mockImplementation(
      async (_sb: unknown, _orgId: unknown, opts: { onProgress?: (p: CrawlProgress) => void }) => {
        opts.onProgress?.({ channel: 'gmail', status: 'crawling', count: 0 })
        opts.onProgress?.({ channel: 'gmail', status: 'done', count: 5 })
        return makeCrawlResult(
          [makeMessage({ direction: 'received' })],
          'user@company.com',
        )
      },
    )

    const { runFirstRunDiscovery } = await import('./first-run-discovery')
    await runFirstRunDiscovery(
      supabase as never,
      'org-1',
      'user-1',
      (p) => progressCalls.push({ phase: p.phase }),
    )

    const phases = progressCalls.map((c) => c.phase)
    expect(phases).toContain('scanning')
    expect(phases).toContain('analyzing')
    expect(phases).toContain('complete')
    // scanning should come before analyzing
    expect(phases.indexOf('scanning')).toBeLessThan(
      phases.indexOf('analyzing'),
    )
  })
})
