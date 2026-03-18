import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MemorySearch } from '@/lib/memory-palace'
import { logger } from '@/lib/core/logger'
import type { MemoryCategory } from '@/lib/memory-palace'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: 'No org found' }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const category = searchParams.get('category') as MemoryCategory | null
    const entityId = searchParams.get('entity_id')
    const limit = parseInt(searchParams.get('limit') ?? '20', 10)
    const includeDecisions = searchParams.get('decisions') !== 'false'
    const includePatterns = searchParams.get('patterns') !== 'false'

    if (!query) {
      return NextResponse.json({ error: 'Missing ?q= search query' }, { status: 400 })
    }

    const search = new MemorySearch(supabase)
    const results = await search.search({
      query,
      orgId: profile.org_id,
      category: category ?? undefined,
      entityId: entityId ?? undefined,
      limit,
      includeDecisions,
      includePatterns,
    })

    return NextResponse.json(results)
  } catch (error) {
    logger.error('[api/memory-palace/search] Error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
