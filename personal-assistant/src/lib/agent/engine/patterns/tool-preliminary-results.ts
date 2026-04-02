/**
 * Tool Preliminary Results Pattern
 *
 * Yields intermediate progress updates from a long-running tool execution
 * using an async generator (`async *execute`). The UI can render each
 * intermediate result (e.g. a progress stepper) before the final answer.
 *
 * Ported from: aisdkagents-patterns/tool-api-preliminary-tool-results
 */

import { type Tool, tool } from 'ai'
import type { z } from 'zod'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepStatus = 'pending' | 'loading' | 'complete' | 'error'

export interface ProgressStep {
  /** Machine-readable step identifier. */
  id: string
  /** Human label. */
  label: string
  /** Current status of this step. */
  status: StepStatus
  /** Optional description or detail text. */
  detail?: string
  /** Arbitrary payload attached when the step completes. */
  data?: unknown
}

export interface ProgressReport {
  steps: ProgressStep[]
  currentStepIndex: number
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fresh `ProgressReport` snapshot, marking steps up to `activeIndex`
 * as complete, the active step as `loading`, and the rest as `pending`.
 */
export function buildProgressSnapshot(
  stepDefinitions: Array<{ id: string; label: string }>,
  activeIndex: number,
  details?: Record<string, { detail?: string; data?: unknown }>,
): ProgressReport {
  const steps: ProgressStep[] = stepDefinitions.map((def, i) => {
    let status: StepStatus = 'pending'
    if (i < activeIndex) status = 'complete'
    else if (i === activeIndex) status = 'loading'

    const extra = details?.[def.id]
    return {
      id: def.id,
      label: def.label,
      status,
      detail: extra?.detail,
      data: extra?.data,
    }
  })
  return { steps, currentStepIndex: activeIndex }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface PreliminaryResultToolOptions<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TFinal,
> {
  /** Tool name. */
  name: string
  /** Description for the LLM. */
  description: string
  /** Zod input schema. */
  inputSchema: TSchema
  /**
   * Async generator that yields `ProgressReport` objects and finally
   * returns the last yield (which becomes the tool result).
   */
  execute: (
    input: z.infer<TSchema>,
  ) => AsyncGenerator<ProgressReport | TFinal, void, undefined>
}

/**
 * Create a tool that streams preliminary results via an async generator.
 *
 * @example
 * ```ts
 * const tools = createPreliminaryResultTool({
 *   name: 'analyzeDocument',
 *   description: 'Analyze a document with progress updates',
 *   inputSchema: z.object({ documentId: z.string() }),
 *   async *execute({ documentId }) {
 *     yield buildProgressSnapshot(steps, 0)
 *     const text = await fetchDocument(documentId)
 *     yield buildProgressSnapshot(steps, 1, { fetch: { detail: 'Fetched' } })
 *     const analysis = await runAnalysis(text)
 *     yield buildProgressSnapshot(steps, 2, {
 *       analyze: { detail: 'Done', data: analysis },
 *     })
 *   },
 * })
 * ```
 */
export function createPreliminaryResultTool<
  TSchema extends z.ZodObject<z.ZodRawShape>,
  TFinal,
>(opts: PreliminaryResultToolOptions<TSchema, TFinal>): Record<string, Tool> {
  return {
    [opts.name]: tool({
      description: opts.description,
      inputSchema: opts.inputSchema as any,
      async *execute(input: any) {
        yield* opts.execute(input)
      },
    } as any),
  }
}