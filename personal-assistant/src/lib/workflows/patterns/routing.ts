/**
 * Routing Workflow Pattern
 *
 * Classifies an input using an LLM, then routes to a specialized handler
 * based on the classification. Supports dynamic model selection based on
 * complexity, and per-route system prompts.
 *
 * Ported from: aisdkagents WDK routing-workflow pattern
 *
 * @example
 * ```ts
 * const result = await runRoutingWorkflow({
 *   input: 'I want a refund for order #123',
 *   classificationPrompt: 'Classify this customer query: {{input}}',
 *   classificationSchema: z.object({
 *     type: z.enum(['general', 'refund', 'technical']),
 *     complexity: z.enum(['simple', 'complex']),
 *   }),
 *   routes: {
 *     general:   { system: 'You handle general inquiries.' },
 *     refund:    { system: 'You handle refund requests.' },
 *     technical: { system: 'You handle technical support.' },
 *   },
 *   routeKey: (c) => c.type,
 *   modelSelector: (c) => c.complexity === 'simple' ? 'fast' : 'balanced',
 * })
 * ```
 */

import { generateText, Output } from 'ai'
import { type ZodType } from 'zod'
import { models } from '@/lib/ai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RouteHandler {
  /** System prompt for this route's handler */
  system: string
  /** Optional prompt template override — defaults to the original input */
  prompt?: string
  /** Model override for this specific route */
  model?: 'fast' | 'balanced' | 'heavy'
}

export interface RoutingWorkflowConfig<TClassification = unknown> {
  /** The input to classify and handle */
  input: string
  /** Prompt template for classification — use {{input}} */
  classificationPrompt: string
  /** Zod schema for the classification output */
  classificationSchema: ZodType<TClassification>
  /** Model for classification (default: 'fast') */
  classificationModel?: 'fast' | 'balanced' | 'heavy'
  /** Map of route key → handler config */
  routes: Record<string, RouteHandler>
  /** Extract the route key from the classification object */
  routeKey: (classification: TClassification) => string
  /**
   * Optional dynamic model selector based on classification.
   * Overrides route-level model if provided.
   */
  modelSelector?: (classification: TClassification) => 'fast' | 'balanced' | 'heavy'
  /** Fallback route key if routeKey returns a key not in routes */
  fallbackRoute?: string
}

export interface RoutingWorkflowResult<TClassification = unknown> {
  /** The classification object */
  classification: TClassification
  /** Which route was selected */
  selectedRoute: string
  /** The handler's response text */
  response: string
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run a routing workflow — classifies the input, selects a route, and
 * delegates to the appropriate handler with the right model and system prompt.
 */
export async function runRoutingWorkflow<TClassification>(
  config: RoutingWorkflowConfig<TClassification>,
): Promise<RoutingWorkflowResult<TClassification>> {
  const {
    input,
    classificationPrompt,
    classificationSchema,
    classificationModel = 'fast',
    routes,
    routeKey,
    modelSelector,
    fallbackRoute,
  } = config

  // Step 1: Classify the input
  const prompt = classificationPrompt.replace(/\{\{input\}\}/g, input)

  const { output: classification } = await generateText({
    model: models[classificationModel],
    output: Output.object({ schema: classificationSchema }),
    prompt,
  })

  if (!classification) throw new Error('Classification returned null')

  // Step 2: Determine route
  let selectedRoute = routeKey(classification)

  if (!(selectedRoute in routes)) {
    if (fallbackRoute && fallbackRoute in routes) {
      selectedRoute = fallbackRoute
    } else {
      // Use first available route as last-resort fallback
      const availableRoutes = Object.keys(routes)
      selectedRoute = availableRoutes[0]
    }
  }

  const handler = routes[selectedRoute]

  // Step 3: Determine model
  let modelTier: 'fast' | 'balanced' | 'heavy' = handler.model ?? 'balanced'
  if (modelSelector) {
    modelTier = modelSelector(classification)
  }

  // Step 4: Generate response via the selected handler
  const handlerPrompt = handler.prompt
    ? handler.prompt.replace(/\{\{input\}\}/g, input)
    : input

  const { text: response } = await generateText({
    model: models[modelTier],
    system: handler.system,
    prompt: handlerPrompt,
  })

  return {
    classification,
    selectedRoute,
    response,
  }
}
