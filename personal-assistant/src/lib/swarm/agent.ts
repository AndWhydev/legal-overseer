/**
 * Swarm Agent
 *
 * Bridge between swarm steps and the existing agent engine.
 * Each agent in a swarm has a role, persona, and capability boundaries.
 * The agent uses runAgentChat() under the hood but with constrained tools
 * and role-specific system prompt injection.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AgentRole,
  AgentPersona,
  CapabilityBoundary,
  SwarmStepResult,
  SwarmStepContext,
  SwarmMessageType,
  ReversibleAction,
  NegotiationResult,
  SwarmParticipant,
} from './types'
import { DEFAULT_PERSONAS, DEFAULT_CAPABILITIES } from './types'
import { runAgentChat } from '@/lib/agent/engine'
import type { EngineConfig, AgentEvent } from '@/lib/agent/engine'
import { resolveModel, type ModelPurpose } from '@/lib/agent/model-registry'
import { logger } from '@/lib/core/logger'

// ── Agent Config ────────────────────────────────────────────────────────────

export interface SwarmAgentConfig {
  role: AgentRole
  persona?: Partial<AgentPersona>
  capabilities?: Partial<CapabilityBoundary>
  modelTier?: 'classification' | 'conversation' | 'synthesis'
  supabase: SupabaseClient
  orgId: string
}

// ── Agent Implementation ────────────────────────────────────────────────────

export class SwarmAgent implements SwarmParticipant {
  role: AgentRole
  persona: AgentPersona
  capabilities: CapabilityBoundary
  private modelTier: ModelPurpose
  private supabase: SupabaseClient
  private orgId: string

  constructor(config: SwarmAgentConfig) {
    this.role = config.role
    this.persona = { ...DEFAULT_PERSONAS[config.role], ...config.persona }
    this.capabilities = { ...DEFAULT_CAPABILITIES[config.role], ...config.capabilities }
    this.modelTier = (config.modelTier || 'conversation') as ModelPurpose
    this.supabase = config.supabase
    this.orgId = config.orgId
  }

  /**
   * Execute a step within the swarm.
   * Runs the agent engine with role-specific constraints.
   */
  async execute(
    prompt: string,
    context: SwarmStepContext,
  ): Promise<SwarmStepResult> {
    const startTime = Date.now()

    try {
      // Build the role-specific system prompt augmentation
      const rolePrompt = this.buildRolePrompt(context)

      // Combine role prompt with step prompt
      const fullPrompt = `${rolePrompt}\n\n## Your Task\n${prompt}\n\n${this.buildContextSection(context)}`

      // Run agent chat with constrained configuration
      const engineConfig: EngineConfig = {
        orgId: this.orgId,
        supabase: this.supabase,
        model: resolveModel(this.modelTier),
        maxIterations: 8, // Swarm steps should be focused
        skipCostGuard: true, // Cost managed at swarm level
        agentType: `swarm-${this.role}`,
      }

      let message = ''
      let tokensIn = 0
      let tokensOut = 0
      const toolCalls: Array<{ name: string; success: boolean; input?: unknown; result?: unknown }> = []

      for await (const event of runAgentChat(fullPrompt, engineConfig)) {
        switch (event.type) {
          case 'message':
          case 'content_delta':
            message += event.data
            break
          case 'tool_result': {
            const data = event.data as { name: string; success: boolean; result?: unknown }
            toolCalls.push({ name: data.name, success: data.success, result: data.result })
            break
          }
          case 'tool_call': {
            const data = event.data as { name: string; input: unknown }
            // Tool call permission check is handled by the engine tool filtering
            break
          }
          case 'done': {
            const data = event.data as { tokens?: { input_tokens: number; output_tokens: number } }
            tokensIn = data.tokens?.input_tokens ?? 0
            tokensOut = data.tokens?.output_tokens ?? 0
            break
          }
          case 'error':
            return {
              success: false,
              error: event.data,
              cost: 0,
              tokensIn: 0,
              tokensOut: 0,
              modelUsed: resolveModel(this.modelTier),
            }
        }
      }

      // Extract structured data from the agent's response
      const extractedData = this.extractStructuredOutput(message)

      // Build reversible actions from tool calls
      const reversibleActions = this.extractReversibleActions(toolCalls, context.stepKey)

      // Build inter-agent messages from findings
      const messages = this.extractMessages(message, extractedData)

      // Check for negotiation (agent pushback)
      const negotiation = this.checkForNegotiation(message, context)

      const cost = this.estimateCost(tokensIn, tokensOut)

      if (negotiation) {
        return {
          success: false,
          data: extractedData,
          negotiation,
          messages,
          reversibleActions,
          cost,
          tokensIn,
          tokensOut,
          modelUsed: resolveModel(this.modelTier),
        }
      }

      return {
        success: true,
        data: extractedData,
        messages,
        reversibleActions,
        cost,
        tokensIn,
        tokensOut,
        modelUsed: resolveModel(this.modelTier),
      }

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error(`[swarm-agent] ${this.role} execution failed`, { error: errorMsg, stepKey: context.stepKey })
      return {
        success: false,
        error: errorMsg,
        cost: 0,
        tokensIn: 0,
        tokensOut: 0,
        modelUsed: resolveModel(this.modelTier),
      }
    }
  }

  // ── Prompt Building ───────────────────────────────────────────────────

  private buildRolePrompt(context: SwarmStepContext): string {
    const persona = this.persona

    return `## Your Role: ${this.role.charAt(0).toUpperCase() + this.role.slice(1)} Agent

You are the **${this.role}** agent in a multi-agent swarm operation. You are working as part of a coordinated team to accomplish a complex task.

### Your Personality
- **Style**: ${persona.style}
- **Risk Tolerance**: ${persona.riskTolerance < 0.4 ? 'Conservative — flag concerns early' : persona.riskTolerance > 0.6 ? 'Open to opportunities — be proactive' : 'Balanced — weigh risks and opportunities'}
${persona.voice ? `- **Communication**: ${persona.voice}` : ''}

### Important Rules
1. Stay focused on YOUR domain (${this.role}). Do not try to do other agents' jobs.
2. Share findings that other agents need to know — post warnings if you discover issues.
3. If you believe the task should NOT proceed (financial risk, missing information, timing issue), explain why clearly. This is your professional judgment.
4. Be concise and action-oriented. This is one step in a larger operation.
5. Return your findings as structured data when possible (JSON in code blocks).

### Response Format
End your response with a JSON block containing your structured findings:
\`\`\`json
{
  "summary": "brief summary of what you found/did",
  ...your specific findings...
}
\`\`\``
  }

  private buildContextSection(context: SwarmStepContext): string {
    const parts: string[] = []

    // Upstream findings
    if (context.upstreamFindings.length > 0) {
      parts.push('## Information from Other Agents')
      for (const finding of context.upstreamFindings) {
        const icon = finding.message_type === 'warning' ? '!!!'
          : finding.message_type === 'blocker' ? 'BLOCKER'
          : finding.message_type === 'finding' ? 'info'
          : ''
        parts.push(`- [${icon}] From ${finding.from_step_key}: ${finding.content}`)
      }
    }

    // Input from dependencies
    if (Object.keys(context.inputData).length > 0) {
      parts.push('\n## Input from Previous Steps')
      for (const [key, value] of Object.entries(context.inputData)) {
        parts.push(`### ${key}`)
        parts.push(typeof value === 'string' ? value : JSON.stringify(value, null, 2).slice(0, 2000))
      }
    }

    return parts.join('\n')
  }

  // ── Output Processing ─────────────────────────────────────────────────

  private extractStructuredOutput(message: string): Record<string, unknown> {
    // Try to find JSON block in the response
    const jsonMatch = message.match(/```json\s*([\s\S]*?)```/)
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim())
      } catch {
        // Fall through to plain text
      }
    }

    // Try bare JSON object
    const bareJson = message.match(/\{[\s\S]*\}/)
    if (bareJson) {
      try {
        const parsed = JSON.parse(bareJson[0])
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed
        }
      } catch {
        // Fall through
      }
    }

    // Return message as summary
    return {
      summary: message.slice(0, 1000),
      rawResponse: message,
    }
  }

  private extractReversibleActions(
    toolCalls: Array<{ name: string; success: boolean; input?: unknown; result?: unknown }>,
    stepKey: string,
  ): ReversibleAction[] {
    const actions: ReversibleAction[] = []

    for (const call of toolCalls) {
      if (!call.success) continue

      // Map tool calls to reversible actions
      switch (call.name) {
        case 'create_task': {
          const result = call.result as Record<string, unknown> | undefined
          if (result?.id) {
            actions.push({
              stepKey,
              actionType: 'create_task',
              actionData: call.input as Record<string, unknown>,
              undoStrategy: 'delete',
              undoPayload: { table: 'tasks', id: result.id },
              executedAt: new Date().toISOString(),
            })
          }
          break
        }
        case 'update_task': {
          // Would need original values to undo — mark as manual
          actions.push({
            stepKey,
            actionType: 'update_task',
            actionData: call.input as Record<string, unknown>,
            undoStrategy: 'manual',
            executedAt: new Date().toISOString(),
          })
          break
        }
        case 'generate_invoice': {
          const result = call.result as Record<string, unknown> | undefined
          if (result?.id) {
            actions.push({
              stepKey,
              actionType: 'generate_invoice',
              actionData: call.input as Record<string, unknown>,
              undoStrategy: 'archive',
              undoPayload: { table: 'invoices', id: result.id },
              executedAt: new Date().toISOString(),
            })
          }
          break
        }
        case 'send_email':
        case 'send_sms':
        case 'send_whatsapp':
          // Outbound comms cannot be reversed
          actions.push({
            stepKey,
            actionType: call.name,
            actionData: call.input as Record<string, unknown>,
            undoStrategy: 'manual',
            executedAt: new Date().toISOString(),
          })
          break
      }
    }

    return actions
  }

  private extractMessages(
    message: string,
    data: Record<string, unknown>,
  ): Array<{ type: SwarmMessageType; content: string; data?: Record<string, unknown> }> {
    const messages: Array<{ type: SwarmMessageType; content: string; data?: Record<string, unknown> }> = []

    // Check for warnings in the response
    const warningPatterns = [
      /(?:warning|concern|caution|risk|alert|flag):\s*(.+)/gi,
      /(?:note|important|attention):\s*(.+)/gi,
    ]

    for (const pattern of warningPatterns) {
      let match
      while ((match = pattern.exec(message)) !== null) {
        messages.push({
          type: 'warning',
          content: match[1].trim(),
        })
      }
    }

    // Always share key findings
    if (data.summary && typeof data.summary === 'string') {
      messages.push({
        type: 'finding',
        content: data.summary,
        data,
      })
    }

    return messages
  }

  private checkForNegotiation(
    message: string,
    context: SwarmStepContext,
  ): NegotiationResult | null {
    // Check for pushback signals
    const pushbackPatterns = [
      /(?:should not|shouldn't|cannot|can't|won't|unable to|not recommend|advise against|concerned about|overcommitted|too risky)/i,
      /(?:suggest instead|alternative approach|recommend postponing|delay|reconsider)/i,
    ]

    const hasPushback = pushbackPatterns.some(p => p.test(message))

    if (hasPushback && this.persona.riskTolerance < 0.5) {
      // Conservative agents are more likely to push back
      return {
        agentRole: this.role,
        originalRequest: context.inputData.toString(),
        counterProposal: message.slice(0, 500),
        reasoning: `${this.role} agent (${this.persona.style} style) has concerns about this approach`,
        resolved: false,
      }
    }

    return null
  }

  private estimateCost(tokensIn: number, tokensOut: number): number {
    const { computeCost } = require('@/lib/agent/model-registry')
    return computeCost(this.modelTier, tokensIn, tokensOut)
  }
}
