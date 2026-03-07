import type { SupabaseClient } from '@supabase/supabase-js'
import { routeIncomingConversation } from '@/lib/conversation/interface'
import { whatsappConversationAdapter } from '@/lib/conversation/whatsapp-adapter'
import { handleIncomingMessage } from '@/lib/whatsapp/conversation-manager'
import { logger } from '@/lib/core/logger';

/**
 * Process an incoming WhatsApp message through the full conversational pipeline.
 * Routes through: command parser -> conversation manager -> agent dispatch -> response formatter.
 *
 * Voice note awareness: if the message metadata indicates voice_note=true,
 * prepends "[Voice note] " to help the command parser understand the input
 * is from speech (more casual, may need more lenient parsing).
 */
export async function processWhatsAppMessage(
  supabase: SupabaseClient,
  orgId: string,
  messageRow: Record<string, unknown>,
  text: string
): Promise<void> {
  await routeIncomingConversation(
    whatsappConversationAdapter,
    { orgId, messageRow, text },
    async (request) => {
      await handleIncomingMessage(supabase, request.orgId, request.participantId, request.text)
    },
    () => {
      logger.warn('[whatsapp-parser] No phone number found in message row')
    }
  )
}
