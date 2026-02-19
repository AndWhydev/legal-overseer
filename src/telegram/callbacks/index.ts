/**
 * Telegram callback handlers barrel export
 *
 * Provides a single function to register all callback query handlers.
 */

import { Bot } from 'grammy';
import { registerApprovalCallbacks } from './approval.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('TelegramCallbacks');

/**
 * Register all callback query handlers on the bot
 *
 * Note: The catch-all handler should be registered LAST to handle
 * unknown callbacks gracefully.
 *
 * @param bot - grammY bot instance
 */
export function registerAllCallbacks(bot: Bot): void {
  // Register specific callback handlers first
  registerApprovalCallbacks(bot);

  // Catch-all handler for unknown callbacks (must be last)
  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;
    logger.warn(`Unknown callback query: ${data}`);
    await ctx.answerCallbackQuery({
      text: 'Unknown action. This button may have expired.',
      show_alert: true,
    });
  });
}

export { registerApprovalCallbacks } from './approval.js';
