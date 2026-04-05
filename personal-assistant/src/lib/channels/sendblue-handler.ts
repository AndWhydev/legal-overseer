import { createClient } from '@supabase/supabase-js'
import { runAgentChat } from '@/lib/agent/engine'
import { sendSendblueMessage } from './sendblue'
import { logger } from '@/lib/core/logger'

/**
 * Handle an inbound Sendblue iMessage: run it through the agent engine
 * and send the response back via Sendblue.
 */
export async function handleSendblueMessage(
  orgId: string,
  fromNumber: string,
  text: string,
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    logger.error('[sendblue-handler] Missing Supabase env vars')
    await sendSendblueMessage(fromNumber, 'Something went wrong, please try again.')
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
      await sendSendblueMessage(fromNumber, responseText)

      // Store outbound message
      await supabase.from('channel_messages').insert({
        org_id: orgId,
        channel: 'imessage', // TODO: change to 'sendblue' after DB constraint migration
        external_id: `out-${Date.now()}`,
        sender: 'BitBit',
        body: responseText,
        received_at: new Date().toISOString(),
        direction: 'outbound',
        metadata: { to: fromNumber },
      }).then(({ error }) => {
        if (error) logger.warn('[sendblue-handler] Failed to store outbound:', error.message)
      })
    } else {
      await sendSendblueMessage(fromNumber, "I processed your message but didn't have a response.")
    }
  } catch (error) {
    logger.error('[sendblue-handler] Error:', error)
    await sendSendblueMessage(fromNumber, 'Something went wrong, please try again.')
  }
}
