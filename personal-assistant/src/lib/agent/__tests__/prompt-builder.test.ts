import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

vi.mock('@/lib/context/loader', () => ({
  loadContext: vi.fn().mockResolvedValue({
    goals: [],
    tasks: [],
    contacts: [],
    recentActivity: [],
    columns: [],
  }),
}))

vi.mock('../policy-loader', () => ({
  loadPolicies: vi.fn().mockResolvedValue(''),
}))

vi.mock('../voice-loader', () => ({
  loadVoiceProfile: vi.fn().mockResolvedValue(''),
}))

vi.mock('@/lib/industry/registry', () => ({
  getPack: vi.fn().mockReturnValue({
    persona: { name: 'BitBit', context: 'a small business', systemPromptSuffix: '' },
  }),
  resolveIndustry: vi.fn().mockReturnValue('agency'),
}))

vi.mock('@/lib/context/entity-mention-scanner', () => ({
  scanForEntityMentions: vi.fn().mockReturnValue([]),
}))

vi.mock('@/lib/context/baseplate-snapshot', () => ({
  getBaseplateSnapshot: vi.fn().mockResolvedValue(null),
}))

vi.mock('../approval-queue', () => ({
  getPendingApprovals: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/intelligence/standing-orders', () => ({
  getActiveOrders: vi.fn().mockResolvedValue([]),
  formatOrdersForPrompt: vi.fn().mockReturnValue(''),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/intelligence/reflexion', () => ({
  getRelevantStrategies: vi.fn().mockResolvedValue([]),
  formatStrategiesForPrompt: vi.fn().mockReturnValue(''),
}))

// Stub fs-based cache reading so getChannelSummary / getTodayEvents / getDueReminders
// don't hit the real filesystem.
vi.mock('fs', () => ({
  readFileSync: vi.fn().mockReturnValue('[]'),
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
}))

// ---------------------------------------------------------------------------
// Import under test — AFTER mocks
// ---------------------------------------------------------------------------

import { BITBIT_IDENTITY_PREAMBLE, buildEntityAwarePrompt } from '../prompt-builder'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock Supabase client that handles the chained query builder pattern.
 * Each `.from(table)` call returns a builder supporting .select/.eq/.in/.order/.limit
 * and resolves via `await` (thenable) to the configured data.
 */
function createMockSupabase(
  tableData: Record<string, { data: unknown[] | null; error: null }> = {},
): SupabaseClient {
  function makeBuilder(table: string) {
    const result = tableData[table] ?? { data: [], error: null }
    const builder: Record<string, unknown> = {}
    // Every chainable method returns the same builder
    for (const method of ['select', 'eq', 'in', 'neq', 'order', 'limit', 'gt', 'lt', 'gte', 'lte', 'is', 'not']) {
      builder[method] = vi.fn().mockReturnValue(builder)
    }
    // Thenable so that `await supabase.from(...).select(...)...` resolves
    builder.then = (resolve: (v: unknown) => void) => resolve(result)
    return builder
  }

  return {
    from: vi.fn().mockImplementation((table: string) => makeBuilder(table)),
  } as unknown as SupabaseClient
}

const ORG_ID = 'test-org-123'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

afterEach(() => vi.restoreAllMocks())

describe('BITBIT_IDENTITY_PREAMBLE', () => {
  it('contains the core identity statement', () => {
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('You are BitBit')
  })

  it('includes DO before DESCRIBE rule', () => {
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('DO before DESCRIBE')
  })

  it('includes Collective Voice section', () => {
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('Collective Voice')
  })

  it('includes integration transparency rules', () => {
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('Integration Transparency')
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('NEVER mention')
    expect(BITBIT_IDENTITY_PREAMBLE).toContain('Composio')
  })
})

describe('buildEntityAwarePrompt', () => {
  it('returns a string containing the identity preamble', async () => {
    const supabase = createMockSupabase()
    const result = await buildEntityAwarePrompt(supabase, ORG_ID, 'hello')
    expect(result).toContain('You are BitBit')
    expect(result).toContain('DO before DESCRIBE')
  })

  it('includes current date in the prompt', async () => {
    const supabase = createMockSupabase()
    const result = await buildEntityAwarePrompt(supabase, ORG_ID, 'hello')
    // The prompt formats the date in en-AU locale. Check that the current year appears.
    const year = new Date().getFullYear().toString()
    expect(result).toContain(year)
    expect(result).toContain('Date/Time:')
  })

  it('includes login email in user profile section', async () => {
    const supabase = createMockSupabase()
    const result = await buildEntityAwarePrompt(supabase, ORG_ID, 'hello', {
      email: 'tor@example.com',
      displayName: 'Tor',
    })
    expect(result).toContain('tor@example.com')
    expect(result).toContain('Login email (authenticated session): tor@example.com')
    expect(result).toContain('Who We Are')
    expect(result).toContain('Tor')
  })

  it('includes connected channels from channel_connections', async () => {
    const supabase = createMockSupabase({
      connector_last_activity: {
        data: [
          { channel_type: 'whatsapp', status: 'connected', last_sync: '2026-01-01T00:00:00Z', config: {} },
          { channel_type: 'gmail', status: 'connected', last_sync: '2026-01-02T00:00:00Z', config: { account_email: 'tor@gmail.com' } },
        ],
        error: null,
      },
    })
    const result = await buildEntityAwarePrompt(supabase, ORG_ID, 'hello')
    expect(result).toContain('Whatsapp')
    expect(result).toContain('Gmail')
    expect(result).toContain('Connected channels:')
  })

  it('shows iMessage routing hint ONLY when iMessage is connected', async () => {
    // With iMessage connected
    const supabaseWithImessage = createMockSupabase({
      connector_last_activity: {
        data: [
          { channel_type: 'imessage', status: 'connected', last_sync: '2026-01-01T00:00:00Z', config: {} },
        ],
        error: null,
      },
    })
    const withImessage = await buildEntityAwarePrompt(supabaseWithImessage, ORG_ID, 'hello')
    expect(withImessage).toContain('iMessage is connected')
    expect(withImessage).toContain('Routing:')

    // Without iMessage
    const supabaseNoImessage = createMockSupabase({
      connector_last_activity: {
        data: [
          { channel_type: 'whatsapp', status: 'connected', last_sync: null, config: {} },
        ],
        error: null,
      },
    })
    const withoutImessage = await buildEntityAwarePrompt(supabaseNoImessage, ORG_ID, 'hello')
    expect(withoutImessage).not.toContain('iMessage is connected')
  })

  it('loads connected emails from gmail/outlook channel_connections into user profile', async () => {
    const supabase = createMockSupabase({
      channel_connections: {
        data: [
          { channel_type: 'gmail', status: 'connected', last_sync: null, config: { account_email: 'tor@gmail.com' } },
          { channel_type: 'outlook', status: 'connected', last_sync: null, config: { account_email: 'tor@outlook.com' } },
        ],
        error: null,
      },
    })
    const result = await buildEntityAwarePrompt(supabase, ORG_ID, 'hello', {
      email: 'tor@example.com',
      displayName: 'Tor',
    })
    // The connected emails should appear as "Other connected email addresses"
    expect(result).toContain('tor@gmail.com')
    expect(result).toContain('tor@outlook.com')
    expect(result).toContain('Other connected email addresses')
  })

  it('omits user identity section when no profile is provided', async () => {
    const supabase = createMockSupabase()
    const result = await buildEntityAwarePrompt(supabase, ORG_ID, 'hello')
    // The "### Who We Are" header should not appear (it's only added by buildUserIdentitySection)
    // Note: the string "Who We Are" may appear elsewhere as a reference, so check the header form
    expect(result).not.toContain('### Who We Are')
    expect(result).not.toContain('Login email (authenticated session)')
  })

  it('shows "No channels connected yet." when no channels exist', async () => {
    const supabase = createMockSupabase({
      connector_last_activity: { data: [], error: null },
    })
    const result = await buildEntityAwarePrompt(supabase, ORG_ID, 'hello')
    expect(result).toContain('No channels connected yet.')
  })
})
