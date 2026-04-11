/**
 * Gatekeeper Task Context Module
 *
 * Provides Gatekeeper-specific functions for content QA processing.
 * Integrates with ClickUp to fetch task details for quality assessment.
 *
 * The Gatekeeper skill reviews content against CheekyGlo's brand guidelines,
 * checks technical quality, and provides structured QA feedback.
 */

import { getTask } from '../../integrations/clickup/service.js';
import { getSkillDefinition } from '../registry.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('Gatekeeper');

/**
 * Payload structure from ClickUp webhook for task events
 */
export interface ClickUpTaskPayload {
  task_id: string;
  history_items?: Array<{
    field: string;
    before?: { status: string };
    after?: { status: string };
  }>;
}

/**
 * Task details fetched from ClickUp
 */
export interface GatekeeperTaskContext {
  taskId: string;
  name: string;
  description: string;
  status: string;
  attachments: string[];
  customFields: Record<string, unknown>;
  fetchError?: string;
}

/**
 * Parse webhook payload to extract task ID
 *
 * @param taskInput - JSON string from webhook payload
 * @returns Task ID or null if parsing fails
 */
export function parseTaskPayload(taskInput: string): string | null {
  try {
    const payload = JSON.parse(taskInput) as ClickUpTaskPayload;
    return payload.task_id || null;
  } catch {
    logger.error('Failed to parse task payload');
    return null;
  }
}

/**
 * Fetch task context from ClickUp for Gatekeeper processing
 *
 * @param taskId - The ClickUp task ID
 * @returns Task context including name, description, attachments
 */
export async function fetchGatekeeperTaskContext(
  taskId: string
): Promise<GatekeeperTaskContext> {
  const result = await getTask(taskId);

  if (!result.success) {
    return {
      taskId,
      name: 'Unknown',
      description: '',
      status: 'unknown',
      attachments: [],
      customFields: {},
      fetchError: result.error || 'Failed to fetch task from ClickUp',
    };
  }

  try {
    // Parse the JSON output from the agent
    const task = JSON.parse(result.output);

    return {
      taskId,
      name: task.name || 'Untitled Task',
      description: task.description || '',
      status: task.status?.status || task.status || 'unknown',
      attachments: task.attachments?.map((a: { url: string }) => a.url) || [],
      customFields: task.custom_fields || {},
    };
  } catch {
    // If parsing fails, try to use raw output
    return {
      taskId,
      name: 'Task ' + taskId,
      description: result.output,
      status: 'unknown',
      attachments: [],
      customFields: {},
    };
  }
}

/**
 * Build Gatekeeper prompt with task context
 *
 * Creates a system prompt that includes the task details fetched from ClickUp,
 * instructing the agent to perform QA analysis.
 *
 * @param taskInput - JSON string from webhook payload
 * @returns System prompt for Gatekeeper skill execution
 *
 * @example
 * ```typescript
 * const prompt = await getGatekeeperPrompt('{"task_id": "abc123"}');
 * const result = await executeQuery(prompt.userPrompt, {
 *   systemPrompt: prompt.systemPrompt
 * });
 * ```
 */
export async function getGatekeeperPrompt(taskInput: string): Promise<{
  systemPrompt: string;
  userPrompt: string;
  taskContext: GatekeeperTaskContext | null;
}> {
  const skill = getSkillDefinition('gatekeeper');

  // Parse task ID from input
  const taskId = parseTaskPayload(taskInput);

  if (!taskId) {
    return {
      systemPrompt: skill.systemPrompt,
      userPrompt: `Unable to parse task from input: ${taskInput}. Please provide a valid ClickUp task ID or webhook payload.`,
      taskContext: null,
    };
  }

  // Fetch task details from ClickUp
  const taskContext = await fetchGatekeeperTaskContext(taskId);

  if (taskContext.fetchError) {
    return {
      systemPrompt: skill.systemPrompt,
      userPrompt: `Error fetching task ${taskId}: ${taskContext.fetchError}. Please verify the task exists and ClickUp is configured.`,
      taskContext,
    };
  }

  // Build user prompt with task context
  const userPrompt = `
Review the following content task for CheekyGlo brand compliance and quality:

## Task Details
- **Task ID:** ${taskContext.taskId}
- **Name:** ${taskContext.name}
- **Status:** ${taskContext.status}

## Description
${taskContext.description || '(No description provided)'}

## Attachments
${taskContext.attachments.length > 0 ? taskContext.attachments.map((url, i) => `${i + 1}. ${url}`).join('\n') : '(No attachments)'}

---

Please analyze this content and provide:
1. **Quality Score** (0-100)
2. **Issues Found** (list any brand guideline violations, technical issues, or concerns)
3. **Recommendation** (APPROVE, FLAG_FOR_REVIEW, or RETURN_TO_CREATOR)
4. **Detailed Feedback** for the creator

Format your response as structured JSON with these fields.
`;

  return {
    systemPrompt: skill.systemPrompt,
    userPrompt,
    taskContext,
  };
}
