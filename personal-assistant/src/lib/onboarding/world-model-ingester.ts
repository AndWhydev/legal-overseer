/**
 * World Model Ingester
 *
 * Takes the structured WorldModel from Opus synthesis and populates:
 * - contacts table (people)
 * - kg_nodes + kg_edges (knowledge graph)
 * - semantic_memories (key facts)
 * - entity_profiles (pre-computed briefings)
 *
 * This is the bridge between Opus comprehension and BitBit's runtime intelligence.
 */

import { logger } from '@/lib/core/logger'
import { getKnowledgeGraph } from '@/lib/rag/knowledge-graph'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorldModel, WorldModelPerson, WorldModelProject } from './opus-synthesis'

export interface IngestionResult {
  contactsCreated: number
  contactsUpdated: number
  memoriesStored: number
  graphNodesCreated: number
  graphEdgesCreated: number
  durationMs: number
}

/**
 * Ingest a world model into BitBit's database.
 * Populates contacts, knowledge graph, and semantic memories.
 */
export async function ingestWorldModel(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  model: WorldModel,
): Promise<IngestionResult> {
  const start = Date.now()
  let contactsCreated = 0
  let contactsUpdated = 0
  let memoriesStored = 0
  let graphNodesCreated = 0
  let graphEdgesCreated = 0

  const graph = getKnowledgeGraph(supabase, orgId)

  // Phase 1: Create/update contacts from people
  const contactIdMap = new Map<string, string>() // name → contact UUID

  for (const person of model.people) {
    try {
      const result = await upsertContact(supabase, orgId, person)
      contactIdMap.set(person.name.toLowerCase(), result.id)
      if (result.created) contactsCreated++
      else contactsUpdated++
    } catch (err) {
      logger.warn('[world-model-ingester] Contact upsert failed', {
        name: person.name, error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // Phase 2: Populate knowledge graph
  // Create person nodes
  for (const person of model.people) {
    const contactId = contactIdMap.get(person.name.toLowerCase()) ?? `ext:${person.name}`
    await graph.upsertPerson({
      id: contactId,
      name: person.name,
      email: person.emails[0],
      phone: person.phones[0],
      org_id: orgId,
      created_at: new Date().toISOString(),
    })
    graphNodesCreated++
  }

  // Create project nodes + link people to projects
  for (const project of model.projects) {
    const projectId = `project:${project.name.toLowerCase().replace(/\s+/g, '-')}`
    await graph.upsertTopic({
      id: projectId,
      name: project.name,
      org_id: orgId,
      first_seen: new Date().toISOString(),
      last_seen: new Date().toISOString(),
    })
    graphNodesCreated++

    // Link people to project via MENTIONED_IN
    for (const personName of project.people) {
      const contactId = contactIdMap.get(personName.toLowerCase()) ?? `ext:${personName}`
      await graph.addMention(contactId, projectId, 'onboarding-synthesis', 'synthesis', new Date().toISOString())
      graphEdgesCreated++
    }
  }

  // Create CONTACTED_BY edges between user and contacts
  for (const person of model.people) {
    if (person.communicationFrequency !== 'rare') {
      const contactId = contactIdMap.get(person.name.toLowerCase()) ?? `ext:${person.name}`
      await graph.addContact(userId, contactId, 'email', 1, person.lastInteraction || new Date().toISOString())
      graphEdgesCreated++
    }
  }

  // Phase 3: Store semantic memories

  // User identity facts
  if (model.user.name) {
    await storeMemory(supabase, orgId, `User's name is ${model.user.name}`, 'preference', 0.95)
    memoriesStored++
  }
  if (model.user.businessName) {
    await storeMemory(supabase, orgId, `User's business is ${model.user.businessName}`, 'preference', 0.95)
    memoriesStored++
  }
  if (model.user.role) {
    await storeMemory(supabase, orgId, `User's role: ${model.user.role}`, 'preference', 0.90)
    memoriesStored++
  }
  if (model.user.communicationStyle) {
    await storeMemory(supabase, orgId, `User's communication style: ${model.user.communicationStyle}`, 'preference', 0.85, 'never')
    memoriesStored++
  }

  // Key person facts
  for (const person of model.people) {
    const contactId = contactIdMap.get(person.name.toLowerCase())
    const entityIds = contactId ? [contactId] : []

    // Relationship
    await storeMemory(supabase, orgId, `${person.name} is a ${person.relationship}${person.company ? ` at ${person.company}` : ''}${person.role ? `, ${person.role}` : ''}`, 'relationship', 0.90, 'slow', entityIds)
    memoriesStored++

    // Outstanding items
    for (const item of person.outstandingItems) {
      await storeMemory(supabase, orgId, `[outstanding] ${person.name}: ${item}`, 'general', 0.80, 'normal', entityIds)
      memoriesStored++
    }

    // Notes
    if (person.notes && person.notes.length > 10) {
      await storeMemory(supabase, orgId, `[context] ${person.name}: ${person.notes}`, 'general', 0.75, 'normal', entityIds)
      memoriesStored++
    }
  }

  // Website/domain facts
  for (const site of model.websitesAndDomains) {
    await storeMemory(supabase, orgId, `Website: ${site.url} — ${site.owner}: ${site.purpose}`, 'factual' as string, 0.90, 'slow')
    memoriesStored++
  }

  // Financial facts
  for (const fin of model.financials) {
    await storeMemory(supabase, orgId, `[financial] ${fin.entity}: ${fin.amount} ${fin.currency} (${fin.type}, ${fin.status}) — ${fin.reference}`, 'financial', 0.85, 'normal')
    memoriesStored++
  }

  // Commitment facts
  for (const commit of model.commitments) {
    if (commit.status !== 'done') {
      await storeMemory(supabase, orgId, `[commitment] ${commit.owner}: ${commit.description} (deadline: ${commit.deadline})`, 'general', 0.80, 'normal')
      memoriesStored++
    }
  }

  // Communication patterns
  for (const pattern of model.communicationPatterns) {
    await storeMemory(supabase, orgId, `[pattern] ${pattern}`, 'general', 0.70, 'slow')
    memoriesStored++
  }

  // Phase 4: Store the raw briefing as a high-confidence summary
  if (model.rawMarkdown) {
    const narrativeStart = model.rawMarkdown.indexOf('## SECTION 2')
    if (narrativeStart > 0) {
      const narrative = model.rawMarkdown.slice(narrativeStart)
      if (narrative.length > 100) {
        await storeMemory(supabase, orgId, `[onboarding-briefing] ${narrative.slice(0, 2000)}`, 'general', 0.95, 'slow')
        memoriesStored++
      }
    }
  }

  const durationMs = Date.now() - start

  logger.info('[world-model-ingester] Ingestion complete', {
    orgId, contactsCreated, contactsUpdated, memoriesStored,
    graphNodesCreated, graphEdgesCreated, durationMs,
  })

  return { contactsCreated, contactsUpdated, memoriesStored, graphNodesCreated, graphEdgesCreated, durationMs }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function upsertContact(
  supabase: SupabaseClient,
  orgId: string,
  person: WorldModelPerson,
): Promise<{ id: string; created: boolean }> {
  // Check if contact already exists by email or name
  let existing = null

  if (person.emails.length > 0) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .or(person.emails.map(e => `emails.cs.{${e}}`).join(','))
      .limit(1)
      .maybeSingle()
    existing = data
  }

  if (!existing) {
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .eq('org_id', orgId)
      .ilike('name', person.name)
      .limit(1)
      .maybeSingle()
    existing = data
  }

  if (existing) {
    // Update existing contact with enriched data
    await supabase
      .from('contacts')
      .update({
        emails: person.emails.length > 0 ? person.emails : undefined,
        phones: person.phones.length > 0 ? person.phones : undefined,
        profile_data: {
          company_name: person.company || undefined,
          role: person.role || undefined,
          relationship: person.relationship,
          communication_frequency: person.communicationFrequency,
          onboarding_synthesized: true,
        },
      })
      .eq('id', existing.id)

    return { id: existing.id, created: false }
  }

  // Create new contact
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      org_id: orgId,
      name: person.name,
      emails: person.emails,
      phones: person.phones,
      type: person.relationship === 'client' ? 'client' : person.relationship === 'vendor' ? 'partner' : 'business',
      profile_data: {
        company_name: person.company || undefined,
        role: person.role || undefined,
        relationship: person.relationship,
        communication_frequency: person.communicationFrequency,
        onboarding_synthesized: true,
      },
    })
    .select('id')
    .single()

  if (error) throw error
  return { id: data.id, created: true }
}

async function storeMemory(
  supabase: SupabaseClient,
  orgId: string,
  content: string,
  category: string,
  confidence: number,
  decayRate: string = 'normal',
  entityIds: string[] = [],
): Promise<void> {
  // Map to DB-allowed categories
  const categoryMap: Record<string, string> = {
    financial: 'financial', preference: 'preference',
    relationship: 'relationship', general: 'general', factual: 'general',
  }
  const dbCategory = categoryMap[category] ?? 'general'

  await supabase.from('semantic_memories').insert({
    org_id: orgId,
    content,
    category: dbCategory,
    confidence,
    entity_ids: entityIds,
    is_active: true,
    admission_score: confidence,
    decay_rate: decayRate,
  })
}
