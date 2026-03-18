import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MemorySearch } from '@/lib/memory-palace'
import { logger } from '@/lib/core/logger'
import type { MemoryCategory } from '@/lib/memory-palace'

/**
 * GET /api/memory-palace/recall?entity_id=...
 * Recall everything known about a specific entity.
 *
 * Optional params:
 *   - categories: comma-separated list (e.g., "fact,pricing,relationship")
 *   - limit: max memories (default 50)
 *   - decisions: include decisions (default true)
 *   - patterns: include patterns (default true)
 */
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
    const entityId = searchParams.get('entity_id')

    if (!entityId) {
      return NextResponse.json({ error: 'Missing ?entity_id= parameter' }, { status: 400 })
    }

    const categoriesParam = searchParams.get('categories')
    const categories = categoriesParam
      ? (categoriesParam.split(',') as MemoryCategory[])
      : undefined

    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const includeDecisions = searchParams.get('decisions') !== 'false'
    const includePatterns = searchParams.get('patterns') !== 'false'

    const search = new MemorySearch(supabase)
    const result = await search.recallEntity({
      orgId: profile.org_id,
      entityId,
      categories,
      limit,
      includeDecisions,
      includePatterns,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error('[api/memory-palace/recall] Error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Recall failed' }, { status: 500 })
  }
}
