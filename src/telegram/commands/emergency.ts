/**
 * Emergency stop and resume commands for BitBit
 *
 * CRITICAL commands - only admin can use.
 * All attempts are logged to audit.
 */

import { Bot, Context } from 'grammy';
import {
  emergencyStop,
  enableAgent,
  getControlPlaneStatus,
} from '../../governance/control-plane.js';
import { logAuditSafe, createSafeLogger } from '../../governance/logger.js';

const logger = createSafeLogger('EmergencyCommands');

/**
 * Admin chat ID from environment
 */
const ADMIN_CHAT_ID = parseInt(process.env.TELEGRAM_ADMIN_CHAT_ID || '0', 10);

/**
 * Verify sender is admin
 */
function isAdmin(ctx: Context): boolean {
  const chatId = ctx.chat?.id;
  if (!chatId) return false;
  return chatId === ADMIN_CHAT_ID;
}

/**
 * Handle /emergency_stop command
 *
 * Usage:
 * /emergency_stop - Global stop (all agents)
 * /emergency_stop agent-id - Stop specific agent
 */
async function handleEmergencyStop(ctx: Context): Promise<void> {
  const userId = ctx.from?.id?.toString() || 'unknown';
  const chatId = ctx.chat?.id;

  // Log attempt
  await logAuditSafe({
    agentId: 'system',
    actionType: 'emergency_stop_attempt',
    actionDetail: `Emergency stop attempted by user ${userId} from chat ${chatId}`,
    riskLevel: 'critical',
    userId,
  });

  // Verify admin
  if (!isAdmin(ctx)) {
    logger.warn('Unauthorized emergency stop attempt', { userId, chatId });
    await ctx.reply('⛔ Unauthorized: Only admin can use emergency stop');
    return;
  }

  // Parse optional agent ID from command
  const text = ctx.message?.text || '';
  const parts = text.split(' ').filter((p) => p);
  const agentId = parts[1]; // /emergency_stop [agentId]

  // Execute emergency stop
  try {
    const reason = `Manual emergency stop via Telegram by user ${userId}`;
    await emergencyStop(reason, agentId);

    const message = agentId
      ? `🛑 <b>Emergency Stop: Agent ${agentId}</b>\n\nAgent has been disabled.\nUse /resume ${agentId} to re-enable.`
      : `🛑 <b>Global Emergency Stop</b>\n\nAll agents have been disabled.\nUse /resume all to re-enable.`;

    await ctx.reply(message, { parse_mode: 'HTML' });

    logger.info('Emergency stop executed', { userId, agentId: agentId || 'global' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Emergency stop failed', { error: errorMessage });
    await ctx.reply(`❌ Emergency stop failed: ${errorMessage}`);
  }
}

/**
 * Handle /resume command
 *
 * Usage:
 * /resume all - Resume all (disable global kill switch)
 * /resume agent-id - Resume specific agent
 */
async function handleResume(ctx: Context): Promise<void> {
  const userId = ctx.from?.id?.toString() || 'unknown';
  const chatId = ctx.chat?.id;

  // Log attempt
  await logAuditSafe({
    agentId: 'system',
    actionType: 'resume_attempt',
    actionDetail: `Resume attempted by user ${userId} from chat ${chatId}`,
    riskLevel: 'high',
    userId,
  });

  // Verify admin
  if (!isAdmin(ctx)) {
    logger.warn('Unauthorized resume attempt', { userId, chatId });
    await ctx.reply('⛔ Unauthorized: Only admin can use resume');
    return;
  }

  // Parse agent ID from command
  const text = ctx.message?.text || '';
  const parts = text.split(' ').filter((p) => p);
  const target = parts[1]; // /resume [all|agentId]

  if (!target) {
    await ctx.reply(
      '⚠️ <b>Usage:</b>\n/resume all - Resume all agents\n/resume &lt;agent-id&gt; - Resume specific agent',
      { parse_mode: 'HTML' }
    );
    return;
  }

  // Execute resume
  try {
    await enableAgent(target);

    const message =
      target === 'all'
        ? `✅ <b>Global Resume</b>\n\nAll agents have been re-enabled.`
        : `✅ <b>Agent Resumed: ${target}</b>\n\nAgent has been re-enabled.`;

    await ctx.reply(message, { parse_mode: 'HTML' });

    logger.info('Resume executed', { userId, target });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Resume failed', { error: errorMessage });
    await ctx.reply(`❌ Resume failed: ${errorMessage}`);
  }
}

/**
 * Handle /control_status command
 *
 * Shows current control plane status
 */
async function handleControlStatus(ctx: Context): Promise<void> {
  // Verify admin
  if (!isAdmin(ctx)) {
    await ctx.reply('⛔ Unauthorized: Only admin can view control status');
    return;
  }

  const status = getControlPlaneStatus();

  let message = '🎛️ <b>Control Plane Status</b>\n\n';
  message += `<b>Global Kill Switch:</b> ${status.globalKillSwitch ? '🔴 ACTIVE' : '🟢 Inactive'}\n`;
  message += `<b>Disabled Agents:</b> ${status.disabledAgents.length > 0 ? status.disabledAgents.join(', ') : 'None'}\n`;

  if (status.lastEmergencyStop) {
    message += `\n<b>Last Emergency Stop:</b>\n`;
    message += `${status.lastEmergencyStop}\n`;
    message += `Reason: ${status.lastEmergencyReason || 'Unknown'}`;
  }

  const uptimeHours = Math.floor(status.uptimeMs / (1000 * 60 * 60));
  const uptimeMinutes = Math.floor((status.uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
  message += `\n\n<b>Uptime:</b> ${uptimeHours}h ${uptimeMinutes}m`;

  await ctx.reply(message, { parse_mode: 'HTML' });
}

/**
 * Register emergency commands on the bot
 *
 * @param bot - grammY bot instance
 */
export function registerEmergencyCommands(bot: Bot): void {
  bot.command('emergency_stop', handleEmergencyStop);
  bot.command('resume', handleResume);
  bot.command('control_status', handleControlStatus);
}

export { handleEmergencyStop, handleResume, handleControlStatus };
