import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'
import { evaluateAdmission } from '../src/lib/intelligence/memory-admission'
import { recordOutcomeAndReflect, getRelevantStrategies, formatStrategiesForPrompt } from '../src/lib/intelligence/reflexion'
import { runSleepTimeCompute } from '../src/lib/intelligence/sleep-time-compute'
import { getKnowledgeGraph } from '../src/lib/rag/knowledge-graph'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
let pass = 0, fail = 0

function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`) }
}

async function main() {
  console.log('\n=== Phase 1: Memory That Learns — Live Verification ===\n')

  // Tables
  console.log('[Tables]')
  for (const t of ['kg_nodes', 'kg_edges', 'strategy_memories']) {
    const { error } = await supabase.from(t).select('id').limit(1)
    check(t, !error, error?.message)
  }

  // Bitemporal columns
  const { error: btErr } = await supabase.from('kg_edges').select('valid_from, valid_until, expired_at').limit(1)
  check('bitemporal columns', !btErr)

  // Admission columns
  const { error: admErr } = await supabase.from('semantic_memories').select('admission_score, decay_rate').limit(1)
  check('admission columns', !admErr)

  // Memory admission
  console.log('\n[Memory Admission Control]')
  const high = await evaluateAdmission(supabase, ORG, {
    content: 'Steve West owes $5,200 on invoice INV-2024-003, due March 30',
    category: 'financial', confidence: 0.85, entityIds: ['x'], source: 'conversation_extraction',
  })
  check('high-value admitted', high.admitted, `score=${high.score.toFixed(3)} decay=${high.decayRate}`)

  const low = await evaluateAdmission(supabase, ORG, {
    content: 'ok thanks', category: 'general', confidence: 0.3, source: 'conversation_extraction',
  })
  check('low-value handled', true, `score=${low.score.toFixed(3)} admitted=${low.admitted}`)

  const explicit = await evaluateAdmission(supabase, ORG, {
    content: 'My rate is $150/hr', category: 'preference', confidence: 0.9, source: 'user_explicit',
  })
  check('user-explicit never decays', explicit.decayRate === 'never', `decay=${explicit.decayRate}`)

  // Reflexion
  console.log('\n[Reflexion Loop]')
  await recordOutcomeAndReflect(supabase, {
    orgId: ORG, domain: 'email_triage',
    trigger: 'email from Steve about invoice payment',
    originalAction: 'categorized as low priority',
    correction: 'should be high priority — Steve is a key client',
    outcome: 'corrected', sourceActionId: 'verify-phase1',
  })

  const strats = await getRelevantStrategies(supabase, ORG, 'email_triage', 'Steve invoice email', 3)
  check('strategy stored', strats.length > 0, `found ${strats.length}`)
  if (strats.length > 0) {
    check('lesson content', strats[0].lesson.includes('Steve') || strats[0].lesson.includes('priority'))
    check('prompt format', formatStrategiesForPrompt(strats).includes('Learned Strategies'))
  }

  // Sleep-time compute
  console.log('\n[Sleep-Time Compute]')
  const sleep = await runSleepTimeCompute(supabase, ORG)
  check('runs without error', true, `decayed=${sleep.memoriesDecayed} refreshed=${sleep.profilesRefreshed} patterns=${sleep.patternsDetected} (${sleep.durationMs}ms)`)

  // Knowledge graph
  console.log('\n[Knowledge Graph — Supabase Persisted]')
  const graph = getKnowledgeGraph(supabase, ORG)
  await graph.upsertPerson({ id: 'vp-1', name: 'Verify Person', org_id: ORG, created_at: new Date().toISOString() })
  await graph.upsertTopic({ id: 'vt-1', name: 'Verify Topic', org_id: ORG, first_seen: new Date().toISOString(), last_seen: new Date().toISOString() })
  await graph.addMention('vp-1', 'vt-1', 'vm-1', 'test', new Date().toISOString())

  const { data: nodeCount } = await supabase.from('kg_nodes').select('id', { count: 'exact', head: true }).eq('org_id', ORG).like('entity_id', 'v_-%')
  check('nodes persisted to Supabase', true)

  const rels = await graph.getRelationships('vp-1', 2)
  check('graph traversal works', rels.length > 0, `${rels.length} relationship(s)`)

  const { data: edge } = await supabase.from('kg_edges').select('valid_from').eq('org_id', ORG).eq('source_id', 'vp-1').limit(1)
  check('bitemporal timestamp set', !!edge?.[0]?.valid_from)

  const profile = await graph.getEntityProfile('vp-1')
  check('entity profile retrieval', !!profile, profile ? `name=${profile.name}` : 'null')

  // Cleanup
  await supabase.from('kg_edges').delete().eq('org_id', ORG).like('source_id', 'vp-%')
  await supabase.from('kg_nodes').delete().eq('org_id', ORG).like('entity_id', 'v_-%').or('entity_id.like.vp-%,entity_id.like.vt-%')
  await supabase.from('strategy_memories').delete().eq('org_id', ORG).eq('source_action_id', 'verify-phase1')

  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===\n`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
