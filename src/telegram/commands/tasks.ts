/**
 * /tasks command handler
 *
 * Shows recent pending and running tasks with status.
 */

import { Bot } from 'grammy';
import { getRecentTasks, Task } from '../../db/repositories/tasks.js';
import { createSafeLogger } from '../../governance/index.js';

const logger = createSafeLogger('TelegramCommands');

/**
 * Escape HTML special characters for Telegram HTML parse mode
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Get status emoji for task status
 */
function getStatusEmoji(status: Task['status']): string {
  switch (status) {
    case 'pending':
      return '🟡';
    case 'running':
      return '🔵';
    case 'awaiting_approval':
      return '⏳';
    case 'completed':
      return '✅';
    case 'failed':
      return '❌';
    case 'cancelled':
      return '⚪';
    default:
      return '❓';
  }
}

/**
 * Format time ago in human-readable form
 */
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) {
    return `${diffDay}d ago`;
  }
  if (diffHour > 0) {
    return `${diffHour}h ago`;
  }
  if (diffMin > 0) {
    return `${diffMin}m ago`;
  }
  return 'just now';
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Register /tasks command on bot
 */
export function registerTasksCommand(bot: Bot): void {
  bot.command('tasks', async (ctx) => {
    try {
      const tasks = getRecentTasks(5);

      if (tasks.length === 0) {
        await ctx.reply(
          '<b>Recent Tasks</b>\n\nNo pending tasks. The queue is clear! 🎉',
          { parse_mode: 'HTML' }
        );
        return;
      }

      const taskLines = tasks.map((task, index) => {
        const emoji = getStatusEmoji(task.status);
        const taskId = truncate(task.id, 8);
        const skillName = escapeHtml(task.skill_id);
        const timeAgo = formatTimeAgo(task.created_at);

        return `${index + 1}. ${emoji} <code>${taskId}</code> - ${skillName} - ${timeAgo}`;
      });

      const message = `<b>Recent Tasks</b>

${taskLines.join('\n')}

Use /status for system overview`;

      await ctx.reply(message, { parse_mode: 'HTML' });
    } catch (error) {
      logger.error('/tasks command error', error);
      await ctx.reply('Failed to fetch tasks. Please try again later.');
    }
  });
}
