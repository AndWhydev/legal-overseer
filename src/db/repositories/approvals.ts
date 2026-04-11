/**
 * Approval repository module for BitBit
 *
 * Provides data access layer for the approvals table.
 * Handles HITL approval request creation and processing.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { getDatabase } from '../connection.js';

/**
 * Approval entity representing a row in the approvals table
 */
export interface Approval {
  id: string;
  task_id: string;
  action_type: string;
  action_summary: string;
  amount: number | null;
  currency: string | null;
  approval_token: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requested_at: string;
  expires_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
}

/**
 * Parameters for creating an approval request
 */
export interface CreateApprovalParams {
  taskId: string;
  actionType: string;
  actionSummary: string;
  amount?: number;
  currency?: string;
}

/**
 * Result of creating an approval request
 */
export interface CreateApprovalResult {
  id: string;
  token: string;
  expiresAt: string;
}

/**
 * Result of processing an approval action
 */
export interface ApprovalActionResult {
  success: boolean;
  approval?: Approval;
  error?: string;
}

/**
 * Generate a secure random token for approval
 * 16 bytes = 32 hex characters (well under 64-byte callback_data limit)
 */
function generateToken(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Calculate expiry time (24 hours from now)
 */
function calculateExpiry(): string {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return expiresAt.toISOString();
}

/**
 * Create a new approval request
 *
 * @param params - Approval request parameters
 * @returns Created approval info with token
 */
export function createApprovalRequest(params: CreateApprovalParams): CreateApprovalResult {
  const db = getDatabase();

  const id = randomUUID();
  const token = generateToken();
  const expiresAt = calculateExpiry();

  db.prepare(`
    INSERT INTO approvals (
      id, task_id, action_type, action_summary, amount, currency,
      approval_token, status, requested_at, expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?)
  `).run(
    id,
    params.taskId,
    params.actionType,
    params.actionSummary,
    params.amount ?? null,
    params.currency ?? null,
    token,
    expiresAt
  );

  return { id, token, expiresAt };
}

/**
 * Get an approval by its token (only if pending and not expired)
 *
 * @param token - Approval token to look up
 * @returns Approval record or null if not found/expired
 */
export function getApprovalByToken(token: string): Approval | null {
  const db = getDatabase();

  const approval = db.prepare(`
    SELECT * FROM approvals
    WHERE approval_token = ?
      AND status = 'pending'
      AND expires_at > datetime('now')
  `).get(token) as Approval | undefined;

  return approval || null;
}

/**
 * Get an approval by its ID
 *
 * @param id - Approval ID to look up
 * @returns Approval record or null if not found
 */
export function getApprovalById(id: string): Approval | null {
  const db = getDatabase();

  const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Approval | undefined;

  return approval || null;
}

/**
 * Approve an approval request
 *
 * @param token - Approval token
 * @param approvedBy - ID of the user who approved (Telegram user ID)
 * @returns Result with success status and updated approval
 */
export function approveRequest(token: string, approvedBy: string): ApprovalActionResult {
  const db = getDatabase();

  // First check if approval exists and is pending
  const approval = getApprovalByToken(token);
  if (!approval) {
    return { success: false, error: 'Approval not found, already processed, or expired' };
  }

  const result = db.prepare(`
    UPDATE approvals
    SET status = 'approved', approved_by = ?, approved_at = datetime('now')
    WHERE approval_token = ? AND status = 'pending'
  `).run(approvedBy, token);

  if (result.changes === 0) {
    return { success: false, error: 'Failed to update approval status' };
  }

  // Fetch updated record
  const updated = db.prepare('SELECT * FROM approvals WHERE approval_token = ?').get(token) as Approval;

  return { success: true, approval: updated };
}

/**
 * Reject an approval request
 *
 * @param token - Approval token
 * @param rejectionReason - Optional reason for rejection
 * @returns Result with success status and updated approval
 */
export function rejectRequest(token: string, rejectionReason?: string): ApprovalActionResult {
  const db = getDatabase();

  // First check if approval exists and is pending
  const approval = getApprovalByToken(token);
  if (!approval) {
    return { success: false, error: 'Approval not found, already processed, or expired' };
  }

  const result = db.prepare(`
    UPDATE approvals
    SET status = 'rejected', rejection_reason = ?, approved_at = datetime('now')
    WHERE approval_token = ? AND status = 'pending'
  `).run(rejectionReason ?? null, token);

  if (result.changes === 0) {
    return { success: false, error: 'Failed to update approval status' };
  }

  // Fetch updated record
  const updated = db.prepare('SELECT * FROM approvals WHERE approval_token = ?').get(token) as Approval;

  return { success: true, approval: updated };
}

/**
 * Expire all pending approvals that have passed their expiry time
 *
 * This should be called periodically by a cleanup job.
 *
 * @returns Number of approvals that were expired
 */
export function expirePendingApprovals(): number {
  const db = getDatabase();

  const result = db.prepare(`
    UPDATE approvals
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < datetime('now')
  `).run();

  return result.changes;
}

/**
 * Get pending approvals for a task
 *
 * @param taskId - Task ID to look up
 * @returns Array of pending approvals
 */
export function getPendingApprovalsByTask(taskId: string): Approval[] {
  const db = getDatabase();

  return db.prepare(`
    SELECT * FROM approvals
    WHERE task_id = ? AND status = 'pending' AND expires_at > datetime('now')
    ORDER BY requested_at DESC
  `).all(taskId) as Approval[];
}
