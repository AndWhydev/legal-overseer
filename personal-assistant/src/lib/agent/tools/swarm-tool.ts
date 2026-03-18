/**
 * Swarm Tool — allows the chat agent to trigger multi-agent swarms.
 *
 * Users can say "Prepare for Thomson pitch" or "Onboard Acme Corp" and
 * the agent uses this tool to match a template and kick off a swarm.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolResult } from '../tools'
import { triggerSwarm, registerBuiltinParticipants, loadTemplates } from '@/lib/swarm'
import { logger } from '@/lib/core/logger'

let participantsRegistered = false

function ensureParticipants() {
  if (!participantsRegistered) {
    registerBuiltinParticipants()
    participantsRegistered = true
  }
}

export const swarmToolDefinitions: Anthropic.Tool[] = [
  {
    name: 'trigger_swarm',
    description: 'Trigger a multi-agent swarm to coordinate complex operations across Finance, Comms, and Sales agents. Use when the user requests something that requires multiple agents working together, like "prepare for a pitch", "onboard a new client", or "run end-of-month review". The swarm will match a template, fill parameters, and execute steps in the right order.',
    input_schema: {
      type: 'object' as const,
      properties: {
        request: {
          type: 'string',
          description: 'Natural language description of what the swarm should do. Examples: "Prepare for the Thomson pitch next Tuesday", "Onboard Acme Corp as a new client", "Run end-of-month review"',
        },
        template_slug: {
          type: 'string',
          description: 'Optional: directly specify a template slug (pitch-prep, client-onboard, end-of-month) instead of NL matching',
        },
        params: {
          type: 'object',
          description: 'Optional: pre-filled parameters for the swarm (e.g., contact_name, service_type)',
        },
      },
      required: ['request'],
    },
  },
  {
    name: 'list_swarm_templates',
    description: 'List available swarm templates that can be triggered. Shows template name, description, and what parameters they accept.',
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'get_swarm_status',
    description: 'Check the status of a running or completed swarm. Shows step progress, agent outputs, and cost.',
    input_schema: {
      type: 'object' as const,
      properties: {
        swarm_run_id: {
          type: 'string',
          description: 'The swarm run ID to check',
        },
      },
      required: ['swarm_run_id'],
    },
  },
]

export const swarmToolHandlers: Record<string, (
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient
) => Promise<ToolResult>> = {

  async trigger_swarm(input, orgId, supabase) {
    ensureParticipants()

    const request = input.request as string
    const templateSlug = input.template_slug as string | undefined
    const params = input.params as Record<string, unknown> | undefined

    try {
      if (templateSlug) {
        // Direct template trigger
        const { data: template } = await supabase
          .from('swarm_templates')
          .select('*')
          .eq('slug', templateSlug)
          .single()

        if (!template) {
          return { success: false, error: `Template not found: ${templateSlug}` }
        }

        const { createSwarmRun, executeSwarmRun } = await import('@/lib/swarm')

        const run = await createSwarmRun(supabase, {
          orgId,
          name: `${template.name}: ${request.slice(0, 50)}`,
          dag: template.dag,
          inputParams: { ...params, _user_input: request },
          templateId: template.id,
          triggeredBy: 'chat-agent',
          triggerInput: request,
        })

        // Fire-and-forget execution
        executeSwarmRun(supabase, run.id).catch(err => {
          logger.error('[swarm-tool] Execution failed:', err)
        })

        return {
          success: true,
          data: {
            swarm_run_id: run.id,
            name: run.name,
            template: template.name,
            status: 'running',
            steps: template.dag.steps?.length ?? 0,
          },
        }
      }

      // Natural language trigger
      const result = await triggerSwarm(supabase, orgId, request, {
        autoExecute: true,
        triggeredBy: 'chat-agent',
      })

      if (!result.triggered) {
        return {
          success: false,
          error: `No matching swarm template for: "${request}". ${result.matchResult.reasoning}`,
          data: { reasoning: result.matchResult.reasoning },
        }
      }

      return {
        success: true,
        data: {
          swarm_run_id: result.run?.id,
          name: result.run?.name,
          template: result.matchResult.template?.name,
          confidence: result.matchResult.confidence,
          status: 'running',
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[swarm-tool] Error:', msg)
      return { success: false, error: msg }
    }
  },

  async list_swarm_templates(_input, orgId, supabase) {
    try {
      const templates = await loadTemplates(supabase, orgId)

      return {
        success: true,
        data: {
          templates: templates.map(t => ({
            slug: t.slug,
            name: t.name,
            description: t.description,
            category: t.category,
            trigger_patterns: t.trigger_patterns,
            params: t.param_schema,
            usage_count: t.usage_count,
            is_builtin: t.is_builtin,
          })),
          total: templates.length,
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  },

  async get_swarm_status(input, orgId, supabase) {
    const runId = input.swarm_run_id as string

    const { data: run } = await supabase
      .from('swarm_runs')
      .select('*')
      .eq('id', runId)
      .eq('org_id', orgId)
      .single()

    if (!run) {
      return { success: false, error: 'Swarm run not found' }
    }

    const { data: steps } = await supabase
      .from('swarm_steps')
      .select('step_id, step_type, agent_type, status, output, cost_cents, error, started_at, completed_at')
      .eq('swarm_run_id', runId)
      .order('execution_order', { ascending: true })

    const { data: messages } = await supabase
      .from('swarm_messages')
      .select('from_step_id, to_step_id, message_type, content')
      .eq('swarm_run_id', runId)
      .order('created_at', { ascending: true })
      .limit(20)

    return {
      success: true,
      data: {
        id: run.id,
        name: run.name,
        status: run.status,
        triggered_by: run.triggered_by,
        total_cost_cents: run.total_cost_cents,
        total_tokens: (run.total_tokens_in ?? 0) + (run.total_tokens_out ?? 0),
        started_at: run.started_at,
        completed_at: run.completed_at,
        output: run.output,
        steps: steps ?? [],
        messages: (messages ?? []).slice(0, 10),
      },
    }
  },
}
