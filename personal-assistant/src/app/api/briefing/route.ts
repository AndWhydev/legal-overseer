import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveOrgId } from '@/lib/tenancy'
import { generateMondayBriefing, formatBriefingWhatsApp, formatBriefingEmail } from '@/lib/agent/briefing-generator'
import { logger } from '@/lib/core/logger'

export const dynamic = 'force-dynamic'

/**
 * On-demand briefing API endpoint.
 * GET /api/briefing — Generate and return briefing for the current user's org.
 *
 * Query params:
 *   format=json (default) — structured JSON for dashboard display
 *   format=whatsapp — WhatsApp-formatted text
 *   format=email — HTML email format
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const orgId = await getActiveOrgId(supabase, user.id)

  const url = new URL(request.url)
  const format = url.searchParams.get('format') ?? 'json'

  try {
    const briefing = await generateMondayBriefing(supabase, orgId)

    switch (format) {
      case 'whatsapp': {
        const text = formatBriefingWhatsApp(briefing)
        return NextResponse.json({
          success: true,
          format: 'whatsapp',
          text,
          summary: briefing.summary,
        })
      }

      case 'email': {
        const { subject, html } = formatBriefingEmail(briefing)
        return NextResponse.json({
          success: true,
          format: 'email',
          subject,
          html,
          summary: briefing.summary,
        })
      }

      case 'json':
      default: {
        return NextResponse.json({
          success: true,
          format: 'json',
          briefing,
        })
      }
    }
  } catch (err) {
    logger.error('[api/briefing] Failed to generate briefing', {
      error: err instanceof Error ? err.message : String(err),
      orgId,
    })

    return NextResponse.json(
      { success: false, error: 'Failed to generate briefing' },
      { status: 500 },
    )
  }
}
