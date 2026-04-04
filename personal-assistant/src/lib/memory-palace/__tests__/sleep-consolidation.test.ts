import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: SupabaseClient
let testOrgId: string

// Track created resources for cleanup
const createdEntityIds: string[] = []
const createdEdgeIds: string[] = []
const createdEventIds: string[] = []
const createdMemoryIds: string[] = []

beforeAll(async () => {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Get existing org for tests
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .limit(1)
    .single()

  expect(org).toBeTruthy()
  testOrgId = org!.id
})

afterAll(async () => {
  // Clean up in reverse dependency order
  if (createdMemoryIds.length > 0) {
    await supabase.from('memory_palace_entries').delete().in('id', createdMemoryIds)
  }
  if (createdEventIds.length > 0) {
    await supabase.from('event_tuples').delete().in('id', createdEventIds)
  }
  if (createdEdgeIds.length > 0) {
    await supabase.from('entity_edges').delete().in('id', createdEdgeIds)
  }
  if (createdEntityIds.length > 0) {
    await supabase.from('entity_nodes').delete().in('id', createdEntityIds)
  }
  // Restore org settings (remove morning_briefing key)
  const { data: org } = await supabase
    .from('organisations')
    .select('settings')
    .eq('id', testOrgId)
    .single()
  if (org?.settings) {
    const settings = org.settings as Record<string, unknown>
    delete settings.morning_briefing
    await supabase.from('organisations').update({ settings }).eq('id', testOrgId)
  }
})

async function createTestEntity(name: string, type: string = 'person') {
  const { data, error } = await supabase
    .from('entity_nodes')
    .insert({
      org_id: testOrgId,
      entity_type: type,
      name,
      aliases: [name.toLowerCase()],
      properties: {},
    })
    .select('*')
    .single()

  expect(error).toBeNull()
  createdEntityIds.push(data!.id)
  return data!
}

async function createTestEvent(subjectId: string, verb: string, objectText: string, occurredAt?: string) {
  const { data, error } = await supabase
    .from('event_tuples')
    .insert({
      org_id: testOrgId,
      subject_id: subjectId,
      verb,
      object_text: objectText,
      occurred_at: occurredAt || new Date().toISOString(),
      metadata: {},
    })
    .select('*')
    .single()

  expect(error).toBeNull()
  createdEventIds.push(data!.id)
  return data!
}

async function createTestEdge(
  sourceId: string,
  targetId: string,
  relationType: string,
  props?: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from('entity_edges')
    .insert({
      org_id: testOrgId,
      source_id: sourceId,
      target_id: targetId,
      relation_type: relationType,
      properties: props || {},
      valid_from: new Date().toISOString(),
      confidence: 0.8,
    })
    .select('*')
    .single()

  expect(error).toBeNull()
  createdEdgeIds.push(data!.id)
  return data!
}

describe('Sleep Consolidation Pipeline', () => {
  // We import dynamically to ensure env is loaded
  let runSleepConsolidation: typeof import('../sleep-consolidation').runSleepConsolidation

  beforeAll(async () => {
    const mod = await import('../sleep-consolidation')
    runSleepConsolidation = mod.runSleepConsolidation
  })

  describe('Stage 1: SUMMARIZE', () => {
    it('populates daily_summary in entity properties for entities with today events', async () => {
      const ts = Date.now()
      const entity = await createTestEntity(`summarize-test-${ts}`)

      // Create an event tuple for today
      await createTestEvent(entity.id, 'sent_email', 'Follow-up about project timeline')

      const report = await runSleepConsolidation(supabase, testOrgId)

      expect(report.summarized).toBeGreaterThanOrEqual(1)

      // Verify entity properties updated
      const { data: updated } = await supabase
        .from('entity_nodes')
        .select('properties')
        .eq('id', entity.id)
        .single()

      expect(updated).toBeTruthy()
      const props = updated!.properties as Record<string, unknown>
      expect(props.daily_summary).toBeTruthy()
      expect(typeof props.daily_summary).toBe('string')
      expect(props.last_summarized).toBeTruthy()
    }, 30000)
  })

  describe('Stage 2: RESOLVE CONFLICTS', () => {
    it('invalidates duplicate edges keeping the most recent', async () => {
      const ts = Date.now()
      const entityA = await createTestEntity(`conflict-a-${ts}`)
      const entityB = await createTestEntity(`conflict-b-${ts}`)

      // Create two edges with same (source, target, type) — both active
      const edge1 = await createTestEdge(entityA.id, entityB.id, 'test_manages')

      // Small delay to ensure different valid_from
      await new Promise((r) => setTimeout(r, 50))
      const edge2 = await createTestEdge(entityA.id, entityB.id, 'test_manages')

      const report = await runSleepConsolidation(supabase, testOrgId)

      expect(report.conflictsResolved).toBeGreaterThanOrEqual(1)

      // Verify: one edge should have valid_until set
      const { data: edges } = await supabase
        .from('entity_edges')
        .select('id, valid_until, valid_from')
        .in('id', [edge1.id, edge2.id])
        .order('valid_from', { ascending: false })

      expect(edges).toBeTruthy()
      expect(edges!.length).toBe(2)

      // Most recent (edge2) should be active, older (edge1) should be invalidated
      const active = edges!.filter((e) => e.valid_until === null)
      const invalidated = edges!.filter((e) => e.valid_until !== null)
      expect(active.length).toBe(1)
      expect(invalidated.length).toBe(1)
      expect(active[0].id).toBe(edge2.id)
    }, 30000)
  })

  describe('Stage 3: DISCOVER RELATIONSHIPS', () => {
    it('creates new edge for co-occurring entities with no existing edge', async () => {
      const ts = Date.now()
      const entityA = await createTestEntity(`discover-a-${ts}`)
      const entityB = await createTestEntity(`discover-b-${ts}`)

      // Create co-occurring events (same date)
      const today = new Date().toISOString()
      await createTestEvent(entityA.id, 'attended_meeting', 'Quarterly review', today)
      await createTestEvent(entityB.id, 'attended_meeting', 'Quarterly review', today)

      const report = await runSleepConsolidation(supabase, testOrgId)

      expect(report.relationshipsDiscovered).toBeGreaterThanOrEqual(1)

      // Verify new edge exists between the two entities
      const { data: edges } = await supabase
        .from('entity_edges')
        .select('id, properties, source_id, target_id')
        .eq('org_id', testOrgId)
        .is('valid_until', null)
        .or(
          `and(source_id.eq.${entityA.id},target_id.eq.${entityB.id}),and(source_id.eq.${entityB.id},target_id.eq.${entityA.id})`,
        )

      expect(edges).toBeTruthy()
      expect(edges!.length).toBeGreaterThanOrEqual(1)

      // Track for cleanup
      for (const e of edges || []) {
        if (!createdEdgeIds.includes(e.id)) createdEdgeIds.push(e.id)
      }

      // Verify source is 'consolidation'
      const discoveredEdge = edges!.find(
        (e) => (e.properties as Record<string, unknown>)?.source === 'consolidation',
      )
      expect(discoveredEdge).toBeTruthy()
    }, 60000)
  })

  describe('Stage 5: MORNING BRIEFING', () => {
    it('generates morning briefing in org settings', async () => {
      const ts = Date.now()
      const entity = await createTestEntity(`briefing-test-${ts}`)

      // Create a deadline event in the next 24h
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      await createTestEvent(entity.id, 'deadline', 'Project proposal due', tomorrow)

      const report = await runSleepConsolidation(supabase, testOrgId)

      expect(report.briefingGenerated).toBe(true)

      // Verify org settings has morning_briefing
      const { data: org } = await supabase
        .from('organisations')
        .select('settings')
        .eq('id', testOrgId)
        .single()

      expect(org).toBeTruthy()
      const settings = org!.settings as Record<string, unknown>
      expect(settings.morning_briefing).toBeTruthy()

      const briefing = settings.morning_briefing as Record<string, unknown>
      expect(briefing.generatedAt).toBeTruthy()
      expect(Array.isArray(briefing.upcomingDeadlines)).toBe(true)
    }, 30000)
  })
})
