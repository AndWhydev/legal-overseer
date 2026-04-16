import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockExecuteBrowserTask = vi.fn()

vi.mock('@/lib/browser/browser-task', () => ({
  executeBrowserTask: (...args: unknown[]) => mockExecuteBrowserTask(...args),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { browserToolDefinitions, browserToolHandlers } from '../browser-tools'

// ---------------------------------------------------------------------------
// Supabase test helper: builds a chainable mock that returns either a matching
// connection row (ownedConnection) or null (not owned by this org).
// ---------------------------------------------------------------------------

function buildSupabase(
  rowsByQuery: (filters: Record<string, string>) => { data: unknown; error: unknown },
): SupabaseClient {
  const from = vi.fn((_table: string) => {
    const filters: Record<string, string> = {}
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: string) => {
        filters[col] = val
        return chain
      }),
      maybeSingle: vi.fn(async () => rowsByQuery(filters)),
      single: vi.fn(async () => rowsByQuery(filters)),
    }
    return chain
  })
  return { from } as unknown as SupabaseClient
}

const ownedConnectionSupabase = buildSupabase((filters) => {
  if (
    filters.org_id === 'org-1' &&
    filters.connected_account_id === 'conn_owned'
  ) {
    return { data: { id: 'oc_123' }, error: null }
  }
  return { data: null, error: null }
})

const noConnectionSupabase = buildSupabase(() => ({ data: null, error: null }))

const mockSupabase = noConnectionSupabase

// ---------------------------------------------------------------------------
// Tests: definitions
// ---------------------------------------------------------------------------

describe('browser tool definitions', () => {
  it('defines spawn_browser_agent tool', () => {
    const toolNames = browserToolDefinitions.map(t => t.name)
    expect(toolNames).toContain('spawn_browser_agent')
    expect(toolNames).toHaveLength(1)
  })

  it('spawn_browser_agent requires instruction', () => {
    const tool = browserToolDefinitions.find(t => t.name === 'spawn_browser_agent')!
    expect(tool.input_schema.required).toContain('instruction')
  })

  it('spawn_browser_agent has optional start_url, max_steps, output_schema', () => {
    const tool = browserToolDefinitions.find(t => t.name === 'spawn_browser_agent')!
    const props = tool.input_schema.properties as Record<string, unknown>
    expect(props).toHaveProperty('start_url')
    expect(props).toHaveProperty('max_steps')
    expect(props).toHaveProperty('output_schema')
  })

  it('spawn_browser_agent accepts credential injection params', () => {
    const tool = browserToolDefinitions.find(t => t.name === 'spawn_browser_agent')!
    const props = tool.input_schema.properties as Record<string, any>

    // All four credential-related params must be in the schema so TAOR can
    // request credential injection.
    expect(props).toHaveProperty('credential_source')
    expect(props).toHaveProperty('composio_connection_id')
    expect(props).toHaveProperty('op_secret_ref')
    expect(props).toHaveProperty('username_selector')
    expect(props).toHaveProperty('password_selector')

    // credential_source must be a constrained enum.
    expect(props.credential_source.enum).toEqual(['none', 'composio', '1password'])

    // None of the credential params are required — they're conditional on
    // credential_source and validated by the handler.
    expect(tool.input_schema.required).not.toContain('credential_source')
    expect(tool.input_schema.required).not.toContain('composio_connection_id')
    expect(tool.input_schema.required).not.toContain('op_secret_ref')
  })
})

// ---------------------------------------------------------------------------
// Tests: handler
// ---------------------------------------------------------------------------

describe('spawn_browser_agent handler', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BROWSERBASE_API_KEY = 'bb_test'
    process.env.BROWSERBASE_PROJECT_ID = 'proj_test'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns error when BROWSERBASE_API_KEY is missing', async () => {
    delete process.env.BROWSERBASE_API_KEY

    const result = await browserToolHandlers.spawn_browser_agent(
      { instruction: 'do something' },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('BROWSERBASE_API_KEY')
    expect(mockExecuteBrowserTask).not.toHaveBeenCalled()
  })

  it('returns error when BROWSERBASE_PROJECT_ID is missing', async () => {
    delete process.env.BROWSERBASE_PROJECT_ID

    const result = await browserToolHandlers.spawn_browser_agent(
      { instruction: 'do something' },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('BROWSERBASE_PROJECT_ID')
  })

  it('calls executeBrowserTask with correct params', async () => {
    mockExecuteBrowserTask.mockResolvedValue({
      status: 'completed',
      message: 'Done',
      actions: [{ stepIndex: 0, type: 'act', description: 'clicked', timestamp: '2026-04-10T00:00:00Z', success: true }],
      durationMs: 5000,
      usage: { inputTokens: 100, outputTokens: 50 },
    })

    const result = await browserToolHandlers.spawn_browser_agent(
      {
        instruction: 'Find the pricing page',
        start_url: 'https://example.com',
        max_steps: 5,
        output_schema: { type: 'object', properties: { price: { type: 'string' } } },
      },
      'org-1',
      mockSupabase,
    )

    expect(mockExecuteBrowserTask).toHaveBeenCalledWith(
      {
        instruction: 'Find the pricing page',
        startUrl: 'https://example.com',
        maxSteps: 5,
        outputSchema: { type: 'object', properties: { price: { type: 'string' } } },
      },
      {
        orgId: 'org-1',
        supabase: mockSupabase,
        ltvMultiplier: 1.0,
        credentialSource: 'none',
        credentialOptions: undefined,
      },
    )
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).status).toBe('completed')
    expect((result.data as Record<string, unknown>).message).toBe('Done')
  })

  it('returns failure when task status is failed', async () => {
    mockExecuteBrowserTask.mockResolvedValue({
      status: 'failed',
      error: 'Page not found',
      actions: [],
      durationMs: 1000,
    })

    const result = await browserToolHandlers.spawn_browser_agent(
      { instruction: 'go somewhere' },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Page not found')
  })

  it('catches unexpected exceptions', async () => {
    mockExecuteBrowserTask.mockRejectedValue(new Error('SDK exploded'))

    const result = await browserToolHandlers.spawn_browser_agent(
      { instruction: 'do something' },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('SDK exploded')
  })

  it('passes through extractedData on success', async () => {
    mockExecuteBrowserTask.mockResolvedValue({
      status: 'completed',
      message: 'Extracted',
      extractedData: { price: '$99/mo', tier: 'Enterprise' },
      actions: [],
      durationMs: 3000,
    })

    const result = await browserToolHandlers.spawn_browser_agent(
      { instruction: 'extract pricing' },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(true)
    const data = result.data as Record<string, unknown>
    expect(data.extractedData).toEqual({ price: '$99/mo', tier: 'Enterprise' })
  })

  // ---- Credential injection ------------------------------------------------

  it('forwards Composio credential params to executeBrowserTask after ownership check', async () => {
    mockExecuteBrowserTask.mockResolvedValue({
      status: 'completed',
      message: 'Logged in',
      actions: [],
      durationMs: 2000,
    })

    const result = await browserToolHandlers.spawn_browser_agent(
      {
        instruction: 'Log in and extract data',
        start_url: 'https://app.example.com',
        credential_source: 'composio',
        composio_connection_id: 'conn_owned',
        username_selector: '#user',
        password_selector: '#pw',
      },
      'org-1',
      ownedConnectionSupabase,
    )

    expect(result.success).toBe(true)
    expect(mockExecuteBrowserTask).toHaveBeenCalledTimes(1)
    const [, options] = mockExecuteBrowserTask.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ]
    expect(options.credentialSource).toBe('composio')
    expect(options.credentialOptions).toEqual({
      composioConnectionId: 'conn_owned',
      opSecretRef: undefined,
      usernameSelector: '#user',
      passwordSelector: '#pw',
    })
  })

  it('rejects a Composio connection that belongs to another org', async () => {
    const result = await browserToolHandlers.spawn_browser_agent(
      {
        instruction: 'Try to use someone else\'s connection',
        credential_source: 'composio',
        composio_connection_id: 'conn_from_other_org',
      },
      'org-1',
      ownedConnectionSupabase, // returns null for this connection id
    )

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found for this org/i)
    // Must fail-closed: the browser task must never be invoked when the
    // ownership check fails.
    expect(mockExecuteBrowserTask).not.toHaveBeenCalled()
  })

  it('requires composio_connection_id when credential_source is composio', async () => {
    const result = await browserToolHandlers.spawn_browser_agent(
      {
        instruction: 'Missing connection id',
        credential_source: 'composio',
      },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('composio_connection_id')
    expect(mockExecuteBrowserTask).not.toHaveBeenCalled()
  })

  it('requires op_secret_ref when credential_source is 1password', async () => {
    const result = await browserToolHandlers.spawn_browser_agent(
      {
        instruction: 'Missing op ref',
        credential_source: '1password',
      },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('op_secret_ref')
    expect(mockExecuteBrowserTask).not.toHaveBeenCalled()
  })

  it('defaults credential_source to "none" when omitted', async () => {
    mockExecuteBrowserTask.mockResolvedValue({
      status: 'completed',
      message: 'ok',
      actions: [],
      durationMs: 1,
    })

    await browserToolHandlers.spawn_browser_agent(
      { instruction: 'no creds needed' },
      'org-1',
      mockSupabase,
    )

    const [, options] = mockExecuteBrowserTask.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ]
    expect(options.credentialSource).toBe('none')
    expect(options.credentialOptions).toBeUndefined()
  })
})
