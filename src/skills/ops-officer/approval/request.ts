/**
 * Invoice approval request
 *
 * Sends HITL approval request for invoice via Telegram.
 */

import { sendApprovalRequest, type SendApprovalResult } from '../../../telegram/notifications.js';
import { generateInvoiceApprovalMessage, generateActionSummary, type InvoiceApprovalData } from './message.js';
import { createSafeLogger } from '../../../governance/index.js';

const logger = createSafeLogger('OpsOfficer');

/**
 * Request approval for an invoice via Telegram
 *
 * Creates approval record in database and sends formatted message
 * with approve/reject buttons to the specified chat.
 *
 * @param chatId - Telegram chat ID (usually from TELEGRAM_CHAT_ID env)
 * @param data - Invoice approval data
 * @returns Result with approval ID and message ID if successful
 */
export async function requestInvoiceApproval(
  chatId: number,
  data: InvoiceApprovalData
): Promise<SendApprovalResult & { message?: string }> {
  // Generate formatted message
  const message = generateInvoiceApprovalMessage(data);

  // Generate action summary for approval record
  const actionSummary = generateActionSummary(data);

  // Use existing approval infrastructure
  const result = await sendApprovalRequest({
    chatId,
    taskId: data.invoiceRecordId ?? data.invoice.invoice_number,
    actionType: 'invoice_payment',
    actionSummary,
    amount: data.invoice.total,
    currency: data.invoice.currency
  });

  if (!result.success) {
    logger.error(`Failed to send approval request: ${result.error}`);
    return result;
  }

  logger.info(`Approval request ${result.approvalId} sent for invoice ${data.invoice.invoice_number}`);

  return {
    ...result,
    message: 'Invoice approval request sent'
  };
}

/**
 * Get chat ID from environment
 */
export function getApprovalChatId(): number | null {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) {
    logger.error('TELEGRAM_CHAT_ID not configured');
    return null;
  }
  return parseInt(chatId, 10);
}
