/**
 * Swarm Tool — trigger multi-agent swarms from chat
 *
 * Enables the chat agent to spawn coordinated multi-agent teams
 * for complex operations like pitch prep, client onboarding, etc.
 */

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolResult } from '../tools'
import { SwarmCoordinator } from '@/lib/swarm/coordinator'
import { BUILTIN_TEMPLATES } from '@/lib/swarm/templates'

// ── Tool Definition ─────────────────────────────────────────────────────────

export const swarmToolDefinition: Anthropic.Tool = {
  name: 'trigger_swarm',
  description: `Deploy a coordinated multi-agent team (swarm) for complex operations that require multiple agents working together. Use this when a single tool call isn't enough — when the task requires Sales, Finance, Comms, Operations, or Research agents to coordinate.

Available swarm templates:
${BUILTIN_TEMPLATES.map(t => `- "${t.slug}": ${t.name} — ${t.description}`).join('\n')}

Examples:
- "Prepare pitch for Thomson" → pitch-prep swarm
- "Onboard Acme Corp as a new client" → client-onboarding swarm
- "Run end of month" → end-of-month swarm

The swarm runs asynchronously. You'll get a run ID to track progress.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      command: {
        type: 'string',
        description: 'Natural language command describing what to do (e.g., "Prepare pitch for Thomson")',
      },
      template_slug: {
        type: 'string',
        description: 'Optional: explicit template slug (pitch-prep, client-onboarding, end-of-month)',
      },
      params: {
        type: 'object',
        description: 'Optional: pre-filled parameters (clientName, contactEmail, etc.)',
      },
    },
    required: ['command'],
  },
}

// ── Tool Handler ────────────────────────────────────────────────────────────

export async function handleTriggerSwarm(
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient,
): Promise<ToolResult> {
  const command = input.command as string
  const templateSlug = input.template_slug as string | undefined
  const params = input.params as Record<string, unknown> | undefined

  if (!command) {
    return { success: false, error: 'command is required' }
  }

  try {
    const coordinator = new SwarmCoordinator(supabase, orgId)

    const result = await coordinator.trigger(command, {
      templateSlug,
      params,
      triggerType: 'chat',
    })

    return {
      success: true,
      data: {
        runId: result.runId,
        status: result.status,
        summary: result.summary,
        message: `Swarm ${result.status}: ${result.summary || 'Check the Swarm dashboard for details.'}`,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: `Swarm trigger failed: ${message}`,
    }
  }
}
