import { createClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { UnifiedConversationPipeline } from "@/lib/conversation/unified-pipeline";
import { sendSendblueMessage, sendTypingIndicator } from "./sendblue";
import { sendVoiceMemoBubble } from "./sendblue-voice-memo";
import { sendTelegramMessage } from "./telegram";
import { sendTelnyxWhatsApp } from "./telnyx-whatsapp";
import { renderForChannel } from "./renderers";
import { TypingKeepalive, NOOP_TYPING_KEEPALIVE } from "./typing-keepalive";
import { BubbleAccumulator, defaultInterBubbleDelayMs } from "./bubble-accumulator";
import { logger } from "@/lib/core/logger";
import type { Channel, ChannelMetadata } from "@/lib/conversation/types";

export interface GatewayMessageParams {
  channel: Channel;
  text: string;
  identity: { userId: string; orgId: string; email?: string; displayName?: string; timezone?: string | null };
  replyTo: string;
  threadId?: string;
  channelMetadata?: ChannelMetadata;
  contentBlocks?: Anthropic.ContentBlockParam[];
}

/** Soft cap for a single prose bubble — longer than this and we try to split on sentences. */
const MAX_BUBBLE_CHARS = 350;
/** Hard cap on total number of bubbles — long-trail chains feel spammy. */
const MAX_BUBBLES = 3;
/** Below this length, a split-out sentence gets merged with its neighbour. */
const MIN_SENTENCE_CHARS = 40;

const LIST_LINE_RE = /^\s*(?:[•\-*+]\s+|\d+\.\s+)/;

/** True if every non-empty line in `paragraph` starts with a list marker. */
function isListParagraph(paragraph: string): boolean {
  const lines = paragraph.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return false;
  return lines.every(l => LIST_LINE_RE.test(l));
}

/**
 * Split a plain-prose paragraph on sentence boundaries (., !, ?), keeping
 * punctuation attached to the sentence it ends. Very short sentences are
 * merged with their neighbour so we don't fire off tiny one-word bubbles.
 */
function splitOnSentences(paragraph: string): string[] {
  // Match: any run of non-terminator chars, then a terminator ( . ! ? ) +
  // trailing whitespace. Fallback to the whole paragraph if nothing matches.
  const matches = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g);
  if (!matches || matches.length <= 1) return [paragraph.trim()];

  const sentences = matches.map(s => s.trim()).filter(s => s.length > 0);
  const merged: string[] = [];
  for (const s of sentences) {
    const prev = merged[merged.length - 1];
    if (prev && (s.length < MIN_SENTENCE_CHARS || prev.length < MIN_SENTENCE_CHARS)) {
      merged[merged.length - 1] = `${prev} ${s}`;
    } else {
      merged.push(s);
    }
  }
  return merged;
}

/**
 * Split rendered response text into individual bubbles for messaging channels.
 *
 * The algorithm is list-aware: list paragraphs are kept as whole bubbles (never
 * fragmented mid-list), consecutive lists collapse into one bubble, and long
 * prose paragraphs fall back to sentence-boundary splits. Final output is
 * capped at MAX_BUBBLES so we don't spam a long trail of bubbles.
 */
export function splitIntoBubbles(responseText: string): string[] {
  const paragraphs = responseText
    .split(/\n\n+/)
    .map(p => p.replace(/^\n+|\n+$/g, ''))
    .filter(p => p.trim().length > 0);

  const bubbles: string[] = [];
  let lastWasList = false;

  for (const rawParagraph of paragraphs) {
    // Trim per-line trailing whitespace but preserve the internal \n shape
    // (important for list paragraphs — we want to keep them as one bubble).
    const paragraph = rawParagraph
      .split('\n')
      .map(line => line.replace(/[ \t]+$/, ''))
      .join('\n')
      .trim();

    const asList = isListParagraph(paragraph);

    if (asList && lastWasList && bubbles.length > 0) {
      // Merge this list block into the previous list bubble.
      bubbles[bubbles.length - 1] = `${bubbles[bubbles.length - 1]}\n\n${paragraph.trim()}`;
      continue;
    }

    if (asList) {
      bubbles.push(paragraph.trim());
      lastWasList = true;
      continue;
    }

    lastWasList = false;

    if (paragraph.length > MAX_BUBBLE_CHARS) {
      for (const piece of splitOnSentences(paragraph)) {
        if (piece.length > 0) bubbles.push(piece);
      }
    } else {
      bubbles.push(paragraph.trim());
    }
  }

  if (bubbles.length > MAX_BUBBLES) {
    const kept = bubbles.slice(0, MAX_BUBBLES - 1);
    const tail = bubbles.slice(MAX_BUBBLES - 1).join('\n\n');
    kept.push(tail);
    return kept;
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

  const isSendblue = channel === "sendblue" || channel === "sms";
  const isWhatsApp = channel === "whatsapp";
  const isMessaging = isSendblue || isWhatsApp;
  const streamingEnabled = isSendblue && process.env.BITBIT_IMESSAGE_STREAMING === "true";

  // C1: typing keep-alive for iMessage. Starts immediately so the "..." bubble
  // appears at T+900ms even when the model takes seconds to produce text.
  const typingKeepalive = isSendblue
    ? new TypingKeepalive({ send: () => sendTypingIndicator(replyTo) })
    : NOOP_TYPING_KEEPALIVE;
  if (isSendblue) (typingKeepalive as TypingKeepalive).start();

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
    typingKeepalive.stop();
    await sendErrorReply(channel, replyTo);
    return;
  }

  if (!responseText) {
    logger.warn("[gateway-handler] Pipeline returned no message text", { channel, replyTo });
    typingKeepalive.stop();
    await sendErrorReply(channel, replyTo);
    return;
  }

  const wordCount = responseText.split(/\s+/).length;

  if (isSendblue && channelMetadata?.isVoiceNote && wordCount <= VOICE_REPLY_MAX_WORDS) {
    typingKeepalive.reassert();
    const voiceResult = await sendVoiceMemoBubble(replyTo, responseText);
    if (voiceResult.success) {
      typingKeepalive.stop();
      logger.info("[gateway-handler] Voice memo reply sent", { replyTo, wordCount });
      return;
    }
    logger.warn("[gateway-handler] Voice memo failed, falling back to text", { error: voiceResult.error });
  }

  // C2: streaming path (behind env flag). Feed the final text through
  // BubbleAccumulator so sends are paced naturally even though the pipeline
  // only emits a single final-message event.
  if (streamingEnabled) {
    const accumulator = new BubbleAccumulator({
      channel,
      typingKeepalive,
      onBubble: async (bubble: string) => {
        await sendChannelReply(channel, replyTo, bubble);
      },
    });
    accumulator.push(responseText);
    await accumulator.flushComplete();
    typingKeepalive.stop();
    return;
  }

  // ── Legacy (non-streaming) path ─────────────────────────────────────────
  const rendered = renderForChannel(responseText, channel);
  const bubbles = splitIntoBubbles(rendered);

  for (let i = 0; i < bubbles.length; i++) {
    const bubble = bubbles[i];
    const isFirst = i === 0;

    if (isSendblue) {
      typingKeepalive.reassert();
      await sleep(typingDelayMs(bubble, isFirst));
    } else if (isWhatsApp && !isFirst) {
      await sleep(typingDelayMs(bubble, isFirst));
    }

    await sendChannelReply(channel, replyTo, bubble);

    // C3: natural inter-bubble delay based on the NEXT bubble's length.
    if (isMessaging && i < bubbles.length - 1) {
      const next = bubbles[i + 1];
      await sleep(defaultInterBubbleDelayMs(next));
      if (isSendblue) typingKeepalive.reassert();
    }
  }

  typingKeepalive.stop();
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
      case "whatsapp": {
        const result = await sendTelnyxWhatsApp(replyTo, text);
        if (!result.success) throw new Error(result.error || "Telnyx WhatsApp send failed");
        break;
      }
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
