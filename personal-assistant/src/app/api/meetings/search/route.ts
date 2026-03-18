import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchTranscripts } from '@/lib/meetings/meeting-service'

/**
<<<<<<< HEAD
 * GET /api/meetings/search?q=...&meeting_id=...&limit=...
=======
 * GET /api/meetings/search — Search across meeting transcripts.
 * Query params: q (search query), limit (default 20)
 *
 * Example: /api/meetings/search?q=homepage+redesign&limit=10
>>>>>>> v1.5-marketing-launch
 */
export async function GET(request: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
<<<<<<< HEAD

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
=======
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = (user.user_metadata?.org_id as string) ?? user.id
  const url = new URL(request.url)
  const query = url.searchParams.get('q')
  const limit = parseInt(url.searchParams.get('limit') || '20')

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: 'q (search query) is required' }, { status: 400 })
  }

  const results = await searchTranscripts(supabase, orgId, query.trim(), limit)
>>>>>>> v1.5-marketing-launch

  return NextResponse.json({ results, total: results.length })
}
