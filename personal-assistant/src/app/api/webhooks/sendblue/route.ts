import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveChannelIdentity } from "@/lib/conversation/identity-resolver";
import { enrichInboundMessage } from "@/lib/conversation/inbound-enrichment";
import { handleGatewayMessage } from "@/lib/channels/gateway-handler";
import { sendSendblueMessage } from "@/lib/channels/sendblue";
import { after } from "next/server";
import { logger } from "@/lib/core/logger";

export const maxDuration = 60;

interface SendblueWebhook {
  from_number: string;
  to_number: string;
  content: string;
  media_url?: string;
  service?: string;
  group_id?: string | null;
  date_sent?: string;
  message_handle?: string;
  // Status callback fields
  status?: string;
  error_code?: string | null;
}

export async function POST(request: NextRequest) {
  // Verify the request is from Sendblue by checking the API key header.
  // Sendblue doesn't support HMAC signatures — header matching is the method.
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

  // Status callback (delivery updates) — log and return
  if (body.status && !body.content) {
    logger.info("[webhook/sendblue] Status update", {
      status: body.status,
      to: body.to_number,
      error: body.error_code,
    });
    return NextResponse.json({ ok: true });
  }

  const fromNumber = body.from_number;
  const content = body.content;
  const toNumber = body.to_number;

  if (!fromNumber || !content) {
    return NextResponse.json({ ok: true }); // Ignore empty messages
  }

  // Echo prevention — ignore messages from our own number
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

  // Resolve identity via channel_identities table
  const identity = await resolveChannelIdentity(supabase, {
    channelType: "sms",
    channelIdentifier: fromNumber,
  });

  if (!identity) {
    // Unknown number — respond based on open registration setting
    const openRegistration = process.env.SENDBLUE_OPEN_REGISTRATION === "true";
    const replyText = openRegistration
      ? "hey! I don't recognize this number yet. what's your email so I can link you up?"
      : "hey, I'm not set up for new numbers just yet. check back soon!";

    after(async () => {
      await sendSendblueMessage(fromNumber, replyText);
    });

    return NextResponse.json({ ok: true });
  }

  // Store inbound message
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
        media_url: body.media_url || null,
        group_id: body.group_id || null,
      },
    })
    .select("id")
    .single();

  // Fire-and-forget enrichment
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

  // Run pipeline in background — return 200 immediately
  after(async () => {
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
      });
    } catch (err) {
      logger.error("[webhook/sendblue] Gateway handler error", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return NextResponse.json({ ok: true });
}
