import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeContactTiming, getNextOptimalWindow } from '@/lib/intelligence/contact-timing'
import type { OptimalContactWindow } from '@/lib/intelligence/contact-timing'

/**
 * GET /api/contacts/[id]/timing
 *
 * Returns optimal contact timing windows for a specific contact.
 * Used by the dashboard to show when is the best time to reach someone.
 *
 * Response:
 * {
 *   contactId: string
 *   windows: OptimalContactWindow[]
 *   nextOptimalSend: string | null  // ISO date of next optimal window
 *   cached: boolean                  // whether result came from entity_patterns cache
 * }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: contactId } = await params

  // Get user's org
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No organization found' }, { status: 400 })
  }

  const orgId = profile.org_id

  // Try to read from cached entity_patterns first
  const { data: cached } = await supabase
    .from('entity_patterns')
    .select('pattern_data, extracted_at, valid_until')
    .eq('org_id', orgId)
    .eq('entity_type', 'contact')
    .eq('entity_id', contactId)
    .eq('pattern_type', 'optimal_contact_timing')
    .single()

  if (cached && new Date(cached.valid_until) > new Date()) {
    const windows = (cached.pattern_data as { windows?: OptimalContactWindow[] })?.windows ?? []
    const nextOptimalSend = getNextOptimalWindow(windows)

    return NextResponse.json({
      contactId,
      windows,
      nextOptimalSend: nextOptimalSend?.toISOString() ?? null,
      cached: true,
      analyzedAt: cached.extracted_at,
    })
  }

  // Compute fresh timing data
  const timing = await analyzeContactTiming(supabase, orgId, contactId)
  const nextOptimalSend = getNextOptimalWindow(timing.windows)

  return NextResponse.json({
    contactId,
    windows: timing.windows,
    nextOptimalSend: nextOptimalSend?.toISOString() ?? null,
    cached: false,
    analyzedAt: timing.analyzedAt,
  })
}
