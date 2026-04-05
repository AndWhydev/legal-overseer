import { NextRequest, NextResponse } from "next/server"
import { getServiceClient } from "@/lib/supabase/service-client"
import { sendSendblueMessage, isSendblueConfigured } from "@/lib/channels/sendblue"
import { linkChannelIdentity } from "@/lib/conversation/identity-resolver"
import { logger } from "@/lib/core/logger"

// In-memory code store (TTL 10 minutes)
const pendingCodes = new Map<string, { code: string; userId: string; orgId: string; expires: number }>()

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export async function POST(request: NextRequest) {
  const { action, phone, code, userId, orgId, channelType } = await request.json()

  if (action === "send") {
    if (!phone || !userId || !orgId) {
      return NextResponse.json({ error: "Missing phone, userId, or orgId" }, { status: 400 })
    }

    const verifyCode = generateCode()
    pendingCodes.set(phone, {
      code: verifyCode,
      userId,
      orgId,
      expires: Date.now() + 10 * 60 * 1000,
    })

    if (isSendblueConfigured()) {
      await sendSendblueMessage(phone, `your BitBit verification code is: ${verifyCode}`)
    } else {
      logger.warn("[verify-phone] Sendblue not configured, code:", verifyCode)
    }

    return NextResponse.json({ sent: true })
  }

  if (action === "verify") {
    if (!phone || !code) {
      return NextResponse.json({ error: "Missing phone or code" }, { status: 400 })
    }

    const pending = pendingCodes.get(phone)
    if (!pending || Date.now() > pending.expires) {
      return NextResponse.json({ error: "Code expired or not found" }, { status: 400 })
    }

    if (pending.code !== code) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 })
    }

    const supabase = getServiceClient()
    const record = await linkChannelIdentity(
      supabase,
      pending.userId,
      pending.orgId,
      { channelType: channelType || "sms", channelIdentifier: phone },
      { verified: true },
    )

    pendingCodes.delete(phone)

    if (!record) {
      return NextResponse.json({ error: "Failed to link phone" }, { status: 500 })
    }

    return NextResponse.json({ verified: true, identityId: record.id })
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 })
}
