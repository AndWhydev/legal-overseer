/**
 * ClickUp Dashboard Data Module
 *
 * Provides functions to fetch aggregated task data for dashboard views.
 * Note: ClickUp API doesn't support creating dashboard views programmatically.
 * This module provides data that can populate dashboards; actual dashboard
 * creation is done manually in the ClickUp UI.
 */

import { executeClickUpQuery, getWorkspaceHierarchy } from './service.js';
import type { QueryOptions } from '../../agent/executor.js';

/**
 * Default options for dashboard read queries
 */
const CLICKUP_READ_DEFAULTS: Partial<QueryOptions> = {
  maxBudgetUsd: 0.5,
  maxTurns: 5,
  allowedTools: [
    'Read',
    'mcp__clickup__get_task',
    'mcp__clickup__get_tasks',
    'mcp__clickup__get_workspace_hierarchy',
  ],
};

/**
 * Summary of tasks in a single list
 */
export interface DashboardTaskSummary {
  /** ClickUp list ID */
  listId: string;
  /** Display name of the list */
  listName: string;
  /** Count of tasks by status (e.g., { "open": 5, "in progress": 3, "complete": 10 }) */
  statusCounts: Record<string, number>;
  /** Total number of tasks in the list */
  totalTasks: number;
}

/**
 * Complete dashboard overview with all lists
 */
export interface DashboardOverview {
  /** Task summaries for each list in the workspace */
  spaces: DashboardTaskSummary[];
  /** ISO timestamp when the overview was generated */
  generatedAt: string;
}

/**
 * Task item returned from status query
 */
export interface DashboardTaskItem {
  /** ClickUp task ID */
  taskId: string;
  /** Task name/title */
  taskName: string;
  /** Name of the list containing the task */
  listName: string;
  /** ISO timestamp when task was created */
  createdAt: string;
}

/**
 * Get a comprehensive dashboard overview of all tasks in the workspace
 *
 * Fetches workspace hierarchy and aggregates task counts by status
 * for each list. This data can be used to populate dashboard widgets
 * or generate briefing summaries.
 *
 * @returns Dashboard overview with task summaries per list
 *
 * @example
 * ```typescript
 * const overview = await getDashboardOverview();
 * if (overview) {
 *   console.log('Generated at:', overview.generatedAt);
 *   for (const list of overview.spaces) {
 *     console.log(`${list.listName}: ${list.totalTasks} tasks`);
 *     console.log('  Status breakdown:', list.statusCounts);
 *   }
 * }
 * ```
 */
export async function getDashboardOverview(): Promise<DashboardOverview | null> {
  // First get the workspace hierarchy to discover all lists
  const hierarchyResult = await getWorkspaceHierarchy();

  if (!hierarchyResult.success) {
    return null;
  }

  // Parse hierarchy to extract list IDs
  let hierarchy: { spaces?: Array<{ id: string; name: string; lists?: Array<{ id: string; name: string }>; folders?: Array<{ lists?: Array<{ id: string; name: string }> }> }> };
  try {
    hierarchy = JSON.parse(hierarchyResult.output);
  } catch {
    return null;
  }

  const summaries: DashboardTaskSummary[] = [];

  // Extract lists from spaces (direct lists and lists in folders)
  const lists: Array<{ id: string; name: string }> = [];

  for (const space of hierarchy.spaces || []) {
    // Direct lists in space
    for (const list of space.lists || []) {
      lists.push({ id: list.id, name: list.name });
    }
    // Lists inside folders
    for (const folder of space.folders || []) {
      for (const list of folder.lists || []) {
        lists.push({ id: list.id, name: list.name });
      }
    }
  }

  // For each list, get task counts by status
  for (const list of lists) {
    const tasksResult = await executeClickUpQuery(
      `Use the ClickUp MCP get_tasks tool to fetch all tasks from list "${list.id}". Return ONLY a JSON array with each task's status field. Format: [{"status": "open"}, {"status": "in progress"}]`,
      CLICKUP_READ_DEFAULTS
    );

    if (tasksResult.success) {
      try {
        const tasks = JSON.parse(tasksResult.output) as Array<{ status: string }>;
        const statusCounts: Record<string, number> = {};

        for (const task of tasks) {
          const status = task.status || 'unknown';
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        }

        summaries.push({
          listId: list.id,
          listName: list.name,
          statusCounts,
          totalTasks: tasks.length,
        });
      } catch {
        // Skip lists where we couldn't parse task data
        summaries.push({
          listId: list.id,
          listName: list.name,
          statusCounts: {},
          totalTasks: 0,
        });
      }
    }
  }

  return {
    spaces: summaries,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Get tasks across the workspace filtered by status
 *
 * Useful for queries like "show all pending tasks" or "list tasks in review".
 * Searches across all lists in the workspace.
 *
 * @param status - The status to filter by (e.g., "open", "in progress", "review")
 * @param limit - Maximum number of tasks to return (default: 20)
 * @returns Array of task items matching the status
 *
 * @example
 * ```typescript
 * const pendingTasks = await getTasksByStatus('open', 10);
 * for (const task of pendingTasks) {
 *   console.log(`[${task.listName}] ${task.taskName}`);
 * }
 * ```
 */
export async function getTasksByStatus(
  status: string,
  limit: number = 20
): Promise<DashboardTaskItem[]> {
  const prompt = `Use the ClickUp MCP tools to find tasks with status "${status}" across the workspace.
Return a JSON array with up to ${limit} tasks. Each task should have: taskId (the task's id), taskName (the task's name), listName (the name of the list it's in), createdAt (date_created field).
Output ONLY the JSON array, no explanation.
Format: [{"taskId": "abc", "taskName": "Task title", "listName": "List name", "createdAt": "2024-01-01T00:00:00.000Z"}]`;

  const result = await executeClickUpQuery(prompt, CLICKUP_READ_DEFAULTS);

  if (!result.success) {
    return [];
  }

  try {
    const tasks = JSON.parse(result.output) as DashboardTaskItem[];
    return tasks.slice(0, limit);
  } catch {
    return [];
  }
}
