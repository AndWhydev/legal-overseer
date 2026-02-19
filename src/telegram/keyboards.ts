/**
 * Telegram inline keyboard builders
 *
 * Creates inline keyboards for interactive messages.
 */

import { InlineKeyboard } from 'grammy';

/**
 * Create an approval keyboard with Approve/Reject buttons
 *
 * @param token - Approval token (32 hex chars)
 * @returns InlineKeyboard with approve/reject buttons
 */
export function createApprovalKeyboard(token: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Approve', `approve:${token}`)
    .text('❌ Reject', `reject:${token}`);
}

/**
 * Create a confirmation keyboard for destructive actions
 *
 * @param actionId - Action identifier
 * @returns InlineKeyboard with confirm/cancel buttons
 */
export function createConfirmKeyboard(actionId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', `confirm:${actionId}`)
    .text('❌ Cancel', `cancel:${actionId}`);
}
