// ============================================
// Agent Audit Service - Complete audit trail for agent interactions
// ============================================

import db from '../db';

/**
 * Action types that can be logged
 */
export type AuditActionType =
  | 'request'       // Initial request received
  | 'tool_call'     // Individual tool execution
  | 'response'      // Final agent response
  | 'escalation'    // Escalation created
  | 'error';        // Error occurred

/**
 * Entry in the audit log
 */
export interface AuditLogEntry {
  id?: number;
  session_id: string;
  action_type: AuditActionType;
  input: unknown;
  output?: unknown;
  reasoning?: string;
  confidence?: number;
  success: boolean;
  error_message?: string;
  created_at?: string;
}

/**
 * Summary of a complete agent session
 */
export interface SessionSummary {
  session_id: string;
  started_at: string;
  completed_at: string;
  request: {
    message: string;
    channel: string;
    sender_type: string;
  };
  trail: AuditLogEntry[];
  outcome: {
    response: string;
    actions_count: number;
    escalated: boolean;
    confidence: number;
  };
}

/**
 * Log a single audit entry to the database
 * Returns the inserted row ID
 */
export function logAuditEntry(entry: AuditLogEntry): number {
  const stmt = db.prepare(`
    INSERT INTO agent_actions (
      session_id, action_type, input, output, reasoning, confidence, success, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const result = stmt.run(
    entry.session_id,
    entry.action_type,
    JSON.stringify(entry.input),
    entry.output !== undefined ? JSON.stringify(entry.output) : null,
    entry.reasoning ?? null,
    entry.confidence ?? null,
    entry.success ? 1 : 0,
    entry.error_message ?? null
  );

  return result.lastInsertRowid as number;
}

/**
 * Log the initial request for a session
 */
export function logRequest(
  sessionId: string,
  message: string,
  channel: string,
  senderType: string,
  senderEmail?: string,
  senderPhone?: string
): number {
  return logAuditEntry({
    session_id: sessionId,
    action_type: 'request',
    input: {
      message,
      channel,
      sender_type: senderType,
      sender_email: senderEmail,
      sender_phone: senderPhone,
    },
    success: true,
  });
}

/**
 * Log the final response for a session
 */
export function logResponse(
  sessionId: string,
  request: unknown,
  response: unknown,
  reasoning: string,
  confidence: number,
  escalated: boolean
): number {
  return logAuditEntry({
    session_id: sessionId,
    action_type: 'response',
    input: request,
    output: {
      response,
      escalated,
    },
    reasoning,
    confidence,
    success: true,
  });
}

/**
 * Log an escalation event
 */
export function logEscalation(
  sessionId: string,
  reason: string,
  category: string,
  owner: string,
  taskId?: number
): number {
  return logAuditEntry({
    session_id: sessionId,
    action_type: 'escalation',
    input: {
      reason,
      category,
      owner,
    },
    output: {
      task_id: taskId,
      acknowledged: true,
    },
    reasoning: reason,
    success: true,
  });
}

/**
 * Log an error during agent processing
 */
export function logError(
  sessionId: string,
  stage: string,
  error: Error | string,
  context?: unknown
): number {
  const errorMessage = error instanceof Error ? error.message : error;

  return logAuditEntry({
    session_id: sessionId,
    action_type: 'error',
    input: {
      stage,
      context,
    },
    error_message: errorMessage,
    success: false,
  });
}

/**
 * Get the complete audit trail for a session
 */
export function getSessionAuditTrail(sessionId: string): AuditLogEntry[] {
  const rows = db.prepare(`
    SELECT * FROM agent_actions
    WHERE session_id = ?
    ORDER BY created_at ASC
  `).all(sessionId) as Array<{
    id: number;
    session_id: string;
    action_type: string;
    input: string;
    output: string | null;
    reasoning: string | null;
    confidence: number | null;
    success: number;
    error_message: string | null;
    created_at: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    session_id: row.session_id,
    action_type: row.action_type as AuditActionType,
    input: JSON.parse(row.input),
    output: row.output ? JSON.parse(row.output) : undefined,
    reasoning: row.reasoning ?? undefined,
    confidence: row.confidence ?? undefined,
    success: Boolean(row.success),
    error_message: row.error_message ?? undefined,
    created_at: row.created_at,
  }));
}

/**
 * Get a session summary with full trail
 */
export function getSessionSummary(sessionId: string): SessionSummary | null {
  const trail = getSessionAuditTrail(sessionId);

  if (trail.length === 0) {
    return null;
  }

  // Find request entry
  const requestEntry = trail.find(e => e.action_type === 'request');
  // Find response entry
  const responseEntry = trail.find(e => e.action_type === 'response');
  // Count tool calls
  const toolCalls = trail.filter(e => e.action_type === 'tool_call');
  // Check for escalation
  const escalationEntry = trail.find(e => e.action_type === 'escalation');

  // Get timestamps
  const startedAt = trail[0].created_at ?? new Date().toISOString();
  const completedAt = trail[trail.length - 1].created_at ?? new Date().toISOString();

  // Extract request info
  const requestInput = requestEntry?.input as {
    message?: string;
    channel?: string;
    sender_type?: string;
  } | undefined;

  // Extract response info
  const responseOutput = responseEntry?.output as {
    response?: { message?: string };
    escalated?: boolean;
  } | undefined;

  return {
    session_id: sessionId,
    started_at: startedAt,
    completed_at: completedAt,
    request: {
      message: requestInput?.message ?? 'Unknown',
      channel: requestInput?.channel ?? 'unknown',
      sender_type: requestInput?.sender_type ?? 'unknown',
    },
    trail,
    outcome: {
      response: responseOutput?.response?.message ?? responseEntry?.reasoning ?? 'No response',
      actions_count: toolCalls.length,
      escalated: Boolean(escalationEntry) || Boolean(responseOutput?.escalated),
      confidence: responseEntry?.confidence ?? 0,
    },
  };
}

/**
 * Query options for recent agent activity
 */
export interface ActivityQueryOptions {
  limit?: number;
  offset?: number;
  action_type?: AuditActionType;
  success_only?: boolean;
}

/**
 * Get recent agent activity for dashboard
 */
export function getRecentAgentActivity(options: ActivityQueryOptions = {}): AuditLogEntry[] {
  const { limit = 50, offset = 0, action_type, success_only } = options;

  let query = 'SELECT * FROM agent_actions WHERE 1=1';
  const params: unknown[] = [];

  if (action_type) {
    query += ' AND action_type = ?';
    params.push(action_type);
  }

  if (success_only) {
    query += ' AND success = 1';
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = db.prepare(query).all(...params) as Array<{
    id: number;
    session_id: string;
    action_type: string;
    input: string;
    output: string | null;
    reasoning: string | null;
    confidence: number | null;
    success: number;
    error_message: string | null;
    created_at: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    session_id: row.session_id,
    action_type: row.action_type as AuditActionType,
    input: JSON.parse(row.input),
    output: row.output ? JSON.parse(row.output) : undefined,
    reasoning: row.reasoning ?? undefined,
    confidence: row.confidence ?? undefined,
    success: Boolean(row.success),
    error_message: row.error_message ?? undefined,
    created_at: row.created_at,
  }));
}

/**
 * Get unique session IDs with recent activity
 */
export function getRecentSessions(limit: number = 20): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT session_id
    FROM agent_actions
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as Array<{ session_id: string }>;

  return rows.map(r => r.session_id);
}

/**
 * Count total agent actions by type
 */
export function getActionCounts(): Record<AuditActionType, number> {
  const rows = db.prepare(`
    SELECT action_type, COUNT(*) as count
    FROM agent_actions
    GROUP BY action_type
  `).all() as Array<{ action_type: string; count: number }>;

  const counts: Record<string, number> = {
    request: 0,
    tool_call: 0,
    response: 0,
    escalation: 0,
    error: 0,
  };

  for (const row of rows) {
    counts[row.action_type] = row.count;
  }

  return counts as Record<AuditActionType, number>;
}
