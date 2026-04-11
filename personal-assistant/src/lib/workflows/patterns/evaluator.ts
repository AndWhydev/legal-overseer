/**
 * Evaluator Workflow Pattern (Quality-Gate Eval/Optimize Loop)
 *
 * Generates an initial output, then enters an evaluate → improve loop.
 * Each iteration evaluates the current output against quality criteria
 * using structured output, and if the quality threshold isn't met,
 * feeds the evaluation feedback back into an improvement step.
 *
 * Ported from: aisdkagents WDK evaluator-workflow pattern
 *
 * @example
 * ```ts
 * const result = await runEvaluatorWorkflow({
 *   input: 'Translate to French: "The quick brown fox..."',
 *   generatorPrompt: 'Translate to {{targetLanguage}}: {{input}}',
 *   generatorSystem: 'You are an expert literary translator.',
 *   evaluationSchema: z.object({
 *     qualityScore: z.number().min(1).max(10),
 *     issues: z.array(z.string()),
 *     suggestions: z.array(z.string()),
 *   }),
 *   evaluationPrompt: 'Evaluate this translation:\nOriginal: {{input}}\nTranslation: {{output}}',
 *   isAcceptable: (e) => e.qualityScore >= 8,
 *   improvementPrompt: 'Improve based on feedback:\n{{evaluation}}\nCurrent: {{output}}',
 *   maxIterations: 3,
 * })
 * ```
 */

import { generateText, Output } from 'ai'
import { type ZodType } from 'zod'
import { models } from '@/lib/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EvaluatorWorkflowConfig<TEvaluation = unknown> {
  /** The original input text */
  input: string
  /** System prompt for the generator/improver */
  generatorSystem?: string
  /** Prompt template for initial generation — use {{input}} */
  generatorPrompt: string
  /** Model for initial generation (default: 'fast') */
  generatorModel?: 'fast' | 'balanced' | 'heavy'

  /** Zod schema for the evaluation output */
  evaluationSchema: ZodType<TEvaluation>
  /** System prompt for the evaluator */
  evaluatorSystem?: string
  /** Prompt template for evaluation — use {{input}}, {{output}} */
  evaluationPrompt: string
  /** Model for evaluation (default: 'balanced') */
  evaluatorModel?: 'fast' | 'balanced' | 'heavy'

  /** Return true if the evaluation meets quality threshold */
  isAcceptable: (evaluation: TEvaluation) => boolean

  /** System prompt for improvements (defaults to generatorSystem) */
  improverSystem?: string
  /** Prompt template for improvement — use {{input}}, {{output}}, {{evaluation}} */
  improvementPrompt: string
  /** Model for improvements (default: 'balanced') */
  improverModel?: 'fast' | 'balanced' | 'heavy'

  /** Maximum eval/improve iterations (default: 3) */
  maxIterations?: number
}

export interface EvaluatorIteration<TEvaluation = unknown> {
  iteration: number
  output: string
  evaluation: TEvaluation
  accepted: boolean
}

export interface EvaluatorWorkflowResult<TEvaluation = unknown> {
  /** Final output text */
  output: string
  /** Total iterations performed */
  iterations: number
  /** Whether the final output was accepted by the quality gate */
  accepted: boolean
  /** History of all evaluation iterations */
  history: EvaluatorIteration<TEvaluation>[]
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run an evaluator workflow — generate initial output, then loop through
 * evaluate → improve cycles until quality threshold is met or max
 * iterations are reached.
 */
export async function runEvaluatorWorkflow<TEvaluation>(
  config: EvaluatorWorkflowConfig<TEvaluation>,
): Promise<EvaluatorWorkflowResult<TEvaluation>> {
  const {
    input,
    generatorSystem,
    generatorPrompt,
    generatorModel = 'fast',
    evaluationSchema,
    evaluatorSystem,
    evaluationPrompt,
    evaluatorModel = 'balanced',
    isAcceptable,
    improverSystem,
    improvementPrompt,
    improverModel = 'balanced',
    maxIterations = 3,
  } = config

  const history: EvaluatorIteration<TEvaluation>[] = []

  // Step 1: Initial generation
  const initialPrompt = generatorPrompt.replace(/\{\{input\}\}/g, input)
  const { text: initialOutput } = await generateText({
    model: models[generatorModel],
    system: generatorSystem,
    prompt: initialPrompt,
  })

  let currentOutput = initialOutput

  // Step 2: Evaluate → improve loop
  for (let i = 0; i < maxIterations; i++) {
    // Evaluate
    const evalPrompt = evaluationPrompt
      .replace(/\{\{input\}\}/g, input)
      .replace(/\{\{output\}\}/g, currentOutput)

    const { output: evaluation } = await generateText({
      model: models[evaluatorModel],
      system: evaluatorSystem,
      output: Output.object({ schema: evaluationSchema }),
      prompt: evalPrompt,
    })

    if (!evaluation) throw new Error('Evaluation returned null')

    const accepted = isAcceptable(evaluation)

    history.push({
      iteration: i + 1,
      output: currentOutput,
      evaluation,
      accepted,
    })

    // If accepted, we're done
    if (accepted) {
      return {
        output: currentOutput,
        iterations: i + 1,
        accepted: true,
        history,
      }
    }

    // Improve based on feedback
    const improvePrompt = improvementPrompt
      .replace(/\{\{input\}\}/g, input)
      .replace(/\{\{output\}\}/g, currentOutput)
      .replace(/\{\{evaluation\}\}/g, JSON.stringify(evaluation, null, 2))

    const { text: improved } = await generateText({
      model: models[improverModel],
      system: improverSystem ?? generatorSystem,
      prompt: improvePrompt,
    })

    currentOutput = improved
  }

  // Exhausted iterations — return last output
  return {
    output: currentOutput,
    iterations: maxIterations,
    accepted: false,
    history,
  }
}
