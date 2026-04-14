import { createClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { UnifiedConversationPipeline } from "@/lib/conversation/unified-pipeline";
import { sendSendblueMessage, sendTypingIndicator } from "./sendblue";
import { sendVoiceMemoBubble } from "./sendblue-voice-memo";
import { sendTelegramMessage } from "./telegram";
import { sendMessage as sendWhatsAppMessage } from "./whatsapp";
import { logger } from "@/lib/core/logger";
import type { Channel, ChannelMetadata } from "@/lib/conversation/types";

export interface GatewayMessageParams {
  channel: Channel;
  text: string;
  identity: { userId: string; orgId: string; email?: string; displayName?: string };
  replyTo: string;
  threadId?: string;
  channelMetadata?: ChannelMetadata;
  contentBlocks?: Anthropic.ContentBlockParam[];
}

/** Split raw response text into individual bubbles for messaging channels. */
export function splitIntoBubbles(responseText: string): string[] {
  let bubbles = responseText
    .split(/\n\n+/)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  bubbles = bubbles.flatMap(bubble => {
    if (bubble.length > 80 && bubble.includes('\n')) {
      return bubble.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    }
    return [bubble];
  });

  if (bubbles.length > 6) {
    const kept = bubbles.slice(0, 5);
    kept.push(bubbles.slice(5).join('\n'));
    bubbles = kept;
  }

  return bubbles;
}

function typingDelayMs(text: string, isFirst: boolean): number {
  const wordCount = text.split(/\s+/).length;
  const base = isFirst ? 200 : 400;
  return Math.min(base + wordCount * 50, isFirst ? 400 : 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const VOICE_REPLY_MAX_WORDS = 30;

export async function handleGatewayMessage(params: GatewayMessageParams): Promise<void> {
  const { channel, text, identity, replyTo, threadId, channelMetadata, contentBlocks } = params;

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
      { content: text, channel, channelMetadata },
      { supabase, identity, threadId, contentBlocks },
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

  const isSendblue = channel === "sendblue" || channel === "sms";
  const wordCount = responseText.split(/\s+/).length;

  if (isSendblue && channelMetadata?.isVoiceNote && wordCount <= VOICE_REPLY_MAX_WORDS) {
    await sendTypingIndicator(replyTo);
    const voiceResult = await sendVoiceMemoBubble(replyTo, responseText);
    if (voiceResult.success) {
      logger.info("[gateway-handler] Voice memo reply sent", { replyTo, wordCount });
      return;
    }
    logger.warn("[gateway-handler] Voice memo failed, falling back to text", { error: voiceResult.error });
  }

  const bubbles = splitIntoBubbles(responseText);

  for (let i = 0; i < bubbles.length; i++) {
    const bubble = bubbles[i];
    const isFirst = i === 0;

    if (isSendblue) {
      await sendTypingIndicator(replyTo);
      await sleep(typingDelayMs(bubble, isFirst));
    }

    await sendChannelReply(channel, replyTo, bubble);

    if (isSendblue && i < bubbles.length - 1) {
      await sleep(300 + Math.random() * 400);
    }
  }
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
  await sendChannelReply(channel, replyTo, "something went wrong on my end, try again in a sec");
}
