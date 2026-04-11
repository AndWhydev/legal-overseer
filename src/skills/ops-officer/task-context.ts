/**
 * Ops Officer task context
 *
 * Handles invoice processing workflow triggered by Gmail emails.
 * Tracks the state of an invoice through the processing pipeline.
 */

import type { Invoice, InvoiceProcessingResult } from './types.js';

/**
 * Context for tracking an invoice through the processing pipeline
 */
export interface OpsOfficerTaskContext {
  /** Gmail message ID for the source email */
  emailId: string;
  /** Email subject line */
  emailSubject: string;
  /** Sender's email address */
  senderEmail: string;
  /** Path to downloaded attachment (PDF/image) */
  attachmentPath?: string;
  /** Extracted invoice data from Claude Vision */
  invoice?: Invoice;
  /** Final processing result */
  processingResult?: InvoiceProcessingResult;
}

/**
 * Create initial task context from an incoming email
 *
 * @param emailId - Gmail message ID
 * @param emailSubject - Email subject line
 * @param senderEmail - Sender's email address
 * @returns Initial task context ready for processing
 *
 * @example
 * ```typescript
 * const ctx = createTaskContext(
 *   'msg-abc123',
 *   'Invoice #1234 from Acme Supplies',
 *   'billing@acme.com'
 * );
 * ```
 */
export function createTaskContext(
  emailId: string,
  emailSubject: string,
  senderEmail: string
): OpsOfficerTaskContext {
  return {
    emailId,
    emailSubject,
    senderEmail
  };
}

/**
 * Update task context with attachment path after download
 *
 * @param ctx - Current task context
 * @param attachmentPath - Path to downloaded attachment
 * @returns Updated task context
 */
export function withAttachment(
  ctx: OpsOfficerTaskContext,
  attachmentPath: string
): OpsOfficerTaskContext {
  return {
    ...ctx,
    attachmentPath
  };
}

/**
 * Update task context with extracted invoice data
 *
 * @param ctx - Current task context
 * @param invoice - Extracted invoice data
 * @returns Updated task context
 */
export function withInvoice(
  ctx: OpsOfficerTaskContext,
  invoice: Invoice
): OpsOfficerTaskContext {
  return {
    ...ctx,
    invoice
  };
}

/**
 * Finalize task context with processing result
 *
 * @param ctx - Current task context
 * @param result - Final processing result
 * @returns Completed task context
 */
export function withResult(
  ctx: OpsOfficerTaskContext,
  result: InvoiceProcessingResult
): OpsOfficerTaskContext {
  return {
    ...ctx,
    processingResult: result
  };
}
