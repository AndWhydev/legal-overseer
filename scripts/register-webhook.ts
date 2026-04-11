/**
 * Register Telegram webhook for BitBit
 *
 * Usage: npm run telegram:register
 *
 * Environment variables required:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather
 * - TELEGRAM_WEBHOOK_SECRET: Secret for webhook verification
 * - WEBHOOK_URL: Public URL (e.g., https://bitbit-cheekyglo.fly.dev)
 */

import { Bot } from 'grammy';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

async function main(): Promise<void> {
  console.log('BitBit Telegram Webhook Registration');
  console.log('=====================================\n');

  // Validate environment variables
  if (!BOT_TOKEN) {
    console.error('❌ Missing TELEGRAM_BOT_TOKEN');
    console.error('   Get one from @BotFather on Telegram');
    process.exit(1);
  }

  if (!WEBHOOK_URL) {
    console.error('❌ Missing WEBHOOK_URL');
    console.error('   Example: https://bitbit-cheekyglo.fly.dev');
    process.exit(1);
  }

  if (!WEBHOOK_SECRET) {
    console.error('❌ Missing TELEGRAM_WEBHOOK_SECRET');
    console.error('   Generate one: openssl rand -hex 32');
    process.exit(1);
  }

  const bot = new Bot(BOT_TOKEN);
  const webhookUrl = `${WEBHOOK_URL}/telegram/webhook`;

  console.log('Registering webhook...');
  console.log(`  URL: ${webhookUrl}`);
  console.log(`  Secret: ${WEBHOOK_SECRET.substring(0, 8)}...`);
  console.log('');

  try {
    // Delete any existing webhook first
    await bot.api.deleteWebhook({ drop_pending_updates: true });
    console.log('✓ Cleared existing webhook');

    // Set new webhook
    await bot.api.setWebhook(webhookUrl, {
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: true,
    });
    console.log('✓ Webhook registered');

    // Verify webhook
    const info = await bot.api.getWebhookInfo();
    console.log('\nWebhook Info:');
    console.log(`  URL: ${info.url}`);
    console.log(`  Has custom certificate: ${info.has_custom_certificate}`);
    console.log(`  Pending update count: ${info.pending_update_count}`);
    console.log(`  Allowed updates: ${info.allowed_updates?.join(', ') ?? 'all'}`);

    if (info.last_error_date) {
      const lastError = new Date(info.last_error_date * 1000);
      console.log(`  Last error: ${info.last_error_message} (${lastError.toISOString()})`);
    }

    // Get bot info
    const me = await bot.api.getMe();
    console.log('\nBot Info:');
    console.log(`  Username: @${me.username}`);
    console.log(`  Name: ${me.first_name}`);
    console.log(`  Bot ID: ${me.id}`);

    // Register bot commands in Telegram's menu
    console.log('\nRegistering bot commands...');
    await bot.api.setMyCommands([
      { command: 'start', description: 'Start the bot and show welcome message' },
      { command: 'help', description: 'Show available commands' },
      { command: 'status', description: 'Show system status and health' },
      { command: 'tasks', description: 'List pending tasks' },
      { command: 'briefing', description: 'Generate operational briefing' },
      { command: 'stopall', description: 'Emergency stop - halt all processing' },
      { command: 'resume', description: 'Resume processing after emergency stop' },
    ]);
    console.log('✓ Bot commands registered in Telegram menu');

    console.log('\n✅ Webhook registration complete!');
    console.log('\nNext steps:');
    console.log('  1. Ensure your server is running at the webhook URL');
    console.log('  2. Set TELEGRAM_WEBHOOK_SECRET on your server');
    console.log('  3. Message your bot to test: /start or /help');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Failed to register webhook: ${errorMessage}`);
    process.exit(1);
  }
}

main();
