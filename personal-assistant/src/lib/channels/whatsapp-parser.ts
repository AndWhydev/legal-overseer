import type { SupabaseClient } from '@supabase/supabase-js'
import { handleIncomingMessage } from '@/lib/whatsapp/conversation-manager'

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
  const phoneNumber = messageRow.sender_email as string // Phone stored in sender_email field

  if (!phoneNumber) {
    console.warn('[whatsapp-parser] No phone number found in message row')
    return
  }

  // Voice note prefix for speech-origin messages
  const metadata = messageRow.metadata as Record<string, unknown> | undefined
  const isVoiceNote = metadata?.voice_note === true
  const processedText = isVoiceNote ? `[Voice note] ${text}` : text

  await handleIncomingMessage(supabase, orgId, phoneNumber, processedText)
}
