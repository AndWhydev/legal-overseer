/**
 * Tier-Appropriate Prompt Modifiers
 *
 * Different model tiers reason differently and need different prompt styles:
 * - Haiku (classification): Structured templates with explicit output schemas
 * - Sonnet (conversation): Behavioral guidance, personality, principles
 * - Opus (synthesis): Situational context, goals and constraints, minimal procedure
 *
 * Research finding: reasoning models perform WORSE with step-by-step instructions.
 * They reason better when given goals and constraints, not procedures.
 */

import type { ModelPurpose } from './model-registry'

/**
 * Get a tier-appropriate prompt modifier to append to the system prompt.
 * This adjusts the instruction style based on which model is handling the request.
 */
export function getTierModifier(purpose: ModelPurpose): string {
  switch (purpose) {
    case 'classification':
      return HAIKU_MODIFIER
    case 'synthesis':
      return OPUS_MODIFIER
    case 'conversation':
    default:
      return SONNET_MODIFIER
  }
}

/**
 * Haiku: structured, template-like instructions.
 * Haiku benefits from explicit output formats and clear decision trees.
 */
const HAIKU_MODIFIER = `
## Execution Mode: Fast Classification

You are operating in fast-classification mode. Be precise and structured:
- Output exactly what's requested, no elaboration
- Follow output format instructions exactly
- When choosing between options, pick one definitively
- No hedging, no "it depends", no caveats unless critical
`

/**
 * Sonnet: behavioral guidance with personality.
 * Sonnet is the workhorse — it needs to know HOW to behave, not step-by-step what to do.
 */
const SONNET_MODIFIER = `
## Execution Mode: Agentic Conversation

You are the primary conversational agent. Principles:
- Act on the user's behalf. Search, read, analyze, then respond with findings.
- When multiple approaches exist, pick the best one and do it. Don't present options.
- If a tool call fails, try an alternative approach before reporting failure.
- Match your response depth to the complexity of the question. Simple questions get short answers.
- Your tools are extensions of your thinking. Use them naturally, not ceremonially.
`

/**
 * Opus: situational context with goals/constraints.
 * Opus reasons deeply — give it the situation and the goal, not the procedure.
 * Over-constraining Opus degrades its performance.
 */
const OPUS_MODIFIER = `
## Execution Mode: Deep Reasoning

You are handling a complex request that requires careful analysis. Your approach:
- Think about the full picture before acting. Consider what the user actually needs, not just what they asked.
- Use your tools to gather comprehensive context. Read broadly before synthesizing.
- When you find conflicting information, resolve it rather than presenting both sides.
- Your response should demonstrate genuine understanding, not just information retrieval.
- Take the time to get it right. Quality matters more than speed for this request.
`

/**
 * Get model-specific tool use guidance.
 * Haiku shouldn't use tools (it's for classification).
 * Sonnet should use tools efficiently.
 * Opus should use tools comprehensively.
 */
export function getToolUseGuidance(purpose: ModelPurpose): string {
  switch (purpose) {
    case 'classification':
      return '' // Haiku doesn't use tools in classification mode
    case 'synthesis':
      return 'For this complex request, gather all relevant context before synthesizing. Prefer depth over breadth.'
    case 'conversation':
    default:
      return '' // Default tool guidance is already in the main prompt
  }
}
