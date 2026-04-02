/**
 * Sequential Workflow Pattern
 *
 * Chains steps in order where each step's output feeds into the next.
 * Includes optional quality-gate checking between steps — if a step's
 * output doesn't meet quality thresholds, it can be regenerated with
 * more specific instructions before moving on.
 *
 * Ported from: aisdkagents WDK sequential-workflow pattern
 *
 * @example
 * ```ts
 * const result = await runSequentialWorkflow({
 *   steps: [
 *     { name: 'draft',   prompt: 'Write marketing copy for: {{input}}' },
 *     { name: 'review',  prompt: 'Edit for clarity: {{prev}}' },
 *   ],
 *   input: 'New SaaS product launch',
 * })
 * ```
 */

import { generateText, generateObject } from 'ai'
import { z, type ZodType } from 'zod'
import { models } from '@/lib/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SequentialStep {
  /** Human-readable step name for logging */
  name: string
  /** Prompt template — use {{input}} for initial input, {{prev}} for previous step output */
  prompt: string
  /** System prompt for this step (optional) */
  system?: string
  /** Which model tier to use (default: 'balanced') */
  model?: 'fast' | 'balanced' | 'heavy'
  /**
   * Optional quality gate. When provided, the step output is evaluated
   * with generateObject against this schema. If `shouldRetry` returns true,
   * the step is re-run with the `retryPrompt` template.
   */
  qualityGate?: {
    schema: ZodType
    evaluationPrompt: string
    shouldRetry: (evaluation: unknown) => boolean
    retryPrompt: string
    /** Model for the evaluator (default: 'balanced') */
    evaluatorModel?: 'fast' | 'balanced' | 'heavy'
  }
}

export interface SequentialWorkflowConfig {
  /** Ordered list of steps to execute */
  steps: SequentialStep[]
  /** Initial input text */
  input: string
  /** Maximum retries per quality gate (default: 1) */
  maxRetries?: number
}

export interface SequentialStepResult {
  name: string
  output: string
  retried: boolean
  evaluation?: unknown
}

export interface SequentialWorkflowResult {
  /** Final output from the last step */
  output: string
  /** Per-step results */
  steps: SequentialStepResult[]
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run a sequential workflow — steps execute in order, each receiving the
 * previous step's output. Optional quality gates can trigger retries.
 */
export async function runSequentialWorkflow(
  config: SequentialWorkflowConfig,
): Promise<SequentialWorkflowResult> {
  const { steps, input, maxRetries = 1 } = config
  const results: SequentialStepResult[] = []
  let previousOutput = input

  for (const step of steps) {
    const model = models[step.model ?? 'balanced']

    // Interpolate prompt template
    const prompt = step.prompt
      .replace(/\{\{input\}\}/g, input)
      .replace(/\{\{prev\}\}/g, previousOutput)

    // Generate initial output
    const { text } = await generateText({
      model,
      system: step.system,
      prompt,
    })

    let output = text
    let retried = false
    let evaluation: unknown = undefined

    // Quality gate check
    if (step.qualityGate) {
      const evalModel = models[step.qualityGate.evaluatorModel ?? 'balanced']
      const evalPrompt = step.qualityGate.evaluationPrompt
        .replace(/\{\{output\}\}/g, output)
        .replace(/\{\{input\}\}/g, input)

      const { object: evalResult } = await generateObject({
        model: evalModel,
        schema: step.qualityGate.schema,
        prompt: evalPrompt,
      })

      evaluation = evalResult

      // Retry if quality gate fails
      if (step.qualityGate.shouldRetry(evalResult)) {
        retried = true
        let retries = 0
        while (retries < maxRetries) {
          const retryPrompt = step.qualityGate.retryPrompt
            .replace(/\{\{output\}\}/g, output)
            .replace(/\{\{input\}\}/g, input)
            .replace(/\{\{evaluation\}\}/g, JSON.stringify(evalResult))

          const { text: improved } = await generateText({
            model,
            system: step.system,
            prompt: retryPrompt,
          })

          output = improved
          retries++
        }
      }
    }

    results.push({ name: step.name, output, retried, evaluation })
    previousOutput = output
  }

  return {
    output: previousOutput,
    steps: results,
  }
}
