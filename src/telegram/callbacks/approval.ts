/**
 * Approval callback handlers
 *
 * Handles approve:{token} and reject:{token} callback queries
 * from approval request inline keyboards.
 */

import { Bot, Context } from 'grammy';
import { approveRequest, rejectRequest } from '../../db/repositories/approvals.js';
import { escapeHtml } from '../notifications.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('ApprovalCallbacks');

function isAuthorizedApprover(userId: string): boolean {
  const authorizedApprovers = process.env.AUTHORIZED_APPROVERS;
  if (!authorizedApprovers) return true; // Allow all if not configured (backwards compat)
  return authorizedApprovers.split(',').map(id => id.trim()).includes(userId);
}

/**
 * Handle approve callback
 */
async function handleApprove(ctx: Context): Promise<void> {
  try {
    // Extract token from callback data (format: approve:{token})
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith('approve:')) {
      await ctx.answerCallbackQuery({ text: 'Invalid callback data' });
      return;
    }

    const token = data.substring('approve:'.length);
    const userId = ctx.from?.id?.toString() ?? 'unknown';
    const username = ctx.from?.username ?? ctx.from?.first_name ?? 'User';

    if (!isAuthorizedApprover(userId)) {
      logger.warn('Unauthorized approval attempt', { userId });
      await ctx.answerCallbackQuery({ text: 'You are not authorized to approve requests.', show_alert: true });
      return;
    }

    // Process approval
    const result = approveRequest(token, userId);

    if (!result.success) {
      await ctx.answerCallbackQuery({
        text: result.error ?? 'Failed to process approval',
        show_alert: true,
      });
      return;
    }

    // Answer callback query to dismiss loading spinner
    await ctx.answerCallbackQuery({ text: '✅ Approved!' });

    // Edit message to show approval status and remove buttons
    try {
      await ctx.editMessageText(
        ctx.callbackQuery?.message?.text +
          `\n\n<b>✅ Approved</b> by @${escapeHtml(username)}`,
        { parse_mode: 'HTML' }
      );
    } catch {
      // If we can't edit (e.g., message too old), just remove the keyboard
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      } catch {
        // Ignore if we can't edit at all
      }
    }

    logger.info('Approval processed', { approvalId: result.approval?.id, approvedBy: userId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Approve callback error', { error: errorMessage });
    await ctx.answerCallbackQuery({
      text: 'An error occurred. Please try again.',
      show_alert: true,
    });
  }
}

/**
 * Handle reject callback
 */
async function handleReject(ctx: Context): Promise<void> {
  try {
    // Extract token from callback data (format: reject:{token})
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith('reject:')) {
      await ctx.answerCallbackQuery({ text: 'Invalid callback data' });
      return;
    }

    const token = data.substring('reject:'.length);
    const userId = ctx.from?.id?.toString() ?? 'unknown';
    const username = ctx.from?.username ?? ctx.from?.first_name ?? 'User';

    if (!isAuthorizedApprover(userId)) {
      logger.warn('Unauthorized rejection attempt', { userId });
      await ctx.answerCallbackQuery({ text: 'You are not authorized to reject requests.', show_alert: true });
      return;
    }

    // Process rejection (no reason for now - could prompt in future)
    const result = rejectRequest(token);

    if (!result.success) {
      await ctx.answerCallbackQuery({
        text: result.error ?? 'Failed to process rejection',
        show_alert: true,
      });
      return;
    }

    // Answer callback query to dismiss loading spinner
    await ctx.answerCallbackQuery({ text: '❌ Rejected' });

    // Edit message to show rejection status and remove buttons
    try {
      await ctx.editMessageText(
        ctx.callbackQuery?.message?.text +
          `\n\n<b>❌ Rejected</b> by @${escapeHtml(username)}`,
        { parse_mode: 'HTML' }
      );
    } catch {
      // If we can't edit (e.g., message too old), just remove the keyboard
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      } catch {
        // Ignore if we can't edit at all
      }
    }

    logger.info('Rejection processed', { approvalId: result.approval?.id });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Reject callback error', { error: errorMessage });
    await ctx.answerCallbackQuery({
      text: 'An error occurred. Please try again.',
      show_alert: true,
    });
  }
}

/**
 * Register approval callback handlers on bot
 *
 * @param bot - grammY bot instance
 */
export function registerApprovalCallbacks(bot: Bot): void {
  // Register approve callback (matches approve:{token})
  bot.callbackQuery(/^approve:/, handleApprove);

  // Register reject callback (matches reject:{token})
  bot.callbackQuery(/^reject:/, handleReject);
}
