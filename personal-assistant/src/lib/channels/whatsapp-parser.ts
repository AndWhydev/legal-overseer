import type { SupabaseClient } from '@supabase/supabase-js'
import { handleIncomingMessage } from '@/lib/whatsapp/conversation-manager'

/**
 * Process an incoming WhatsApp message through the full conversational pipeline.
 * Routes through: command parser -> conversation manager -> agent dispatch -> response formatter.
 */
export async function processWhatsAppMessage(
  supabase: SupabaseClient,
  orgId: string,
  messageRow: Record<string, unknown>,
  text: string
): Promise<void> {
  const phoneNumber = messageRow.sender_email as string // Phone stored in sender_email field

  if (!phoneNumber) {
    console.warn('[whatsapp-parser] No phone number found in message row')
    return
  }

  await handleIncomingMessage(supabase, orgId, phoneNumber, text)
}
