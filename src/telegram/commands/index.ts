/**
 * Telegram commands barrel export
 *
 * Provides a single function to register all command handlers.
 */

import { Bot } from 'grammy';
import { registerStatusCommand } from './status.js';
import { registerTasksCommand } from './tasks.js';
import { registerHelpCommand } from './help.js';
import { registerEmergencyCommands } from './emergency.js';
import { registerBriefingCommand } from './briefing.js';

/**
 * Register all command handlers on the bot
 *
 * @param bot - grammY bot instance
 */
export function registerAllCommands(bot: Bot): void {
  registerStatusCommand(bot);
  registerTasksCommand(bot);
  registerBriefingCommand(bot);
  registerHelpCommand(bot);
  registerEmergencyCommands(bot);
}

export { registerStatusCommand } from './status.js';
export { registerTasksCommand } from './tasks.js';
export { registerHelpCommand } from './help.js';
export { registerEmergencyCommands } from './emergency.js';
export { registerBriefingCommand } from './briefing.js';
