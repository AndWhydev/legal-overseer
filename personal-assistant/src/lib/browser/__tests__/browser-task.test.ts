import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInit = vi.fn()
const mockAct = vi.fn()
const mockClose = vi.fn()
const mockGoto = vi.fn()
const mockExtract = vi.fn()
const mockAgentExecute = vi.fn()
const mockAgent = vi.fn(() => ({ execute: mockAgentExecute }))

vi.mock('@browserbasehq/stagehand', () => {
  const MockStagehand = vi.fn(function (this: Record<string, unknown>) {
    this.init = mockInit
    this.act = mockAct
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

vi.mock('../domain-gate', () => ({
  checkDomainAuthorization: vi.fn(),
}))

vi.mock('../credential-injector', () => ({
  injectCredentials: vi.fn(),
}))

vi.mock('../cost-monitor', () => ({
  createCostBudget: vi.fn(),
  recordTokens: vi.fn(),
  recordSessionTime: vi.fn(),
  checkBudget: vi.fn(),
  preFlightBudgetCheck: vi.fn(),
}))

import { executeBrowserTask, runPreFlightChecks } from '../browser-task'
import { checkDomainAuthorization } from '../domain-gate'
import { injectCredentials } from '../credential-injector'
import {
  createCostBudget,
  recordTokens,
  recordSessionTime,
  checkBudget,
  preFlightBudgetCheck,
} from '../cost-monitor'

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

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { settings: {} }, error: null }),
      }),
    }),
  }),
}

function setupDefaultMocks() {
  vi.mocked(checkDomainAuthorization).mockResolvedValue({
    allowed: true,
    domain: 'example.com',
  })

  vi.mocked(preFlightBudgetCheck).mockReturnValue({
    allowed: true,
    maxBudgetUsd: 0.5,
    ltvMultiplier: 1.0,
  })

  vi.mocked(createCostBudget).mockReturnValue({
    maxBudgetUsd: 0.5,
    spentUsd: 0,
    tokensUsed: 0,
    sessionMinutes: 0,
    ltvMultiplier: 1.0,
  })

  vi.mocked(checkBudget).mockReturnValue({
    withinBudget: true,
    utilization: 0.1,
    remaining: 0.45,
    spentUsd: 0.05,
    maxBudgetUsd: 0.5,
  })

  vi.mocked(injectCredentials).mockResolvedValue({ success: true })

  mockAgentExecute.mockResolvedValue({
    success: true,
    message: 'Task completed successfully',
    actions: ['navigated to page', 'clicked button'],
    completed: true,
    usage: {
      input_tokens: 200,
      output_tokens: 80,
      reasoning_tokens: 20,
    },
  })
}

// ---------------------------------------------------------------------------
// Tests: runPreFlightChecks
// ---------------------------------------------------------------------------

describe('runPreFlightChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  it('passes when domain is allowed and budget is available', async () => {
    const result = await runPreFlightChecks(
      { instruction: 'test', startUrl: 'https://example.com' },
      mockSupabase,
      'org_123',
      1.0,
    )

    expect(result.passed).toBe(true)
    expect(result.budgetMaxUsd).toBe(0.5)
    expect(checkDomainAuthorization).toHaveBeenCalledWith(
      'https://example.com',
      'org_123',
      mockSupabase,
    )
  })

  it('fails when domain is blocked', async () => {
    vi.mocked(checkDomainAuthorization).mockResolvedValue({
      allowed: false,
      domain: 'evil.com',
      reason: 'Domain "evil.com" is blocked by org policy',
    })

    const result = await runPreFlightChecks(
      { instruction: 'test', startUrl: 'https://evil.com' },
      mockSupabase,
      'org_123',
    )

    expect(result.passed).toBe(false)
    expect(result.failReason).toContain('blocked')
  })

  it('skips domain check when no startUrl', async () => {
    const result = await runPreFlightChecks(
      { instruction: 'test' },
      mockSupabase,
      'org_123',
    )

    expect(result.passed).toBe(true)
    expect(checkDomainAuthorization).not.toHaveBeenCalled()
  })

  it('skips domain check when no supabase', async () => {
    const result = await runPreFlightChecks(
      { instruction: 'test', startUrl: 'https://example.com' },
      undefined,
      'org_123',
    )

    expect(result.passed).toBe(true)
    expect(checkDomainAuthorization).not.toHaveBeenCalled()
  })

  it('fails when budget pre-flight fails', async () => {
    vi.mocked(preFlightBudgetCheck).mockReturnValue({
      allowed: false,
      maxBudgetUsd: 0,
      ltvMultiplier: 0.1,
    })

    const result = await runPreFlightChecks(
      { instruction: 'test' },
      mockSupabase,
      'org_123',
    )

    expect(result.passed).toBe(false)
    expect(result.failReason).toContain('Budget')
  })
})

// ---------------------------------------------------------------------------
// Tests: executeBrowserTask
// ---------------------------------------------------------------------------

describe('executeBrowserTask', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    setupDefaultMocks()
  })
  afterEach(() => clearEnv())

  it('runs end-to-end success path', async () => {
    const result = await executeBrowserTask(
      {
        instruction: 'Find the pricing on example.com',
        startUrl: 'https://example.com/pricing',
        maxSteps: 5,
      },
      {
        orgId: 'org_123',
        supabase: mockSupabase,
        ltvMultiplier: 1.0,
      },
    )

    expect(result.status).toBe('completed')
    expect(result.message).toBe('Task completed successfully')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.usage?.inputTokens).toBe(200)
    expect(result.usage?.outputTokens).toBe(80)
    expect(result.usage?.reasoningTokens).toBe(20)

    // Should have navigate action + agent actions
    expect(result.actions.length).toBeGreaterThanOrEqual(1)
    expect(result.actions[0].type).toBe('navigate')

    // Session should be closed
    expect(mockClose).toHaveBeenCalledOnce()

    // Cost monitoring should have been invoked
    expect(createCostBudget).toHaveBeenCalledWith(1.0)
    expect(recordTokens).toHaveBeenCalled()
    expect(recordSessionTime).toHaveBeenCalled()
    expect(checkBudget).toHaveBeenCalled()
  })

  it('returns failed result when domain gate blocks', async () => {
    vi.mocked(checkDomainAuthorization).mockResolvedValue({
      allowed: false,
      domain: 'blocked.com',
      reason: 'Domain "blocked.com" is blocked by org policy',
    })

    const result = await executeBrowserTask(
      {
        instruction: 'Scrape blocked site',
        startUrl: 'https://blocked.com',
      },
      {
        orgId: 'org_123',
        supabase: mockSupabase,
      },
    )

    expect(result.status).toBe('failed')
    expect(result.error).toContain('blocked')

    // Should NOT create a session
    expect(mockInit).not.toHaveBeenCalled()
    expect(mockClose).not.toHaveBeenCalled()
  })

  it('returns failed result when credential injection fails', async () => {
    vi.mocked(injectCredentials).mockResolvedValue({
      success: false,
      error: 'Missing opSecretRef',
    })

    const result = await executeBrowserTask(
      {
        instruction: 'Login and do stuff',
        startUrl: 'https://app.example.com/login',
      },
      {
        credentialSource: '1password',
        credentialOptions: {},
      },
    )

    expect(result.status).toBe('failed')
    expect(result.error).toContain('Credential injection failed')
    expect(result.actions.some((a) => a.description.includes('Credential injection'))).toBe(true)

    // Session should still be closed
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('returns failed result when budget is exceeded', async () => {
    vi.mocked(checkBudget).mockReturnValue({
      withinBudget: false,
      utilization: 1.5,
      remaining: 0,
      spentUsd: 0.75,
      maxBudgetUsd: 0.5,
    })

    const result = await executeBrowserTask(
      { instruction: 'Expensive task' },
      { ltvMultiplier: 1.0 },
    )

    expect(result.status).toBe('failed')
    expect(result.error).toContain('Budget exceeded')
    expect(result.message).toContain('cost budget exceeded')

    // Session should still be closed
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('closes session on unexpected error', async () => {
    mockAgentExecute.mockRejectedValueOnce(new Error('Agent exploded'))

    const result = await executeBrowserTask(
      { instruction: 'Do something risky' },
    )

    expect(result.status).toBe('failed')
    expect(result.error).toBe('Agent exploded')

    // Session must still be closed
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('skips pre-flight checks without supabase or orgId', async () => {
    const result = await executeBrowserTask(
      {
        instruction: 'Quick task',
        startUrl: 'https://example.com',
      },
    )

    expect(result.status).toBe('completed')
    expect(checkDomainAuthorization).not.toHaveBeenCalled()
    // Budget is still tracked even without supabase
    expect(createCostBudget).toHaveBeenCalled()
  })

  it('handles task without startUrl', async () => {
    const result = await executeBrowserTask(
      { instruction: 'Search Google for something' },
    )

    expect(result.status).toBe('completed')
    expect(mockGoto).not.toHaveBeenCalled()
    expect(result.actions.every((a) => a.type !== 'navigate')).toBe(true)
  })

  it('extracts structured data when outputSchema is provided', async () => {
    mockExtract.mockResolvedValue({ price: '$99/mo', plan: 'Enterprise' })

    const result = await executeBrowserTask(
      {
        instruction: 'Get the pricing',
        startUrl: 'https://example.com/pricing',
        outputSchema: { type: 'object', properties: { price: { type: 'string' } } },
      },
    )

    expect(result.status).toBe('completed')
    expect(result.extractedData).toEqual({ price: '$99/mo', plan: 'Enterprise' })
    expect(result.actions.some((a) => a.type === 'extract')).toBe(true)
  })

  it('injects credentials via composio source', async () => {
    const result = await executeBrowserTask(
      {
        instruction: 'Login and extract data',
        startUrl: 'https://app.example.com',
      },
      {
        credentialSource: 'composio',
        credentialOptions: { composioConnectionId: 'conn_123' },
      },
    )

    expect(result.status).toBe('completed')
    expect(injectCredentials).toHaveBeenCalledWith(
      expect.any(Object),
      'composio',
      { composioConnectionId: 'conn_123' },
    )
  })

  it('passes the Stagehand session through to injectCredentials (for the variables option)', async () => {
    await executeBrowserTask(
      {
        instruction: 'Login',
        startUrl: 'https://app.example.com',
      },
      {
        credentialSource: '1password',
        credentialOptions: { opSecretRef: 'op://vault/item' },
      },
    )

    // The session must be passed whole (not `{ act }`) so the injector can
    // call `session.stagehand.act(instruction, { variables })`.
    const sessionArg = vi.mocked(injectCredentials).mock.calls[0][0] as any
    expect(sessionArg).toBeDefined()
    expect(sessionArg.stagehand).toBeDefined()
    expect(typeof sessionArg.stagehand.act).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// CUA requirement coverage tests
// ---------------------------------------------------------------------------

describe('CUA-01: Stagehand SDK integration', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    setupDefaultMocks()
  })
  afterEach(() => clearEnv())

  it('uses Stagehand agent() for autonomous task execution', async () => {
    await executeBrowserTask({ instruction: 'Find pricing' })

    expect(mockAgent).toHaveBeenCalled()
    expect(mockAgentExecute).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: 'Find pricing' }),
    )
  })

  it('defaults to 10 max steps when not specified', async () => {
    await executeBrowserTask({ instruction: 'Default steps' })

    expect(mockAgentExecute).toHaveBeenCalledWith(
      expect.objectContaining({ maxSteps: 10 }),
    )
  })

  it('respects custom maxSteps parameter', async () => {
    await executeBrowserTask({ instruction: 'Custom steps', maxSteps: 20 })

    expect(mockAgentExecute).toHaveBeenCalledWith(
      expect.objectContaining({ maxSteps: 20 }),
    )
  })
})

describe('CUA-02: Session lifecycle management', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    setupDefaultMocks()
  })
  afterEach(() => clearEnv())

  it('creates session, runs task, and closes session on success', async () => {
    const result = await executeBrowserTask({
      instruction: 'Lifecycle test',
      startUrl: 'https://example.com',
    })

    expect(result.status).toBe('completed')
    expect(mockInit).toHaveBeenCalledOnce()
    expect(mockClose).toHaveBeenCalledOnce()
  })

  it('closes session on failure (finally block)', async () => {
    mockAgentExecute.mockRejectedValueOnce(new Error('Session crash'))

    const result = await executeBrowserTask({ instruction: 'Crash test' })

    expect(result.status).toBe('failed')
    expect(mockClose).toHaveBeenCalledOnce()
  })
})

describe('CUA-03/05: Ephemeral session isolation', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    setupDefaultMocks()
  })
  afterEach(() => clearEnv())

  it('creates a new session per task invocation', async () => {
    await executeBrowserTask({ instruction: 'Task A' })
    await executeBrowserTask({ instruction: 'Task B' })

    expect(mockInit).toHaveBeenCalledTimes(2)
    expect(mockClose).toHaveBeenCalledTimes(2)
  })

  it('does not create session when pre-flight fails', async () => {
    vi.mocked(checkDomainAuthorization).mockResolvedValue({
      allowed: false,
      domain: 'evil.com',
      reason: 'Blocked',
    })

    await executeBrowserTask(
      { instruction: 'Blocked', startUrl: 'https://evil.com' },
      { orgId: 'org_1', supabase: mockSupabase },
    )

    expect(mockInit).not.toHaveBeenCalled()
  })
})

describe('CUA-07: Structured action recording + evidence', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    setupDefaultMocks()
  })
  afterEach(() => clearEnv())

  it('records navigate action with correct type and description', async () => {
    const result = await executeBrowserTask({
      instruction: 'Navigate test',
      startUrl: 'https://app.example.com',
    })

    const navAction = result.actions.find((a) => a.type === 'navigate')
    expect(navAction).toBeDefined()
    expect(navAction!.description).toContain('https://app.example.com')
    expect(navAction!.success).toBe(true)
  })

  it('assigns sequential step indices to all actions', async () => {
    const result = await executeBrowserTask({
      instruction: 'Sequential test',
      startUrl: 'https://example.com',
    })

    for (let i = 0; i < result.actions.length; i++) {
      expect(result.actions[i].stepIndex).toBe(i)
    }
  })

  it('includes evidence bundle with matching action data', async () => {
    const result = await executeBrowserTask({
      instruction: 'Evidence test',
      startUrl: 'https://example.com',
    })

    expect(result.evidence).toBeDefined()
    expect(result.evidence.actionLog).toEqual(result.actions)
    expect(result.evidence.actionCount).toBe(result.actions.length)
    expect(result.evidence.durationSeconds).toBeGreaterThanOrEqual(0)
  })

  it('includes evidence even on failure', async () => {
    mockAgentExecute.mockRejectedValueOnce(new Error('Boom'))

    const result = await executeBrowserTask({ instruction: 'Fail evidence' })

    expect(result.status).toBe('failed')
    expect(result.evidence).toBeDefined()
    expect(Array.isArray(result.evidence.actionLog)).toBe(true)
    expect(typeof result.evidence.actionCount).toBe('number')
  })
})

describe('CUA-10: Cost monitoring and budget enforcement', () => {
  beforeEach(() => {
    setEnv()
    vi.clearAllMocks()
    setupDefaultMocks()
  })
  afterEach(() => clearEnv())

  it('creates cost budget at start of execution', async () => {
    await executeBrowserTask(
      { instruction: 'Cost test' },
      { ltvMultiplier: 2.0 },
    )

    expect(createCostBudget).toHaveBeenCalledWith(2.0)
  })

  it('records token usage during execution', async () => {
    await executeBrowserTask({ instruction: 'Token test' })

    expect(recordTokens).toHaveBeenCalled()
  })

  it('records session time after execution', async () => {
    await executeBrowserTask({ instruction: 'Time test' })

    expect(recordSessionTime).toHaveBeenCalled()
  })

  it('checks budget after agent execution', async () => {
    await executeBrowserTask({ instruction: 'Budget check test' })

    expect(checkBudget).toHaveBeenCalled()
  })

  it('fails task when budget exceeded', async () => {
    vi.mocked(checkBudget).mockReturnValue({
      withinBudget: false,
      utilization: 1.5,
      remaining: 0,
      spentUsd: 0.75,
      maxBudgetUsd: 0.5,
    })

    const result = await executeBrowserTask({ instruction: 'Expensive' })

    expect(result.status).toBe('failed')
    expect(result.error).toContain('Budget exceeded')
  })
})
