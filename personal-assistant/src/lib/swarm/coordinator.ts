/**
 * Swarm Coordinator — the brain that matches user intent to swarm templates.
 *
 * Flow:
 * 1. Haiku classifies user input → identifies if it's a swarm trigger
 * 2. Matches to a template using trigger_patterns + semantic similarity
 * 3. Fills template params from context (contacts, projects, etc.)
 * 4. Creates and starts the swarm run
 *
 * Cost-optimized: Haiku does classification, Sonnet/Opus handle execution.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveModel } from '@/lib/agent/model-registry'
import { assembleContext } from '@/lib/context/assembler'
import type { SwarmTemplate, SwarmTriggerResult, SwarmDAG } from './types'
import { createSwarmRun, executeSwarmRun } from './executor'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Template Matching
// ---------------------------------------------------------------------------

/**
 * Load all available templates for an org (builtin + org-specific).
 */
export async function loadTemplates(
  supabase: SupabaseClient,
  orgId: string,
): Promise<SwarmTemplate[]> {
  const { data, error } = await supabase
    .from('swarm_templates')
    .select('*')
    .or(`org_id.is.null,org_id.eq.${orgId}`)
    .order('usage_count', { ascending: false })

  if (error) {
    logger.warn('[swarm-coordinator] Failed to load templates:', error.message)
    return []
  }

  return (data ?? []) as SwarmTemplate[]
}

/**
 * Match user input against available templates using pattern matching + LLM.
 *
 * Two-stage matching:
 * 1. Fast: check trigger_patterns with keyword overlap
 * 2. If no strong match, use Haiku to classify intent
 */
export async function matchTemplate(
  supabase: SupabaseClient,
  orgId: string,
  userInput: string,
): Promise<SwarmTriggerResult> {
  const templates = await loadTemplates(supabase, orgId)
  if (templates.length === 0) {
    return { matched: false, confidence: 0, reasoning: 'No templates available' }
  }

  // Stage 1: Pattern-based matching
  const inputLower = userInput.toLowerCase()
  const inputWords = inputLower.split(/\s+/).filter(w => w.length > 2)

  let bestMatch: SwarmTemplate | undefined
  let bestScore = 0

  for (const template of templates) {
    let score = 0

    // Check trigger patterns
    for (const pattern of template.trigger_patterns) {
      const patternLower = pattern.toLowerCase()
      if (inputLower.includes(patternLower)) {
        score += 10 // Exact phrase match
      } else {
        // Word overlap
        const patternWords = patternLower.split(/\s+/).filter(w => w.length > 2)
        const overlap = patternWords.filter(pw => inputWords.some(iw => iw.includes(pw) || pw.includes(iw)))
        score += overlap.length * 2
      }
    }

    // Check template name/description
    if (inputLower.includes(template.name.toLowerCase())) {
      score += 5
    }

    if (score > bestScore) {
      bestScore = score
      bestMatch = template
    }
  }

  // If strong pattern match (score >= 6), return it directly
  if (bestMatch && bestScore >= 6) {
    return {
      matched: true,
      template: bestMatch,
      confidence: Math.min(0.95, 0.5 + bestScore * 0.05),
      reasoning: `Pattern match: "${bestMatch.name}" (score: ${bestScore})`,
    }
  }

  // Stage 2: LLM-based classification
  try {
    const client = new Anthropic()

    const templateDescriptions = templates.map(t =>
      `- ${t.slug}: ${t.name} — ${t.description ?? 'No description'}. Triggers: ${t.trigger_patterns.join(', ')}`
    ).join('\n')

    const response = await client.messages.create({
      model: resolveModel('classification'),
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Is this user input requesting a multi-step coordinated operation? If so, which template matches best?

User input: "${userInput}"

Available templates:
${templateDescriptions}

Return JSON only:
{
  "matched": true/false,
  "template_slug": "<slug or null>",
  "confidence": <0-1>,
  "reasoning": "<brief explanation>",
  "extracted_params": { "<param_name>": "<value>", ... }
}

If the input is NOT asking for a multi-step operation (e.g., just a chat question), set matched=false.`
      }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { matched: false, confidence: 0, reasoning: 'LLM returned no JSON' }
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (parsed.matched && parsed.template_slug) {
      const matchedTemplate = templates.find(t => t.slug === parsed.template_slug)
      if (matchedTemplate) {
        return {
          matched: true,
          template: matchedTemplate,
          params: parsed.extracted_params ?? {},
          confidence: parsed.confidence ?? 0.7,
          reasoning: parsed.reasoning ?? 'LLM match',
        }
      }
    }

    return {
      matched: false,
      confidence: parsed.confidence ?? 0,
      reasoning: parsed.reasoning ?? 'No template match',
    }
  } catch (err) {
    logger.warn('[swarm-coordinator] LLM matching failed:', err)
    // Fall back to best pattern match if we have one
    if (bestMatch && bestScore > 0) {
      return {
        matched: true,
        template: bestMatch,
        confidence: 0.4,
        reasoning: `Weak pattern match: "${bestMatch.name}" (LLM unavailable)`,
      }
    }
    return { matched: false, confidence: 0, reasoning: 'Matching failed' }
  }
}

// ---------------------------------------------------------------------------
// Parameter Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve swarm template parameters from context and user input.
 * Uses entity resolution to fill contact/project references.
 */
export async function resolveParams(
  supabase: SupabaseClient,
  orgId: string,
  template: SwarmTemplate,
  userInput: string,
  extractedParams: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const params: Record<string, unknown> = { ...extractedParams }

  // Assemble context to find entities mentioned in user input
  const context = await assembleContext(supabase, orgId, userInput)

  // Auto-fill from context
  if (context.resolvedEntities?.length) {
    const firstEntity = context.resolvedEntities[0]
    if (!params.contact_name && firstEntity.name) {
      params.contact_name = firstEntity.name
    }
    if (!params.contact_id && firstEntity.id) {
      params.contact_id = firstEntity.id
    }
  }

  // Fill defaults from param_schema
  for (const [key, def] of Object.entries(template.param_schema)) {
    if (params[key] === undefined && def.default !== undefined) {
      params[key] = def.default
    }
  }

  // Pass the original input as a param too
  params._user_input = userInput
  params._context_summary = context.summary

  return params
}

// ---------------------------------------------------------------------------
// Trigger & Execute
// ---------------------------------------------------------------------------

/**
 * Full coordinator flow: match template → resolve params → create run → execute.
 */
export async function triggerSwarm(
  supabase: SupabaseClient,
  orgId: string,
  userInput: string,
  options?: {
    autoExecute?: boolean
    triggeredBy?: string
  },
): Promise<{
  triggered: boolean
  run?: { id: string; name: string; status: string }
  matchResult: SwarmTriggerResult
}> {
  const tag = '[swarm-coordinator]'

  // 1. Match template
  const matchResult = await matchTemplate(supabase, orgId, userInput)
  if (!matchResult.matched || !matchResult.template) {
    return { triggered: false, matchResult }
  }

  logger.info(`${tag} Matched template: ${matchResult.template.name} (${matchResult.confidence})`)

  // 2. Resolve params
  const params = await resolveParams(
    supabase,
    orgId,
    matchResult.template,
    userInput,
    matchResult.params,
  )

  // 3. Create run
  const run = await createSwarmRun(supabase, {
    orgId,
    name: `${matchResult.template.name}: ${userInput.slice(0, 50)}`,
    dag: matchResult.template.dag,
    inputParams: params,
    templateId: matchResult.template.id,
    triggeredBy: options?.triggeredBy ?? 'coordinator',
    triggerInput: userInput,
  })

  // 4. Increment template usage
  await supabase
    .from('swarm_templates')
    .update({ usage_count: matchResult.template.usage_count + 1 })
    .eq('id', matchResult.template.id)

  // 5. Execute (async if autoExecute, otherwise leave pending)
  if (options?.autoExecute !== false) {
    // Fire-and-forget execution
    executeSwarmRun(supabase, run.id).catch(err => {
      logger.error(`${tag} Swarm execution failed:`, err)
    })
  }

  return {
    triggered: true,
    run: { id: run.id, name: run.name, status: run.status },
    matchResult,
  }
}

// ---------------------------------------------------------------------------
// Conflict Resolution
// ---------------------------------------------------------------------------

/**
 * When agents disagree, escalate to Sonnet for resolution.
 * E.g., Finance says "overcommitted" but Sales says "pursue".
 */
export async function resolveConflict(
  supabase: SupabaseClient,
  orgId: string,
  conflictingSteps: Array<{
    step_id: string
    agent_type: string
    output: Record<string, unknown>
  }>,
  swarmContext: Record<string, unknown>,
): Promise<{ resolution: Record<string, unknown>; reasoning: string }> {
  const client = new Anthropic()

  const perspectives = conflictingSteps.map(s =>
    `${s.agent_type} (step ${s.step_id}): ${JSON.stringify(s.output)}`
  ).join('\n\n')

  const response = await client.messages.create({
    model: resolveModel('synthesis'),
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `You are a business operations coordinator. Two agents in a multi-agent swarm have produced conflicting recommendations. Analyze both perspectives and provide a resolution.

Context: ${JSON.stringify(swarmContext)}

Conflicting perspectives:
${perspectives}

Return JSON:
{
  "resolution": { "action": "<what to do>", "adjustments": {} },
  "reasoning": "<why this resolution is best>",
  "chosen_perspective": "<which agent's view to favor, if any>"
}`
    }],
  })

  const text = response.content.find(b => b.type === 'text')?.text ?? '{}'
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { resolution: {}, reasoning: 'Failed to parse conflict resolution' }
  }

  const parsed = JSON.parse(jsonMatch[0])
  return {
    resolution: parsed.resolution ?? {},
    reasoning: parsed.reasoning ?? 'No reasoning provided',
  }
}
