import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRunBrowserTask = vi.fn()

vi.mock('@/lib/browser/stagehand-client', () => ({
  runBrowserTask: (...args: unknown[]) => mockRunBrowserTask(...args),
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

const mockSupabase = {} as SupabaseClient

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
    expect(mockRunBrowserTask).not.toHaveBeenCalled()
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

  it('calls runBrowserTask with correct params', async () => {
    mockRunBrowserTask.mockResolvedValue({
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

    expect(mockRunBrowserTask).toHaveBeenCalledWith({
      instruction: 'Find the pricing page',
      startUrl: 'https://example.com',
      maxSteps: 5,
      outputSchema: { type: 'object', properties: { price: { type: 'string' } } },
    })
    expect(result.success).toBe(true)
    expect((result.data as Record<string, unknown>).status).toBe('completed')
    expect((result.data as Record<string, unknown>).message).toBe('Done')
  })

  it('returns failure when task status is failed', async () => {
    mockRunBrowserTask.mockResolvedValue({
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
    mockRunBrowserTask.mockRejectedValue(new Error('SDK exploded'))

    const result = await browserToolHandlers.spawn_browser_agent(
      { instruction: 'do something' },
      'org-1',
      mockSupabase,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('SDK exploded')
  })

  it('passes through extractedData on success', async () => {
    mockRunBrowserTask.mockResolvedValue({
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
})
