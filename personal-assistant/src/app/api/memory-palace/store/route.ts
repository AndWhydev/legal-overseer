import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { MemoryWriter } from '@/lib/memory-palace'
import { logger } from '@/lib/core/logger'
import type { MemoryCategory, MemorySource, StoreMemoryInput, StoreDecisionInput } from '@/lib/memory-palace'

const VALID_CATEGORIES: MemoryCategory[] = [
  'conversation', 'decision', 'pattern', 'fact',
  'relationship', 'pricing', 'convention',
]

export async function POST(request: Request) {
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

    const body = await request.json()
    const { type } = body as { type?: string }

    const writer = new MemoryWriter(supabase)

    // Store a decision
    if (type === 'decision') {
      const { title, decision, alternatives, reasoning, entityIds, entityNames, domain, impact } = body

      if (!title || !decision || !reasoning) {
        return NextResponse.json(
          { error: 'Missing required fields: title, decision, reasoning' },
          { status: 400 },
        )
      }

      const result = await writer.storeDecision({
        orgId: profile.org_id,
        title,
        decision,
        alternatives,
        reasoning,
        entityIds,
        entityNames,
        decidedBy: user.email ?? 'unknown',
        domain,
        impact,
      } satisfies StoreDecisionInput)

      if (!result) {
        return NextResponse.json({ error: 'Failed to store decision' }, { status: 500 })
      }

      return NextResponse.json({ decision: result }, { status: 201 })
    }

    // Store a memory
    const { category, title, content, confidence, entityIds, entityNames, source, tags } = body

    if (!content) {
      return NextResponse.json({ error: 'Missing required field: content' }, { status: 400 })
    }

    const memCategory = (category ?? 'fact') as MemoryCategory
    if (!VALID_CATEGORIES.includes(memCategory)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
        { status: 400 },
      )
    }

    const result = await writer.storeMemory({
      orgId: profile.org_id,
      category: memCategory,
      title,
      content,
      confidence,
      entityIds,
      entityNames,
      source: (source ?? 'user_explicit') as MemorySource,
      tags,
    } satisfies StoreMemoryInput)

    if (!result) {
      // Might have been corroborated instead of created
      return NextResponse.json({ message: 'Memory corroborated with existing entry' }, { status: 200 })
    }

    return NextResponse.json({ memory: result }, { status: 201 })
  } catch (error) {
    logger.error('[api/memory-palace/store] Error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Store failed' }, { status: 500 })
  }
}
