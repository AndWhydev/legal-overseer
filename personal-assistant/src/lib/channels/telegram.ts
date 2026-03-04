import type { ChannelAdapter } from './types'

/**
 * Send a text message via Telegram Bot API.
 */
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.warn('Telegram: TELEGRAM_BOT_TOKEN not set')
    return false
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.warn(`Telegram send failed (${response.status}):`, body)
      return false
    }

    return true
  } catch (error) {
    console.warn('Telegram send failed:', error)
    return false
  }
}

export const telegramAdapter: ChannelAdapter = {
  type: 'telegram',
  name: 'Telegram',
  description: 'Messaging via Telegram Bot API',
  icon: 'Send',

  async pull() {
    // Telegram is push-based via webhooks. No pull needed.
    return []
  },

  async isAvailable() {
    return Boolean(process.env.TELEGRAM_BOT_TOKEN)
  },
}
