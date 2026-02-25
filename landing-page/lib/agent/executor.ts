// ============================================
// Tool Executor - Registry-based tool execution
// ============================================

import {
  handleLookupOrder,
  handleGetShippingStatus,
  handleGetCustomerHistory,
  handleSendReply,
  handleCreateTask,
  handleCheckInventory,
  handleEscalate,
} from '../services/tool-handlers';
import type { ToolExecutionResult } from './types';

// Tool handler registry
const handlers = new Map<
  string,
  (input: Record<string, unknown>, sessionId: string) => Promise<unknown>
>([
  ['lookup_order', handleLookupOrder],
  ['get_shipping_status', handleGetShippingStatus],
  ['get_customer_history', handleGetCustomerHistory],
  ['send_reply', handleSendReply],
  ['create_task', handleCreateTask],
  ['check_inventory', handleCheckInventory],
  ['escalate', handleEscalate],
]);

/**
 * Execute a tool call by name with the given input.
 */
export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionId: string
): Promise<ToolExecutionResult> {
  console.log(`[Executor] Executing tool: ${toolName}`);

  const handler = handlers.get(toolName);
  if (!handler) {
    return { result: null, error: `Unknown tool: ${toolName}`, success: false };
  }

  try {
    const result = await handler(toolInput, sessionId);
    console.log(`[Executor] Success`);
    return { result, success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Executor] Error: ${errorMessage}`);
    return { result: null, error: errorMessage, success: false };
  }
}
