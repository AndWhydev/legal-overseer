import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEntityGraph, searchEntities } from '@/lib/context/graph-query'
import type { EntityType } from '@/lib/context/types'

const VALID_ENTITY_TYPES: EntityType[] = ['contact', 'project', 'invoice', 'task', 'channel_message', 'goal']

export async function GET(request: Request) {
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
  const search = searchParams.get('search')
  const entityType = searchParams.get('entity_type') as EntityType | null
  const entityId = searchParams.get('entity_id')

  // Search mode
  if (search) {
    const results = await searchEntities(supabase, profile.org_id, search)
    return NextResponse.json({ results })
  }

  // Graph mode
  if (entityType && entityId) {
    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      return NextResponse.json({ error: 'Invalid entity_type' }, { status: 400 })
    }
    const graph = await getEntityGraph(supabase, profile.org_id, entityType, entityId)
    return NextResponse.json({ graph })
  }

  return NextResponse.json({ error: 'Provide ?search= or ?entity_type=&entity_id=' }, { status: 400 })
}
