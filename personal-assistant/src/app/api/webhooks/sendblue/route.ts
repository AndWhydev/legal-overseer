import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type Anthropic from "@anthropic-ai/sdk";
import { resolveChannelIdentity } from "@/lib/conversation/identity-resolver";
import { enrichInboundMessage } from "@/lib/conversation/inbound-enrichment";
import { handleGatewayMessage } from "@/lib/channels/gateway-handler";
import { sendSendblueMessage } from "@/lib/channels/sendblue";
import { downloadSendblueMedia } from "@/lib/channels/sendblue-media";
import { transcribeVoiceNote } from "@/lib/channels/voice-transcription";
import { handleUnknownSender } from "@/lib/channels/sendblue-onboarding";
import {
  isRateLimited,
  isMediaUrlSafe,
  verifyWebhookKey,
  checkSmsQuota,
  trackSmsSend,
} from "@/lib/channels/sendblue-guard";
import { sendContactCardIfNeeded } from "@/lib/channels/sendblue-contact-card";
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

  // SSRF guard: validate media URL before fetching
  if (!isMediaUrlSafe(mediaUrl)) {
    logger.warn("[webhook/sendblue] Blocked unsafe media URL", { url: mediaUrl.slice(0, 100) });
    return { content, channelMetadata, contentBlocks };
  }

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
  // ── Auth: timing-safe API key verification ──────────────────────────
  if (!verifyWebhookKey(request.headers.get("sb-api-key-id"))) {
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

  // Status callbacks (delivery updates) — log and return
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

  // Echo prevention
  const ourNumber = process.env.SENDBLUE_FROM_NUMBER;
  if (ourNumber && fromNumber === ourNumber) {
    return NextResponse.json({ ok: true });
  }

  // ── Rate limiting: per-number inbound throttle ──────────────────────
  if (isRateLimited(fromNumber)) {
    // Silently drop — don't waste Sendblue credits on rate-limited senders
    return NextResponse.json({ ok: true });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    logger.error("[webhook/sendblue] Missing Supabase env vars");
    return NextResponse.json({ ok: true });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // ── Identity resolution ─────────────────────────────────────────────
  const identity = await resolveChannelIdentity(supabase, {
    channelType: "sms",
    channelIdentifier: fromNumber,
  });

  if (!identity) {
    // Unknown sender → onboarding flow (email → OTP → link)
    const handled = await handleUnknownSender(supabase, fromNumber, content);
    if (handled) return NextResponse.json({ ok: true });

    // Fallback: registration disabled
    await sendSendblueMessage(fromNumber, "hey, not set up for new numbers yet — check back soon");
    return NextResponse.json({ ok: true });
  }

  // ── Send quota check ────────────────────────────────────────────────
  const quotaOk = await checkSmsQuota(supabase, identity.orgId);
  if (!quotaOk) {
    logger.warn("[webhook/sendblue] SMS quota exceeded, not responding", {
      orgId: identity.orgId, from: fromNumber,
    });
    // Store message but don't respond — user will see it in dashboard
    return NextResponse.json({ ok: true });
  }

  // ── Process media ───────────────────────────────────────────────────
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

  // ── Store inbound message ───────────────────────────────────────────
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

  // ── Run pipeline + send response ────────────────────────────────────
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

    // Track SMS send for quota + send contact card on first touch
    trackSmsSend(supabase, identity.orgId).catch(() => {});
    sendContactCardIfNeeded(supabase, identity.orgId, fromNumber).catch(() => {});
  } catch (err) {
    logger.error("[webhook/sendblue] Gateway handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true });
}
