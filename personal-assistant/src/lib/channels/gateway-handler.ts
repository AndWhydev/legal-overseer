import { createClient } from "@supabase/supabase-js";
import { UnifiedConversationPipeline } from "@/lib/conversation/unified-pipeline";
import { sendSendblueMessage } from "./sendblue";
import { sendTelegramMessage } from "./telegram";
import { sendMessage as sendWhatsAppMessage } from "./whatsapp";
import { logger } from "@/lib/core/logger";
import type { Channel } from "@/lib/conversation/types";

export interface GatewayMessageParams {
  /** Channel the message arrived on */
  channel: Channel;
  /** The raw text content sent by the user */
  text: string;
  /** Pre-resolved identity (userId + orgId) */
  identity: { userId: string; orgId: string; email?: string; displayName?: string };
  /** Channel-specific address to send the reply to (phone number, chat ID, etc.) */
  replyTo: string;
  /** Optional thread to continue */
  threadId?: string;
}

/**
 * Shared gateway response handler for all messaging webhooks.
 *
 * Runs the inbound message through UnifiedConversationPipeline and
 * sends the response back via the channel-specific send function.
 */
export async function handleGatewayMessage(params: GatewayMessageParams): Promise<void> {
  const { channel, text, identity, replyTo, threadId } = params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    logger.error("[gateway-handler] Missing Supabase env vars");
    await sendErrorReply(channel, replyTo);
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const pipeline = new UnifiedConversationPipeline(supabase);

  let responseText = "";

  try {
    const events = pipeline.handleMessage(
      { content: text, channel },
      {
        supabase,
        identity,
        threadId,
      },
    );

    for await (const event of events) {
      if (event.type === "message") {
        responseText = event.data as string;
      }
    }
  } catch (err) {
    logger.error("[gateway-handler] Pipeline error", { channel, err });
    await sendErrorReply(channel, replyTo);
    return;
  }

  if (!responseText) {
    logger.warn("[gateway-handler] Pipeline returned no message text", { channel, replyTo });
    return;
  }

  await sendChannelReply(channel, replyTo, responseText);
}

async function sendChannelReply(channel: Channel, replyTo: string, text: string): Promise<void> {
  try {
    switch (channel) {
      case "sendblue":
      case "sms":
        await sendSendblueMessage(replyTo, text);
        break;

      case "telegram":
        await sendTelegramMessage(replyTo, text);
        break;

      case "whatsapp":
        await sendWhatsAppMessage(replyTo, text);
        break;

      default:
        logger.warn("[gateway-handler] No send function for channel", { channel });
    }
  } catch (err) {
    logger.error("[gateway-handler] Send failed", { channel, err });
  }
}

async function sendErrorReply(channel: Channel, replyTo: string): Promise<void> {
  const message = "something went wrong on my end, try again in a sec";
  await sendChannelReply(channel, replyTo, message);
}
