/**
 * Browser task execution engine.
 * Phase 40: Multimodal Web Automation
 *
 * Orchestrates the full lifecycle of a browser automation task:
 * 1. Pre-flight checks (CUA-11): domain gate, budget check, credential availability
 * 2. Session creation: ephemeral Browserbase session via Stagehand (CUA-03, CUA-05)
 * 3. Navigation + credential injection (CUA-08)
 * 4. Autonomous task execution via Stagehand agent() (CUA-06)
 * 5. Cost monitoring throughout (CUA-10)
 * 6. Result collection + session close
 * 7. Evidence capture for audit trail (CUA-09)
 *
 * Sessions are ephemeral: no data persists between tasks or orgs.
 * Browserbase handles container isolation -- we don't manage containers.
 */

import { logger } from '@/lib/core/logger'
import {
  createSession,
  navigateTo,
  extract,
  closeSession,
} from './stagehand-client'
import type { StagehandSession } from './stagehand-client'
import { checkDomainAuthorization } from './domain-gate'
import { injectCredentials } from './credential-injector'
import type { CredentialSource, CredentialOptions } from './credential-injector'
import {
  createCostBudget,
  recordTokens,
  recordSessionTime,
  checkBudget,
  preFlightBudgetCheck,
} from './cost-monitor'
import type {
  BrowserTaskParams,
  BrowserTaskResult,
  BrowserAction,
  BrowserEvidence,
} from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Estimated tokens per Stagehand action (act/observe/extract). */
const ESTIMATED_TOKENS_PER_ACTION = 2000

// ---------------------------------------------------------------------------
// Pre-flight checks (CUA-11: fail-closed gate)
// ---------------------------------------------------------------------------

export interface PreFlightResult {
  passed: boolean
  failReason?: string
  budgetMaxUsd?: number
}

/**
 * Run pre-flight checks before creating a browser session.
 *
 * Checks:
 * 1. Domain authorization (if startUrl and supabase provided)
 * 2. Budget availability
 */
export async function runPreFlightChecks(
  params: BrowserTaskParams,
  supabase: { from: (table: string) => any } | undefined,
  orgId?: string,
  ltvMultiplier?: number,
): Promise<PreFlightResult> {
  // Check 1: Domain authorization (only when supabase and startUrl available)
  if (params.startUrl && supabase && orgId) {
    const domainResult = await checkDomainAuthorization(
      params.startUrl,
      orgId,
      supabase,
    )
    if (!domainResult.allowed) {
      return {
        passed: false,
        failReason: `Domain check failed: ${domainResult.reason ?? 'blocked'}`,
      }
    }
  }

  // Check 2: Budget pre-flight
  const budgetResult = preFlightBudgetCheck(ltvMultiplier ?? 1.0)
  if (!budgetResult.allowed) {
    return {
      passed: false,
      failReason: 'Budget pre-flight check failed: insufficient budget',
    }
  }

  return {
    passed: true,
    budgetMaxUsd: budgetResult.maxBudgetUsd,
  }
}

// ---------------------------------------------------------------------------
// Execution options
// ---------------------------------------------------------------------------

export interface ExecuteBrowserTaskOptions {
  orgId?: string
  supabase?: { from: (table: string) => any }
  ltvMultiplier?: number
  credentialSource?: CredentialSource
  credentialOptions?: CredentialOptions
}

// ---------------------------------------------------------------------------
// Main execution function
// ---------------------------------------------------------------------------

/**
 * Execute a browser automation task end-to-end.
 *
 * This is the function called by spawn_browser_agent via the tool executor.
 * It manages the complete session lifecycle and returns structured results
 * for inline display in the conversation (D-10).
 */
export async function executeBrowserTask(
  params: BrowserTaskParams,
  options?: ExecuteBrowserTaskOptions,
): Promise<BrowserTaskResult> {
  const ltvMultiplier = options?.ltvMultiplier ?? 1.0
  const actions: BrowserAction[] = []
  const startTime = Date.now()
  let session: StagehandSession | undefined

  logger.info('[browser-task] Starting', {
    startUrl: params.startUrl,
    instruction: params.instruction,
    orgId: options?.orgId,
    credentialSource: options?.credentialSource,
  })

  // -- Pre-flight checks (CUA-11) ------------------------------------------
  if (options?.supabase || options?.orgId) {
    const preFlight = await runPreFlightChecks(
      params,
      options?.supabase,
      options?.orgId,
      ltvMultiplier,
    )
    if (!preFlight.passed) {
      logger.warn('[browser-task] Pre-flight failed', {
        reason: preFlight.failReason,
      })

      const failEvidence: BrowserEvidence = {
        sessionReplayUrl: '',
        actionLog: [],
        actionCount: 0,
        durationSeconds: 0,
      }

      return {
        status: 'failed',
        actions: [],
        error: preFlight.failReason,
        message: `Browser task blocked: ${preFlight.failReason}`,
        durationMs: Date.now() - startTime,
        evidence: failEvidence,
      }
    }
  }

  // -- Create ephemeral session (CUA-03, CUA-05) ---------------------------
  const costBudget = createCostBudget(ltvMultiplier)

  try {
    session = await createSession()

    // -- Navigate to target URL ---------------------------------------------
    if (params.startUrl) {
      actions.push({
        stepIndex: 0,
        type: 'navigate',
        description: `Navigate to ${params.startUrl}`,
        timestamp: new Date().toISOString(),
        success: true,
      })
      await navigateTo(session, params.startUrl)
      recordTokens(costBudget, ESTIMATED_TOKENS_PER_ACTION)
    }

    // -- Credential injection (CUA-08) --------------------------------------
    if (options?.credentialSource && options.credentialSource !== 'none') {
      const credResult = await injectCredentials(
        { act: (instruction: string) => session!.stagehand.act(instruction) },
        options.credentialSource,
        options.credentialOptions ?? {},
      )
      recordTokens(costBudget, ESTIMATED_TOKENS_PER_ACTION * 2)

      if (!credResult.success) {
        actions.push({
          stepIndex: actions.length,
          type: 'act',
          description: `Credential injection failed: ${credResult.error}`,
          timestamp: new Date().toISOString(),
          success: false,
          detail: credResult.error,
        })

        throw new Error(`Credential injection failed: ${credResult.error}`)
      }

      actions.push({
        stepIndex: actions.length,
        type: 'act',
        description: `Credential injection succeeded via ${options.credentialSource}`,
        timestamp: new Date().toISOString(),
        success: true,
      })
    }

    // -- Autonomous task execution (CUA-06) ---------------------------------
    const agent = session.stagehand.agent({
      model: session.stagehand.modelName,
    })

    const agentResult = await agent.execute({
      instruction: params.instruction,
      maxSteps: params.maxSteps ?? 10,
    })

    // Record agent actions
    if (agentResult.actions && Array.isArray(agentResult.actions)) {
      for (const agentAction of agentResult.actions) {
        actions.push({
          stepIndex: actions.length,
          type: 'act',
          description:
            typeof agentAction === 'string'
              ? agentAction
              : JSON.stringify(agentAction),
          timestamp: new Date().toISOString(),
          success: true,
        })
      }
    }

    // Record estimated token consumption
    const estimatedAgentTokens =
      ESTIMATED_TOKENS_PER_ACTION *
      (agentResult.actions?.length ?? 5)
    recordTokens(costBudget, estimatedAgentTokens)

    // -- Cost budget check (CUA-10) -----------------------------------------
    const costCheck = checkBudget(costBudget)
    if (!costCheck.withinBudget) {
      logger.warn('[browser-task] Budget exceeded', {
        sessionId: session.sessionId,
        spentUsd: costCheck.spentUsd,
        maxBudgetUsd: costCheck.maxBudgetUsd,
      })

      const durationMs = Date.now() - startTime
      const durationSeconds = Math.round(durationMs / 1000)
      recordSessionTime(costBudget, Math.ceil(durationSeconds / 60))

      const evidence: BrowserEvidence = {
        sessionReplayUrl: session.sessionId
          ? `https://www.browserbase.com/sessions/${session.sessionId}`
          : '',
        actionLog: actions,
        actionCount: actions.length,
        durationSeconds,
      }

      return {
        status: 'failed',
        actions,
        message: `Browser task stopped: cost budget exceeded ($${costCheck.spentUsd.toFixed(2)} / $${costCheck.maxBudgetUsd.toFixed(2)})`,
        error: `Budget exceeded: $${costCheck.spentUsd.toFixed(2)} spent of $${costCheck.maxBudgetUsd.toFixed(2)} max`,
        sessionId: session.sessionId,
        replayUrl: evidence.sessionReplayUrl,
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
    }

    // -- Extract structured data if schema provided -------------------------
    let extractedData: unknown = undefined
    if (params.outputSchema) {
      try {
        extractedData = await extract(session, params.instruction)
        actions.push({
          stepIndex: actions.length,
          type: 'extract',
          description: 'Extract structured data from page',
          timestamp: new Date().toISOString(),
          success: true,
        })
        recordTokens(costBudget, ESTIMATED_TOKENS_PER_ACTION)
      } catch {
        logger.info('[browser-task] Extraction skipped', {
          sessionId: session.sessionId,
        })
      }
    }

    // -- Collect results and close session -----------------------------------
    const durationMs = Date.now() - startTime
    const durationSeconds = Math.round(durationMs / 1000)
    recordSessionTime(costBudget, Math.ceil(durationSeconds / 60))

    const replayUrl = session.sessionId
      ? `https://www.browserbase.com/sessions/${session.sessionId}`
      : ''

    const evidence: BrowserEvidence = {
      sessionReplayUrl: replayUrl,
      actionLog: actions,
      actionCount: actions.length,
      durationSeconds,
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
    logger.error('[browser-task] Task failed', { error: errorMsg })

    const failDurationMs = Date.now() - startTime
    const failDurationSeconds = Math.round(failDurationMs / 1000)

    const failReplayUrl = session?.sessionId
      ? `https://www.browserbase.com/sessions/${session.sessionId}`
      : ''

    const failEvidence: BrowserEvidence = {
      sessionReplayUrl: failReplayUrl,
      actionLog: actions,
      actionCount: actions.length,
      durationSeconds: failDurationSeconds,
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
