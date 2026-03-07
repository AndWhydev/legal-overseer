import { createClient } from '@supabase/supabase-js'
import { runAgentChat } from '@/lib/agent/engine'
import { sendTelegramMessage } from './telegram'
import { logger } from '@/lib/core/logger';

/**
 * Handle an inbound Telegram message: run it through the agent engine
 * and send the response back to the chat.
 */
export async function handleTelegramMessage(
  orgId: string,
  chatId: string,
  text: string,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    logger.error('Telegram handler: missing Supabase env vars')
    await sendTelegramMessage(chatId, 'Something went wrong, please try again.')
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const events = runAgentChat(text, { orgId, supabase, skipCostGuard: true })

    let responseText = ''
    for await (const event of events) {
      if (event.type === 'message') {
        responseText = event.data
      }
    }

    if (responseText) {
      await sendTelegramMessage(chatId, responseText)
    } else {
      await sendTelegramMessage(chatId, "I processed your message but didn't have a response.")
    }
  } catch (error) {
    logger.error('Telegram handler error:', error)
    await sendTelegramMessage(chatId, 'Something went wrong, please try again.')
  }
}
