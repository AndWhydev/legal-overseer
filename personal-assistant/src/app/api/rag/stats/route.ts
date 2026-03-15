import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIndex } from '@/lib/rag/pinecone-client'
import { logger } from '@/lib/core/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface IndexStats {
  totalVectors: number
  namespaceVectors: Record<string, number>
  indexFullness: number
  lastUpdated: string
}

/**
 * GET /api/rag/stats
 * Returns Pinecone index statistics for the authenticated user's org.
 *
 * Returns:
 * {
 *   totalVectors: number,
 *   namespaceVectors: { [channel]: count },
 *   indexFullness: number,
 *   lastUpdated: ISO string
 * }
 *
 * On error or Pinecone not configured: gracefully returns zeros
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({
      totalVectors: 0,
      namespaceVectors: {},
      indexFullness: 0,
      lastUpdated: new Date().toISOString(),
    })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get org_id from user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.org_id) {
      logger.warn('[rag-stats] Failed to get org_id', { error: profileError })
      return NextResponse.json({
        totalVectors: 0,
        namespaceVectors: {},
        indexFullness: 0,
        lastUpdated: new Date().toISOString(),
      })
    }

    const orgId = profile.org_id
    const index = getIndex()

    // If Pinecone not configured, return graceful fallback
    if (!index) {
      logger.debug('[rag-stats] Pinecone not configured')
      return NextResponse.json({
        totalVectors: 0,
        namespaceVectors: {},
        indexFullness: 0,
        lastUpdated: new Date().toISOString(),
      })
    }

    // Query Pinecone index stats
    const indexStats = await index.describeIndexStats()

    // Extract total vector count
    const totalVectors = indexStats.totalVectorCount ?? 0

    // Extract per-namespace stats (we use org_id as namespace)
    const namespaceVectors: Record<string, number> = {}
    if (indexStats.namespaces && typeof indexStats.namespaces === 'object') {
      for (const [ns, stats] of Object.entries(indexStats.namespaces)) {
        if (typeof stats === 'object' && stats !== null && 'vectorCount' in stats) {
          namespaceVectors[ns] = (stats as Record<string, unknown>).vectorCount as number ?? 0
        }
      }
    }

    // Get vectors for the current org's namespace
    const orgNamespaceStats = namespaceVectors[orgId] ?? 0

    // Calculate index fullness (assume 100M vector capacity, typical Pinecone limit)
    const indexCapacity = 100_000_000
    const indexFullness = totalVectors > 0 ? Math.round((totalVectors / indexCapacity) * 100) : 0

    const stats: IndexStats = {
      totalVectors: orgNamespaceStats,
      namespaceVectors,
      indexFullness,
      lastUpdated: new Date().toISOString(),
    }

    return NextResponse.json(stats)
  } catch (err) {
    logger.error('[rag-stats] Failed to fetch Pinecone stats', {
      error: err instanceof Error ? err.message : String(err),
    })

    // Graceful degradation
    return NextResponse.json({
      totalVectors: 0,
      namespaceVectors: {},
      indexFullness: 0,
      lastUpdated: new Date().toISOString(),
    })
  }
}
