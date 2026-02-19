/**
 * ClickUp Webhook Types
 *
 * Type definitions for ClickUp webhook payloads and events.
 */

/**
 * ClickUp webhook event types
 */
export type ClickUpTaskEvent =
  | 'taskCreated'
  | 'taskUpdated'
  | 'taskStatusUpdated'
  | 'taskCommentPosted';

/**
 * History item from a webhook payload - describes a single change
 */
export interface ClickUpHistoryItem {
  id: string;
  type: number;
  date: string;
  field: string;
  parent_id: string;
  before?: ClickUpStatusValue | string | null;
  after?: ClickUpStatusValue | string | null;
}

/**
 * Status value structure in history items
 */
export interface ClickUpStatusValue {
  status: string;
  color: string;
  type: string;
  orderindex: number;
}

/**
 * ClickUp webhook payload structure
 */
export interface ClickUpWebhookPayload {
  event: ClickUpTaskEvent;
  webhook_id: string;
  task_id: string;
  history_items: ClickUpHistoryItem[];
}

/**
 * QA Report structure for Gatekeeper skill output
 */
export interface QAReport {
  /** Quality score from 0-100 */
  score: number;
  /** List of issues found during QA */
  issues: string[];
  /** Recommendation for the task */
  recommendation: 'approve' | 'reject' | 'review';
  /** Optional detailed feedback */
  feedback?: string;
}

/**
 * Recommendation to ClickUp status mapping
 */
export const QA_STATUS_MAP: Record<QAReport['recommendation'], string> = {
  approve: 'approved',
  reject: 'needs revision',
  review: 'pending review',
};
