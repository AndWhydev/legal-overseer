import type { SupabaseClient } from '@supabase/supabase-js'
import type { EntityType, RelationshipType } from './types'

// ─── Graph Query Types ─────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  type: EntityType
  label: string
  metadata: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  relationshipType: RelationshipType
  strength: number
  lastEvidenceAt: string
}

export interface EntityGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface SearchResult {
  id: string
  type: EntityType
  label: string
  snippet: string
  metadata: Record<string, unknown>
}

// ─── Entity Label Resolvers ────────────────────────────────────────────────

async function resolveLabel(
  supabase: SupabaseClient,
  type: EntityType,
  id: string
): Promise<{ label: string; metadata: Record<string, unknown> }> {
  const tableMap: Record<EntityType, { table: string; labelCol: string }> = {
    contact: { table: 'contacts', labelCol: 'name' },
    project: { table: 'projects', labelCol: 'name' },
    invoice: { table: 'invoices', labelCol: 'invoice_number' },
    task: { table: 'tasks', labelCol: 'title' },
    channel_message: { table: 'channel_messages', labelCol: 'subject' },
    goal: { table: 'goals', labelCol: 'title' },
  }

  const mapping = tableMap[type]
  if (!mapping) return { label: id, metadata: {} }

  const { data } = await supabase
    .from(mapping.table)
    .select('*')
    .eq('id', id)
    .single()

  if (!data) return { label: id, metadata: {} }

  return {
    label: (data[mapping.labelCol] as string) || id,
    metadata: data as Record<string, unknown>,
  }
}

// ─── Graph Traversal ───────────────────────────────────────────────────────

/**
 * Get the relationship graph for a given entity.
 * Returns all directly connected entities as nodes + edges.
 */
export async function getEntityGraph(
  supabase: SupabaseClient,
  orgId: string,
  entityType: EntityType,
  entityId: string
): Promise<EntityGraph> {
  // Fetch relationships where this entity is on either side
  const [asA, asB] = await Promise.all([
    supabase
      .from('entity_relationships')
      .select('*')
      .eq('org_id', orgId)
      .eq('entity_a_type', entityType)
      .eq('entity_a_id', entityId),
    supabase
      .from('entity_relationships')
      .select('*')
      .eq('org_id', orgId)
      .eq('entity_b_type', entityType)
      .eq('entity_b_id', entityId),
  ])

  const rels = [...(asA.data ?? []), ...(asB.data ?? [])]

  // Collect unique connected entities
  const seen = new Map<string, { type: EntityType; id: string }>()
  const edges: GraphEdge[] = []

  for (const rel of rels) {
    const isA = rel.entity_a_type === entityType && rel.entity_a_id === entityId
    const otherType = (isA ? rel.entity_b_type : rel.entity_a_type) as EntityType
    const otherId = isA ? rel.entity_b_id : rel.entity_a_id
    const key = `${otherType}:${otherId}`

    if (!seen.has(key)) {
      seen.set(key, { type: otherType, id: otherId })
    }

    edges.push({
      source: entityId,
      target: otherId,
      relationshipType: rel.relationship_type as RelationshipType,
      strength: rel.strength ?? 1,
      lastEvidenceAt: rel.last_evidence_at,
    })
  }

  // Resolve labels for all nodes (including root)
  const rootResolved = await resolveLabel(supabase, entityType, entityId)
  const nodes: GraphNode[] = [
    {
      id: entityId,
      type: entityType,
      label: rootResolved.label,
      metadata: rootResolved.metadata,
    },
  ]

  const resolvePromises = Array.from(seen.values()).map(async ({ type, id }) => {
    const resolved = await resolveLabel(supabase, type, id)
    return { id, type, label: resolved.label, metadata: resolved.metadata }
  })

  const resolved = await Promise.all(resolvePromises)
  nodes.push(...resolved)

  return { nodes, edges }
}

// ─── Cross-Entity Search ───────────────────────────────────────────────────

/**
 * Search across contacts, projects, invoices, and tasks by name/title.
 */
export async function searchEntities(
  supabase: SupabaseClient,
  orgId: string,
  query: string
): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const pattern = `%${q}%`

  const [contacts, projects, invoices, tasks] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, name, type, emails, phones')
      .eq('org_id', orgId)
      .ilike('name', pattern)
      .limit(10),
    supabase
      .from('projects')
      .select('id, name, status, client_id')
      .eq('org_id', orgId)
      .ilike('name', pattern)
      .limit(10),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, amount, contact_id')
      .eq('org_id', orgId)
      .ilike('invoice_number', pattern)
      .limit(10),
    supabase
      .from('tasks')
      .select('id, title, status, priority')
      .eq('org_id', orgId)
      .ilike('title', pattern)
      .limit(10),
  ])

  const results: SearchResult[] = []

  for (const c of contacts.data ?? []) {
    results.push({
      id: c.id,
      type: 'contact',
      label: c.name ?? 'Unnamed',
      snippet: [c.type, c.emails?.[0]].filter(Boolean).join(' - '),
      metadata: c as Record<string, unknown>,
    })
  }

  for (const p of projects.data ?? []) {
    results.push({
      id: p.id,
      type: 'project',
      label: p.name ?? 'Unnamed',
      snippet: `Status: ${p.status ?? 'unknown'}`,
      metadata: p as Record<string, unknown>,
    })
  }

  for (const inv of invoices.data ?? []) {
    results.push({
      id: inv.id,
      type: 'invoice',
      label: inv.invoice_number ?? inv.id,
      snippet: `${inv.status ?? 'draft'} - $${inv.amount ?? 0}`,
      metadata: inv as Record<string, unknown>,
    })
  }

  for (const t of tasks.data ?? []) {
    results.push({
      id: t.id,
      type: 'task',
      label: t.title ?? 'Untitled',
      snippet: `${t.status ?? 'open'} (${t.priority ?? 'normal'})`,
      metadata: t as Record<string, unknown>,
    })
  }

  return results
}
