---
phase: 40
plan: 1
title: "Stagehand SDK Client + spawn_browser_agent Tool"
wave: 1
depends_on: []
requirements_addressed: [CUA-01, CUA-02]
files_modified:
  - personal-assistant/package.json
  - personal-assistant/src/lib/browser/stagehand-client.ts
  - personal-assistant/src/lib/browser/types.ts
  - personal-assistant/src/lib/agent/tools/browser-tools.ts
  - personal-assistant/src/lib/agent/tools/index.ts
  - personal-assistant/src/lib/browser/__tests__/stagehand-client.test.ts
  - personal-assistant/src/lib/agent/tools/__tests__/browser-tools.test.ts
autonomous: true
estimated_tasks: 5
---

# Plan 40-01: Stagehand SDK Client + spawn_browser_agent Tool

<objective>
Install the Stagehand SDK, create a typed client wrapper that connects to Browserbase infrastructure, and register `spawn_browser_agent` as a tool in the TAOR loop tool dispatch. This is the foundational integration layer -- all other browser automation plans depend on this.
</objective>

## Tasks

<task id="40-01-01">
<title>Install @browserbasehq/stagehand dependency</title>
<read_first>
- personal-assistant/package.json (current dependencies)
</read_first>
<action>
Add `@browserbasehq/stagehand` to `personal-assistant/package.json` dependencies:

```bash
cd personal-assistant && npm install @browserbasehq/stagehand
```

Also add environment variable stubs to `.env.example` (if it exists) or document in the module:
- `BROWSERBASE_API_KEY` -- Browserbase API key for session management
- `BROWSERBASE_PROJECT_ID` -- Browserbase project identifier
</action>
<acceptance_criteria>
- `personal-assistant/package.json` contains `"@browserbasehq/stagehand"` in dependencies
- `personal-assistant/node_modules/@browserbasehq/stagehand` directory exists after install
</acceptance_criteria>
</task>

<task id="40-01-02">
<title>Create browser automation types</title>
<read_first>
- personal-assistant/src/lib/agent/engine/types.ts (EngineConfig pattern for typed interfaces)
- personal-assistant/src/lib/agent/tools/spawn-agent.ts (existing spawn tool pattern)
</read_first>
<action>
Create `personal-assistant/src/lib/browser/types.ts` with the following types:

```typescript
/**
 * Types for the browser automation subsystem.
 * Phase 40: Multimodal Web Automation (CUA-01 through CUA-11)
 */

/** Browser task status within the execution lifecycle. */
export type BrowserTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'budget_exceeded'

/** Parameters for spawning a browser agent task. */
export interface BrowserTaskParams {
  /** Target URL to navigate to. */
  url: string
  /** Natural language objective for the browser agent. */
  objective: string
  /** Organization ID for domain authorization and cost tracking. */
  orgId: string
  /** Entity ID for LTV-scaled budget lookup. */
  entityId?: string
  /** Credential source: 'composio' (primary) or '1password' (fallback). */
  credentialSource?: 'composio' | '1password' | 'none'
  /** Composio connection ID for authenticated navigation. */
  composioConnectionId?: string
  /** 1Password secret reference for credential injection. */
  opSecretRef?: string
  /** Maximum session duration in seconds (default: 300). */
  maxDurationSeconds?: number
}

/** Result returned from a completed browser task. */
export interface BrowserTaskResult {
  status: BrowserTaskStatus
  /** Browserbase session ID for replay URL construction. */
  sessionId: string
  /** Session replay URL: https://browserbase.com/sessions/{sessionId} */
  replayUrl: string
  /** Natural language summary of actions taken. */
  summary: string
  /** Structured data extracted during the task (if any). */
  extractedData?: Record<string, unknown>
  /** Actions performed during the session. */
  actions: BrowserAction[]
  /** Total session duration in seconds. */
  durationSeconds: number
  /** Estimated cost: LLM tokens + Browserbase session time. */
  estimatedCost: { llmTokens: number; sessionMinutes: number }
  /** Error message if status is 'failed'. */
  error?: string
}

/** A single browser action recorded during execution. */
export interface BrowserAction {
  type: 'navigate' | 'act' | 'extract' | 'observe'
  instruction: string
  timestamp: string
  success: boolean
  result?: string
}

/** Configuration for the Stagehand client. */
export interface StagehandConfig {
  apiKey: string
  projectId: string
  /** Model to use for Stagehand's AI operations. Defaults to Claude Sonnet via Browserbase Model Gateway. */
  model?: string
  /** Whether to record the session (default: true). */
  recordSession?: boolean
}
```
</action>
<acceptance_criteria>
- File `personal-assistant/src/lib/browser/types.ts` exists
- File contains `export type BrowserTaskStatus`
- File contains `export interface BrowserTaskParams`
- File contains `export interface BrowserTaskResult`
- File contains `export interface BrowserAction`
- File contains `export interface StagehandConfig`
- File contains `replayUrl: string`
- File contains `credentialSource?: 'composio' | '1password' | 'none'`
</acceptance_criteria>
</task>

<task id="40-01-03">
<title>Create Stagehand client wrapper</title>
<read_first>
- personal-assistant/src/lib/browser/types.ts (types just created)
- personal-assistant/src/lib/composio/mcp-session.ts (existing SDK wrapper pattern)
- personal-assistant/src/lib/core/logger.ts (logger import pattern)
</read_first>
<action>
Create `personal-assistant/src/lib/browser/stagehand-client.ts`:

```typescript
/**
 * Stagehand SDK client wrapper for Browserbase-managed browser automation.
 *
 * Phase 40: Multimodal Web Automation
 * Provider: Stagehand + Browserbase (hybrid vision + accessibility-tree paradigm)
 *
 * Stagehand methods map to TAOR loop semantics:
 * - observe() → Understand page state (TAOR "Observe")
 * - act(instruction) → Execute browser action (TAOR "Act")
 * - extract(instruction, schema) → Pull structured data
 * - agent({ task }) → Full autonomous multi-step task
 */

import { Stagehand } from '@browserbasehq/stagehand'
import { logger } from '@/lib/core/logger'
import type { StagehandConfig, BrowserAction } from './types'

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function getConfig(): StagehandConfig {
  const apiKey = process.env.BROWSERBASE_API_KEY
  const projectId = process.env.BROWSERBASE_PROJECT_ID

  if (!apiKey) throw new Error('BROWSERBASE_API_KEY environment variable is required for browser automation')
  if (!projectId) throw new Error('BROWSERBASE_PROJECT_ID environment variable is required for browser automation')

  return { apiKey, projectId }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

export interface StagehandSession {
  stagehand: Stagehand
  sessionId: string
  actions: BrowserAction[]
  startedAt: Date
}

/**
 * Create a new ephemeral Browserbase session via Stagehand.
 * Each session is isolated -- no data persists between tasks or orgs (CUA-05).
 */
export async function createSession(
  options: { recordSession?: boolean; model?: string } = {}
): Promise<StagehandSession> {
  const config = getConfig()

  const stagehand = new Stagehand({
    env: 'BROWSERBASE',
    apiKey: config.apiKey,
    projectId: config.projectId,
    modelName: options.model ?? 'anthropic/claude-sonnet-4-6',
    enableCaching: true, // Auto-caching for repeated actions (~2x faster, ~30% cost reduction)
  })

  await stagehand.init()

  // Extract session ID from Browserbase session
  const sessionId = (stagehand as any).sessionId ?? 'unknown'

  logger.info('browser.session.created', {
    sessionId,
    recordSession: options.recordSession ?? true,
  })

  return {
    stagehand,
    sessionId,
    actions: [],
    startedAt: new Date(),
  }
}

/**
 * Navigate to a URL within the session.
 */
export async function navigateTo(session: StagehandSession, url: string): Promise<void> {
  const page = session.stagehand.context.pages()[0]
  if (!page) throw new Error('No page available in Stagehand session')

  await page.goto(url)

  session.actions.push({
    type: 'navigate',
    instruction: `Navigate to ${url}`,
    timestamp: new Date().toISOString(),
    success: true,
  })

  logger.info('browser.navigate', { sessionId: session.sessionId, url })
}

/**
 * Execute a natural-language browser action via Stagehand act().
 * Stagehand uses hybrid paradigm: DOM/accessibility-tree first, vision fallback.
 */
export async function act(session: StagehandSession, instruction: string): Promise<string> {
  const result = await session.stagehand.act(instruction)

  session.actions.push({
    type: 'act',
    instruction,
    timestamp: new Date().toISOString(),
    success: true,
    result: JSON.stringify(result),
  })

  logger.info('browser.act', { sessionId: session.sessionId, instruction })
  return JSON.stringify(result)
}

/**
 * Observe the current page state via Stagehand observe().
 * Returns available actions on the page.
 */
export async function observe(session: StagehandSession): Promise<string> {
  const observations = await session.stagehand.observe()

  session.actions.push({
    type: 'observe',
    instruction: 'Observe page state',
    timestamp: new Date().toISOString(),
    success: true,
    result: JSON.stringify(observations),
  })

  return JSON.stringify(observations)
}

/**
 * Extract structured data from the page via Stagehand extract().
 */
export async function extract(
  session: StagehandSession,
  instruction: string,
  schema?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const data = await session.stagehand.extract({
    instruction,
    ...(schema ? { schema } : {}),
  })

  session.actions.push({
    type: 'extract',
    instruction,
    timestamp: new Date().toISOString(),
    success: true,
    result: JSON.stringify(data),
  })

  logger.info('browser.extract', { sessionId: session.sessionId, instruction })
  return data as Record<string, unknown>
}

/**
 * Close the session. Browserbase handles cleanup -- session data does not persist.
 */
export async function closeSession(session: StagehandSession): Promise<{
  sessionId: string
  replayUrl: string
  durationSeconds: number
  actionCount: number
}> {
  const durationSeconds = Math.round((Date.now() - session.startedAt.getTime()) / 1000)

  await session.stagehand.close()

  const result = {
    sessionId: session.sessionId,
    replayUrl: `https://browserbase.com/sessions/${session.sessionId}`,
    durationSeconds,
    actionCount: session.actions.length,
  }

  logger.info('browser.session.closed', result)
  return result
}
```
</action>
<acceptance_criteria>
- File `personal-assistant/src/lib/browser/stagehand-client.ts` exists
- File contains `import { Stagehand } from '@browserbasehq/stagehand'`
- File contains `export async function createSession`
- File contains `export async function navigateTo`
- File contains `export async function act`
- File contains `export async function observe`
- File contains `export async function extract`
- File contains `export async function closeSession`
- File contains `env: 'BROWSERBASE'` (Browserbase-managed infrastructure)
- File contains `enableCaching: true`
- File contains `replayUrl: \`https://browserbase.com/sessions/`
</acceptance_criteria>
</task>

<task id="40-01-04">
<title>Create spawn_browser_agent tool definition</title>
<read_first>
- personal-assistant/src/lib/agent/tools/spawn-agent.ts (existing spawn tool pattern for tool definition structure)
- personal-assistant/src/lib/agent/tools/index.ts (tool registration pattern)
- personal-assistant/src/lib/browser/types.ts (BrowserTaskParams interface)
</read_first>
<action>
Create `personal-assistant/src/lib/agent/tools/browser-tools.ts`:

```typescript
/**
 * Browser automation tools for the TAOR loop.
 * Phase 40: Multimodal Web Automation (CUA-01)
 *
 * spawn_browser_agent dispatches a browser task to the Stagehand/Browserbase
 * infrastructure. The task runs as an async operation and returns results
 * inline in the conversation.
 */

import type { ToolDefinition, ToolResult, ExecuteToolOptions } from '@/lib/agent/tools'
import { logger } from '@/lib/core/logger'

export const BROWSER_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'spawn_browser_agent',
    description: 'Navigate a website autonomously — log in, fill forms, click buttons, extract data. Uses an ephemeral cloud browser with session recording for evidence. The browser agent acts fully autonomously without confirmation prompts. Results are returned inline.',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: {
          type: 'string',
          description: 'Target URL to navigate to (e.g., "https://dashboard.stripe.com/invoices")',
        },
        objective: {
          type: 'string',
          description: 'Natural language description of what to accomplish (e.g., "Find the latest unpaid invoice for Acme Corp and download the PDF")',
        },
        credential_source: {
          type: 'string',
          enum: ['composio', '1password', 'none'],
          description: 'How to authenticate: "composio" for managed OAuth/API keys, "1password" for vault credentials, "none" for public sites. Defaults to "none".',
        },
        composio_connection_id: {
          type: 'string',
          description: 'Composio connection ID for authenticated navigation. Required when credential_source is "composio".',
        },
        op_secret_ref: {
          type: 'string',
          description: '1Password secret reference (e.g., "op://Vault/Item/field"). Required when credential_source is "1password".',
        },
        max_duration_seconds: {
          type: 'number',
          description: 'Maximum session duration in seconds. Defaults to 300 (5 minutes).',
        },
      },
      required: ['url', 'objective'],
    },
  },
]

/**
 * Execute the spawn_browser_agent tool.
 * This is the entry point from the TAOR loop tool executor.
 */
export async function executeBrowserTool(
  toolName: string,
  input: Record<string, unknown>,
  options: ExecuteToolOptions,
): Promise<ToolResult> {
  if (toolName !== 'spawn_browser_agent') {
    return { result: `Unknown browser tool: ${toolName}`, isError: true }
  }

  const url = input.url as string
  const objective = input.objective as string
  const credentialSource = (input.credential_source as string) ?? 'none'
  const maxDurationSeconds = (input.max_duration_seconds as number) ?? 300

  logger.info('browser.tool.dispatch', {
    url,
    objective,
    credentialSource,
    orgId: options.orgId,
  })

  try {
    // Import dynamically to avoid loading Stagehand SDK when browser tools aren't used
    const { executeBrowserTask } = await import('@/lib/browser/browser-task')

    const result = await executeBrowserTask({
      url,
      objective,
      orgId: options.orgId,
      entityId: options.entityId,
      credentialSource: credentialSource as 'composio' | '1password' | 'none',
      composioConnectionId: input.composio_connection_id as string | undefined,
      opSecretRef: input.op_secret_ref as string | undefined,
      maxDurationSeconds,
    })

    // Format result for conversation display (D-10)
    const evidence = result.replayUrl
      ? `\n\nSession recording: ${result.replayUrl}`
      : ''

    const extractedInfo = result.extractedData
      ? `\n\nExtracted data:\n${JSON.stringify(result.extractedData, null, 2)}`
      : ''

    return {
      result: `${result.summary}${extractedInfo}${evidence}\n\n(Duration: ${result.durationSeconds}s, Actions: ${result.actions.length})`,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('browser.tool.failed', { url, objective, error: message })
    return {
      result: `Browser task failed: ${message}`,
      isError: true,
    }
  }
}
```

Then register the tool in `personal-assistant/src/lib/agent/tools/index.ts` by:
1. Importing `BROWSER_TOOL_DEFINITIONS` and `executeBrowserTool` from `./browser-tools`
2. Adding `BROWSER_TOOL_DEFINITIONS` to the tool definitions array
3. Adding a case for `'spawn_browser_agent'` in the tool execution dispatch that calls `executeBrowserTool`
</action>
<acceptance_criteria>
- File `personal-assistant/src/lib/agent/tools/browser-tools.ts` exists
- File contains `name: 'spawn_browser_agent'`
- File contains `export const BROWSER_TOOL_DEFINITIONS`
- File contains `export async function executeBrowserTool`
- File contains `import('@/lib/browser/browser-task')` (dynamic import)
- `personal-assistant/src/lib/agent/tools/index.ts` imports from `./browser-tools`
- `personal-assistant/src/lib/agent/tools/index.ts` includes `spawn_browser_agent` in tool dispatch
</acceptance_criteria>
</task>

<task id="40-01-05">
<title>Unit tests for Stagehand client and browser tool</title>
<read_first>
- personal-assistant/src/lib/browser/stagehand-client.ts (module under test)
- personal-assistant/src/lib/agent/tools/browser-tools.ts (tool under test)
- personal-assistant/src/lib/agent/engine/__tests__/taor-loop.test.ts (existing test patterns, mocking approach)
</read_first>
<action>
Create `personal-assistant/src/lib/browser/__tests__/stagehand-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the Stagehand SDK
vi.mock('@browserbasehq/stagehand', () => ({
  Stagehand: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    context: { pages: () => [{ goto: vi.fn().mockResolvedValue(undefined) }] },
    act: vi.fn().mockResolvedValue({ success: true }),
    observe: vi.fn().mockResolvedValue([{ description: 'Login button', selector: '#login' }]),
    extract: vi.fn().mockResolvedValue({ title: 'Test Page', items: 3 }),
    close: vi.fn().mockResolvedValue(undefined),
    sessionId: 'test-session-123',
  })),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

describe('stagehand-client', () => {
  beforeEach(() => {
    process.env.BROWSERBASE_API_KEY = 'test-api-key'
    process.env.BROWSERBASE_PROJECT_ID = 'test-project-id'
  })

  afterEach(() => {
    delete process.env.BROWSERBASE_API_KEY
    delete process.env.BROWSERBASE_PROJECT_ID
  })

  it('creates a session with Browserbase config', async () => {
    const { createSession } = await import('../stagehand-client')
    const session = await createSession()
    expect(session.sessionId).toBe('test-session-123')
    expect(session.actions).toHaveLength(0)
    expect(session.startedAt).toBeInstanceOf(Date)
  })

  it('throws when BROWSERBASE_API_KEY is missing', async () => {
    delete process.env.BROWSERBASE_API_KEY
    const { createSession } = await import('../stagehand-client')
    await expect(createSession()).rejects.toThrow('BROWSERBASE_API_KEY')
  })

  it('navigates to a URL and records action', async () => {
    const { createSession, navigateTo } = await import('../stagehand-client')
    const session = await createSession()
    await navigateTo(session, 'https://example.com')
    expect(session.actions).toHaveLength(1)
    expect(session.actions[0].type).toBe('navigate')
    expect(session.actions[0].instruction).toContain('https://example.com')
  })

  it('executes act() and records action', async () => {
    const { createSession, act } = await import('../stagehand-client')
    const session = await createSession()
    const result = await act(session, 'click the login button')
    expect(session.actions).toHaveLength(1)
    expect(session.actions[0].type).toBe('act')
    expect(session.actions[0].instruction).toBe('click the login button')
    expect(result).toContain('success')
  })

  it('executes extract() and returns structured data', async () => {
    const { createSession, extract } = await import('../stagehand-client')
    const session = await createSession()
    const data = await extract(session, 'get the page title and item count')
    expect(data).toHaveProperty('title', 'Test Page')
    expect(data).toHaveProperty('items', 3)
    expect(session.actions).toHaveLength(1)
    expect(session.actions[0].type).toBe('extract')
  })

  it('closes session and returns replay URL', async () => {
    const { createSession, closeSession } = await import('../stagehand-client')
    const session = await createSession()
    const result = await closeSession(session)
    expect(result.sessionId).toBe('test-session-123')
    expect(result.replayUrl).toBe('https://browserbase.com/sessions/test-session-123')
    expect(result.durationSeconds).toBeGreaterThanOrEqual(0)
  })
})
```

Create `personal-assistant/src/lib/agent/tools/__tests__/browser-tools.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { BROWSER_TOOL_DEFINITIONS, executeBrowserTool } from '../browser-tools'

vi.mock('@/lib/core/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock('@/lib/browser/browser-task', () => ({
  executeBrowserTask: vi.fn().mockResolvedValue({
    status: 'completed',
    sessionId: 'sess-abc',
    replayUrl: 'https://browserbase.com/sessions/sess-abc',
    summary: 'Navigated to Stripe and downloaded invoice PDF.',
    extractedData: { invoiceId: 'INV-001', amount: 150.00 },
    actions: [
      { type: 'navigate', instruction: 'Navigate to stripe.com', timestamp: '2026-04-08T00:00:00Z', success: true },
      { type: 'act', instruction: 'Click invoices tab', timestamp: '2026-04-08T00:00:01Z', success: true },
    ],
    durationSeconds: 45,
    estimatedCost: { llmTokens: 12000, sessionMinutes: 1 },
  }),
}))

describe('browser-tools', () => {
  it('defines spawn_browser_agent tool with correct schema', () => {
    const tool = BROWSER_TOOL_DEFINITIONS.find(t => t.name === 'spawn_browser_agent')
    expect(tool).toBeDefined()
    expect(tool!.input_schema.required).toContain('url')
    expect(tool!.input_schema.required).toContain('objective')
    expect(tool!.input_schema.properties).toHaveProperty('credential_source')
  })

  it('executes browser tool and returns formatted result', async () => {
    const result = await executeBrowserTool(
      'spawn_browser_agent',
      { url: 'https://stripe.com', objective: 'Download latest invoice' },
      { orgId: 'org-123' } as any,
    )
    expect(result.isError).toBeUndefined()
    expect(result.result).toContain('Navigated to Stripe')
    expect(result.result).toContain('browserbase.com/sessions/sess-abc')
    expect(result.result).toContain('INV-001')
  })

  it('returns error for unknown tool name', async () => {
    const result = await executeBrowserTool('unknown_tool', {}, {} as any)
    expect(result.isError).toBe(true)
    expect(result.result).toContain('Unknown browser tool')
  })
})
```
</action>
<acceptance_criteria>
- File `personal-assistant/src/lib/browser/__tests__/stagehand-client.test.ts` exists
- File contains `describe('stagehand-client'`
- File contains tests for createSession, navigateTo, act, extract, closeSession
- File `personal-assistant/src/lib/agent/tools/__tests__/browser-tools.test.ts` exists
- File contains `describe('browser-tools'`
- File contains test for tool definition schema
- File contains test for tool execution result format
- All tests pass: `cd personal-assistant && npx vitest run src/lib/browser/__tests__/stagehand-client.test.ts src/lib/agent/tools/__tests__/browser-tools.test.ts`
</acceptance_criteria>
</task>

## Verification

```bash
# Stagehand dependency installed
grep "@browserbasehq/stagehand" personal-assistant/package.json

# Types defined
grep "BrowserTaskParams\|BrowserTaskResult\|StagehandConfig" personal-assistant/src/lib/browser/types.ts

# Client wrapper exists with all methods
grep "createSession\|navigateTo\|act\|observe\|extract\|closeSession" personal-assistant/src/lib/browser/stagehand-client.ts

# Tool registered in TAOR loop dispatch
grep "spawn_browser_agent" personal-assistant/src/lib/agent/tools/browser-tools.ts
grep "spawn_browser_agent\|browser-tools" personal-assistant/src/lib/agent/tools/index.ts

# Tests pass
cd personal-assistant && npx vitest run src/lib/browser/__tests__/stagehand-client.test.ts
cd personal-assistant && npx vitest run src/lib/agent/tools/__tests__/browser-tools.test.ts
```

## must_haves
- [ ] `@browserbasehq/stagehand` installed as dependency
- [ ] Typed interfaces for browser task params, results, and actions
- [ ] Stagehand client wrapper with createSession, act, observe, extract, closeSession
- [ ] `spawn_browser_agent` tool definition registered in TAOR loop dispatch
- [ ] Unit tests pass for both client wrapper and tool definition

## PLANNING COMPLETE
