/**
 * Invoice approval request
 *
 * Sends HITL approval request for an invoice via email.
 */

import {
  sendApprovalRequest,
  isEmailConfigured,
  type SendApprovalResult,
} from '../../../email/notifier.js';
import {
  generateInvoiceApprovalMessage,
  generateActionSummary,
  type InvoiceApprovalData,
} from './message.js';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('OpsOfficer');

/**
 * Request approval for an invoice via email.
 *
 * Creates the approval record in the database and emails the operator
 * with the full invoice context plus an approval token they can quote
 * back via the dashboard or CLI.
 *
 * @param data - Invoice approval data
 * @returns Result with approval ID and token if successful
 */
export async function requestInvoiceApproval(
  data: InvoiceApprovalData,
): Promise<SendApprovalResult & { message?: string }> {
  const htmlBody = generateInvoiceApprovalMessage(data);
  const actionSummary = generateActionSummary(data);

  const result = await sendApprovalRequest({
    taskId: data.invoiceRecordId ?? data.invoice.invoice_number,
    actionType: 'invoice_payment',
    actionSummary,
    amount: data.invoice.total,
    currency: data.invoice.currency,
    htmlBody,
  });

  if (!result.success) {
    logger.error(`Failed to send approval request: ${result.error}`);
    return result;
  }

  logger.info(
    `Approval request ${result.approvalId} emailed for invoice ${data.invoice.invoice_number}`,
  );

  return {
    ...result,
    message: 'Invoice approval request sent',
  };
}

/**
 * Confirm the email channel is configured for approvals.
 *
 * Returns true when ADMIN_EMAIL + SMTP_* are set; logs and returns
 * false otherwise. Callers should bail out (or queue for retry) when
 * this returns false rather than dropping the approval silently.
 */
export function isApprovalChannelReady(): boolean {
  if (!isEmailConfigured()) {
    logger.error(
      'Email channel not configured (need ADMIN_EMAIL, SMTP_HOST, SMTP_USER, SMTP_PASS)',
    );
    return false;
  }
  return true;
}
