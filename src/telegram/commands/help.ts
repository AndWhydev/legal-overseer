/**
 * /help command handler
 *
 * Shows available commands and usage information.
 */

import { Bot } from 'grammy';

const VERSION = '0.1.0';

/**
 * Register /help command on bot
 */
export function registerHelpCommand(bot: Bot): void {
  bot.command('help', async (ctx) => {
    const message = `<b>BitBit Help</b>

BitBit is your AI operations assistant for CheekyGlo.

<b>Commands:</b>
/status - Check system health and task counts
/tasks - View recent pending tasks
/briefing - Get daily operational briefing
/help - Show this help message

<b>Approvals:</b>
When BitBit needs approval for an action, you'll receive a message with Approve/Reject buttons.

<i>v${VERSION}</i>`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  });
}
