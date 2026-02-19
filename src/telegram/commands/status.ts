/**
 * /status command handler
 *
 * Shows system health status, database connection, and task counts.
 */

import { Bot } from 'grammy';
import { getDatabase } from '../../db/index.js';

const VERSION = '0.1.0';
const startTime = Date.now();

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
 * Format uptime in human-readable form
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Check database connection status
 */
function checkDatabase(): boolean {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT 1 as check_val').get() as { check_val: number };
    return result?.check_val === 1;
  } catch {
    return false;
  }
}

/**
 * Get task counts by status
 */
function getTaskCounts(): { pending: number; running: number; completedToday: number } {
  try {
    const db = getDatabase();

    const pending = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'"
    ).get() as { count: number };

    const running = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE status = 'running'"
    ).get() as { count: number };

    // Completed today (since midnight UTC)
    const today = new Date().toISOString().split('T')[0];
    const completedToday = db.prepare(
      "SELECT COUNT(*) as count FROM tasks WHERE status = 'completed' AND completed_at >= ?"
    ).get(today) as { count: number };

    return {
      pending: pending.count,
      running: running.count,
      completedToday: completedToday.count,
    };
  } catch {
    return { pending: 0, running: 0, completedToday: 0 };
  }
}

/**
 * Register /status command on bot
 */
export function registerStatusCommand(bot: Bot): void {
  bot.command('status', async (ctx) => {
    const dbConnected = checkDatabase();
    const uptime = formatUptime(Date.now() - startTime);
    const taskCounts = getTaskCounts();

    const systemStatus = dbConnected ? 'Healthy ✅' : 'Degraded ⚠️';
    const dbStatus = dbConnected ? 'Connected' : 'Error';

    const message = `<b>BitBit Status</b>

<b>System:</b> ${escapeHtml(systemStatus)}
<b>Database:</b> ${escapeHtml(dbStatus)}
<b>Uptime:</b> ${escapeHtml(uptime)}
<b>Version:</b> ${escapeHtml(VERSION)}

<b>Tasks:</b>
• Pending: ${taskCounts.pending}
• Running: ${taskCounts.running}
• Completed today: ${taskCounts.completedToday}`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  });
}
