import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import {
  findOrCreateEntity,
  createEdge,
  createEventTuple,
} from '@/lib/knowledge-graph/graph-queries'
import type { EntityNode, EntityEdge, EventTuple } from '@/lib/knowledge-graph/types'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: SupabaseClient
let testOrgId: string

// Test entities
let entityAlice: EntityNode
let entityBob: EntityNode
let entityProject: EntityNode

// Track for cleanup
const createdEntityIds: string[] = []
const createdEdgeIds: string[] = []
const createdEventIds: string[] = []

beforeAll(async () => {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .limit(1)
    .single()
  expect(org).toBeTruthy()
  testOrgId = org!.id

  // Create test entities
  const ts = Date.now()
  entityAlice = (await findOrCreateEntity(supabase, testOrgId, `test-alice-${ts}`, 'person', [`alice-${ts}`]))!
  entityBob = (await findOrCreateEntity(supabase, testOrgId, `test-bob-${ts}`, 'person', [`bob-${ts}`]))!
  entityProject = (await findOrCreateEntity(supabase, testOrgId, `test-project-${ts}`, 'project', [`proj-${ts}`]))!

  createdEntityIds.push(entityAlice.id, entityBob.id, entityProject.id)

  // Create edges: Alice --works_on--> Project, Alice --knows--> Bob
  const edge1 = await createEdge(supabase, testOrgId, entityAlice.id, entityProject.id, 'works_on')
  const edge2 = await createEdge(supabase, testOrgId, entityAlice.id, entityBob.id, 'knows')
  const edge3 = await createEdge(supabase, testOrgId, entityBob.id, entityProject.id, 'contributes_to')
  if (edge1) createdEdgeIds.push(edge1.id)
  if (edge2) createdEdgeIds.push(edge2.id)
  if (edge3) createdEdgeIds.push(edge3.id)

  // Create events for Alice
  const now = new Date()
  const e1 = await createEventTuple(supabase, testOrgId, entityAlice.id, 'sent_email', 'Discussed pricing', new Date(now.getTime() - 2 * 86400000).toISOString())
  const e2 = await createEventTuple(supabase, testOrgId, entityAlice.id, 'attended_meeting', 'Sprint review', new Date(now.getTime() - 5 * 86400000).toISOString())
  const e3 = await createEventTuple(supabase, testOrgId, entityAlice.id, 'completed_task', 'API integration', new Date(now.getTime() - 10 * 86400000).toISOString())
  if (e1) createdEventIds.push(e1.id)
  if (e2) createdEventIds.push(e2.id)
  if (e3) createdEventIds.push(e3.id)
})

afterAll(async () => {
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

describe('graphAwareRecall', () => {
  it('returns formatted context with neighborhood and events for an entity', async () => {
    const { graphAwareRecall } = await import('../proactive-recall')

    const results = await graphAwareRecall(supabase, testOrgId, [entityAlice.id])

    expect(results).toBeTruthy()
    expect(results.length).toBeGreaterThan(0)

    const aliceResult = results.find(r => r.entityId === entityAlice.id)
    expect(aliceResult).toBeTruthy()
    expect(aliceResult!.formattedText).toContain('works_on')
    expect(aliceResult!.formattedText).toContain('knows')
    // Should contain event descriptions
    expect(aliceResult!.formattedText).toContain('sent_email')
  })

  it('falls back to legacy recall when no graph data exists', async () => {
    const { graphAwareRecall } = await import('../proactive-recall')

    // Use a random UUID that has no entity_node
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const results = await graphAwareRecall(supabase, testOrgId, [fakeId])

    // Should return empty (no graph data AND no legacy data for fake ID)
    expect(results).toEqual([])
  })

  it('respects 1500 token budget', async () => {
    const { graphAwareRecall } = await import('../proactive-recall')

    const results = await graphAwareRecall(supabase, testOrgId, [entityAlice.id, entityBob.id, entityProject.id])

    // Total text across all results should fit within budget
    const totalText = results.map(r => r.formattedText).join('\n')
    const estimatedTokens = totalText.length / 3.5
    expect(estimatedTokens).toBeLessThanOrEqual(1500)
  })

  it('orders items by blended score (relevance*0.4 + confidence*0.3 + recency*0.2 + edgeWeight*0.1)', async () => {
    const { graphAwareRecall } = await import('../proactive-recall')

    const results = await graphAwareRecall(supabase, testOrgId, [entityAlice.id])
    expect(results.length).toBeGreaterThan(0)

    const aliceResult = results.find(r => r.entityId === entityAlice.id)
    expect(aliceResult).toBeTruthy()
    // Scored items should be in descending score order
    expect(aliceResult!.scoredItems).toBeDefined()
    for (let i = 1; i < aliceResult!.scoredItems.length; i++) {
      expect(aliceResult!.scoredItems[i - 1].blendedScore)
        .toBeGreaterThanOrEqual(aliceResult!.scoredItems[i].blendedScore)
    }
  })

  it('merges results from multiple entity_node_ids and deduplicates', async () => {
    const { graphAwareRecall } = await import('../proactive-recall')

    const results = await graphAwareRecall(supabase, testOrgId, [entityAlice.id, entityBob.id])

    // Should have results for both entities (or merged)
    expect(results.length).toBeGreaterThanOrEqual(1)

    // Total formatted text should mention both entities
    const allText = results.map(r => r.formattedText).join('\n')
    expect(allText).toContain(entityAlice.name)
    expect(allText).toContain(entityBob.name)
  })

  it('returns empty result for empty entity_node_ids array', async () => {
    const { graphAwareRecall } = await import('../proactive-recall')

    const results = await graphAwareRecall(supabase, testOrgId, [])
    expect(results).toEqual([])
  })
})

describe('legacyProactiveRecall', () => {
  it('is exported for backwards compatibility', async () => {
    const { legacyProactiveRecall } = await import('../proactive-recall')
    expect(typeof legacyProactiveRecall).toBe('function')
  })
})

describe('formatProactiveRecall', () => {
  it('still works with new result format', async () => {
    const { formatProactiveRecall } = await import('../proactive-recall')
    expect(typeof formatProactiveRecall).toBe('function')

    const formatted = formatProactiveRecall([])
    expect(formatted).toBe('')
  })
})
