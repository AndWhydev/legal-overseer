import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { pollChannel } from '@/lib/channels/relay-daemon'
import { runScheduledAgents } from '@/lib/agent/scheduler'
import { reflectOnEvent } from '@/lib/agent/reflection'
import { consolidateMemories } from '@/lib/agent/memory-consolidation'

const {
  anthropicCreateMock,
  gmailPullMock,
  isDuplicateMock,
  getOrgCredentialMock,
  runSentryTickMock,
  processSentryEscalationsMock,
  logAgentRunMock,
  canProceedMock,
  withCircuitBreakerMock,
  withRetryMock,
  logAuditEventMock,
  deadLetterMock,
} = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  gmailPullMock: vi.fn(),
  isDuplicateMock: vi.fn(),
  getOrgCredentialMock: vi.fn(),
  runSentryTickMock: vi.fn(),
  processSentryEscalationsMock: vi.fn(),
  logAgentRunMock: vi.fn(),
  canProceedMock: vi.fn(),
  withCircuitBreakerMock: vi.fn(),
  withRetryMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  deadLetterMock: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    return {
      messages: {
        create: anthropicCreateMock,
      },
    }
  }

  return {
    default: MockAnthropic,
  }
})

vi.mock('@/lib/channels/gmail', () => ({
  gmailAdapter: {
    type: 'gmail',
    name: 'Gmail',
    description: 'Mock Gmail adapter',
    icon: 'Mail',
    pull: gmailPullMock,
    isAvailable: vi.fn().mockReturnValue(true),
  },
}))

vi.mock('@/lib/channels/dedup', () => ({
  isDuplicate: isDuplicateMock,
  computeContentHash: vi.fn((sender: string, subject: string, body: string) => `${sender}|${subject}|${body}`),
}))

vi.mock('@/lib/integrations/credentials', () => ({
  getOrgCredential: getOrgCredentialMock,
}))

vi.mock('@/lib/agent/run-logger', () => ({
  logAgentRun: logAgentRunMock,
}))

vi.mock('@/lib/agent/sentry', () => ({
  runSentryTick: runSentryTickMock,
}))

vi.mock('@/lib/agent/sentry-escalation', () => ({
  processSentryEscalations: processSentryEscalationsMock,
}))

vi.mock('@/lib/agent/lead-swarm', () => ({
  runLeadSwarmTick: vi.fn(),
}))

vi.mock('@/lib/agent/invoice-flow', () => ({
  runInvoiceFlowTick: vi.fn(),
  createInvoiceFromIntent: vi.fn(),
  parseInvoiceIntent: vi.fn(),
}))

vi.mock('@/lib/agent/channel-triage', () => ({
  runTriage: vi.fn(),
  scorePriority: vi.fn(),
}))

vi.mock('@/lib/agent/client-comms', () => ({
  runClientCommsTick: vi.fn(),
}))

vi.mock('@/lib/agent/proposal-bot', () => ({
  runProposalBotTick: vi.fn(),
}))

vi.mock('@/lib/agent/client-onboarding', () => ({
  runOnboardingTick: vi.fn(),
}))

vi.mock('@/lib/agent/ad-script-gen', () => ({
  runAdScriptGenTick: vi.fn(),
}))

vi.mock('@/lib/agent/ai-search-optimizer', () => ({
  runAISearchTick: vi.fn(),
}))

vi.mock('@/lib/agent/tender-hunter', () => ({
  runTenderHunterTick: vi.fn(),
}))

vi.mock('@/lib/agent/quote-bot', () => ({
  runQuoteBotTick: vi.fn(),
}))

vi.mock('@/lib/agent/job-reminder', () => ({
  runJobReminderTick: vi.fn(),
}))

vi.mock('@/lib/agent/cost-guard', () => ({
  canProceed: canProceedMock,
}))

vi.mock('@/lib/agent/circuit-breaker', () => ({
  withCircuitBreaker: withCircuitBreakerMock,
}))

vi.mock('@/lib/agent/retry', () => ({
  withRetry: withRetryMock,
  isTransientError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/audit/logger', () => ({
  logAuditEvent: logAuditEventMock,
}))

vi.mock('@/lib/agent/dead-letter', () => ({
  deadLetter: deadLetterMock,
}))

type MemoryRow = {
  id: string
  org_id: string
  content: string
  category: string
  confidence: number
  entity_ids: string[]
  created_at: string
  source?: string
  is_active: boolean
  superseded_by?: string
}

type TestSupabaseClient = SupabaseClient

function createSemanticMemoriesSupabase(seed: MemoryRow[] = []) {
  const state = {
    memories: [...seed],
  }

  const supabase = {
    from(table: string) {
      if (table !== 'semantic_memories') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select(_cols?: string, options?: { count?: 'exact'; head?: boolean }) {
          const filters: Record<string, unknown> = {}

          const query = {
            eq(key: string, value: unknown) {
              filters[key] = value
              return query
            },
            ilike(key: string, value: unknown) {
              filters[`ilike:${key}`] = value
              return query
            },
            contains(key: string, value: unknown) {
              filters[`contains:${key}`] = value
              return query
            },
            order() {
              return query
            },
            limit() {
              return query
            },
            then(resolve: (value: unknown) => void) {
              const filtered = state.memories.filter((row) => {
                for (const [k, v] of Object.entries(filters)) {
                  if (k.startsWith('ilike:')) {
                    const col = k.replace('ilike:', '')
                    const rowValue = String((row as Record<string, unknown>)[col] ?? '').toLowerCase()
                    const expected = String(v ?? '').toLowerCase()
                    if (rowValue !== expected) return false
                    continue
                  }

                  if (k.startsWith('contains:')) {
                    const col = k.replace('contains:', '')
                    const expected = Array.isArray(v) ? v : []
                    const rowValue = (row as Record<string, unknown>)[col]
                    if (!Array.isArray(rowValue)) return false
                    const hasAll = expected.every((item) => rowValue.includes(item))
                    if (!hasAll) return false
                    continue
                  }

                  if ((row as Record<string, unknown>)[k] !== v) return false
                }

                return true
              })

              if (options?.count === 'exact' && options?.head) {
                return resolve({ data: null, error: null, count: filtered.length })
              }

              return resolve({ data: filtered, error: null })
            },
          }

          return query
        },

        insert(payload: Record<string, unknown>) {
          const record: MemoryRow = {
            id: String(payload.id ?? `mem-${state.memories.length + 1}`),
            org_id: String(payload.org_id),
            content: String(payload.content),
            category: String(payload.category ?? 'domain'),
            confidence: Number(payload.confidence ?? 0.7),
            entity_ids: (payload.entity_ids as string[]) ?? [],
            source: String(payload.source ?? 'test'),
            is_active: payload.is_active !== false,
            created_at: String(payload.created_at ?? new Date().toISOString()),
          }
          state.memories.push(record)
          return Promise.resolve({ error: null })
        },

        update(patch: Record<string, unknown>) {
          const filters: Record<string, unknown> = {}

          const query = {
            in(key: string, values: unknown[]) {
              filters[`in:${key}`] = values
              return query
            },
            eq(key: string, value: unknown) {
              filters[key] = value
              return query
            },
            then(resolve: (value: unknown) => void) {
              const ids = (filters['in:id'] as string[]) ?? null
              for (const memory of state.memories) {
                if (ids && !ids.includes(memory.id)) continue
                if (filters.org_id && memory.org_id !== filters.org_id) continue
                Object.assign(memory, patch)
              }
              return resolve({ data: null, error: null })
            },
          }

          return query
        },
      }
    },
  }

  return {
    supabase,
    state,
  }
}

type ConnectionRow = {
  org_id: string
  channel_type: 'gmail'
  relay_enabled: boolean
  config: Record<string, unknown>
  poll_cursor: string | null
  last_sync: string | null
}

type ChannelMessageRow = {
  id: string
  org_id: string
  channel: string
  external_id: string
  sender: string
  sender_email: string | null
  subject: string | null
  body: string
  received_at: string
  is_actionable: boolean
  priority: string
  processed: boolean
  metadata: Record<string, unknown>
  content_hash: string
  classification?: string
}

function createRelaySupabase(seedConnections: ConnectionRow[]) {
  const state = {
    connections: [...seedConnections],
    messages: [] as ChannelMessageRow[],
    nextMessageId: 1,
  }

  const supabase = {
    from(table: string) {
      if (table === 'channel_connections') {
        return {
          select() {
            const filters: Record<string, unknown> = {}

            return {
              eq(key: string, value: unknown) {
                filters[key] = value
                return this
              },
              single: () => {
                const row =
                  state.connections.find((connection) => {
                    if (filters.org_id && connection.org_id !== filters.org_id) return false
                    if (filters.channel_type && connection.channel_type !== filters.channel_type) return false
                    return true
                  }) ?? null

                return Promise.resolve({ data: row, error: row ? null : { message: 'not found' } })
              },
            }
          },

          update(patch: Record<string, unknown>) {
            const filters: Record<string, unknown> = {}
            const query = {
              eq(key: string, value: unknown) {
                filters[key] = value
                return query
              },
              then(resolve: (value: unknown) => void) {
                for (const connection of state.connections) {
                  if (filters.org_id && connection.org_id !== filters.org_id) continue
                  if (filters.channel_type && connection.channel_type !== filters.channel_type) continue
                  Object.assign(connection, patch)
                }
                return resolve({ data: null, error: null })
              },
            }
            return query
          },
        }
      }

      if (table === 'channel_messages') {
        return {
          upsert(payload: Omit<ChannelMessageRow, 'id'>) {
            const row: ChannelMessageRow = {
              id: `message-${state.nextMessageId++}`,
              ...payload,
            }
            state.messages.push(row)

            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: row.id }, error: null }),
              }),
            }
          },

          update(patch: Partial<ChannelMessageRow>) {
            const filters: Record<string, unknown> = {}
            const query = {
              eq(key: string, value: unknown) {
                filters[key] = value
                return query
              },
              then(resolve: (value: unknown) => void) {
                for (const message of state.messages) {
                  if (filters.id && message.id !== filters.id) continue
                  if (filters.org_id && message.org_id !== filters.org_id) continue
                  Object.assign(message, patch)
                }
                return resolve({ data: null, error: null })
              },
            }
            return query
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return {
    supabase,
    state,
  }
}

function createSchedulerSupabase(configs: Record<string, unknown>[]) {
  const state = {
    configs: [...configs],
    lastRunQueryCount: 0,
  }

  const supabase = {
    from(table: string) {
      if (table === 'agent_configs') {
        return {
          select() {
            const filters: Record<string, unknown> = {}
            const query = {
              eq(key: string, value: unknown) {
                filters[key] = value
                return query
              },
              then(resolve: (value: unknown) => void) {
                const filtered = state.configs.filter((config) =>
                  Object.entries(filters).every(([k, v]) => (config as Record<string, unknown>)[k] === v),
                )
                return resolve({ data: filtered, error: null })
              },
            }
            return query
          },
        }
      }

      if (table === 'agent_runs') {
        state.lastRunQueryCount += 1
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return {
                          limit: () => Promise.resolve({ data: [], error: null }),
                        }
                      },
                    }
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  return {
    supabase,
    state,
  }
}

afterEach(() => vi.restoreAllMocks())

beforeEach(() => {
  anthropicCreateMock.mockReset()
  gmailPullMock.mockReset()
  isDuplicateMock.mockReset()
  getOrgCredentialMock.mockReset()
  runSentryTickMock.mockReset()
  processSentryEscalationsMock.mockReset()
  logAgentRunMock.mockReset()
  canProceedMock.mockReset()
  withCircuitBreakerMock.mockReset()
  withRetryMock.mockReset()
  logAuditEventMock.mockReset()
  deadLetterMock.mockReset()

  process.env.ANTHROPIC_API_KEY = 'test-key'

  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})

  isDuplicateMock.mockResolvedValue({ duplicate: false })
  getOrgCredentialMock.mockResolvedValue(null)

  runSentryTickMock.mockResolvedValue({
    processed: 1,
    triggered: 1,
    alertsCreated: 0,
  })
  processSentryEscalationsMock.mockResolvedValue({
    processed: 0,
    escalated: 0,
    silenced: 0,
    failed: 0,
  })

  canProceedMock.mockResolvedValue({
    allowed: true,
    spentToday: 0,
    dailyLimit: 100,
    remainingBudget: 100,
  })

  withRetryMock.mockImplementation((fn: () => Promise<unknown>) => fn())
  withCircuitBreakerMock.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn())

  logAgentRunMock.mockResolvedValue({ id: 'run-id' })
  logAuditEventMock.mockResolvedValue(undefined)
  deadLetterMock.mockResolvedValue(undefined)
})

describe('Infrastructure Load Cycles Integration', () => {
  it('runs memory reflection + consolidation cycle while preserving tenant isolation', async () => {
    anthropicCreateMock
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                content: 'Org A prefers weekly updates.',
                category: 'workflow',
                confidence: 0.92,
              },
            ]),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                content: 'Org B prefers weekly updates.',
                category: 'workflow',
                confidence: 0.91,
              },
            ]),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              keep: ['mem-3'],
              deactivate: ['mem-org-a-old'],
              merge: [],
            }),
          },
        ],
      })

    const { supabase, state } = createSemanticMemoriesSupabase([
      {
        id: 'mem-org-a-old',
        org_id: 'org-A',
        content: 'Org A prefers monthly updates.',
        category: 'workflow',
        confidence: 0.71,
        entity_ids: ['contact-a'],
        created_at: '2026-03-01T00:00:00.000Z',
        is_active: true,
      },
      {
        id: 'mem-org-b-existing',
        org_id: 'org-B',
        content: 'Org B likes concise updates.',
        category: 'workflow',
        confidence: 0.8,
        entity_ids: ['contact-b'],
        created_at: '2026-03-01T00:00:00.000Z',
        is_active: true,
      },
    ])

    await reflectOnEvent(supabase as unknown as TestSupabaseClient, 'org-A', {
      eventType: 'message_received',
      eventData: { content: 'Please send weekly updates.' },
      entityType: 'contact',
      entityId: 'contact-a',
      entityName: 'Client A',
    })

    await reflectOnEvent(supabase as unknown as TestSupabaseClient, 'org-B', {
      eventType: 'message_received',
      eventData: { content: 'Weekly updates work for us.' },
      entityType: 'contact',
      entityId: 'contact-b',
      entityName: 'Client B',
    })

    const consolidation = await consolidateMemories(
      supabase as unknown as TestSupabaseClient,
      'org-A',
    )

    expect(consolidation).toEqual({ merged: 0, deactivated: 1, kept: 1 })

    expect(state.memories.find((m) => m.id === 'mem-org-a-old')?.is_active).toBe(false)

    const orgBActive = state.memories.filter((m) => m.org_id === 'org-B' && m.is_active)
    expect(orgBActive.map((memory) => memory.content)).toEqual([
      'Org B likes concise updates.',
      'Org B prefers weekly updates.',
    ])
  })

  it('processes 50 relay cycles deterministically without cross-tenant bleed', async () => {
    const { supabase, state } = createRelaySupabase([
      {
        org_id: 'org-A',
        channel_type: 'gmail',
        relay_enabled: true,
        config: { orgTag: 'org-A' },
        poll_cursor: null,
        last_sync: null,
      },
      {
        org_id: 'org-B',
        channel_type: 'gmail',
        relay_enabled: true,
        config: { orgTag: 'org-B' },
        poll_cursor: null,
        last_sync: null,
      },
    ])

    const perOrgCounter: Record<string, number> = {}
    gmailPullMock.mockImplementation(async (config: Record<string, unknown>) => {
      const orgTag = String(config.orgTag)
      perOrgCounter[orgTag] = (perOrgCounter[orgTag] ?? 0) + 1
      const loop = perOrgCounter[orgTag]

      return [
        {
          channel: 'gmail',
          externalId: `${orgTag}-msg-${loop}`,
          sender: `${orgTag}-sender`,
          senderEmail: `${orgTag.toLowerCase()}@example.com`,
          subject: `Loop ${loop}`,
          body: `Payload ${loop}`,
          receivedAt: new Date(`2026-03-05T10:${String(loop).padStart(2, '0')}:00.000Z`),
          isActionable: loop % 2 === 0,
          priority: 'medium',
          metadata: { loop, orgTag },
        },
      ]
    })

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) => {
        const orgId = index % 2 === 0 ? 'org-A' : 'org-B'
        return pollChannel(supabase as unknown as TestSupabaseClient, orgId, 'gmail')
      }),
    )

    expect(results).toHaveLength(50)
    expect(results.every((result) => !result.skipped && !result.error)).toBe(true)
    expect(results.every((result) => result.messagesFound === 1 && result.messagesInserted === 1)).toBe(true)

    expect(state.messages).toHaveLength(50)

    const orgAMessages = state.messages.filter((message) => message.org_id === 'org-A')
    const orgBMessages = state.messages.filter((message) => message.org_id === 'org-B')

    expect(orgAMessages).toHaveLength(25)
    expect(orgBMessages).toHaveLength(25)
    expect(state.messages.every((message) => message.classification === 'pending')).toBe(true)
    expect(state.connections.every((connection) => typeof connection.poll_cursor === 'string')).toBe(true)
  })

  it('simulates 10 due agent runs in one scheduler tick with guardrails engaged', async () => {
    const configs = Array.from({ length: 10 }, (_, index) => ({
      id: `config-${index + 1}`,
      org_id: `org-${index + 1}`,
      agent_type: 'sentry',
      schedule: { type: 'continuous' },
      enabled: true,
    }))

    const { supabase, state } = createSchedulerSupabase(configs)

    const result = await runScheduledAgents(supabase as unknown as TestSupabaseClient)

    expect(result).toHaveLength(10)
    expect(result.every((entry) => entry.triggered && entry.reason === 'due')).toBe(true)

    expect(state.lastRunQueryCount).toBe(10)
    expect(canProceedMock).toHaveBeenCalledTimes(10)
    expect(withRetryMock).toHaveBeenCalledTimes(10)
    expect(withCircuitBreakerMock).toHaveBeenCalledTimes(10)
    expect(runSentryTickMock).toHaveBeenCalledTimes(10)
    expect(processSentryEscalationsMock).toHaveBeenCalledTimes(10)
    expect(logAgentRunMock).toHaveBeenCalledTimes(10)
    expect(logAuditEventMock).toHaveBeenCalledTimes(10)
  })
})
