/**
 * Parallel Workflow Pattern
 *
 * Runs multiple independent analysis steps concurrently using Promise.all,
 * then aggregates results into a unified summary. Useful when several
 * perspectives or analyses need to be gathered simultaneously.
 *
 * Ported from: aisdkagents WDK parallel-workflow pattern
 *
 * @example
 * ```ts
 * const result = await runParallelWorkflow({
 *   input: codeSnippet,
 *   branches: [
 *     { name: 'security',  system: 'You are a security expert.', schema: securitySchema },
 *     { name: 'performance', system: 'You are a performance expert.', schema: perfSchema },
 *   ],
 *   aggregation: {
 *     system: 'Summarize these reviews.',
 *     prompt: 'Synthesize: {{results}}',
 *   },
 * })
 * ```
 */

import { generateText, generateObject } from 'ai'
import { type ZodType } from 'zod'
import { models } from '@/lib/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParallelBranch<T = unknown> {
  /** Human-readable name for this branch */
  name: string
  /** System prompt for the branch's LLM call */
  system: string
  /** Prompt template — use {{input}} for the shared input */
  prompt?: string
  /** Zod schema for structured output from this branch */
  schema: ZodType<T>
  /** Model tier (default: 'balanced') */
  model?: 'fast' | 'balanced' | 'heavy'
}

export interface ParallelAggregation {
  /** System prompt for the aggregator */
  system: string
  /** Prompt template — use {{results}} for JSON of all branch outputs, {{input}} for original input */
  prompt: string
  /** Model tier for aggregation (default: 'balanced') */
  model?: 'fast' | 'balanced' | 'heavy'
}

export interface ParallelWorkflowConfig {
  /** Shared input for all branches */
  input: string
  /** Parallel branches to execute concurrently */
  branches: ParallelBranch[]
  /** Optional aggregation step to combine branch results into a summary */
  aggregation?: ParallelAggregation
}

export interface ParallelBranchResult {
  name: string
  output: unknown
  error?: string
}

export interface ParallelWorkflowResult {
  /** Per-branch structured outputs */
  branches: ParallelBranchResult[]
  /** Aggregated summary text (only if aggregation config provided) */
  summary?: string
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run a parallel workflow — all branches execute concurrently, then an
 * optional aggregation step synthesizes the results.
 */
export async function runParallelWorkflow(
  config: ParallelWorkflowConfig,
): Promise<ParallelWorkflowResult> {
  const { input, branches, aggregation } = config

  // Execute all branches concurrently
  const branchResults = await Promise.all(
    branches.map(async (branch): Promise<ParallelBranchResult> => {
      try {
        const model = models[branch.model ?? 'balanced']
        const prompt = (branch.prompt ?? 'Analyze this:\n{{input}}')
          .replace(/\{\{input\}\}/g, input)

        const { object } = await generateObject({
          model,
          system: branch.system,
          schema: branch.schema,
          prompt,
        })

        return { name: branch.name, output: object }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { name: branch.name, output: null, error: message }
      }
    }),
  )

  // Build result
  const result: ParallelWorkflowResult = { branches: branchResults }

  // Optional aggregation step
  if (aggregation) {
    const enrichedResults = branchResults.map((br) => ({
      type: br.name,
      ...((br.output as Record<string, unknown>) ?? {}),
      ...(br.error ? { error: br.error } : {}),
    }))

    const aggModel = models[aggregation.model ?? 'balanced']
    const aggPrompt = aggregation.prompt
      .replace(/\{\{results\}\}/g, JSON.stringify(enrichedResults, null, 2))
      .replace(/\{\{input\}\}/g, input)

    const { text: summary } = await generateText({
      model: aggModel,
      system: aggregation.system,
      prompt: aggPrompt,
    })

    result.summary = summary
  }

  return result
}
