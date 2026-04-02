/**
 * Orchestrator Workflow Pattern
 *
 * A coordinator agent creates a plan (structured), then delegates each
 * planned task to specialized worker agents that execute concurrently.
 * Useful for complex multi-step tasks like feature implementation,
 * content creation pipelines, or research projects.
 *
 * Ported from: aisdkagents WDK orchestrator-workflow pattern
 *
 * @example
 * ```ts
 * const result = await runOrchestratorWorkflow({
 *   input: 'Add user authentication with OAuth2',
 *   plannerSystem: 'You are a senior software architect.',
 *   plannerPrompt: 'Create an implementation plan for: {{input}}',
 *   planSchema: z.object({
 *     tasks: z.array(z.object({
 *       id: z.string(),
 *       description: z.string(),
 *       type: z.enum(['create', 'modify', 'delete']),
 *     })),
 *     complexity: z.enum(['low', 'medium', 'high']),
 *   }),
 *   workerSystemByType: {
 *     create: 'You implement new components.',
 *     modify: 'You modify existing code safely.',
 *     delete: 'You safely remove code.',
 *   },
 *   workerSchema: z.object({ explanation: z.string(), code: z.string() }),
 *   taskToWorkerPrompt: (task, input) =>
 *     `Implement: ${task.description}\nContext: ${input}`,
 *   getTaskType: (task) => task.type,
 * })
 * ```
 */

import { generateText, generateObject } from 'ai'
import { type ZodType } from 'zod'
import { models } from '@/lib/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrchestratorWorkflowConfig<
  TPlan = unknown,
  TTask = unknown,
  TWorkerOutput = unknown,
> {
  /** The input/request to orchestrate */
  input: string

  // -- Planner (coordinator) --
  /** System prompt for the planner */
  plannerSystem: string
  /** Prompt template for planning — use {{input}} */
  plannerPrompt: string
  /** Zod schema for the structured plan output */
  planSchema: ZodType<TPlan>
  /** Model for the planner (default: 'balanced') */
  plannerModel?: 'fast' | 'balanced' | 'heavy'

  // -- Workers --
  /** Extract the array of tasks from the plan */
  getTasks: (plan: TPlan) => TTask[]
  /** Extract a type/category key from a task (for workerSystemByType lookup) */
  getTaskType: (task: TTask) => string
  /** Map of task type → system prompt for the worker */
  workerSystemByType: Record<string, string>
  /** Default system prompt if task type not in workerSystemByType */
  defaultWorkerSystem?: string
  /** Zod schema for worker output */
  workerSchema: ZodType<TWorkerOutput>
  /** Build the worker prompt from a task and the original input */
  taskToWorkerPrompt: (task: TTask, input: string) => string
  /** Model for workers (default: 'balanced') */
  workerModel?: 'fast' | 'balanced' | 'heavy'
  /** Execute workers sequentially instead of in parallel (default: false) */
  sequential?: boolean

  // -- Optional synthesis --
  /** If provided, synthesize all worker outputs into a final summary */
  synthesis?: {
    system: string
    /** Prompt template — use {{plan}}, {{results}}, {{input}} */
    prompt: string
    model?: 'fast' | 'balanced' | 'heavy'
  }
}

export interface WorkerResult<TTask = unknown, TWorkerOutput = unknown> {
  task: TTask
  output: TWorkerOutput | null
  error?: string
}

export interface OrchestratorWorkflowResult<
  TPlan = unknown,
  TTask = unknown,
  TWorkerOutput = unknown,
> {
  /** The structured plan from the orchestrator */
  plan: TPlan
  /** Per-task worker results */
  workers: WorkerResult<TTask, TWorkerOutput>[]
  /** Optional synthesis summary */
  summary?: string
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run an orchestrator workflow — the planner creates a structured plan,
 * then workers execute each task (concurrently by default), with an
 * optional synthesis step to combine all results.
 */
export async function runOrchestratorWorkflow<
  TPlan,
  TTask,
  TWorkerOutput,
>(
  config: OrchestratorWorkflowConfig<TPlan, TTask, TWorkerOutput>,
): Promise<OrchestratorWorkflowResult<TPlan, TTask, TWorkerOutput>> {
  const {
    input,
    plannerSystem,
    plannerPrompt,
    planSchema,
    plannerModel = 'balanced',
    getTasks,
    getTaskType,
    workerSystemByType,
    defaultWorkerSystem = 'You are a skilled worker completing the assigned task.',
    workerSchema,
    taskToWorkerPrompt,
    workerModel = 'balanced',
    sequential = false,
    synthesis,
  } = config

  // Step 1: Plan
  const prompt = plannerPrompt.replace(/\{\{input\}\}/g, input)

  const { object: plan } = await generateObject({
    model: models[plannerModel],
    system: plannerSystem,
    schema: planSchema,
    prompt,
  })

  const tasks = getTasks(plan)

  // Step 2: Execute workers
  const executeWorker = async (
    task: TTask,
  ): Promise<WorkerResult<TTask, TWorkerOutput>> => {
    try {
      const taskType = getTaskType(task)
      const system = workerSystemByType[taskType] ?? defaultWorkerSystem
      const workerPrompt = taskToWorkerPrompt(task, input)

      const { object: output } = await generateObject({
        model: models[workerModel],
        system,
        schema: workerSchema,
        prompt: workerPrompt,
      })

      return { task, output }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { task, output: null, error: message }
    }
  }

  let workers: WorkerResult<TTask, TWorkerOutput>[]

  if (sequential) {
    workers = []
    for (const task of tasks) {
      workers.push(await executeWorker(task))
    }
  } else {
    workers = await Promise.all(tasks.map(executeWorker))
  }

  // Step 3: Optional synthesis
  const result: OrchestratorWorkflowResult<TPlan, TTask, TWorkerOutput> = {
    plan,
    workers,
  }

  if (synthesis) {
    const synthModel = models[synthesis.model ?? 'balanced']
    const synthPrompt = synthesis.prompt
      .replace(/\{\{plan\}\}/g, JSON.stringify(plan, null, 2))
      .replace(/\{\{results\}\}/g, JSON.stringify(workers, null, 2))
      .replace(/\{\{input\}\}/g, input)

    const { text: summary } = await generateText({
      model: synthModel,
      system: synthesis.system,
      prompt: synthPrompt,
    })

    result.summary = summary
  }

  return result
}
