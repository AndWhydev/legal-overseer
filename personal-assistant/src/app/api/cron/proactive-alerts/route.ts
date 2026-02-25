import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAndSendAlerts } from '@/lib/whatsapp/proactive-alerts'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint for checking and sending proactive alerts via WhatsApp.
 * Designed to run every 15 minutes.
 * Checks for: high-value leads, newly overdue invoices, negative sentiment.
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
    const alertsSent = await checkAndSendAlerts(supabase, orgId, recipientPhone)
    return NextResponse.json({ success: true, alertsSent })
  } catch (err) {
    console.error('[cron/proactive-alerts] Error:', err)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
