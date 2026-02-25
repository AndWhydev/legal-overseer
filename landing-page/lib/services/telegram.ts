// ============================================
// Telegram Bot Service
// ============================================

import db from '../db';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

/**
 * Result from sending a Telegram message
 */
export interface TelegramMessageResult {
  success: boolean;
  message_id: string;
  channel: 'telegram';
  recipient: string;
  sent_at: string;
}

/**
 * Send a message via Telegram Bot API
 */
export async function sendTelegram(
  chatId: string | number,
  text: string
): Promise<TelegramMessageResult> {
  const timestamp = new Date().toISOString();
  const messageId = `tg_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

  // If no token, mock the response (for dev/testing)
  if (!TELEGRAM_BOT_TOKEN) {
    console.log(`[Telegram] MOCK - Would send to ${chatId}:`);
    console.log(`  ${text.slice(0, 100)}${text.length > 100 ? '...' : ''}`);

    const result: TelegramMessageResult = {
      success: true,
      message_id: messageId,
      channel: 'telegram',
      recipient: String(chatId),
      sent_at: timestamp,
    };

    logTelegramAction('send_telegram', { chatId, text }, result);
    return result;
  }

  // Send via Telegram Bot API
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

  // Convert chatId to number if it's a numeric string
  const numericChatId = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;

  // Strip markdown formatting for plain text
  const plainText = text
    .replace(/^##?\s+/gm, '')           // Remove ## headers
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // Remove **bold**
    .replace(/\*([^*]+)\*/g, '$1')      // Remove *italic*
    .replace(/`([^`]+)`/g, '$1')        // Remove `code`
    .replace(/^- /gm, '• ')             // Convert - lists to bullets
    .replace(/^\d+\.\s+/gm, '• ')       // Convert numbered lists
    .trim();

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: numericChatId,
      text: plainText,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    console.error('[Telegram] API Error:', data);
    throw new Error(data.description || 'Telegram API error');
  }

  console.log(`[Telegram] Sent message to ${chatId}: ${text.slice(0, 50)}...`);

  const result: TelegramMessageResult = {
    success: true,
    message_id: String(data.result.message_id),
    channel: 'telegram',
    recipient: String(chatId),
    sent_at: timestamp,
  };

  logTelegramAction('send_telegram', { chatId, text }, result);
  return result;
}

/**
 * Get bot info (useful for testing connection)
 */
export async function getBotInfo(): Promise<{ ok: boolean; username?: string; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.ok) {
    return { ok: false, error: data.description };
  }

  return { ok: true, username: data.result.username };
}

/**
 * Set webhook URL for receiving updates
 */
export async function setWebhook(webhookUrl: string): Promise<{ ok: boolean; error?: string }> {
  if (!TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });

  const data = await response.json();

  if (!data.ok) {
    return { ok: false, error: data.description };
  }

  console.log(`[Telegram] Webhook set to: ${webhookUrl}`);
  return { ok: true };
}

/**
 * Log Telegram action to database
 */
function logTelegramAction(
  actionType: string,
  input: object,
  output: object,
  sessionId: string = 'telegram'
): void {
  db.prepare(`
    INSERT INTO agent_actions (session_id, action_type, input, output, success)
    VALUES (?, ?, ?, ?, 1)
  `).run(sessionId, actionType, JSON.stringify(input), JSON.stringify(output));
}
