// ---------------------------------------------------------------------------
// Stagehand client wrapper — thin layer over @browserbasehq/stagehand SDK
// ---------------------------------------------------------------------------
// All browser automation flows go through this module. It handles
// configuration, session lifecycle, and error normalisation so callers
// never import the SDK directly.
//
// CUA-09 Self-Healing Navigation (via Stagehand's hybrid paradigm)
// ----------------------------------------------------------------
// Stagehand provides three-tier element targeting that delivers
// self-healing navigation without any custom selector-repair code:
//
//   Tier 1 — Cached selector (enableCaching=true):
//     Previously resolved selectors are reused across identical pages,
//     giving near-instant targeting on repeat visits.
//
//   Tier 2 — DOM / accessibility-tree inference:
//     When cached selectors miss (page structure changed), Stagehand
//     falls back to scanning the live DOM and accessibility tree to
//     locate elements by semantic role, label, and context.
//
//   Tier 3 — Vision (screenshot + CUA model):
//     As a last resort the model takes a screenshot and uses visual
//     understanding to locate the target, handling dynamic UIs and
//     sites that resist programmatic scraping.
//
// This three-tier fallback means the agent self-heals automatically
// when selectors break due to UI changes — no custom retry/repair
// logic is needed on our side (per decision D-05).
// ---------------------------------------------------------------------------

import { logger } from '@/lib/core/logger'
import type {
  StagehandConfig,
  BrowserAction,
  BrowserEvidence,
  BrowserTaskResult,
  BrowserTaskParams,
} from './types'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Build a StagehandConfig from environment variables. Throws if required vars are missing. */
export function getConfig(): StagehandConfig {
  const apiKey = process.env.BROWSERBASE_API_KEY
  const projectId = process.env.BROWSERBASE_PROJECT_ID

  if (!apiKey || !projectId) {
    throw new Error(
      'BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID must be set. ' +
      'Get them from https://www.browserbase.com > Settings > API Keys.',
    )
  }

  return {
    apiKey,
    projectId,
    env: 'BROWSERBASE',
    modelName: process.env.STAGEHAND_MODEL ?? 'anthropic/claude-sonnet-4-20250514',
    modelClientOptions: process.env.ANTHROPIC_API_KEY
      ? { apiKey: process.env.ANTHROPIC_API_KEY }
      : undefined,
    enableCaching: process.env.STAGEHAND_CACHE !== '0',
    verbose: process.env.NODE_ENV === 'development' ? 1 : 0,
  }
}

// ---------------------------------------------------------------------------
// Session wrapper
// ---------------------------------------------------------------------------

export interface StagehandSession {
  /** The underlying Stagehand instance. */
  stagehand: InstanceType<typeof import('@browserbasehq/stagehand').Stagehand>
  /** The default page in the browser context. */
  page: Awaited<ReturnType<InstanceType<typeof import('@browserbasehq/stagehand').Stagehand>['context']['pages']>>[0]
  /** Browserbase session ID. */
  sessionId: string | undefined
  /** When the session was created (epoch ms). */
  createdAt: number
}

/**
 * Create and initialise a new Stagehand browser session.
 *
 * Callers are responsible for calling `closeSession()` when done.
 */
export async function createSession(
  configOverrides?: Partial<StagehandConfig>,
): Promise<StagehandSession> {
  const config = { ...getConfig(), ...configOverrides }

  // Dynamic import so the SDK is tree-shaken in client bundles
  const { Stagehand } = await import('@browserbasehq/stagehand')

  // `experimental: true` + `disableAPI: true` are required so that the
  // `variables` option on act()/agent.execute() is honoured locally instead
  // of being rejected by the hosted Stagehand API. BitBit relies on that
  // option for credential injection — raw credential values must stay out
  // of the LLM prompt and are substituted at the browser layer.
  const stagehand = new Stagehand({
    env: config.env,
    apiKey: config.apiKey,
    projectId: config.projectId,
    model: config.modelName,
    verbose: config.verbose,
    experimental: true,
    disableAPI: true,
  })

  await stagehand.init()

  const page = stagehand.context.pages()[0]

  logger.info('[stagehand] Session created', {
    env: config.env,
    model: config.modelName,
  })

  return {
    stagehand,
    page,
    sessionId: undefined, // Browserbase assigns this internally
    createdAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// Primitive operations
// ---------------------------------------------------------------------------

/** Navigate to a URL. */
export async function navigateTo(
  session: StagehandSession,
  url: string,
): Promise<void> {
  logger.debug('[stagehand] Navigating', { url })
  await session.page.goto(url)
}

/** Execute a natural-language browser action. */
export async function act(
  session: StagehandSession,
  instruction: string,
): Promise<{ success: boolean; message: string; action: string }> {
  logger.debug('[stagehand] act()', { instruction })
  const result = await session.stagehand.act(instruction)
  return {
    success: result.success,
    message: result.message,
    action: result.actionDescription,
  }
}

/** Observe available actions on the current page. */
export async function observe(
  session: StagehandSession,
  instruction: string,
): Promise<Array<{ description: string; selector: string }>> {
  logger.debug('[stagehand] observe()', { instruction })
  const actions = await session.stagehand.observe(instruction)
  return actions.map((a) => ({
    description: a.description,
    selector: a.selector,
  }))
}

/** Extract structured data from the current page. */
export async function extract<T = Record<string, unknown>>(
  session: StagehandSession,
  instruction: string,
  schema?: import('zod').ZodType<T>,
): Promise<T> {
  logger.debug('[stagehand] extract()', { instruction })
  if (schema) {
    return session.stagehand.extract(instruction, schema)
  }
  return session.stagehand.extract(instruction) as Promise<T>
}

/** Gracefully close a session and release browser resources. */
export async function closeSession(session: StagehandSession): Promise<void> {
  try {
    await session.stagehand.close()
    logger.info('[stagehand] Session closed', {
      durationMs: Date.now() - session.createdAt,
    })
  } catch (err) {
    logger.warn('[stagehand] Error closing session', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ---------------------------------------------------------------------------
// High-level task runner
// ---------------------------------------------------------------------------

/**
 * Run a complete browser automation task end-to-end.
 *
 * Creates a session, navigates (if startUrl given), runs the agent,
 * collects actions, extracts data (if schema given), and closes the session.
 */
export async function runBrowserTask(
  params: BrowserTaskParams,
): Promise<BrowserTaskResult> {
  const actions: BrowserAction[] = []
  const startTime = Date.now()
  let session: StagehandSession | undefined

  try {
    session = await createSession()

    // Navigate to start URL if provided
    if (params.startUrl) {
      actions.push({
        stepIndex: 0,
        type: 'navigate',
        description: `Navigate to ${params.startUrl}`,
        timestamp: new Date().toISOString(),
        success: true,
      })
      await navigateTo(session, params.startUrl)
    }

    // Use the agent for multi-step instruction execution
    const agent = session.stagehand.agent({
      model: (session.stagehand as any)['modelName'],
    })

    const agentResult = await agent.execute({
      instruction: params.instruction,
      maxSteps: params.maxSteps ?? 10,
    })

    // Record each action from the agent result
    if (agentResult.actions && Array.isArray(agentResult.actions)) {
      for (let i = 0; i < agentResult.actions.length; i++) {
        const agentAction = agentResult.actions[i]
        actions.push({
          stepIndex: actions.length,
          type: 'act',
          description: typeof agentAction === 'string'
            ? agentAction
            : JSON.stringify(agentAction),
          timestamp: new Date().toISOString(),
          success: true,
        })
      }
    }

    // Extract structured data if a schema was provided
    let extractedData: unknown = undefined
    if (params.outputSchema) {
      // Use instruction-based extraction (schema-aware extraction
      // will be added when JSON-schema-to-Zod conversion lands)
      extractedData = await extract(
        session,
        params.instruction,
      )
      actions.push({
        stepIndex: actions.length,
        type: 'extract',
        description: 'Extract structured data from page',
        timestamp: new Date().toISOString(),
        success: true,
      })
    }

    const durationMs = Date.now() - startTime
    const replayUrl = session.sessionId
      ? `https://www.browserbase.com/sessions/${session.sessionId}`
      : ''

    const evidence: BrowserEvidence = {
      sessionReplayUrl: replayUrl,
      actionLog: actions,
      actionCount: actions.length,
      durationSeconds: Math.round(durationMs / 1000),
    }

    return {
      status: 'completed',
      extractedData,
      message: agentResult.message,
      actions,
      sessionId: session.sessionId,
      replayUrl,
      usage: agentResult.usage
        ? {
            inputTokens: agentResult.usage.input_tokens,
            outputTokens: agentResult.usage.output_tokens,
            reasoningTokens: agentResult.usage.reasoning_tokens,
          }
        : undefined,
      durationMs,
      evidence,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[stagehand] Browser task failed', { error: errorMsg })

    const failDurationMs = Date.now() - startTime
    const failReplayUrl = session?.sessionId
      ? `https://www.browserbase.com/sessions/${session.sessionId}`
      : ''

    const failEvidence: BrowserEvidence = {
      sessionReplayUrl: failReplayUrl,
      actionLog: actions,
      actionCount: actions.length,
      durationSeconds: Math.round(failDurationMs / 1000),
    }

    return {
      status: 'failed',
      actions,
      error: errorMsg,
      durationMs: failDurationMs,
      replayUrl: failReplayUrl,
      evidence: failEvidence,
    }
  } finally {
    if (session) {
      await closeSession(session)
    }
  }
}
