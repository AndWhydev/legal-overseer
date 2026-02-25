// ============================================
// Response Formatter - Clean agent responses for display and audit
// ============================================

import type { AgentRequest, AgentAction, AgentResponse, AgentRouting } from './types';
import type { ConfidenceAssessment } from './confidence';
import type { RoutingDecision } from './routing';

/**
 * Formatted response for display and API consumers
 */
export interface FormattedResponse {
  // For display
  summary: string;          // One-line summary of what happened
  detail: string;           // Full message to show user
  actions_summary: string;  // "Looked up order CG-10001, sent WhatsApp reply"

  // For API consumers
  raw: AgentResponse;

  // For audit
  audit_record: AuditRecord;
}

/**
 * Complete audit record for a single agent interaction
 */
export interface AuditRecord {
  session_id: string;
  timestamp: string;
  input: {
    message: string;
    channel: string;
    sender_type: string;
    sender_email?: string;
    sender_phone?: string;
  };
  processing: {
    intent_detected: string;
    tools_called: string[];
    confidence: number;
    confidence_level: 'high' | 'medium' | 'low';
    routing_decision: string;
  };
  output: {
    response_sent: string;
    actions_taken: AgentAction[];
    escalated: boolean;
    escalation_reason?: string;
    auto_resolved: boolean;
    queue: 'xixi' | 'allen' | 'auto';
  };
}

/**
 * Summarize an order lookup result for display
 */
function summarizeOrderLookup(result: unknown): string {
  if (!result || typeof result !== 'object') return 'Order lookup';

  const r = result as Record<string, unknown>;
  if (!r.found) return 'Order not found';

  const order = r.order as Record<string, unknown> | undefined;
  if (!order) return 'Order looked up';

  const orderNum = order.order_number || 'unknown';
  const status = order.status || 'unknown';
  return `Looked up order ${orderNum} (${status})`;
}

/**
 * Summarize a shipping status result
 */
function summarizeShippingStatus(result: unknown): string {
  if (!result || typeof result !== 'object') return 'Checked shipping';

  const r = result as Record<string, unknown>;
  if (!r.found) return 'Shipping info not found';

  const shipping = r.shipping as Record<string, unknown> | undefined;
  if (!shipping) return 'Checked shipping status';

  const carrier = shipping.carrier || 'carrier';
  const status = shipping.shipping_status || shipping.status || 'in transit';
  return `Shipping: ${carrier} - ${status}`;
}

/**
 * Summarize a send_reply action
 */
function summarizeSendReply(params: Record<string, unknown>, result: unknown): string {
  const channel = params.channel || 'message';
  const r = result as Record<string, unknown> | undefined;

  if (r?.sent) {
    return `Sent ${channel} reply`;
  }
  return `Queued ${channel} reply`;
}

/**
 * Summarize a create_task action
 */
function summarizeCreateTask(params: Record<string, unknown>, result: unknown): string {
  const owner = params.owner || 'team';
  const r = result as Record<string, unknown> | undefined;

  if (r?.created) {
    const task = r.task as Record<string, unknown> | undefined;
    const id = task?.id || 'new';
    return `Created task #${id} for ${owner}`;
  }
  return `Created task for ${owner}`;
}

/**
 * Summarize an escalate action
 */
function summarizeEscalate(params: Record<string, unknown>, result: unknown): string {
  const category = params.category || 'issue';
  const r = result as Record<string, unknown> | undefined;
  const owner = r?.owner || 'team';
  return `Escalated ${category} to ${owner}`;
}

/**
 * Summarize a check_inventory action
 */
function summarizeInventory(result: unknown): string {
  if (!result || typeof result !== 'object') return 'Checked inventory';

  const r = result as Record<string, unknown>;
  if (!r.found) return 'Product not found';

  const stock = r.stock as Record<string, unknown> | undefined;
  if (!stock) return 'Checked stock';

  const sku = stock.sku || 'product';
  const inStock = stock.in_stock;
  return `${sku}: ${inStock ? 'in stock' : 'out of stock'}`;
}

/**
 * Summarize a single action into human-readable text
 */
function summarizeAction(action: AgentAction): string {
  const { type, params, result } = action;

  switch (type) {
    case 'lookup_order':
      return summarizeOrderLookup(result);
    case 'get_shipping_status':
      return summarizeShippingStatus(result);
    case 'get_customer_history':
      const email = params.email || 'customer';
      return `Retrieved history for ${email}`;
    case 'send_reply':
      return summarizeSendReply(params, result);
    case 'create_task':
      return summarizeCreateTask(params, result);
    case 'escalate':
      return summarizeEscalate(params, result);
    case 'check_inventory':
      return summarizeInventory(result);
    default:
      return `Executed ${type}`;
  }
}

/**
 * Convert a list of actions to a human-readable summary string
 */
export function summarizeActions(actions: AgentAction[]): string {
  if (actions.length === 0) return 'No actions taken';

  const summaries = actions.map(summarizeAction);

  if (summaries.length === 1) {
    return summaries[0];
  }

  if (summaries.length === 2) {
    return `${summaries[0]}, ${summaries[1]}`;
  }

  // For 3+ actions, use Oxford comma
  const last = summaries.pop()!;
  return `${summaries.join(', ')}, and ${last}`;
}

/**
 * Generate a one-line summary of the agent's response
 */
function generateSummary(actions: AgentAction[], routing: AgentRouting): string {
  const actionCount = actions.length;

  if (actionCount === 0) {
    if (routing.auto_resolve) {
      return 'Responded without additional actions';
    }
    return `Requires ${routing.queue} review`;
  }

  if (routing.auto_resolve) {
    return `Auto-resolved with ${actionCount} action${actionCount > 1 ? 's' : ''}`;
  }

  return `${actionCount} action${actionCount > 1 ? 's' : ''} taken, routed to ${routing.queue}`;
}

/**
 * Format a complete agent response for display and audit
 */
export function formatResponse(
  request: AgentRequest,
  response: AgentResponse,
  confidence: ConfidenceAssessment,
  routing: RoutingDecision,
  sessionId: string
): FormattedResponse {
  const timestamp = new Date().toISOString();
  const actions = response.actions_taken;

  // Build clean summaries
  const summary = generateSummary(actions, response.routing!);
  const actions_summary = summarizeActions(actions);

  // Build audit record
  const audit_record: AuditRecord = {
    session_id: sessionId,
    timestamp,
    input: {
      message: request.message,
      channel: request.channel,
      sender_type: request.sender.type,
      sender_email: request.sender.email,
      sender_phone: request.sender.phone,
    },
    processing: {
      intent_detected: routing.intent,
      tools_called: actions.map(a => a.type),
      confidence: confidence.score,
      confidence_level: confidence.level,
      routing_decision: routing.reason,
    },
    output: {
      response_sent: response.message,
      actions_taken: actions,
      escalated: response.should_escalate,
      escalation_reason: confidence.escalation_reason,
      auto_resolved: response.routing?.auto_resolve ?? false,
      queue: response.routing?.queue ?? 'xixi',
    },
  };

  return {
    summary,
    detail: response.message,
    actions_summary,
    raw: response,
    audit_record,
  };
}
