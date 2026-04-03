import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { extractAndPopulateGraph } from '../entity-extractor'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: SupabaseClient
let testOrgId: string

// Track created records for cleanup
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
})

afterAll(async () => {
  // Clean up test data in reverse dependency order
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

/**
 * Helper: collect all entities, edges, events created during a test
 * by querying the DB for records matching our test org that were
 * created after a given timestamp.
 */
async function collectCreatedRecords(since: string) {
  const { data: entities } = await supabase
    .from('entity_nodes')
    .select('id, name, entity_type')
    .eq('org_id', testOrgId)
    .gte('created_at', since)

  const { data: edges } = await supabase
    .from('entity_edges')
    .select('id, source_id, target_id, relation_type')
    .eq('org_id', testOrgId)
    .gte('ingested_at', since)

  const { data: events } = await supabase
    .from('event_tuples')
    .select('id, subject_id, verb, object_text')
    .eq('org_id', testOrgId)
    .gte('created_at', since)

  // Track for cleanup
  for (const e of entities || []) createdEntityIds.push(e.id)
  for (const e of edges || []) createdEdgeIds.push(e.id)
  for (const e of events || []) createdEventIds.push(e.id)

  return {
    entities: entities || [],
    edges: edges || [],
    events: events || [],
  }
}

describe('extractAndPopulateGraph', () => {
  it('extracts entities from a business message', async () => {
    const before = new Date().toISOString()
    const result = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      'Steve agreed to the $700 Phase 2 proposal',
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )

    // Should have created at least 2 entities (Steve as person, Phase 2 as project)
    expect(result.entities).toBeGreaterThanOrEqual(2)

    const records = await collectCreatedRecords(before)
    const names = records.entities.map((e) => e.name.toLowerCase())
    expect(names.some((n) => n.includes('steve'))).toBe(true)
    expect(names.some((n) => n.includes('phase 2') || n.includes('phase2'))).toBe(true)
  }, 30_000)

  it('extracts SVO events', async () => {
    const before = new Date().toISOString()
    const result = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      'Steve agreed to the $700 Phase 2 proposal',
      { sender: 'test', channel: 'test', timestamp: '2026-04-04T12:00:00Z' }
    )

    expect(result.events).toBeGreaterThanOrEqual(1)

    const records = await collectCreatedRecords(before)
    // Should have an event with verb related to "agreed"
    expect(records.events.some((e) =>
      e.verb.toLowerCase().includes('agreed') || e.verb.toLowerCase().includes('agree')
    )).toBe(true)
  }, 30_000)

  it('extracts relationships/edges', async () => {
    const before = new Date().toISOString()
    const result = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      "Maya's website rebuild is blocked waiting for hosting credentials",
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )

    expect(result.entities).toBeGreaterThanOrEqual(1)
    // Should create at least one edge (Maya -> website rebuild relationship)
    // or at least one event (blocked_by)
    expect(result.edges + result.events).toBeGreaterThanOrEqual(1)

    const records = await collectCreatedRecords(before)
    const entityNames = records.entities.map((e) => e.name.toLowerCase())
    expect(entityNames.some((n) => n.includes('maya'))).toBe(true)
  }, 30_000)

  it('handles empty/trivial messages gracefully', async () => {
    const result = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      "Hey how's it going",
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )

    expect(result.entities).toBe(0)
    expect(result.edges).toBe(0)
    expect(result.events).toBe(0)
  }, 30_000)

  it('never throws on failure (null/undefined input)', async () => {
    // Should not throw, should return zeros
    const result1 = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      null as unknown as string,
      { sender: 'test', channel: 'test' }
    )
    expect(result1).toEqual({ entities: 0, edges: 0, events: 0 })

    const result2 = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      undefined as unknown as string,
      { sender: 'test', channel: 'test' }
    )
    expect(result2).toEqual({ entities: 0, edges: 0, events: 0 })

    const result3 = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      '',
      { sender: 'test', channel: 'test' }
    )
    expect(result3).toEqual({ entities: 0, edges: 0, events: 0 })
  }, 10_000)

  it('deduplicates entities across calls', async () => {
    const before = new Date().toISOString()

    // First call
    await extractAndPopulateGraph(
      supabase,
      testOrgId,
      'Steve sent an email about the project',
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )

    // Second call with same entity
    await extractAndPopulateGraph(
      supabase,
      testOrgId,
      'Steve sent another email about updates',
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )

    const records = await collectCreatedRecords(before)
    // Filter for "Steve" entities - should only have one
    const steveEntities = records.entities.filter((e) =>
      e.name.toLowerCase().includes('steve')
    )
    expect(steveEntities.length).toBe(1)
  }, 60_000)
})
