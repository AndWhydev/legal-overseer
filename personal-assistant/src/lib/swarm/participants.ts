/**
 * Built-in SwarmParticipants — bridges swarm steps to the existing agent/role system.
 *
 * Each participant wraps the Anthropic SDK to execute a step with context
 * from the swarm, then returns structured output.
 */

import Anthropic from '@anthropic-ai/sdk'
import { resolveModel } from '@/lib/agent/model-registry'
import type { SwarmParticipant, SwarmStepContext, SwarmStepResult, SwarmMessageType } from './types'

// Aliases for this module's usage
type SwarmContext = SwarmStepContext & {
  step: { step_id?: string }
  run: { dag_snapshot?: { agents?: Array<{ id: string; model_tier?: string }> } }
  stepDef: { agent_id?: string; name?: string; prompt_template?: string }
  input: Record<string, unknown>
  findings: Array<{ from_step_id?: string; message_type: string; content: unknown }>
}
type SwarmResult = SwarmStepResult & {
  output: Record<string, unknown>
  cost_cents?: number
  tokens_in?: number
  tokens_out?: number
}

// Extend SwarmParticipant locally to include agent_type
interface SwarmParticipantWithType extends Omit<SwarmParticipant, 'execute'> {
  agent_type: string
  execute(ctx: SwarmContext): Promise<SwarmResult>
}
import { registerParticipant } from './participant-registry'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Generic LLM Participant — works for any agent type
// ---------------------------------------------------------------------------

function createLLMParticipant(agentType: string, systemPrompt: string): SwarmParticipantWithType {
  return {
    agent_type: agentType,
    role: agentType as SwarmParticipantWithType['role'],
    persona: { style: 'balanced', riskTolerance: 0.5, priorityWeight: 0.5 },
    capabilities: { allowedToolGroups: ['core'] },

    async execute(ctx: SwarmContext): Promise<SwarmResult> {
      const tag = `[swarm-participant:${agentType}:${ctx.step.step_id}]`
      const startMs = Date.now()

      try {
        const client = new Anthropic()

        // Determine model tier from DAG agent config
        const agentDef = ctx.run.dag_snapshot?.agents?.find(
          (a: { id: string }) => a.id === ctx.stepDef.agent_id
        )
        const modelTier = agentDef?.model_tier ?? 'sonnet'
        const model = resolveModel(
          modelTier === 'haiku' ? 'classification' : modelTier === 'opus' ? 'synthesis' : 'conversation'
        )

        // Build prompt from template + context
        let prompt = ctx.stepDef.prompt_template ?? `Execute step: ${ctx.stepDef.name}`

        // Replace template variables with params
        for (const [key, value] of Object.entries(ctx.input)) {
          if (typeof value === 'string') {
            prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
          }
        }

        // Include findings from other agents
        let findingsContext = ''
        if (ctx.findings.length > 0) {
          findingsContext = '\n\nFindings from other agents in this swarm:\n' +
            ctx.findings.map(f =>
              `[${f.from_step_id}] (${f.message_type}): ${JSON.stringify(f.content)}`
            ).join('\n')
        }

        // Include upstream step outputs
        let upstreamContext = ''
        const upstreamKeys = Object.keys(ctx.input).filter(k => k.startsWith('upstream_'))
        if (upstreamKeys.length > 0) {
          upstreamContext = '\n\nUpstream step outputs:\n' +
            upstreamKeys.map(k => `${k.replace('upstream_', '')}: ${JSON.stringify(ctx.input[k])}`).join('\n')
        }

        const fullPrompt = `${prompt}${findingsContext}${upstreamContext}

Input parameters: ${JSON.stringify(ctx.input, null, 2)}

Return your response as JSON with the following structure:
{
  "output": { <structured results matching expected outputs> },
  "summary": "<1-2 sentence summary of what you found/did>",
  "messages": [ <optional messages to share with other agents> ],
  "confidence": <0-1 how confident you are in this result>
}`

        const response = await client.messages.create({
          model,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: fullPrompt }],
        })

        const textBlock = response.content.find(b => b.type === 'text')
        if (!textBlock || textBlock.type !== 'text') {
          return {
            success: false,
            output: {},
            error: 'No text response from model',
          }
        }

        // Parse JSON response
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/)
        let parsed: Record<string, unknown> = {}
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0])
          } catch {
            // If JSON parsing fails, use the raw text as output
            parsed = { raw_response: textBlock.text, summary: textBlock.text.slice(0, 200) }
          }
        } else {
          parsed = { raw_response: textBlock.text, summary: textBlock.text.slice(0, 200) }
        }

        const output = (parsed.output as Record<string, unknown>) ?? parsed
        const messages = Array.isArray(parsed.messages) ? parsed.messages : []

        // Calculate cost
        const tokensIn = response.usage?.input_tokens ?? 0
        const tokensOut = response.usage?.output_tokens ?? 0
        // Rough cost estimate: Haiku ~$0.25/1M in, Sonnet ~$3/1M in
        const costPerMillionIn = modelTier === 'haiku' ? 0.25 : modelTier === 'opus' ? 15 : 3
        const costPerMillionOut = modelTier === 'haiku' ? 1.25 : modelTier === 'opus' ? 75 : 15
        const costCents = Math.ceil(
          (tokensIn * costPerMillionIn / 1_000_000 + tokensOut * costPerMillionOut / 1_000_000) * 100
        )

        const durationMs = Date.now() - startMs
        logger.info(`${tag} Completed in ${durationMs}ms (${tokensIn}+${tokensOut} tokens, ${costCents}c)`)

        return {
          success: true,
          output,
          messages: messages.map((m: Record<string, unknown>) => ({
            type: ((m.message_type as string) ?? 'finding') as SwarmMessageType,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? m),
            data: (m.content as Record<string, unknown>) ?? undefined,
          })),
          cost_cents: costCents,
          tokens_in: tokensIn,
          tokens_out: tokensOut,
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(`${tag} Execution failed: ${errorMsg}`)
        return {
          success: false,
          output: {},
          error: errorMsg,
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Register Built-in Participants
// ---------------------------------------------------------------------------

const FINANCE_SYSTEM = `You are the Finance agent in a multi-agent swarm within BitBit, an agentic AI ops platform.
Your domain: invoicing, cash flow, billing, financial analysis, payment tracking, budgeting.
You have access to invoice data, payment history, and financial projections.
Always return structured JSON with clear financial data.
Flag any financial risks or concerns as messages to share with other agents.
If you find capacity issues or budget constraints, send a "conflict" message to the coordinator.`

const COMMS_SYSTEM = `You are the Communications agent in a multi-agent swarm within BitBit, an agentic AI ops platform.
Your domain: email drafting, message triage, follow-ups, client communication, relationship management.
You craft professional communications adapted to each client's tone and preferences.
Always return structured JSON with draft content.
If you notice relationship concerns (e.g., client going quiet), send a "finding" message to share.`

const SALES_SYSTEM = `You are the Sales agent in a multi-agent swarm within BitBit, an agentic AI ops platform.
Your domain: lead qualification, proposal generation, prospect research, pipeline management, pricing.
You analyze prospects, assess fit, and prepare compelling proposals.
Always return structured JSON with research findings and recommendations.
If you identify upsell opportunities or competitive threats, share as "finding" messages.`

export function registerBuiltinParticipants(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerParticipant(createLLMParticipant('finance', FINANCE_SYSTEM) as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerParticipant(createLLMParticipant('comms', COMMS_SYSTEM) as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerParticipant(createLLMParticipant('sales', SALES_SYSTEM) as any)

  // Generic fallback participant for custom agent types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerParticipant(createLLMParticipant('generic', `You are an agent in a multi-agent swarm within BitBit. Execute the given task and return structured JSON results.`) as any)
}
