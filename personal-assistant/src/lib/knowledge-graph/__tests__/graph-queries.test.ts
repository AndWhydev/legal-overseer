import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  findOrCreateEntity,
  getEntityByAlias,
  getNeighborhood,
  getEntityEvents,
  createEdge,
  createEventTuple,
  vectorSearchEntities,
} from '../graph-queries'
import type { EntityNode } from '../types'

// Load from .env.local (dotenv/config reads .env; we also need .env.local)
import { config } from 'dotenv'
config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: SupabaseClient
let testOrgId: string

// Track created entities for cleanup
const createdEntityIds: string[] = []
const createdEdgeIds: string[] = []
const createdEventIds: string[] = []

beforeAll(async () => {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Get existing org for tests (service role bypasses RLS)
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single()

  expect(org).toBeTruthy()
  testOrgId = org!.id
})

afterAll(async () => {
  // Clean up in reverse dependency order: events, edges, nodes
  if (createdEventIds.length > 0) {
    await supabase.from('event_tuples').delete().in('id', createdEventIds)
  }
  if (createdEdgeIds.length > 0) {
    await supabase.from('entity_edges').delete().in('id', createdEdgeIds)
  }
  if (createdEntityIds.length > 0) {
    await supabase.from('entity_nodes').delete().in('id', createdEntityIds)
  }
})

function trackEntity(node: EntityNode | null) {
  if (node) createdEntityIds.push(node.id)
  return node
}

describe('findOrCreateEntity', () => {
  it('creates a new entity when none exists', async () => {
    const name = `test-entity-${Date.now()}`
    const entity = trackEntity(
      await findOrCreateEntity(supabase, testOrgId, name, 'person', ['test-alias-unique-' + Date.now()])
    )

    expect(entity).toBeTruthy()
    expect(entity!.name).toBe(name)
    expect(entity!.entity_type).toBe('person')
  })

  it('returns existing entity on alias match', async () => {
    const name = `test-dup-${Date.now()}`
    const alias = `dup-alias-${Date.now()}`
    const first = trackEntity(
      await findOrCreateEntity(supabase, testOrgId, name, 'company', [alias])
    )
    expect(first).toBeTruthy()

    // Try creating with same alias but different name - should find existing
    const second = await findOrCreateEntity(supabase, testOrgId, 'different-name', 'company', [alias])
    expect(second).toBeTruthy()
    expect(second!.id).toBe(first!.id)
  })
})

describe('getNeighborhood', () => {
  it('returns 1-hop neighbors and filters invalidated edges', async () => {
    const nodeA = trackEntity(
      await findOrCreateEntity(supabase, testOrgId, `node-a-${Date.now()}`, 'person')
    )
    const nodeB = trackEntity(
      await findOrCreateEntity(supabase, testOrgId, `node-b-${Date.now()}`, 'project')
    )
    const nodeC = trackEntity(
      await findOrCreateEntity(supabase, testOrgId, `node-c-${Date.now()}`, 'company')
    )
    expect(nodeA).toBeTruthy()
    expect(nodeB).toBeTruthy()
    expect(nodeC).toBeTruthy()

    // Create active edges A->B and A->C
    const edgeAB = await createEdge(supabase, testOrgId, nodeA!.id, nodeB!.id, 'works_on')
    const edgeAC = await createEdge(supabase, testOrgId, nodeA!.id, nodeC!.id, 'employed_by')
    if (edgeAB) createdEdgeIds.push(edgeAB.id)
    if (edgeAC) createdEdgeIds.push(edgeAC.id)

    const neighborhood = await getNeighborhood(supabase, testOrgId, nodeA!.id)
    expect(neighborhood).toBeTruthy()
    expect(neighborhood!.node.id).toBe(nodeA!.id)
    expect(neighborhood!.edges.length).toBeGreaterThanOrEqual(2)
    expect(neighborhood!.neighbors.length).toBeGreaterThanOrEqual(2)

    const neighborIds = neighborhood!.neighbors.map((n) => n.id)
    expect(neighborIds).toContain(nodeB!.id)
    expect(neighborIds).toContain(nodeC!.id)

    // Now invalidate edge A->B by creating a replacement (createEdge auto-invalidates)
    const edgeAB2 = await createEdge(supabase, testOrgId, nodeA!.id, nodeB!.id, 'works_on')
    if (edgeAB2) createdEdgeIds.push(edgeAB2.id)

    // Old edge should be invalidated, neighborhood should still have B via new edge
    const neighborhood2 = await getNeighborhood(supabase, testOrgId, nodeA!.id)
    expect(neighborhood2).toBeTruthy()
    // All returned edges should be active (valid_until IS NULL) since default filter
    for (const edge of neighborhood2!.edges) {
      expect(edge.valid_until).toBeNull()
    }
    expect(neighborhood2!.edges.length).toBeGreaterThanOrEqual(2)
  })
})

describe('getEntityEvents', () => {
  it('returns events ordered by occurred_at DESC and respects time range', async () => {
    const entity = trackEntity(
      await findOrCreateEntity(supabase, testOrgId, `event-entity-${Date.now()}`, 'person')
    )
    expect(entity).toBeTruthy()

    // Create events at different times
    const e1 = await createEventTuple(
      supabase, testOrgId, entity!.id, 'sent_email', 'Hello', '2026-01-01T10:00:00Z'
    )
    const e2 = await createEventTuple(
      supabase, testOrgId, entity!.id, 'called', 'Follow up', '2026-02-15T10:00:00Z'
    )
    const e3 = await createEventTuple(
      supabase, testOrgId, entity!.id, 'met', 'Coffee meeting', '2026-03-20T10:00:00Z'
    )
    if (e1) createdEventIds.push(e1.id)
    if (e2) createdEventIds.push(e2.id)
    if (e3) createdEventIds.push(e3.id)

    // All events, should be newest first
    const all = await getEntityEvents(supabase, testOrgId, entity!.id)
    expect(all.length).toBeGreaterThanOrEqual(3)
    // Verify DESC ordering
    const occurrences = all.map((e) => new Date(e.occurred_at).getTime())
    for (let i = 1; i < occurrences.length; i++) {
      expect(occurrences[i - 1]).toBeGreaterThanOrEqual(occurrences[i])
    }

    // Time range filter: only Feb
    const febEvents = await getEntityEvents(supabase, testOrgId, entity!.id, {
      from: '2026-02-01T00:00:00Z',
      to: '2026-02-28T23:59:59Z',
    })
    expect(febEvents.length).toBe(1)
    expect(febEvents[0].verb).toBe('called')
  })
})

describe('createEdge', () => {
  it('auto-invalidates prior same-type edge', async () => {
    const a = trackEntity(
      await findOrCreateEntity(supabase, testOrgId, `edge-a-${Date.now()}`, 'person')
    )
    const b = trackEntity(
      await findOrCreateEntity(supabase, testOrgId, `edge-b-${Date.now()}`, 'company')
    )
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()

    const edge1 = await createEdge(supabase, testOrgId, a!.id, b!.id, 'manages')
    if (edge1) createdEdgeIds.push(edge1.id)
    expect(edge1).toBeTruthy()
    expect(edge1!.valid_until).toBeNull()

    // Create another edge of same type -- should invalidate edge1
    const edge2 = await createEdge(supabase, testOrgId, a!.id, b!.id, 'manages')
    if (edge2) createdEdgeIds.push(edge2.id)
    expect(edge2).toBeTruthy()
    expect(edge2!.valid_until).toBeNull()

    // Verify edge1 is now invalidated
    const { data: oldEdge } = await supabase
      .from('entity_edges')
      .select('*')
      .eq('id', edge1!.id)
      .single()
    expect(oldEdge).toBeTruthy()
    expect(oldEdge!.valid_until).not.toBeNull()
  })
})

describe('vectorSearchEntities', () => {
  it('returns results ordered by similarity', async () => {
    // Create entities with embeddings (768 dimensions)
    const dim768 = new Array(768).fill(0)

    const embA = [...dim768]
    embA[0] = 1.0

    const embB = [...dim768]
    embB[0] = 0.9
    embB[1] = 0.1

    const embC = [...dim768]
    embC[100] = 1.0

    const ts = Date.now()
    const insertions = [
      { org_id: testOrgId, entity_type: 'person', name: `vec-a-${ts}`, aliases: [], properties: {}, embedding: JSON.stringify(embA) },
      { org_id: testOrgId, entity_type: 'person', name: `vec-b-${ts}`, aliases: [], properties: {}, embedding: JSON.stringify(embB) },
      { org_id: testOrgId, entity_type: 'person', name: `vec-c-${ts}`, aliases: [], properties: {}, embedding: JSON.stringify(embC) },
    ]

    const { data: inserted, error: insErr } = await supabase
      .from('entity_nodes')
      .insert(insertions)
      .select('id, name')

    expect(insErr).toBeNull()
    for (const row of inserted || []) {
      createdEntityIds.push(row.id)
    }

    // Search with query vector similar to A
    const queryVec = [...dim768]
    queryVec[0] = 1.0

    const results = await vectorSearchEntities(supabase, testOrgId, queryVec, 10)
    expect(results.length).toBeGreaterThan(0)

    // Results should be sorted by similarity descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity)
    }
  })
})
