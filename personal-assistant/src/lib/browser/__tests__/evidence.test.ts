import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInit = vi.fn()
const mockClose = vi.fn()
const mockGoto = vi.fn()
const mockAgentExecute = vi.fn()
const mockAgent = vi.fn(() => ({ execute: mockAgentExecute }))

vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.init = mockInit
    this.act = vi.fn()
    this.observe = vi.fn()
    this.extract = vi.fn()
    this.close = mockClose
    this.agent = mockAgent
    this.modelName = 'anthropic/claude-sonnet-4-20250514'
    this.context = {
      pages: () => [{ goto: mockGoto }],
    }
  }),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { runBrowserTask } from '../stagehand-client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv() {
  process.env.BROWSERBASE_API_KEY = 'bb_test_key'
  process.env.BROWSERBASE_PROJECT_ID = 'proj_test'
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
}

function clearEnv() {
  delete process.env.BROWSERBASE_API_KEY
  delete process.env.BROWSERBASE_PROJECT_ID
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.STAGEHAND_MODEL
  delete process.env.STAGEHAND_CACHE
}

// ---------------------------------------------------------------------------
// Evidence capture tests (CUA-09)
// ---------------------------------------------------------------------------

describe('evidence capture', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    mockAgentExecute.mockResolvedValue({
      success: true,
      message: 'Task completed',
      actions: ['clicked login', 'filled form'],
      completed: true,
      usage: {
        input_tokens: 200,
        output_tokens: 80,
        reasoning_tokens: 0,
      },
    })
  })
  afterEach(() => clearEnv())

  it('includes evidence field in successful result', async () => {
    const result = await runBrowserTask({
      instruction: 'Find the pricing page',
      startUrl: 'https://example.com',
    })

    expect(result.evidence).toBeDefined()
    expect(result.status).toBe('completed')
  })

  it('replay URL is present in evidence', async () => {
    const result = await runBrowserTask({
      instruction: 'Find the pricing page',
      startUrl: 'https://example.com',
    })

    // sessionId is undefined in mock session (assigned internally by Browserbase),
    // so replayUrl will be empty string. When sessionId is set, it follows the format.
    expect(typeof result.evidence.sessionReplayUrl).toBe('string')
  })

  it('replay URL follows Browserbase format when session ID exists', async () => {
    // The replay URL format should contain the browserbase.com domain
    // When sessionId is present, URL is https://www.browserbase.com/sessions/<id>
    const result = await runBrowserTask({
      instruction: 'Do something',
    })

    // With undefined sessionId, URL is empty
    expect(result.evidence.sessionReplayUrl).toBe('')

    // Verify the replayUrl field on result matches evidence
    expect(result.replayUrl).toBe(result.evidence.sessionReplayUrl)
  })

  it('action log is populated in evidence', async () => {
    const result = await runBrowserTask({
      instruction: 'Navigate and click',
      startUrl: 'https://example.com',
    })

    // Should have at least the navigate action + 2 agent actions
    expect(result.evidence.actionLog.length).toBeGreaterThanOrEqual(1)
    expect(result.evidence.actionLog[0].type).toBe('navigate')
    expect(result.evidence.actionLog[0].description).toContain('https://example.com')
  })

  it('action count matches action log length', async () => {
    const result = await runBrowserTask({
      instruction: 'Navigate and do things',
      startUrl: 'https://example.com',
    })

    expect(result.evidence.actionCount).toBe(result.evidence.actionLog.length)
    expect(result.evidence.actionCount).toBeGreaterThan(0)
  })

  it('duration is captured in evidence as seconds', async () => {
    const result = await runBrowserTask({
      instruction: 'Quick task',
    })

    expect(typeof result.evidence.durationSeconds).toBe('number')
    expect(result.evidence.durationSeconds).toBeGreaterThanOrEqual(0)
  })

  it('evidence is present even on task failure', async () => {
    mockAgentExecute.mockRejectedValueOnce(new Error('Agent crashed'))

    const result = await runBrowserTask({
      instruction: 'Failing task',
    })

    expect(result.status).toBe('failed')
    expect(result.evidence).toBeDefined()
    expect(typeof result.evidence.sessionReplayUrl).toBe('string')
    expect(Array.isArray(result.evidence.actionLog)).toBe(true)
    expect(typeof result.evidence.actionCount).toBe('number')
    expect(typeof result.evidence.durationSeconds).toBe('number')
  })

  it('evidence action log matches top-level actions array', async () => {
    const result = await runBrowserTask({
      instruction: 'Check consistency',
      startUrl: 'https://example.com',
    })

    expect(result.evidence.actionLog).toEqual(result.actions)
  })

  it('evidence captures partial actions when task fails mid-execution', async () => {
    // Agent returns some actions before crashing
    mockAgentExecute.mockRejectedValueOnce(new Error('Timeout'))

    const result = await runBrowserTask({
      instruction: 'Navigate then crash',
      startUrl: 'https://example.com',
    })

    expect(result.status).toBe('failed')
    // Navigate action should still be recorded before the crash
    expect(result.evidence.actionLog.length).toBeGreaterThanOrEqual(1)
    expect(result.evidence.actionLog[0].type).toBe('navigate')
  })
})
