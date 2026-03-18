/**
 * Memory Palace API
 *
 * POST /api/memory-palace — search memories
 * GET  /api/memory-palace — get stats or entity memories
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createMemoryPalace } from '@/lib/memory-palace'
import { logger } from '@/lib/core/logger'
import type { MemoryType } from '@/lib/memory-palace'

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>) {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .single()
  return profile?.org_id ?? null
}

/**
 * POST /api/memory-palace
 *
 * Actions: search, remember, forget, record_outcome
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const orgId = await getOrgId(supabase)
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { action } = body

    const palace = createMemoryPalace(supabase, orgId)

    switch (action) {
      case 'search': {
        const results = await palace.searchMemories({
          query: body.query ?? '',
          memoryType: body.memoryType as MemoryType | undefined,
          entityId: body.entityId,
          minConfidence: body.minConfidence,
          limit: body.limit,
        })
        return NextResponse.json({ results })
      }

      case 'remember': {
        const id = await palace.createMemory({
          memoryType: body.memoryType ?? 'fact',
          title: body.title ?? 'Untitled',
          content: body.content ?? '',
          typeMetadata: body.typeMetadata,
          confidence: body.confidence,
          sourceType: 'user_explicit',
          entityIds: body.entityIds,
          entityNames: body.entityNames,
        })
        return NextResponse.json({ id })
      }

      case 'remember_decision': {
        const id = await palace.createDecision({
          decisionSummary: body.title ?? body.decisionSummary ?? '',
          content: body.content ?? '',
          alternatives: body.alternatives,
          reasoningChain: body.reasoningChain,
          participants: body.participants,
          domain: body.domain,
          entityIds: body.entityIds,
          entityNames: body.entityNames,
        })
        return NextResponse.json({ id })
      }

      case 'forget': {
        if (!body.entityId) {
          return NextResponse.json({ error: 'entityId required' }, { status: 400 })
        }
        const result = await palace.forgetEntity(body.entityId)
        return NextResponse.json(result)
      }

      case 'record_outcome': {
        if (!body.decisionId) {
          return NextResponse.json({ error: 'decisionId required' }, { status: 400 })
        }
        await palace.recordDecisionOutcome(body.decisionId, {
          status: body.outcomeStatus ?? 'unknown',
          notes: body.outcomeNotes,
          lessonLearned: body.lessonLearned,
        })
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    logger.error('[api/memory-palace] POST failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * GET /api/memory-palace
 *
 * Params: view=stats|entity|decisions
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    if (!supabase) return NextResponse.json({ error: 'Not configured' }, { status: 503 })

    const orgId = await getOrgId(supabase)
    if (!orgId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const view = searchParams.get('view') ?? 'stats'

    const palace = createMemoryPalace(supabase, orgId)

    switch (view) {
      case 'stats': {
        const stats = await palace.getStats()
        return NextResponse.json(stats)
      }

      case 'entity': {
        const entityId = searchParams.get('entityId')
        if (!entityId) return NextResponse.json({ error: 'entityId required' }, { status: 400 })
        const memories = await palace.getEntityMemories(entityId, {
          memoryType: searchParams.get('type') as MemoryType | undefined,
          limit: parseInt(searchParams.get('limit') ?? '20'),
          minConfidence: parseFloat(searchParams.get('minConfidence') ?? '0.1'),
        })
        return NextResponse.json({ memories })
      }

      case 'decisions': {
        const decisions = await palace.getDecisions({
          domain: searchParams.get('domain') ?? undefined,
          limit: parseInt(searchParams.get('limit') ?? '20'),
          entityId: searchParams.get('entityId') ?? undefined,
        })
        return NextResponse.json({ decisions })
      }

      case 'memory': {
        const memoryId = searchParams.get('id')
        if (!memoryId) return NextResponse.json({ error: 'id required' }, { status: 400 })
        const memory = await palace.getMemory(memoryId)
        return NextResponse.json({ memory })
      }

      default:
        return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 })
    }
  } catch (err) {
    logger.error('[api/memory-palace] GET failed', {
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
