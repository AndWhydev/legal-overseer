/**
 * Audit logging repository module for BitBit
 *
 * Provides append-only audit logging for all agent actions.
 * This module enforces immutability - no UPDATE or DELETE operations.
 */

import { getDatabase } from '../connection.js';

/**
 * Risk levels for audit entries
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Audit entry for logging agent actions
 */
export interface AuditEntry {
  /** ID of the agent performing the action */
  agentId: string;
  /** Type of action performed (e.g., 'task_started', 'task_completed') */
  actionType: string;
  /** Detailed description of the action */
  actionDetail: string;
  /** Risk level of the action */
  riskLevel: RiskLevel;
  /** Optional hash of input data */
  inputHash?: string;
  /** Optional hash of output data */
  outputHash?: string;
  /** Optional associated task ID */
  taskId?: string;
  /** Optional user ID who triggered the action */
  userId?: string;
  /** Optional session ID */
  sessionId?: string;
}

/**
 * Log an audit event (append-only)
 *
 * Inserts an immutable audit log entry. This function only supports
 * INSERT operations - no UPDATE or DELETE is provided by design.
 *
 * @param entry - Audit entry to log
 * @returns The generated audit log ID
 */
export function logAuditEvent(entry: AuditEntry): string {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO audit_logs (
      id, agent_id, task_id, action_type, action_detail,
      risk_level, input_hash, output_hash, user_id, session_id, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    entry.agentId,
    entry.taskId || null,
    entry.actionType,
    entry.actionDetail,
    entry.riskLevel,
    entry.inputHash || null,
    entry.outputHash || null,
    entry.userId || null,
    entry.sessionId || null,
    timestamp
  );

  return id;
}
