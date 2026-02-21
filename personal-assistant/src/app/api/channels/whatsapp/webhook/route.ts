import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPendingApprovals, resolveApproval } from '../../../../../lib/agent/approval-queue'
import { parseApprovalReply, sendMessage } from '../../../../../lib/channels/whatsapp'

const DEFAULT_ORG_ID = '289083e9-2143-44eb-9b6a-cfc615f1e81c'

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string
          text?: { body?: string }
        }>
      }
    }>
  }>
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, '')
}

function createServiceSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseKey)
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const verifyToken = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (
    mode === 'subscribe' &&
    verifyToken &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    verifyToken === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(challenge ?? '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new Response('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as WebhookPayload
    const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
    const sender = message?.from
    const text = message?.text?.body ?? ''

    if (!sender) {
      console.log('WhatsApp webhook ignored: missing sender')
      return NextResponse.json({ ok: true })
    }

    const andyPhone = process.env.WHATSAPP_ANDY_PHONE
    if (!andyPhone || normalizePhone(sender) !== normalizePhone(andyPhone)) {
      console.log('WhatsApp webhook ignored: sender not authorized')
      return NextResponse.json({ ok: true })
    }

    const reply = parseApprovalReply(text)
    if (!reply) {
      console.log('WhatsApp webhook ignored: unrecognized reply')
      return NextResponse.json({ ok: true })
    }

    const supabase = createServiceSupabase()
    if (!supabase) {
      console.warn('WhatsApp webhook missing Supabase configuration')
      return NextResponse.json({ ok: true })
    }

    const pendingApprovals = await getPendingApprovals(supabase, DEFAULT_ORG_ID, {
      limit: reply.type === 'simple' ? 1 : 20,
      offset: 0,
    })

    const targetApproval =
      reply.type === 'simple' ? pendingApprovals[0] : pendingApprovals[reply.index - 1]

    if (!targetApproval) {
      await sendMessage(sender, 'No pending approval found for that response.')
      return NextResponse.json({ ok: true })
    }

    const resolved = await resolveApproval(
      supabase,
      targetApproval.id,
      reply.decision,
      'andy-whatsapp',
      'whatsapp',
    )

    const prefix = reply.decision === 'approved' ? 'Approved' : 'Rejected'
    await sendMessage(sender, `${prefix}: ${resolved.action_summary}`)
  } catch (error) {
    console.warn('WhatsApp webhook processing failed', error)
  }

  return NextResponse.json({ ok: true })
}
