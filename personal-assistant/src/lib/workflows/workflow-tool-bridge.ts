import type { SupabaseClient } from '@supabase/supabase-js'
import { TOOL_GROUPS, executeAgentTool, type ToolGroup } from '@/lib/agent/tools'
import { canProceed } from '@/lib/agent/cost-guard'
import type { WorkflowAction, WorkflowRule } from './workflow-rule-types'
import type { WorkflowStepContext, WorkflowStepResult, WorkflowDefinition, WorkflowStepDef } from '@/lib/roles/workflow-executor'
import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// WorkflowToolBridge — Cross-role tool resolution + org-level budget guard
// ---------------------------------------------------------------------------

export interface WorkflowToolBridge {
  /** Check if a tool exists in the given tool group. */
  resolveTool(toolGroup: ToolGroup, toolName: string): boolean
  /** Execute a tool with org-level budget check. */
  executeTool(
    toolGroup: ToolGroup,
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<WorkflowStepResult>
}

/**
 * Create a workflow tool bridge scoped to an org.
 * Resolves tools from any tool group regardless of which role triggered the workflow.
 * Checks org-level budget via canProceed before executing any tool.
 */
export function createWorkflowToolBridge(
  supabase: SupabaseClient,
  orgId: string,
): WorkflowToolBridge {
  return {
    resolveTool(toolGroup: ToolGroup, toolName: string): boolean {
      const group = TOOL_GROUPS[toolGroup]
      if (!group) return false
      return group.tools.includes(toolName)
    },

    async executeTool(
      toolGroup: ToolGroup,
      toolName: string,
      params: Record<string, unknown>,
    ): Promise<WorkflowStepResult> {
      // Validate tool exists
      if (!this.resolveTool(toolGroup, toolName)) {
        return {
          success: false,
          error: `Cannot resolve tool '${toolName}' in group '${toolGroup}'`,
        }
      }

      // Org-level budget check
      const budgetCheck = await canProceed(supabase, orgId)
      if (!budgetCheck.allowed) {
        logger.warn('[workflow-tool-bridge] Budget guard blocked tool execution', {
          toolGroup,
          toolName,
          reason: budgetCheck.reason,
        })
        return {
          success: false,
          error: `Workflow budget exceeded: ${budgetCheck.reason ?? 'Daily budget limit reached'}`,
        }
      }

      // Execute via existing tool infrastructure (respects plan gates, autonomy, etc.)
      try {
        const result = await executeAgentTool(toolName, params, orgId, supabase)
        return {
          success: result.success,
          result,
          error: result.error,
        }
      } catch (err) {
        return {
          success: false,
          error: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
        }
      }
    },
  }
}

// ---------------------------------------------------------------------------
// executeWorkflowStep — Convert a WorkflowAction into tool execution
// ---------------------------------------------------------------------------

/**
 * Execute a single workflow step (action) through the tool bridge.
 * Handles condition evaluation, failure strategies, and result tracking.
 */
export async function executeWorkflowStep(
  bridge: WorkflowToolBridge,
  action: WorkflowAction,
  ctx: WorkflowStepContext,
): Promise<WorkflowStepResult> {
  // Evaluate condition: if a step_id is referenced, check if that step succeeded
  if (action.condition) {
    const referencedResult = ctx.stepResults[action.condition] as
      | { success: boolean }
      | undefined
    if (referencedResult && !referencedResult.success) {
      logger.info('[workflow-tool-bridge] Step skipped due to condition', {
        stepId: action.step_id,
        condition: action.condition,
      })
      return {
        success: true,
        error: `Step '${action.name}' skipped: condition step '${action.condition}' did not succeed`,
      }
    }
  }

  // Execute the tool
  const result = await bridge.executeTool(action.tool_group, action.tool_name, action.parameters)

  // Handle failure strategies
  if (!result.success) {
    switch (action.on_failure) {
      case 'skip':
        logger.info('[workflow-tool-bridge] Step failure skipped', {
          stepId: action.step_id,
          error: result.error,
        })
        return {
          success: true,
          error: `Step '${action.name}' failed but skipped: ${result.error}`,
        }

      case 'retry': {
        // Retry once
        logger.info('[workflow-tool-bridge] Retrying step', { stepId: action.step_id })
        const retryResult = await bridge.executeTool(
          action.tool_group,
          action.tool_name,
          action.parameters,
        )
        return retryResult
      }

      case 'abort':
      default:
        // Propagate error
        return result
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// ruleToWorkflowDefinition — Convert a WorkflowRule to executor-compatible def
// ---------------------------------------------------------------------------

/**
 * Convert a WorkflowRule (user-defined, DB-stored) into a WorkflowDefinition
 * compatible with the existing startWorkflow() executor.
 *
 * Each action in the rule becomes a WorkflowStepDef where execute() calls
 * executeWorkflowStep() through the provided bridge.
 */
export function ruleToWorkflowDefinition(
  rule: WorkflowRule,
  bridge: WorkflowToolBridge,
  orgId: string,
): WorkflowDefinition {
  const steps: WorkflowStepDef[] = rule.actions.map((action) => ({
    id: action.step_id,
    name: action.name,
    delaySeconds: action.delay_seconds,
    execute: async (ctx: WorkflowStepContext): Promise<WorkflowStepResult> => {
      return executeWorkflowStep(bridge, action, ctx)
    },
  }))

  return {
    type: `workflow_rule:${rule.id}`,
    steps,
    context: {
      ruleId: rule.id,
      ruleName: rule.name,
      orgId,
      triggered_by_workflow: true, // Loop prevention flag
    },
  }
}
