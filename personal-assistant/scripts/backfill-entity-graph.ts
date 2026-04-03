/**
 * Backfill Entity Graph from existing contacts
 *
 * Populates entity_nodes from the contacts table and creates embeddings.
 * Run with: npx tsx scripts/backfill-entity-graph.ts
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'

// Use relative imports since tsx doesn't resolve @/ path aliases in scripts
// We dynamically import the modules after setting up the paths
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Inline helpers (avoid path alias issues with tsx) ──────────────────

async function findOrCreateEntity(
  orgId: string,
  name: string,
  type: string,
  aliases: string[],
): Promise<{ id: string; name: string; entity_type: string; properties: Record<string, unknown> } | null> {
  // Check for existing entity by alias match
  const normalised = name.toLowerCase()
  const { data: existing } = await supabase
    .from('entity_nodes')
    .select('*')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .or(`name.ilike.${normalised},aliases.cs.{${normalised}}`)
    .limit(1)
    .single()

  if (existing) return existing

  // Check each alias
  for (const alias of aliases) {
    if (!alias) continue
    const norm = alias.toLowerCase()
    const { data: found } = await supabase
      .from('entity_nodes')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .or(`name.ilike.${norm},aliases.cs.{${norm}}`)
      .limit(1)
      .single()

    if (found) return found
  }

  // Create new
  const allAliases = [...new Set([...aliases, normalised].filter(Boolean).map(a => a.toLowerCase()))]

  const { data, error } = await supabase
    .from('entity_nodes')
    .insert({
      org_id: orgId,
      entity_type: type,
      name,
      aliases: allAliases,
      properties: {},
    })
    .select('*')
    .single()

  if (error) {
    console.error(`  [ERR] Failed to create entity "${name}":`, error.message)
    return null
  }
  return data
}

async function createEdge(
  orgId: string,
  sourceId: string,
  targetId: string,
  relationType: string,
): Promise<boolean> {
  // Invalidate existing
  await supabase
    .from('entity_edges')
    .update({ valid_until: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('source_id', sourceId)
    .eq('target_id', targetId)
    .eq('relation_type', relationType)
    .is('valid_until', null)

  const { error } = await supabase
    .from('entity_edges')
    .insert({
      org_id: orgId,
      source_id: sourceId,
      target_id: targetId,
      relation_type: relationType,
      properties: {},
      valid_from: new Date().toISOString(),
      confidence: 0.9,
    })

  if (error) {
    console.error(`  [ERR] Failed to create edge:`, error.message)
    return false
  }
  return true
}

// ── Voyage embedding (optional, best-effort) ──────────────────────────

async function embedVoyage(text: string): Promise<number[] | null> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: [text],
        model: 'voyage-3.5',
        input_type: 'document',
      }),
    })

    if (!res.ok) return null
    const data = await res.json() as { data?: Array<{ embedding: number[] }> }
    const emb = data.data?.[0]?.embedding
    return emb && emb.length === 1024 ? emb : null
  } catch {
    return null
  }
}

async function embedEntityNode(
  nodeId: string,
  textRepr: string,
): Promise<void> {
  const voyageEmb = await embedVoyage(textRepr)

  const updates: Record<string, unknown> = {}
  if (voyageEmb && voyageEmb.length === 1024) {
    updates.text_embedding = `[${voyageEmb.join(',')}]`
  }

  // Google embedding skipped (no GOOGLE_API_KEY configured yet)

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('entity_nodes')
      .update(updates)
      .eq('id', nodeId)

    if (error) {
      console.error(`  [ERR] Embedding update failed for ${nodeId}:`, error.message)
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Entity Graph Backfill ===\n')

  // 1. Get all orgs
  const { data: orgs, error: orgErr } = await supabase.from('organizations').select('id, name')
  if (orgErr || !orgs || orgs.length === 0) {
    console.error('No organizations found:', orgErr?.message)
    return
  }

  let totalNodes = 0
  let totalEdges = 0
  let totalEmbeddings = 0

  for (const org of orgs) {
    console.log(`\nOrg: ${org.name || org.id}`)

    // 2. Backfill contacts → entity_nodes (person)
    const { data: contacts, error: contactErr } = await supabase
      .from('contacts')
      .select('*')
      .eq('org_id', org.id)

    if (contactErr) {
      console.error(`  [ERR] Failed to fetch contacts:`, contactErr.message)
      continue
    }

    let contactCount = 0
    for (const contact of contacts || []) {
      const aliases = [
        contact.slug,
        contact.name?.toLowerCase(),
        ...(contact.emails || []),
        ...(contact.phones || []),
        ...(contact.aliases || []),
      ].filter(Boolean) as string[]

      const node = await findOrCreateEntity(org.id, contact.name, 'person', aliases)
      if (!node) continue

      // Update properties with contact data
      const { error: updateErr } = await supabase
        .from('entity_nodes')
        .update({
          properties: {
            contact_id: contact.id,
            slug: contact.slug,
            type: contact.type,
            emails: contact.emails,
            phones: contact.phones,
            profile_data: contact.profile_data,
            communication_patterns: contact.communication_patterns,
          },
        })
        .eq('id', node.id)

      if (updateErr) {
        console.error(`  [ERR] Failed to update properties for "${contact.name}":`, updateErr.message)
      }

      // Embed (best-effort)
      const textRepr = `person: ${contact.name}. ${(contact.emails || []).map((e: string) => `email: ${e}`).join('. ')}. ${(contact.phones || []).map((p: string) => `phone: ${p}`).join('. ')}`
      await embedEntityNode(node.id, textRepr)
      totalEmbeddings++

      contactCount++
      process.stdout.write(`  Contacts: ${contactCount}/${(contacts || []).length}\r`)
    }
    console.log(`  Contacts: ${contactCount} nodes created/found`)
    totalNodes += contactCount

    // 3. Check for entity_relationships table (from migration 005) for edges
    const { data: relationships } = await supabase
      .from('entity_relationships')
      .select('*')
      .eq('org_id', org.id)
      .limit(100)

    if (relationships && relationships.length > 0) {
      let edgeCount = 0
      for (const rel of relationships) {
        // Find source and target entity nodes by their contact/entity IDs
        const { data: sourceNodes } = await supabase
          .from('entity_nodes')
          .select('id')
          .eq('org_id', org.id)
          .contains('properties', { contact_id: rel.source_entity_id })
          .limit(1)

        const { data: targetNodes } = await supabase
          .from('entity_nodes')
          .select('id')
          .eq('org_id', org.id)
          .contains('properties', { contact_id: rel.target_entity_id })
          .limit(1)

        if (sourceNodes?.[0] && targetNodes?.[0]) {
          const created = await createEdge(
            org.id,
            sourceNodes[0].id,
            targetNodes[0].id,
            rel.relationship_type || 'related_to',
          )
          if (created) edgeCount++
        }
      }
      console.log(`  Edges from entity_relationships: ${edgeCount}`)
      totalEdges += edgeCount
    }
  }

  // Final counts
  console.log('\n=== Verification ===')
  const { count: nodeCount } = await supabase.from('entity_nodes').select('*', { count: 'exact', head: true })
  const { count: edgeTotal } = await supabase.from('entity_edges').select('*', { count: 'exact', head: true })
  const { count: eventCount } = await supabase.from('event_tuples').select('*', { count: 'exact', head: true })

  console.log(`  entity_nodes: ${nodeCount}`)
  console.log(`  entity_edges: ${edgeTotal}`)
  console.log(`  event_tuples: ${eventCount}`)
  console.log(`\nBackfill complete. Processed ${totalNodes} contacts, ${totalEdges} edges, ${totalEmbeddings} embeddings attempted.`)
}

main().catch(console.error)
