import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMorningBriefing } from '@/lib/whatsapp/morning-briefing'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint for sending daily morning briefings via WhatsApp.
 * Configured to run at the owner's preferred time (default: 7am).
 */
export async function GET(request: Request) {
  if (
    process.env.CRON_SECRET &&
    request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  )

  const recipientPhone = process.env.WHATSAPP_ANDY_PHONE
  if (!recipientPhone) {
    return NextResponse.json({ success: false, error: 'WHATSAPP_ANDY_PHONE not configured' })
  }

  const orgId = process.env.DEFAULT_ORG_ID ?? '00000000-0000-0000-0000-000000000000'

  try {
    const result = await sendMorningBriefing(supabase, orgId, recipientPhone)
    return NextResponse.json({ success: result.sent, sections: result.sections })
  } catch (err) {
    console.error('[cron/morning-briefing] Error:', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
