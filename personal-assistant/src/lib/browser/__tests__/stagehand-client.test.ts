import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInit = vi.fn()
const mockAct = vi.fn()
const mockObserve = vi.fn()
const mockExtract = vi.fn()
const mockClose = vi.fn()
const mockGoto = vi.fn()
const mockAgentExecute = vi.fn()
const mockAgent = vi.fn(() => ({ execute: mockAgentExecute }))

vi.mock('@browserbasehq/stagehand', () => {
  const MockStagehand = vi.fn(function (this: Record<string, unknown>) {
    this.init = mockInit
    this.act = mockAct
    this.observe = mockObserve
    this.extract = mockExtract
    this.close = mockClose
    this.agent = mockAgent
    this.modelName = 'anthropic/claude-sonnet-4-20250514'
    this.context = {
      pages: () => [{ goto: mockGoto }],
    }
  })
  return { Stagehand: MockStagehand }
})

vi.mock('@/lib/core/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  getConfig,
  createSession,
  navigateTo,
  act,
  observe,
  extract,
  closeSession,
  runBrowserTask,
} from '../stagehand-client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setEnv(overrides?: Record<string, string | undefined>) {
  const defaults: Record<string, string> = {
    BROWSERBASE_API_KEY: 'bb_test_key',
    BROWSERBASE_PROJECT_ID: 'proj_test',
    ANTHROPIC_API_KEY: 'sk-ant-test',
  }
  const env = { ...defaults, ...overrides }
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = v
    }
  }
}

function clearEnv() {
  delete process.env.BROWSERBASE_API_KEY
  delete process.env.BROWSERBASE_PROJECT_ID
  delete process.env.ANTHROPIC_API_KEY
  delete process.env.STAGEHAND_MODEL
  delete process.env.STAGEHAND_CACHE
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getConfig', () => {
  beforeEach(() => clearEnv())
  afterEach(() => clearEnv())

  it('returns config from env vars', () => {
    setEnv()
    const config = getConfig()
    expect(config.apiKey).toBe('bb_test_key')
    expect(config.projectId).toBe('proj_test')
    expect(config.env).toBe('BROWSERBASE')
    expect(config.modelClientOptions).toEqual({ apiKey: 'sk-ant-test' })
  })

  it('throws when BROWSERBASE_API_KEY is missing', () => {
    setEnv({ BROWSERBASE_API_KEY: undefined })
    expect(() => getConfig()).toThrow('BROWSERBASE_API_KEY')
  })

  it('throws when BROWSERBASE_PROJECT_ID is missing', () => {
    setEnv({ BROWSERBASE_PROJECT_ID: undefined })
    expect(() => getConfig()).toThrow('BROWSERBASE_PROJECT_ID')
  })

  it('uses custom model from STAGEHAND_MODEL', () => {
    setEnv()
    process.env.STAGEHAND_MODEL = 'openai/gpt-4o'
    const config = getConfig()
    expect(config.modelName).toBe('openai/gpt-4o')
  })

  it('disables caching when STAGEHAND_CACHE=0', () => {
    setEnv()
    process.env.STAGEHAND_CACHE = '0'
    const config = getConfig()
    expect(config.enableCaching).toBe(false)
  })
})

describe('createSession', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
  })
  afterEach(() => clearEnv())

  it('creates a session and calls init()', async () => {
    const session = await createSession()
    expect(mockInit).toHaveBeenCalledOnce()
    expect(session.page).toBeDefined()
    expect(session.stagehand).toBeDefined()
    expect(session.createdAt).toBeGreaterThan(0)
  })
})

describe('navigateTo', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
  })
  afterEach(() => clearEnv())

  it('calls page.goto with the url', async () => {
    const session = await createSession()
    await navigateTo(session, 'https://example.com')
    expect(mockGoto).toHaveBeenCalledWith('https://example.com')
  })
})

describe('act', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    mockAct.mockResolvedValue({
      success: true,
      message: 'Clicked button',
      actionDescription: 'click submit',
    })
  })
  afterEach(() => clearEnv())

  it('returns normalised act result', async () => {
    const session = await createSession()
    const result = await act(session, 'click the submit button')
    expect(result.success).toBe(true)
    expect(result.message).toBe('Clicked button')
    expect(result.action).toBe('click submit')
    expect(mockAct).toHaveBeenCalledWith('click the submit button')
  })
})

describe('observe', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    mockObserve.mockResolvedValue([
      { description: 'Submit button', selector: '#submit', method: 'click', arguments: [] },
      { description: 'Email field', selector: '#email', method: 'fill', arguments: [] },
    ])
  })
  afterEach(() => clearEnv())

  it('returns mapped observations', async () => {
    const session = await createSession()
    const result = await observe(session, 'find form elements')
    expect(result).toHaveLength(2)
    expect(result[0].description).toBe('Submit button')
    expect(result[0].selector).toBe('#submit')
  })
})

describe('extract', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    mockExtract.mockResolvedValue({ title: 'Test Page', price: '$99' })
  })
  afterEach(() => clearEnv())

  it('returns extracted data without schema', async () => {
    const session = await createSession()
    const result = await extract(session, 'get the title and price')
    expect(result).toEqual({ title: 'Test Page', price: '$99' })
    expect(mockExtract).toHaveBeenCalledWith('get the title and price')
  })
})

describe('closeSession', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
  })
  afterEach(() => clearEnv())

  it('calls stagehand.close()', async () => {
    const session = await createSession()
    await closeSession(session)
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('does not throw when close errors', async () => {
    mockClose.mockRejectedValueOnce(new Error('close failed'))
    const session = await createSession()
    await expect(closeSession(session)).resolves.not.toThrow()
  })
})

describe('runBrowserTask', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    mockAgentExecute.mockResolvedValue({
      success: true,
      message: 'Task completed',
      actions: ['navigated', 'clicked'],
      completed: true,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        reasoning_tokens: 10,
      },
    })
  })
  afterEach(() => clearEnv())

  it('runs a task end-to-end with startUrl', async () => {
    const result = await runBrowserTask({
      instruction: 'Find the pricing',
      startUrl: 'https://example.com',
      maxSteps: 5,
    })

    expect(result.status).toBe('completed')
    expect(result.message).toBe('Task completed')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.usage?.inputTokens).toBe(100)
    expect(result.usage?.outputTokens).toBe(50)
    // Should have navigate action + 2 agent actions
    expect(result.actions.length).toBeGreaterThanOrEqual(1)
    expect(result.actions[0].type).toBe('navigate')
    expect(mockGoto).toHaveBeenCalledWith('https://example.com')
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('runs a task without startUrl', async () => {
    const result = await runBrowserTask({
      instruction: 'Search Google for stagehand',
    })

    expect(result.status).toBe('completed')
    expect(mockGoto).not.toHaveBeenCalled()
  })

  it('returns failed result on error', async () => {
    mockAgentExecute.mockRejectedValueOnce(new Error('Agent crashed'))

    const result = await runBrowserTask({
      instruction: 'do something',
    })

    expect(result.status).toBe('failed')
    expect(result.error).toBe('Agent crashed')
    expect(mockClose).toHaveBeenCalledOnce() // cleanup still happens
  })
})
