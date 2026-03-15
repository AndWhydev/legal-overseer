import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEntityGraph, searchEntities } from '@/lib/context/graph-query'
import { logger } from '@/lib/core/logger'
import type { EntityType } from '@/lib/context/types'

const VALID_ENTITY_TYPES: EntityType[] = ['contact', 'project', 'invoice', 'task', 'channel_message', 'goal']

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
    const search = searchParams.get('search')
    const entityType = searchParams.get('entity_type') as EntityType | null
    const entityId = searchParams.get('entity_id')
    const format = searchParams.get('format') // 'nodes' for visualization format

    // Visualization mode - return formatted nodes and edges for GraphViewer
    if (format === 'nodes') {
      try {
        // Query entities for this org
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, name, email, phone, created_at')
          .eq('org_id', profile.org_id)
          .limit(100)

        const { data: organizations } = await supabase
          .from('organizations')
          .select('id, name, domain, created_at')
          .eq('org_id', profile.org_id)
          .limit(50)

        const nodes: Array<{
          id: string
          label: string
          type: 'Person' | 'Organization' | 'Topic'
          data?: Record<string, unknown>
        }> = []

        const edges: Array<{
          source: string
          target: string
          label?: string
        }> = []

        // Add person nodes
        if (contacts) {
          contacts.forEach((contact) => {
            nodes.push({
              id: `person:${contact.id}`,
              label: contact.name || contact.email || 'Unknown',
              type: 'Person',
              data: {
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                created_at: contact.created_at,
              },
            })
          })
        }

        // Add organization nodes
        if (organizations) {
          organizations.forEach((org) => {
            nodes.push({
              id: `organization:${org.id}`,
              label: org.name || 'Unknown Organization',
              type: 'Organization',
              data: {
                name: org.name,
                domain: org.domain,
                created_at: org.created_at,
              },
            })
          })
        }

        logger.info('Knowledge graph visualization data generated', {
          orgId: profile.org_id,
          nodeCount: nodes.length,
          edgeCount: edges.length,
        })

        return NextResponse.json({
          nodes,
          edges,
          stats: {
            nodeCount: nodes.length,
            edgeCount: edges.length,
            people: nodes.filter((n) => n.type === 'Person').length,
            organizations: nodes.filter((n) => n.type === 'Organization').length,
            topics: nodes.filter((n) => n.type === 'Topic').length,
          },
        })
      } catch (err) {
        logger.error('Failed to generate visualization data:', err)
        return NextResponse.json(
          { error: 'Failed to generate visualization data' },
          { status: 500 }
        )
      }
    }

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

    return NextResponse.json({ error: 'Provide ?search= or ?entity_type=&entity_id= or ?format=nodes' }, { status: 400 })
  } catch (error) {
    logger.error('Knowledge graph API error:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: 'Failed to fetch knowledge graph' },
      { status: 500 }
    )
  }
}
