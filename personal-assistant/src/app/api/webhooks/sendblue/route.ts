import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { resolveChannelIdentity } from "@/lib/conversation/identity-resolver";
import { enrichInboundMessage } from "@/lib/conversation/inbound-enrichment";
import { handleGatewayMessage } from "@/lib/channels/gateway-handler";
import { sendSendblueMessage } from "@/lib/channels/sendblue";
import { downloadSendblueMedia } from "@/lib/channels/sendblue-media";
import { transcribeVoiceNote } from "@/lib/channels/voice-transcription";
import { logger } from "@/lib/core/logger";
import type { ChannelMetadata } from "@/lib/conversation/types";

export const maxDuration = 120;

interface SendblueWebhook {
  from_number: string;
  to_number: string;
  content: string;
  media_url?: string;
  service?: string;
  group_id?: string | null;
  date_sent?: string;
  message_handle?: string;
  status?: string;
  error_code?: string | null;
}

async function processInboundMedia(
  mediaUrl: string,
  textContent: string,
): Promise<{
  content: string;
  channelMetadata: Partial<ChannelMetadata>;
  contentBlocks: Anthropic.ContentBlockParam[];
}> {
  const channelMetadata: Partial<ChannelMetadata> = {};
  const contentBlocks: Anthropic.ContentBlockParam[] = [];
  let content = textContent;

  const media = await downloadSendblueMedia(mediaUrl);
  if (!media) return { content, channelMetadata, contentBlocks };

  channelMetadata.attachments = [{ type: media.mimeType, url: mediaUrl, name: media.filename }];

  if (media.category === "audio") {
    channelMetadata.isVoiceNote = true;
    const result = await transcribeVoiceNote(media.buffer, media.mimeType);
    if (result.success && result.text) {
      content = content
        ? `${content}\n\n[voice note]: "${result.text}"`
        : `[voice note]: "${result.text}"`;
      logger.info("[webhook/sendblue] Voice memo transcribed", {
        duration: result.duration, language: result.language, textLength: result.text.length,
      });
    } else {
      content = content || "[voice note — couldn't transcribe]";
      logger.warn("[webhook/sendblue] Voice memo transcription failed", { error: result.error });
    }
  } else if (media.category === "image") {
    const base64 = media.buffer.toString("base64");
    const validMediaTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    type ValidMediaType = (typeof validMediaTypes)[number];
    const mediaType = validMediaTypes.includes(media.mimeType as ValidMediaType)
      ? (media.mimeType as ValidMediaType)
      : ("image/jpeg" as const);

    contentBlocks.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: base64 },
    });
    if (!content) content = "[sent an image]";
    logger.info("[webhook/sendblue] Image received", { mimeType: media.mimeType, size: media.buffer.length });
  } else {
    if (!content) content = `[sent a ${media.category}: ${media.filename}]`;
  }

  return { content, channelMetadata, contentBlocks };
}

export async function POST(request: NextRequest) {
  const incomingKey = request.headers.get("sb-api-key-id");
  const expectedKey = process.env.SENDBLUE_API_KEY;
  if (expectedKey && incomingKey && incomingKey !== expectedKey) {
    logger.warn("[webhook/sendblue] API key mismatch");
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  let body: SendblueWebhook;
  try {
    body = await request.json();
  } catch {
    logger.error("[webhook/sendblue] Invalid JSON");
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (body.status && !body.content && !body.media_url) {
    logger.info("[webhook/sendblue] Status update", { status: body.status, to: body.to_number, error: body.error_code });
    return NextResponse.json({ ok: true });
  }

  const fromNumber = body.from_number;
  const toNumber = body.to_number;
  let content = body.content || "";
  const mediaUrl = body.media_url;

  if (!fromNumber || (!content && !mediaUrl)) {
    return NextResponse.json({ ok: true });
  }

  const ourNumber = process.env.SENDBLUE_FROM_NUMBER;
  if (ourNumber && fromNumber === ourNumber) {
    return NextResponse.json({ ok: true });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    logger.error("[webhook/sendblue] Missing Supabase env vars");
    return NextResponse.json({ ok: true });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const identity = await resolveChannelIdentity(supabase, {
    channelType: "sms",
    channelIdentifier: fromNumber,
  });

  if (!identity) {
    const openRegistration = process.env.SENDBLUE_OPEN_REGISTRATION === "true";
    const replyText = openRegistration
      ? "hey! don't recognize this number yet\n\nwhat's ur email so i can link you up?"
      : "hey, not set up for new numbers yet — check back soon";
    await sendSendblueMessage(fromNumber, replyText);
    return NextResponse.json({ ok: true });
  }

  let channelMetadata: ChannelMetadata | undefined;
  let contentBlocks: Anthropic.ContentBlockParam[] | undefined;

  if (mediaUrl) {
    const mediaResult = await processInboundMedia(mediaUrl, content);
    content = mediaResult.content;
    if (Object.keys(mediaResult.channelMetadata).length > 0) {
      channelMetadata = mediaResult.channelMetadata as ChannelMetadata;
    }
    if (mediaResult.contentBlocks.length > 0) {
      contentBlocks = mediaResult.contentBlocks;
    }
  }

  const externalId = body.message_handle || `sb-${Date.now()}-${fromNumber}`;
  const { data: insertedMsg } = await supabase
    .from("channel_messages")
    .insert({
      org_id: identity.orgId,
      channel: "sendblue",
      external_id: externalId,
      sender: fromNumber,
      sender_email: fromNumber,
      body: content,
      received_at: body.date_sent || new Date().toISOString(),
      direction: "inbound",
      priority: "medium",
      metadata: {
        from_number: fromNumber,
        to_number: toNumber,
        service: body.service,
        media_url: mediaUrl || null,
        group_id: body.group_id || null,
        is_voice_note: channelMetadata?.isVoiceNote || false,
      },
    })
    .select("id")
    .single();

  if (insertedMsg) {
    enrichInboundMessage(supabase, {
      messageId: insertedMsg.id as string,
      orgId: identity.orgId,
      channel: "sendblue",
      senderIdentifier: fromNumber,
      senderName: identity.displayName ?? fromNumber,
      subject: null,
      body: content,
      priority: "medium",
    }).catch((err) => {
      logger.error("[webhook/sendblue] Enrichment failed (non-fatal):", err);
    });
  }

  try {
    await handleGatewayMessage({
      channel: "sendblue",
      text: content,
      identity: {
        userId: identity.userId,
        orgId: identity.orgId,
        email: identity.email,
        displayName: identity.displayName,
      },
      replyTo: fromNumber,
      channelMetadata,
      contentBlocks,
    });
  } catch (err) {
    logger.error("[webhook/sendblue] Gateway handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true });
}
