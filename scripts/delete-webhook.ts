/**
 * Delete Telegram webhook for BitBit
 *
 * Usage: npm run telegram:delete
 *
 * Environment variables required:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather
 */

import { Bot } from 'grammy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function main(): Promise<void> {
  console.log('BitBit Telegram Webhook Deletion');
  console.log('=================================\n');

  if (!BOT_TOKEN) {
    console.error('❌ Missing TELEGRAM_BOT_TOKEN');
    process.exit(1);
  }

  const bot = new Bot(BOT_TOKEN);

  try {
    // Get current webhook info
    const infoBefore = await bot.api.getWebhookInfo();
    if (!infoBefore.url) {
      console.log('ℹ️  No webhook is currently configured');
      return;
    }

    console.log(`Current webhook: ${infoBefore.url}`);
    console.log('Deleting...');

    // Delete webhook
    await bot.api.deleteWebhook({ drop_pending_updates: true });

    // Verify deletion
    const infoAfter = await bot.api.getWebhookInfo();
    if (infoAfter.url) {
      console.error('❌ Webhook still configured after deletion');
      process.exit(1);
    }

    console.log('\n✅ Webhook deleted successfully!');
    console.log('   Pending updates have been dropped');
    console.log('\nNote: The bot will not receive any updates until you register a new webhook');
    console.log('      or start long polling (not recommended for production)');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Failed to delete webhook: ${errorMessage}`);
    process.exit(1);
  }
}

main();
