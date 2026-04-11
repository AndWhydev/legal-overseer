import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveChannelIdentity } from "@/lib/conversation/identity-resolver"
import { handleGatewayMessage } from "@/lib/channels/gateway-handler"
import { logger } from "@/lib/core/logger"

/**
 * Process an incoming WhatsApp message through the unified gateway pipeline.
 *
 * Used by the Baileys bridge (baileys-bridge.ts) which has already inserted
 * the message row and resolved orgId. The function resolves channel identity
 * and hands off to handleGatewayMessage.
 *
 * Voice note awareness: if the message metadata indicates voice_note=true,
 * the text has already been transcribed upstream — pass it through as-is.
 */
export async function processWhatsAppMessage(
  supabase: SupabaseClient,
  orgId: string,
  messageRow: Record<string, unknown>,
  text: string
): Promise<void> {
  const phone = (messageRow.sender_email as string | undefined) ?? ""
  const name = (messageRow.sender as string | undefined) ?? phone

  if (!phone) {
    logger.warn("[whatsapp-parser] No phone number found in message row")
    return
  }

  // Resolve identity from sender phone number
  let identity: { userId: string; orgId: string; displayName?: string } | null = null
  try {
    const resolved = await resolveChannelIdentity(supabase, {
      channelType: "whatsapp",
      channelIdentifier: phone,
    })
    if (resolved) {
      identity = {
        userId: resolved.userId,
        orgId: resolved.orgId,
        displayName: resolved.displayName,
      }
    }
  } catch {
    // Non-fatal — fall back to orgId from config
  }

  if (!identity) {
    logger.warn(`[whatsapp-parser] No identity resolved for phone=${phone}, using fallback orgId`)
    identity = {
      userId: "system",
      orgId,
      displayName: name,
    }
  }

  await handleGatewayMessage({
    channel: "whatsapp",
    text,
    identity: {
      userId: identity.userId,
      orgId: identity.orgId,
      displayName: identity.displayName ?? name,
    },
    replyTo: phone,
  })
}
