/**
 * BitBit Telegram Bot Module
 *
 * Initializes grammY bot instance for webhook-based operation.
 * Does NOT use long polling - relies on webhook handler.
 */

import { Bot } from 'grammy';
import { registerAllCommands } from './commands/index.js';
import { registerAllCallbacks } from './callbacks/index.js';
import { createSafeLogger } from '../governance/index.js';

const logger = createSafeLogger('TelegramBot');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * grammY bot instance.
 * May be undefined if TELEGRAM_BOT_TOKEN is not set.
 */
export const bot: Bot | undefined = BOT_TOKEN ? new Bot(BOT_TOKEN) : undefined;

/**
 * Track initialization state
 */
let botInitialized = false;

/**
 * Initialize the bot (fetches bot info from Telegram API).
 * Must be called before handling webhooks.
 * Safe to call multiple times - only initializes once.
 */
export async function initBot(): Promise<boolean> {
  if (!bot) {
    logger.warn('TELEGRAM_BOT_TOKEN not set - Telegram integration disabled');
    return false;
  }

  if (botInitialized) {
    return true;
  }

  try {
    // This fetches bot info from Telegram API
    await bot.init();
    botInitialized = true;
    logger.info(`Telegram bot connected: @${bot.botInfo.username}`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to initialize Telegram bot: ${errorMessage}`);
    return false;
  }
}

/**
 * Check if bot is initialized and ready
 */
export function isBotReady(): boolean {
  return bot !== undefined && botInitialized;
}

if (bot) {
  // Error handling middleware - logs errors without exposing sensitive data
  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error(`Telegram bot error: Update ID: ${ctx.update.update_id}, Error: ${err.error}`);
  });

  // /start command - welcome message
  bot.command('start', async (ctx) => {
    await ctx.reply(
      '<b>🤖 BitBit</b> - Enterprise Agentic AI System\n\n' +
        'I am the AI assistant for CheekyGlo operations.\n\n' +
        'Use /help to see available commands.',
      { parse_mode: 'HTML' }
    );
  });

  // Register all command handlers
  registerAllCommands(bot);

  // Register all callback query handlers (must be after commands)
  registerAllCallbacks(bot);
}
