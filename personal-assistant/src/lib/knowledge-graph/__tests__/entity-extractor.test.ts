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
    const result = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      'Steve agreed to the $700 Phase 2 proposal',
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )

    // Should have processed at least 1 entity (may be deduped from prior runs)
    expect(result.entities).toBeGreaterThanOrEqual(1)

    // Verify entities exist in DB (may have been created in prior runs)
    const { data: steveMatch } = await supabase
      .from('entity_nodes')
      .select('id, name')
      .eq('org_id', testOrgId)
      .ilike('name', '%steve%')
      .limit(1)
    for (const e of steveMatch || []) createdEntityIds.push(e.id)
    expect(steveMatch?.length).toBeGreaterThanOrEqual(1)

    const { data: phaseMatch } = await supabase
      .from('entity_nodes')
      .select('id, name')
      .eq('org_id', testOrgId)
      .or('name.ilike.%phase%,name.ilike.%proposal%')
      .limit(1)
    for (const e of phaseMatch || []) createdEntityIds.push(e.id)
    expect(phaseMatch?.length).toBeGreaterThanOrEqual(1)
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
    const result = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      "Maya's website rebuild is blocked waiting for hosting credentials",
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )

    // LLM extraction is non-deterministic; verify some structure was extracted.
    // Entities may be deduplicated if they already exist from prior runs,
    // so check the aggregate return counts (includes both new + deduped).
    expect(result.entities + result.edges + result.events).toBeGreaterThanOrEqual(1)

    // Verify at least one entity now exists in DB with a relevant name
    const { data: matching } = await supabase
      .from('entity_nodes')
      .select('id, name')
      .eq('org_id', testOrgId)
      .or('name.ilike.%maya%,name.ilike.%website%,name.ilike.%rebuild%,name.ilike.%hosting%')
      .limit(5)

    for (const e of matching || []) createdEntityIds.push(e.id)
    expect(matching?.length).toBeGreaterThanOrEqual(1)
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
    // Use a unique name to avoid collisions with other tests
    const uniqueName = `Bartholomew-${Date.now()}`

    // First call
    const r1 = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      `${uniqueName} signed the contract for the new deal`,
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )
    expect(r1.entities).toBeGreaterThanOrEqual(1)

    // Second call with same entity name
    const r2 = await extractAndPopulateGraph(
      supabase,
      testOrgId,
      `${uniqueName} followed up on the contract status`,
      { sender: 'test', channel: 'test', timestamp: new Date().toISOString() }
    )

    // Query ALL entities in this org matching the unique name
    const { data: allMatching } = await supabase
      .from('entity_nodes')
      .select('id, name')
      .eq('org_id', testOrgId)
      .ilike('name', `%${uniqueName}%`)

    // Track for cleanup
    for (const e of allMatching || []) createdEntityIds.push(e.id)

    // Should have exactly one entity, not two
    expect(allMatching).toBeTruthy()
    expect(allMatching!.length).toBe(1)
  }, 60_000)
})
