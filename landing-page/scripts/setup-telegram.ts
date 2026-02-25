#!/usr/bin/env npx ts-node

/**
 * Telegram Bot Setup Script
 *
 * Usage:
 *   npx ts-node scripts/setup-telegram.ts
 *
 * Prerequisites:
 *   1. Create a bot via @BotFather on Telegram
 *   2. Copy the bot token
 *   3. Set TELEGRAM_BOT_TOKEN in .env.local
 *
 * What this script does:
 *   1. Verifies bot token is valid
 *   2. Sets webhook URL to your deployed app
 *   3. Sends a test message (optional)
 */

import 'dotenv/config';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;

async function main() {
  console.log('🤖 BitBit Telegram Setup\n');

  // Check token
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set in environment');
    console.log('\nTo set up:');
    console.log('1. Message @BotFather on Telegram');
    console.log('2. Send /newbot and follow the prompts');
    console.log('3. Copy the token and add to .env.local:');
    console.log('   TELEGRAM_BOT_TOKEN=your_token_here\n');
    process.exit(1);
  }

  // Verify bot
  console.log('📡 Verifying bot token...');
  const meResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
  const meData = await meResponse.json();

  if (!meData.ok) {
    console.error('❌ Invalid bot token:', meData.description);
    process.exit(1);
  }

  console.log(`✅ Bot verified: @${meData.result.username}`);
  console.log(`   Name: ${meData.result.first_name}`);

  // Set webhook
  if (APP_URL) {
    const webhookUrl = `${APP_URL.replace(/\/$/, '')}/api/telegram/webhook`;
    console.log(`\n🔗 Setting webhook to: ${webhookUrl}`);

    const webhookResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      }
    );
    const webhookData = await webhookResponse.json();

    if (webhookData.ok) {
      console.log('✅ Webhook set successfully!');
    } else {
      console.error('❌ Failed to set webhook:', webhookData.description);
    }
  } else {
    console.log('\n⚠️  No APP_URL set - webhook not configured');
    console.log('   Set NEXT_PUBLIC_APP_URL in .env.local for production');
    console.log('   Example: NEXT_PUBLIC_APP_URL=https://your-app.vercel.app');
  }

  // Get current webhook info
  console.log('\n📋 Current webhook info:');
  const infoResponse = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`
  );
  const infoData = await infoResponse.json();

  if (infoData.ok) {
    const info = infoData.result;
    console.log(`   URL: ${info.url || '(not set)'}`);
    console.log(`   Pending updates: ${info.pending_update_count}`);
    if (info.last_error_message) {
      console.log(`   Last error: ${info.last_error_message}`);
    }
  }

  console.log('\n✨ Setup complete!');
  console.log('\nTo test, message your bot on Telegram.');
  console.log('For local development, use ngrok to expose localhost.\n');
}

main().catch(console.error);
