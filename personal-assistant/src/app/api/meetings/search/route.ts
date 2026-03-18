import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchTranscripts } from '@/lib/meetings/meeting-service'

/**
 * GET /api/meetings/search?q=...&meeting_id=...&limit=...
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('active_org_id')
    .eq('id', user.id)
    .single()

  if (!profile?.active_org_id) return NextResponse.json({ error: 'No org' }, { status: 400 })

  const url = new URL(request.url)
  const query = url.searchParams.get('q')
  if (!query) return NextResponse.json({ error: 'q parameter required' }, { status: 400 })

  const results = await searchTranscripts(supabase, profile.active_org_id, query, {
    limit: parseInt(url.searchParams.get('limit') ?? '20'),
    meeting_id: url.searchParams.get('meeting_id') ?? undefined,
  })

  return NextResponse.json({ results, total: results.length })
}
