/**
 * Decision trace repository module for BitBit
 *
 * Captures the "why" behind agent decisions for learning and audit.
 * Implements append-only pattern - no UPDATE or DELETE for decision records.
 * Only feedback can be recorded after initial insert.
 */

import { getDatabase } from '../connection.js';
import { redact } from '../../governance/pii-redactor.js';

/**
 * Result of a decision execution
 */
export type DecisionResult = 'success' | 'partial' | 'failure';

/**
 * Human feedback on a decision
 */
export type HumanFeedback = 'approved' | 'overridden' | 'none';

/**
 * Decision trace for logging agent decisions
 */
export interface DecisionTrace {
  /** ID of the task this decision relates to */
  taskId: string;
  /** What triggered this decision (e.g., 'clickup_webhook', 'cron_job', 'telegram_command') */
  trigger: string;
  /** Input data as JSON string */
  inputsJson: string;
  /** Agent's reasoning for the decision */
  reasoning: string;
  /** Other options considered (optional) */
  alternativesConsidered?: string;
  /** The action taken */
  actionTaken: string;
  /** Result of the action (optional, can be updated later) */
  result?: DecisionResult;
  /** Impact data as JSON string (optional) */
  impactJson?: string;
}

/**
 * Stored decision trace record from database
 */
export interface StoredDecisionTrace extends DecisionTrace {
  id: string;
  humanFeedback: HumanFeedback | null;
  overrideReason: string | null;
  retrospectiveNotes: string | null;
  timestamp: string;
}

/**
 * Log a decision trace (append-only)
 *
 * Inserts an immutable decision trace record. The only modification
 * allowed is recording feedback via recordFeedback().
 *
 * @param trace - Decision trace to log
 * @returns The generated trace ID
 */
export function logDecision(trace: DecisionTrace): string {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO decision_traces (
      id, task_id, trigger, inputs_json, reasoning,
      alternatives_considered, action_taken, result, impact_json, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    trace.taskId,
    trace.trigger,
    redact(trace.inputsJson),
    trace.reasoning,
    trace.alternativesConsidered || null,
    trace.actionTaken,
    trace.result || null,
    trace.impactJson || null,
    timestamp
  );

  return id;
}

/**
 * Get all decisions for a specific task
 *
 * @param taskId - Task ID to query
 * @returns Array of decision traces for the task
 */
export function getDecisionsForTask(taskId: string): StoredDecisionTrace[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      `
    SELECT
      id,
      task_id as taskId,
      trigger,
      inputs_json as inputsJson,
      reasoning,
      alternatives_considered as alternativesConsidered,
      action_taken as actionTaken,
      result,
      impact_json as impactJson,
      human_feedback as humanFeedback,
      override_reason as overrideReason,
      retrospective_notes as retrospectiveNotes,
      timestamp
    FROM decision_traces
    WHERE task_id = ?
    ORDER BY timestamp ASC
  `
    )
    .all(taskId) as StoredDecisionTrace[];

  return rows;
}

/**
 * Record human feedback on a decision
 *
 * This is the only UPDATE operation allowed on decision traces.
 * It records whether a human approved, overrode, or took no action.
 *
 * @param traceId - Decision trace ID
 * @param feedback - Human feedback type
 * @param reason - Optional reason for override
 */
export function recordFeedback(
  traceId: string,
  feedback: HumanFeedback,
  reason?: string
): void {
  const db = getDatabase();

  db.prepare(
    `
    UPDATE decision_traces
    SET
      human_feedback = ?,
      override_reason = ?
    WHERE id = ?
  `
  ).run(feedback, reason || null, traceId);
}

/**
 * Update the result of a decision after execution
 *
 * @param traceId - Decision trace ID
 * @param result - Result of the execution
 * @param impactJson - Optional impact data as JSON
 */
export function updateDecisionResult(
  traceId: string,
  result: DecisionResult,
  impactJson?: string
): void {
  const db = getDatabase();

  db.prepare(
    `
    UPDATE decision_traces
    SET
      result = ?,
      impact_json = ?
    WHERE id = ?
  `
  ).run(result, impactJson || null, traceId);
}

/**
 * Get recent decisions for an agent (for anomaly detection)
 *
 * Queries decisions related to tasks created by the specified agent.
 *
 * @param agentId - Agent ID
 * @param limit - Maximum number of decisions to return (default 100)
 * @returns Array of recent decision traces
 */
export function getRecentDecisions(
  agentId: string,
  limit: number = 100
): StoredDecisionTrace[] {
  const db = getDatabase();

  // Join with tasks table to filter by agent
  const rows = db
    .prepare(
      `
    SELECT
      dt.id,
      dt.task_id as taskId,
      dt.trigger,
      dt.inputs_json as inputsJson,
      dt.reasoning,
      dt.alternatives_considered as alternativesConsidered,
      dt.action_taken as actionTaken,
      dt.result,
      dt.impact_json as impactJson,
      dt.human_feedback as humanFeedback,
      dt.override_reason as overrideReason,
      dt.retrospective_notes as retrospectiveNotes,
      dt.timestamp
    FROM decision_traces dt
    JOIN tasks t ON dt.task_id = t.id
    WHERE t.assigned_agent = ?
    ORDER BY dt.timestamp DESC
    LIMIT ?
  `
    )
    .all(agentId, limit) as StoredDecisionTrace[];

  return rows;
}

/**
 * Get a single decision trace by ID
 *
 * @param traceId - Decision trace ID
 * @returns Decision trace or null if not found
 */
export function getDecision(traceId: string): StoredDecisionTrace | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `
    SELECT
      id,
      task_id as taskId,
      trigger,
      inputs_json as inputsJson,
      reasoning,
      alternatives_considered as alternativesConsidered,
      action_taken as actionTaken,
      result,
      impact_json as impactJson,
      human_feedback as humanFeedback,
      override_reason as overrideReason,
      retrospective_notes as retrospectiveNotes,
      timestamp
    FROM decision_traces
    WHERE id = ?
  `
    )
    .get(traceId) as StoredDecisionTrace | undefined;

  return row || null;
}

/**
 * Add retrospective notes to a decision
 *
 * @param traceId - Decision trace ID
 * @param notes - Retrospective notes
 */
export function addRetrospectiveNotes(traceId: string, notes: string): void {
  const db = getDatabase();

  db.prepare(
    `
    UPDATE decision_traces
    SET retrospective_notes = ?
    WHERE id = ?
  `
  ).run(notes, traceId);
}
