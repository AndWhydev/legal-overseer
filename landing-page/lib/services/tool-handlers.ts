// ============================================
// Tool Handlers - Service wrappers for agent tools
// ============================================
// Each handler takes (input, sessionId) and returns the result

import db from '../db';
import {
  lookupOrder,
  lookupOrderByTracking,
  getShippingStatus,
  getCustomerOrderHistory,
} from './orders';
import { sendEmail, sendWhatsApp, sendSMS } from './messaging';
import { createTask } from './tasks';
import { checkStock, getProductInfo } from './inventory';

/**
 * Log a tool execution to the database
 */
function logToolExecution(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
  success: boolean,
  error?: string
): void {
  db.prepare(`
    INSERT INTO agent_actions (session_id, action_type, input, output, success, error_message)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    toolName,
    JSON.stringify(input),
    JSON.stringify(output),
    success ? 1 : 0,
    error || null
  );
}

// ============================================
// LOOKUP ORDER
// ============================================
export async function handleLookupOrder(
  input: Record<string, unknown>,
  sessionId: string
): Promise<unknown> {
  const { order_number, tracking_number } = input as {
    order_number?: string;
    tracking_number?: string;
  };

  let result: unknown;

  if (order_number) {
    const order = lookupOrder(order_number);
    result = order
      ? { found: true, order }
      : { found: false, message: `Order ${order_number} not found` };
  } else if (tracking_number) {
    const order = lookupOrderByTracking(tracking_number);
    result = order
      ? { found: true, order }
      : { found: false, message: `No order found with tracking ${tracking_number}` };
  } else {
    throw new Error('Either order_number or tracking_number is required');
  }

  logToolExecution(sessionId, 'lookup_order', input, result, true);
  return result;
}

// ============================================
// GET SHIPPING STATUS
// ============================================
export async function handleGetShippingStatus(
  input: Record<string, unknown>,
  sessionId: string
): Promise<unknown> {
  const { order_number } = input as { order_number: string };
  const status = getShippingStatus(order_number);

  const result = status
    ? { found: true, shipping: status }
    : { found: false, message: `Order ${order_number} not found` };

  logToolExecution(sessionId, 'get_shipping_status', input, result, true);
  return result;
}

// ============================================
// GET CUSTOMER HISTORY
// ============================================
export async function handleGetCustomerHistory(
  input: Record<string, unknown>,
  sessionId: string
): Promise<unknown> {
  const { email } = input as { email: string };
  const history = getCustomerOrderHistory(email);

  const result = history
    ? { found: true, customer_history: history }
    : { found: false, message: `Customer with email ${email} not found` };

  logToolExecution(sessionId, 'get_customer_history', input, result, true);
  return result;
}

// ============================================
// SEND REPLY
// ============================================
export async function handleSendReply(
  input: Record<string, unknown>,
  sessionId: string
): Promise<unknown> {
  const { channel, to, message, subject } = input as {
    channel: 'email' | 'whatsapp' | 'sms' | 'telegram';
    to: string;
    message: string;
    subject?: string;
  };

  let result: unknown;

  switch (channel) {
    case 'email':
      result = await sendEmail({
        to,
        subject: subject || 'CheekyGlo Customer Support',
        body: message,
      });
      break;
    case 'whatsapp':
      result = await sendWhatsApp({ to, message });
      break;
    case 'sms':
      result = await sendSMS({ to, message });
      break;
    case 'telegram':
      // For Telegram, don't actually send - the webhook handles delivery
      // Just record the intended message so webhook can extract it
      result = {
        success: true,
        message_id: `tg_pending_${Date.now().toString(36)}`,
        channel: 'telegram',
        recipient: to,
        sent_at: new Date().toISOString(),
        note: 'Message queued - webhook will deliver',
        intended_message: message,
      };
      break;
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }

  logToolExecution(sessionId, 'send_reply', input, result, true);
  return result;
}

// ============================================
// CREATE TASK
// ============================================
export async function handleCreateTask(
  input: Record<string, unknown>,
  sessionId: string
): Promise<unknown> {
  const { title, owner, description, due_days } = input as {
    title: string;
    owner: 'xixi' | 'allen';
    description?: string;
    due_days?: number;
  };

  const task = createTask({ title, owner, description, due_days });
  const result = { created: true, task };

  logToolExecution(sessionId, 'create_task', input, result, true);
  return result;
}

// ============================================
// CHECK INVENTORY
// ============================================
export async function handleCheckInventory(
  input: Record<string, unknown>,
  sessionId: string
): Promise<unknown> {
  const { sku } = input as { sku: string };
  const stock = checkStock(sku);

  let result: unknown;

  if (!stock) {
    const product = getProductInfo(sku);
    if (product) {
      result = {
        found: true,
        stock: {
          sku: product.sku,
          name: product.name,
          inventory_count: product.inventory_count,
          in_stock: product.in_stock,
          low_stock: product.low_stock,
          reorder_suggested: product.low_stock || !product.in_stock,
        },
      };
    } else {
      result = { found: false, message: `Product with SKU ${sku} not found` };
    }
  } else {
    result = { found: true, stock };
  }

  logToolExecution(sessionId, 'check_inventory', input, result, true);
  return result;
}

// ============================================
// ESCALATE
// ============================================
export async function handleEscalate(
  input: Record<string, unknown>,
  sessionId: string
): Promise<unknown> {
  const { reason, category, context, suggested_owner } = input as {
    reason: string;
    category: string;
    context: string;
    suggested_owner?: 'xixi' | 'allen';
  };

  const owner = suggested_owner || 'xixi';
  const task = createTask({
    title: `[ESCALATION - ${category.toUpperCase()}] ${reason.slice(0, 50)}${reason.length > 50 ? '...' : ''}`,
    owner,
    description: `ESCALATION REASON: ${reason}\n\nCATEGORY: ${category}\n\nCONTEXT:\n${context}`,
    due_days: 0,
  });

  // Log escalation separately
  db.prepare(`
    INSERT INTO agent_actions (session_id, action_type, input, output, success)
    VALUES (?, 'escalation', ?, ?, 1)
  `).run(
    sessionId,
    JSON.stringify({ reason, category, context, suggested_owner }),
    JSON.stringify({ task_id: task.id, acknowledged: true })
  );

  const result = {
    escalated: true,
    escalation_id: `ESC-${Date.now()}`,
    task_id: task.id,
    owner,
    message: `Issue escalated to ${owner}. Task created with ID ${task.id}.`,
  };

  logToolExecution(sessionId, 'escalate', input, result, true);
  return result;
}
