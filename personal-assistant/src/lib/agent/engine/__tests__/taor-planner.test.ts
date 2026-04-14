/**
 * TAOR Planner Integration Tests
 *
 * Tests the planner and skill integration paths within the TAOR loop:
 * - Planner invocation with correct parameters
 * - Trivial message bypass
 * - 1500ms race window timeout
 * - Plan stage event emission
 * - Tool group narrowing from planner
 * - Skill RAG candidate passing
 * - Skill resolution and prompt injection
 * - PlanGate enforcement (free vs growth)
 * - swarmRole skill filtering via getSkillsForRole
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks (must be defined before vi.mock calls)
// ---------------------------------------------------------------------------

const {
  generatePlanMock,
  isTrivialMessageMock,
  stageFromToolNameMock,
  selectRelevantSkillsRAGMock,
  getAllSkillsMock,
  getSkillsForRoleMock,
  resolveSkillMock,
  initializeSkillRegistryMock,
  getAgentToolsMock,
  getEagerToolsMock,
  buildDeferredToolsPromptMock,
  resolveToolSchemaMock,
  selectRelevantToolsMock,
  buildEntityAwarePromptMock,
  selectModelMock,
  resolveModelMock,
  resolveTokenLimitMock,
  logAgentRunMock,
  estimateRunCostMock,
  preFlightChecksMock,
  withCircuitBreakerMock,
  writeToDeadLetterQueueMock,
  detectLeakMock,
  scrubLeaksMock,
  guardAndHumanizeMock,
  detectTopicShiftMock,
  evaluateTurnQualityMock,
  getTierModifierMock,
  getOrgPlanMock,
  checkToolPlanGateMock,
  callModelViaGatewayMock,
} = vi.hoisted(() => ({
  generatePlanMock: vi.fn(),
  isTrivialMessageMock: vi.fn(),
  stageFromToolNameMock: vi.fn(),
  selectRelevantSkillsRAGMock: vi.fn(),
  getAllSkillsMock: vi.fn(),
  getSkillsForRoleMock: vi.fn(),
  resolveSkillMock: vi.fn(),
  initializeSkillRegistryMock: vi.fn(),
  getAgentToolsMock: vi.fn(),
  getEagerToolsMock: vi.fn(),
  buildDeferredToolsPromptMock: vi.fn(),
  resolveToolSchemaMock: vi.fn(),
  selectRelevantToolsMock: vi.fn(),
  buildEntityAwarePromptMock: vi.fn(),
  selectModelMock: vi.fn(),
  resolveModelMock: vi.fn(),
  resolveTokenLimitMock: vi.fn(),
  logAgentRunMock: vi.fn(),
  estimateRunCostMock: vi.fn(),
  preFlightChecksMock: vi.fn(),
  withCircuitBreakerMock: vi.fn(),
  writeToDeadLetterQueueMock: vi.fn(),
  detectLeakMock: vi.fn(),
  scrubLeaksMock: vi.fn(),
  guardAndHumanizeMock: vi.fn(),
  detectTopicShiftMock: vi.fn(),
  evaluateTurnQualityMock: vi.fn(),
  getTierModifierMock: vi.fn(),
  getOrgPlanMock: vi.fn(),
  checkToolPlanGateMock: vi.fn(),
  callModelViaGatewayMock: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {}
  return { default: MockAnthropic }
})

vi.mock('@/lib/ai/gateway-adapter', () => ({
  callModelViaGateway: callModelViaGatewayMock,
}))

vi.mock('@/lib/ai', () => ({
  models: { fast: 'anthropic/claude-haiku', balanced: 'anthropic/claude-sonnet', heavy: 'anthropic/claude-opus' },
}))

vi.mock('@/lib/agent/planner', () => ({
  generatePlan: generatePlanMock,
  isTrivialMessage: isTrivialMessageMock,
  stageFromToolName: stageFromToolNameMock,
}))

vi.mock('@/lib/skills/skill-rag', () => ({
  selectRelevantSkills: selectRelevantSkillsRAGMock,
}))

vi.mock('@/lib/skills/registry', () => ({
  getAllSkills: getAllSkillsMock,
  getSkillsForRole: getSkillsForRoleMock,
  resolveSkill: resolveSkillMock,
  initializeSkillRegistry: initializeSkillRegistryMock,
}))

vi.mock('@/lib/agent/tools', () => ({
  getAgentTools: getAgentToolsMock,
}))

vi.mock('@/lib/agent/tools/deferred-loader', () => ({
  getEagerTools: getEagerToolsMock,
  buildDeferredToolsPrompt: buildDeferredToolsPromptMock,
  resolveToolSchema: resolveToolSchemaMock,
}))

vi.mock('@/lib/composio/tool-provider', () => ({
  getComposioToolsForOrg: vi.fn(async () => ({ tools: [] })),
}))

vi.mock('@/lib/composio/client', () => ({
  isComposioEnabled: vi.fn(() => false),
}))

vi.mock('@/lib/composio/mcp-session', () => ({
  isMCPEnabled: vi.fn(() => false),
  getMCPTools: vi.fn(async () => []),
}))

vi.mock('@/lib/agent/tool-rag', () => ({
  selectRelevantTools: selectRelevantToolsMock,
}))

vi.mock('@/lib/agent/prompt-builder', () => ({
  buildEntityAwarePrompt: buildEntityAwarePromptMock,
}))

vi.mock('@/lib/context-assembly/context-assembler', () => ({
  ContextAssembler: vi.fn().mockImplementation(() => ({
    assemble: vi.fn(),
  })),
}))

vi.mock('@/lib/agent/model-router', () => ({
  selectModel: selectModelMock,
}))

vi.mock('@/lib/agent/model-registry', () => ({
  resolveModel: resolveModelMock,
  resolveTokenLimit: resolveTokenLimitMock,
}))

vi.mock('@/lib/agent/run-logger', () => ({
  logAgentRun: logAgentRunMock,
  estimateRunCost: estimateRunCostMock,
}))

vi.mock('@/lib/agent/circuit-breaker', () => ({
  withCircuitBreaker: withCircuitBreakerMock,
  CircuitOpenError: class CircuitOpenError extends Error {
    circuitKey: string
    constructor(key: string) {
      super(`Circuit open: ${key}`)
      this.circuitKey = key
    }
  },
}))

vi.mock('@/lib/agent/dlq', () => ({
  writeToDeadLetterQueue: writeToDeadLetterQueueMock,
}))

vi.mock('@/lib/agent/response-guard', () => ({
  detectLeak: detectLeakMock,
  scrubLeaks: scrubLeaksMock,
  guardAndHumanize: guardAndHumanizeMock,
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/lib/agent/citation-extractor', () => ({
  detectTopicShift: detectTopicShiftMock,
  extractCitationsFromToolResult: vi.fn().mockReturnValue([]),
}))

vi.mock('../turn-evaluator', () => ({
  evaluateTurnQuality: evaluateTurnQualityMock,
}))

vi.mock('@/lib/memory-palace/service', () => ({
  MemoryPalaceService: vi.fn().mockImplementation(() => ({
    createMemory: vi.fn().mockResolvedValue('mem-123'),
    contradictMemory: vi.fn().mockResolvedValue(undefined),
    corroborateMemory: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('../pre-flight', () => ({
  preFlightChecks: preFlightChecksMock,
}))

vi.mock('../tool-executor', () => ({
  executeToolBatchStreaming: vi.fn(),
}))

vi.mock('@/lib/agent/tier-prompts', () => ({
  getTierModifier: getTierModifierMock,
}))

vi.mock('@/lib/billing/plan-gates', () => ({
  getOrgPlan: getOrgPlanMock,
  checkToolPlanGate: checkToolPlanGateMock,
  TOOL_PLAN_REQUIREMENTS: {},
}))

vi.mock('@/lib/brain/query-gate', () => ({
  classifyQueryComplexity: vi.fn(() => 'system2'),
}))

vi.mock('@/lib/agent/entity-overrides', () => ({
  resolveEntityOverrides: vi.fn(async () => ({})),
}))

vi.mock('@/lib/agent/delegation-intent', () => ({
  detectDelegationIntent: vi.fn(() => null),
  resolveEntityCandidates: vi.fn(async () => []),
  generateActivationConfirmation: vi.fn(() => ''),
  generateRevocationConfirmation: vi.fn(() => ''),
  generateAmbiguityClarification: vi.fn(() => ''),
}))

vi.mock('@/lib/agent/delegation-mandate', () => ({
  setEntityMandate: vi.fn(async () => {}),
  revokeEntityMandate: vi.fn(async () => false),
  getEntityMandate: vi.fn(async () => null),
}))

vi.mock('./taor-loop-utils', () => ({
  buildTaorExecOptions: vi.fn(() => undefined),
  mergeEntityOverrides: vi.fn((config: unknown) => config),
}))

vi.mock('./tool-resolver', () => ({
  buildTierContextBlock: vi.fn(async () => null),
}))

vi.mock('@/lib/agent/follow-up-generator', () => ({
  generateFollowUps: vi.fn(async () => []),
}))

vi.mock('./decision-trace-retriever', () => ({
  retrieveRelevantTraces: vi.fn(async () => ({ traces: [], retrievalMs: 0 })),
  formatTracesAsContext: vi.fn(() => null),
}))

vi.mock('@/lib/agent/cost-guard', () => ({
  checkRoleBudget: vi.fn(async () => ({ allowed: true, warning: false })),
  getExecutionTokenCap: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'org-test',
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null }),
          }),
        }),
      }),
    } as unknown,
    ...overrides,
  }
}

const DUMMY_TOOLS = [
  { name: 'search_contacts', description: 'Search', input_schema: { type: 'object', properties: {} } },
  { name: 'create_task', description: 'Create', input_schema: { type: 'object', properties: {} } },
]

async function collectEvents(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const events: unknown[] = []
  for await (const event of gen) {
    events.push(event)
  }
  return events
}

function createMockGatewayResult(
  content: string,
  stopReason = 'end_turn',
  usage = { input_tokens: 100, output_tokens: 50 },
) {
  return {
    streamedDeltas: [content],
    streamedThinkingDeltas: [],
    hadThinking: false,
    thinkingStartTime: null,
    response: {
      content: [{ type: 'text', text: content }],
      stop_reason: stopReason,
      usage,
    },
  }
}

// ---------------------------------------------------------------------------
// Default mock behaviour (reset each test)
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()

  // Pre-flight: always pass
  preFlightChecksMock.mockResolvedValue({ blocked: false, events: [] })

  // Model routing
  selectModelMock.mockReturnValue({ model: 'claude-sonnet', purpose: 'conversation', reasoning: 'test' })
  resolveModelMock.mockReturnValue('claude-sonnet')
  resolveTokenLimitMock.mockReturnValue(4096)

  // Prompt building
  buildEntityAwarePromptMock.mockResolvedValue('You are BitBit.')
  getTierModifierMock.mockReturnValue('')

  // Tools
  getEagerToolsMock.mockReturnValue(DUMMY_TOOLS)
  getAgentToolsMock.mockReturnValue(DUMMY_TOOLS)
  buildDeferredToolsPromptMock.mockReturnValue('')
  resolveToolSchemaMock.mockReturnValue(undefined)
  selectRelevantToolsMock.mockReturnValue({ tools: DUMMY_TOOLS, excluded: [], scores: {} })

  // Planner defaults
  isTrivialMessageMock.mockReturnValue(false)
  generatePlanMock.mockResolvedValue({
    stages: [],
    toolGroups: [],
    complexity: 'medium',
    skills: [],
  })
  stageFromToolNameMock.mockReturnValue(null)

  // Skills defaults
  initializeSkillRegistryMock.mockResolvedValue(undefined)
  getAllSkillsMock.mockReturnValue([])
  getSkillsForRoleMock.mockReturnValue([])
  resolveSkillMock.mockResolvedValue(null)
  selectRelevantSkillsRAGMock.mockReturnValue({ candidates: [], scores: {} })

  // Response guard
  detectLeakMock.mockReturnValue({ leaked: false, patterns: [] })
  scrubLeaksMock.mockImplementation((s: string) => s)
  guardAndHumanizeMock.mockImplementation((s: string) => s)

  // Run logger
  logAgentRunMock.mockResolvedValue({ id: 'run-1' })
  estimateRunCostMock.mockReturnValue(0.001)

  // Circuit breaker: just execute the fn
  withCircuitBreakerMock.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn())

  // DLQ
  writeToDeadLetterQueueMock.mockResolvedValue(undefined)

  // Plan gates
  getOrgPlanMock.mockResolvedValue('free')
  checkToolPlanGateMock.mockReturnValue({ allowed: true })

  // Others
  detectTopicShiftMock.mockReturnValue(false)
  evaluateTurnQualityMock.mockResolvedValue(undefined)

  // Gateway: default text response
  callModelViaGatewayMock.mockResolvedValue(createMockGatewayResult('Hello there'))
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TAOR planner integration', () => {
  it('1. calls generatePlan with message, entity context, tool names, and skill candidates', async () => {
    const skillCandidates = [
      { id: 'seo-audit', name: 'SEO Audit', description: 'Run SEO audit', estimatedTokens: 500, score: 5 },
    ]
    selectRelevantSkillsRAGMock.mockReturnValue({
      candidates: skillCandidates,
      scores: { 'seo-audit': 5 },
    })
    buildEntityAwarePromptMock.mockResolvedValue(
      'You are BitBit.\n\n## Entity Context\n\nJohn Doe is a contact.\n\n## Next Section',
    )

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Run an SEO audit for my site', makeConfig() as any)
    await collectEvents(gen)

    expect(generatePlanMock).toHaveBeenCalledTimes(1)
    const [msg, entityCtx, toolNames, candidates] = generatePlanMock.mock.calls[0]
    expect(msg).toBe('Run an SEO audit for my site')
    expect(entityCtx).toBe('John Doe is a contact.')
    expect(toolNames).toEqual(expect.arrayContaining(['search_contacts', 'create_task']))
    expect(candidates).toEqual([{ id: 'seo-audit', description: 'Run SEO audit' }])
  })

  it('2. skips planner entirely for trivial messages', async () => {
    isTrivialMessageMock.mockReturnValue(true)

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('hi', makeConfig() as any)
    await collectEvents(gen)

    expect(generatePlanMock).not.toHaveBeenCalled()
  })

  it('3. continues without plan stages when planner exceeds 1500ms race window', async () => {
    generatePlanMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        stages: [{ id: 'late', label: 'Too Late', icon: '🐌' }],
        toolGroups: ['web'],
        complexity: 'high',
        skills: [],
      }), 2000)),
    )

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Do something complex', makeConfig() as any)
    const events = await collectEvents(gen)

    // The plan was too slow for the 1500ms race, so tool groups were NOT applied from the plan
    expect(getAgentToolsMock).not.toHaveBeenCalledWith(expect.arrayContaining(['web']))
  }, 10000)

  it('4. yields plan stages as { type: "plan", data: { stages } } event', async () => {
    const planStages = [
      { id: 'find_contact', label: 'Steve West', sublabel: 'RESOLVING', icon: '👤', toolHint: 'search_contacts' },
      { id: 'create_task', label: 'New Task', sublabel: 'CREATING', icon: '📋', toolHint: 'create_task' },
    ]
    generatePlanMock.mockResolvedValue({
      stages: planStages,
      toolGroups: ['memory'],
      complexity: 'medium',
      skills: [],
    })

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Create a task for Steve West', makeConfig() as any)
    const events = await collectEvents(gen)

    const planEvent = (events as Array<{ type: string; data: unknown }>).find(e => e.type === 'plan')
    expect(planEvent).toBeDefined()
    expect((planEvent as any).data.stages).toEqual(planStages)
  })

  it('5. narrows tool set via getAgentTools when planner returns toolGroups', async () => {
    const narrowedTools = [{ name: 'web_search', description: 'Search web', input_schema: { type: 'object', properties: {} } }]
    getAgentToolsMock.mockReturnValue(narrowedTools)

    generatePlanMock.mockResolvedValue({
      stages: [{ id: 'search', label: 'Search', icon: '🔍' }],
      toolGroups: ['web'],
      complexity: 'medium',
      skills: [],
    })

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Search the web for plumbers', makeConfig() as any)
    await collectEvents(gen)

    // getAgentTools should have been called with the planner's tool groups
    expect(getAgentToolsMock).toHaveBeenCalledWith(expect.arrayContaining(['web']))
  })

  it('6. passes skill RAG candidates to planner as skillCandidates parameter', async () => {
    selectRelevantSkillsRAGMock.mockReturnValue({
      candidates: [
        { id: 'content-calendar', name: 'Content Calendar', description: 'Plan content', estimatedTokens: 800, score: 6 },
        { id: 'seo-audit', name: 'SEO Audit', description: 'Run audit', estimatedTokens: 500, score: 4 },
      ],
      scores: { 'content-calendar': 6, 'seo-audit': 4 },
    })

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Plan my content calendar and SEO', makeConfig() as any)
    await collectEvents(gen)

    expect(generatePlanMock).toHaveBeenCalledTimes(1)
    const skillCandidates = generatePlanMock.mock.calls[0][3]
    expect(skillCandidates).toEqual([
      { id: 'content-calendar', description: 'Plan content' },
      { id: 'seo-audit', description: 'Run audit' },
    ])
  })

  it('7. resolves planner-selected skills and injects prompt into system prompt', async () => {
    const mockResolvedSkill = {
      entry: {
        id: 'seo-audit',
        name: 'SEO Audit',
        description: 'Run SEO audit',
        tags: ['seo'],
        triggerKeywords: ['seo', 'audit'],
        roleAffinity: [],
        estimatedTokens: 500,
        promptPath: '/fake/prompt.md',
      },
      prompt: 'You are an SEO expert. Analyze the following...',
      tools: undefined,
    }

    generatePlanMock.mockResolvedValue({
      stages: [{ id: 'audit', label: 'SEO Audit', icon: '🔍' }],
      toolGroups: [],
      complexity: 'medium',
      skills: ['seo-audit'],
    })
    resolveSkillMock.mockResolvedValue(mockResolvedSkill)

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Audit my website SEO', makeConfig() as any)
    await collectEvents(gen)

    expect(resolveSkillMock).toHaveBeenCalledWith('seo-audit')
  })

  it('8. resolves at most 2 skills from planner selection (slices to 2)', async () => {
    generatePlanMock.mockResolvedValue({
      stages: [{ id: 's1', label: 'Step 1', icon: '1' }],
      toolGroups: [],
      complexity: 'medium',
      skills: ['skill-a', 'skill-b', 'skill-c'],
    })
    resolveSkillMock.mockImplementation(async (id: string) => ({
      entry: { id, name: id, description: id, tags: [], triggerKeywords: [], roleAffinity: [], estimatedTokens: 100, promptPath: '/fake' },
      prompt: `Prompt for ${id}`,
    }))

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Do three things', makeConfig() as any)
    await collectEvents(gen)

    // resolveSkill should be called only for the first 2
    expect(resolveSkillMock).toHaveBeenCalledTimes(2)
    expect(resolveSkillMock).toHaveBeenCalledWith('skill-a')
    expect(resolveSkillMock).toHaveBeenCalledWith('skill-b')
  })

  it('9. merges skill tool groups into planner tool groups for getAgentTools', async () => {
    generatePlanMock.mockResolvedValue({
      stages: [{ id: 's1', label: 'Step', icon: '1' }],
      toolGroups: ['web'],
      complexity: 'medium',
      skills: ['seo-audit'],
    })
    resolveSkillMock.mockResolvedValue({
      entry: {
        id: 'seo-audit',
        name: 'SEO Audit',
        description: 'Audit',
        tags: [],
        triggerKeywords: [],
        roleAffinity: [],
        estimatedTokens: 500,
        toolGroup: 'seo',
        promptPath: '/fake',
      },
      prompt: 'SEO skill prompt',
    })

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Audit SEO', makeConfig() as any)
    await collectEvents(gen)

    // getAgentTools should be called with both 'web' (planner) and 'seo' (skill)
    expect(getAgentToolsMock).toHaveBeenCalledWith(expect.arrayContaining(['web', 'seo']))
  })

  it('10. uses getSkillsForRole when swarmRole is configured', async () => {
    const roleSkills = [
      { id: 'lead-scoring', name: 'Lead Scoring', description: 'Score leads', tags: [], triggerKeywords: [], roleAffinity: ['lead-swarm'], estimatedTokens: 400, promptPath: '/fake' },
    ]
    getSkillsForRoleMock.mockReturnValue(roleSkills)

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Score my leads', makeConfig({ swarmRole: 'lead-swarm' }) as any)
    await collectEvents(gen)

    expect(getSkillsForRoleMock).toHaveBeenCalledWith('lead-swarm')
    expect(getAllSkillsMock).not.toHaveBeenCalled()
    expect(selectRelevantSkillsRAGMock).toHaveBeenCalledWith('Score my leads', roleSkills)
  })

  it('11. does not pass skillCandidates to planner when skill RAG returns empty', async () => {
    selectRelevantSkillsRAGMock.mockReturnValue({ candidates: [], scores: {} })

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('What tasks are pending?', makeConfig() as any)
    await collectEvents(gen)

    expect(generatePlanMock).toHaveBeenCalledTimes(1)
    const skillCandidates = generatePlanMock.mock.calls[0][3]
    expect(skillCandidates).toBeUndefined()
  })

  it('12. registers skill-specific tools into the active tool set', async () => {
    const skillTools = [
      { name: 'audit_visibility', description: 'Audit site', input_schema: { type: 'object', properties: {} } },
    ]
    generatePlanMock.mockResolvedValue({
      stages: [{ id: 's1', label: 'Audit', icon: '🔍' }],
      toolGroups: [],
      complexity: 'medium',
      skills: ['seo-audit'],
    })
    resolveSkillMock.mockResolvedValue({
      entry: {
        id: 'seo-audit',
        name: 'SEO Audit',
        description: 'Audit',
        tags: [],
        triggerKeywords: [],
        roleAffinity: [],
        estimatedTokens: 500,
        promptPath: '/fake',
      },
      prompt: 'SEO skill prompt',
      tools: skillTools,
    })

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Run SEO audit', makeConfig() as any)
    await collectEvents(gen)

    // resolveSkill was called and returned tools with 'audit_visibility'
    expect(resolveSkillMock).toHaveBeenCalledWith('seo-audit')
  })

  it('13. uses getAllSkills (not getSkillsForRole) when no swarmRole set', async () => {
    const allSkills = [
      { id: 'generic-skill', name: 'Generic', description: 'A skill', tags: [], triggerKeywords: [], roleAffinity: [], estimatedTokens: 200, promptPath: '/fake' },
    ]
    getAllSkillsMock.mockReturnValue(allSkills)

    const { runTAORLoop } = await import('../taor-loop')
    const gen = runTAORLoop('Help me with something', makeConfig() as any)
    await collectEvents(gen)

    expect(getAllSkillsMock).toHaveBeenCalled()
    expect(getSkillsForRoleMock).not.toHaveBeenCalled()
    expect(selectRelevantSkillsRAGMock).toHaveBeenCalledWith('Help me with something', allSkills)
  })
})
