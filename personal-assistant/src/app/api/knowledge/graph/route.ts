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
          .select('id, name, emails, phones, created_at')
          .eq('org_id', profile.org_id)
          .limit(100)

        // Organization is the org itself
        const { data: orgRow } = await supabase
          .from('organizations')
          .select('id, name, created_at')
          .eq('id', profile.org_id)
          .single()

        const organizations = orgRow ? [orgRow] : []

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
              label: contact.name || (contact.emails?.[0]) || 'Unknown',
              type: 'Person',
              data: {
                name: contact.name,
                email: contact.emails?.[0],
                created_at: contact.created_at,
              },
            })
          })
        }

        // Add organization node
        for (const org of organizations) {
          nodes.push({
            id: `organization:${org.id}`,
            label: org.name || 'Unknown Organization',
            type: 'Organization',
            data: {
              name: org.name,
              created_at: org.created_at,
            },
          })
        }

        // Fetch entity_relationships to build edges
        const { data: relationships } = await supabase
          .from('entity_relationships')
          .select('entity_a_type, entity_a_id, entity_b_type, entity_b_id, relationship_type, strength')
          .eq('org_id', profile.org_id)
          .limit(500)

        if (relationships) {
          for (const rel of relationships) {
            const sourceId = `${rel.entity_a_type}:${rel.entity_a_id}`
            const targetId = `${rel.entity_b_type}:${rel.entity_b_id}`
            // Map 'contact' type to 'person' to match node IDs
            const srcId = sourceId.replace(/^contact:/, 'person:')
            const tgtId = targetId.replace(/^contact:/, 'person:')
            // Only add edge if both nodes exist
            if (nodes.some(n => n.id === srcId) && nodes.some(n => n.id === tgtId)) {
              edges.push({
                source: srcId,
                target: tgtId,
                label: rel.relationship_type?.replace(/_/g, ' ') ?? 'related',
              })
            }
          }
        }

        // Also fetch kg_edges if kg_nodes exist
        const { data: kgEdges } = await supabase
          .from('kg_edges')
          .select('source_id, target_id, edge_type')
          .eq('org_id', profile.org_id)
          .is('expired_at', null)
          .limit(500)

        if (kgEdges) {
          for (const ke of kgEdges) {
            // kg_edges source/target IDs are entity IDs that may already be in our nodes
            if (nodes.some(n => n.id === ke.source_id) && nodes.some(n => n.id === ke.target_id)) {
              edges.push({
                source: ke.source_id,
                target: ke.target_id,
                label: ke.edge_type?.replace(/_/g, ' ').toLowerCase() ?? 'related',
              })
            }
          }
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
