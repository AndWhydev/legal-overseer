import { NextRequest, NextResponse } from 'next/server';
import { createAgent } from '@/lib/bitbit';
import { sendTelegram } from '@/lib/services/telegram';

// Telegram update types
interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

// Create agent once at startup
const agentPromise = createAgent({
  tools: 'config/tools.yaml',
  policies: '.planning/CLIENT-PACK.md',
});

/**
 * POST /api/telegram/webhook
 *
 * Receives Telegram bot updates and processes them through BitBit.
 */
export async function POST(request: NextRequest) {
  try {
    const update: TelegramUpdate = await request.json();

    // Only process text messages
    if (!update.message?.text) {
      return NextResponse.json({ ok: true });
    }

    const message = update.message!;
    const chatId = message.chat.id;
    const text = message.text!;
    const user = message.from;

    console.log(`[Telegram] Message from ${user.first_name} (${chatId}): ${text}`);

    // Skip commands for now (could add /start, /help handlers)
    if (text.startsWith('/')) {
      if (text === '/start') {
        await sendTelegram(chatId, 'Hi! I\'m BitBit, your CheekyGlo support assistant. How can I help you today?');
      }
      return NextResponse.json({ ok: true });
    }

    // Process through BitBit agent
    const agent = await agentPromise;
    const result = await agent.handle({
      message: text as string,
      channel: 'telegram',
      sender: {
        type: 'customer',
        name: `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`,
        telegramId: user.id,
      },
    });

    // Extract the customer-facing message
    // Priority: 1) Message from send_reply action, 2) Clean extract from response
    let replyText = '';

    // Check if agent tried to send a reply - use that message
    const sendReplyAction = result.actions_taken.find(
      (a) => a.type === 'send_reply' && a.params.channel === 'telegram'
    );
    if (sendReplyAction?.params.message) {
      replyText = String(sendReplyAction.params.message);
    } else {
      // Extract clean response - skip the ## Summary / ## Actions / ## Confidence sections
      const lines = result.message.split('\n');
      const cleanLines: string[] = [];
      let skipSection = false;

      for (const line of lines) {
        // Skip markdown section headers and their content
        if (line.match(/^##\s+(Summary|Actions|Confidence|Needs)/i)) {
          skipSection = true;
          continue;
        }
        if (line.startsWith('## ')) {
          skipSection = false;
        }
        if (!skipSection && line.trim() && !line.startsWith('**') && !line.startsWith('- **')) {
          cleanLines.push(line);
        }
      }

      replyText = cleanLines.join('\n').trim() || 'Hi! How can I help you today?';
    }

    // Send the response back via Telegram
    try {
      await sendTelegram(chatId, replyText);
      console.log(`[Telegram] Reply sent to ${chatId}`);
    } catch (sendError) {
      // Log but don't fail - chatId might be invalid in testing
      console.error(`[Telegram] Failed to send to ${chatId}:`, sendError);
      return NextResponse.json({
        ok: true,
        note: 'Agent processed successfully but Telegram send failed',
        would_send: replyText.slice(0, 200),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error:', error);
    // Return 200 to prevent Telegram from retrying
    return NextResponse.json({ ok: true, error: 'Processing failed' });
  }
}

/**
 * GET /api/telegram/webhook
 *
 * Health check endpoint for the webhook.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'BitBit Telegram Webhook',
    timestamp: new Date().toISOString(),
  });
}
