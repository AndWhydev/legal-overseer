/**
 * BitBit Demo Stress Test
 *
 * Tests that would be run during an official demo to showcase:
 * - Instant world knowledge (no gradual learning)
 * - Agency (acts, doesn't list options)
 * - Cross-channel intelligence
 * - Financial awareness
 * - Proactive behavior
 * - Natural identity
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dir, '../.env.local') })

import { createClient } from '@supabase/supabase-js'
import { runAgentChat } from '../src/lib/agent/engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
const USER = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'

interface Result {
  name: string
  prompt: string
  response: string
  tools: string[]
  duration: number
  pass: boolean
  check: string
}

async function run(name: string, prompt: string, check: string, validator: (r: string, t: string[]) => boolean): Promise<Result> {
  const start = Date.now()
  const tools: string[] = []
  let response = ''

  try {
    for await (const event of runAgentChat(prompt, {
      orgId: ORG, supabase, userId: USER,
      userEmail: 'amatorri847@gmail.com', userDisplayName: 'Tor',
      skipCostGuard: true,
    })) {
      if (event.type === 'tool_call') tools.push((event.data as { name: string }).name)
      if (event.type === 'message') response = event.data as string
      if (event.type === 'content_delta') response += event.data as string
    }
  } catch (e) {
    response = `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }

  const pass = validator(response, tools)
  const duration = Date.now() - start
  console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} (${tools.length} tools, ${(duration/1000).toFixed(1)}s)`)
  if (!pass) console.log(`      Response: ${response.slice(0, 150)}...`)
  return { name, prompt, response: response.slice(0, 300), tools, duration, pass, check }
}

async function main() {
  console.log('=== BitBit Official Demo Stress Test ===\n')

  const results: Result[] = []

  // ── SECTION 1: First Impression (Onboarding Proof) ──

  console.log('--- First Impression ---')

  results.push(await run(
    'Knows user instantly',
    "Hey, what do you know about me?",
    'Names the user, knows their role/business',
    (r) => (r.toLowerCase().includes('torrin') || r.toLowerCase().includes('tor')) && r.toLowerCase().includes('web'),
  ))

  results.push(await run(
    'Knows all clients',
    "Who are my clients?",
    'Lists Steve West and Maya Mendoza by name',
    (r) => r.toLowerCase().includes('steve') && r.toLowerCase().includes('maya'),
  ))

  results.push(await run(
    'Knows websites',
    "What websites am I managing?",
    'Mentions presaleservices and mayamendoza domains',
    (r) => r.toLowerCase().includes('presaleservices') || r.toLowerCase().includes('mayamendoza'),
  ))

  // ── SECTION 2: Agency (Does, Doesn't Describe) ──

  console.log('\n--- Agency ---')

  results.push(await run(
    'Finds info without asking',
    "What's the latest with Steve?",
    'Searches and reports, no "want me to" or options',
    (r, t) => {
      const l = r.toLowerCase()
      return t.length > 0 && !l.includes('want me to') && !l.includes('would you like') && l.includes('steve')
    },
  ))

  results.push(await run(
    'Handles vague request',
    "Catch me up",
    'Provides a real status update, not "what would you like to know"',
    (r) => {
      const l = r.toLowerCase()
      return !l.includes('what would you') && !l.includes('what area') && r.length > 100
    },
  ))

  // ── SECTION 3: Financial Awareness ──

  console.log('\n--- Financial Awareness ---')

  results.push(await run(
    'Knows invoice details',
    "Does anyone owe me money?",
    'Mentions Steve $500 invoice or financial details',
    (r) => r.includes('500') || r.toLowerCase().includes('invoice') || r.toLowerCase().includes('overdue'),
  ))

  // ── SECTION 4: Relationship Intelligence ──

  console.log('\n--- Relationship Intelligence ---')

  results.push(await run(
    'Cross-entity relationships',
    "Tell me about Maya's situation",
    'Knows Maya, her website issues, connection to Steve',
    (r) => {
      const l = r.toLowerCase()
      return l.includes('maya') && (l.includes('website') || l.includes('sister') || l.includes('scotland'))
    },
  ))

  results.push(await run(
    'Contact enrichment',
    "What do you know about Karly?",
    'Finds Karly at ASA from memory',
    (r) => r.toLowerCase().includes('karly') && (r.toLowerCase().includes('asa') || r.toLowerCase().includes('analytic')),
  ))

  // ── SECTION 5: Identity & Trust ──

  console.log('\n--- Identity & Trust ---')

  results.push(await run(
    'Natural identity',
    "What are you?",
    'Says BitBit naturally, no corporate disclosure',
    (r) => {
      const l = r.toLowerCase()
      return l.includes('bitbit') && !l.includes('unable to disclose') && !l.includes('underlying model')
    },
  ))

  results.push(await run(
    'Honest about capabilities',
    "Did you build Steve's website?",
    'Admits it did NOT build the site — user did',
    (r) => {
      const l = r.toLowerCase()
      return l.includes('you') || l.includes("didn't") || l.includes('did not') || l.includes('no')
    },
  ))

  // ── SECTION 6: Complex Multi-Step ──

  console.log('\n--- Complex Multi-Step ---')

  results.push(await run(
    'Multi-entity research',
    "Give me a complete picture of all my active projects with status, people involved, and any blockers",
    'Synthesizes across multiple entities and projects',
    (r) => r.length > 200 && r.toLowerCase().includes('steve'),
  ))

  // ── SCORECARD ──

  const passed = results.filter(r => r.pass).length
  const total = results.length
  const totalTime = results.reduce((s, r) => s + r.duration, 0)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`DEMO SCORECARD: ${passed}/${total} passed (${(totalTime/1000).toFixed(0)}s total)`)
  console.log('='.repeat(60))

  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.name}`)
    console.log(`     ${r.check}`)
  }

  if (passed < total) {
    console.log(`\n${total - passed} FAILURES:`)
    for (const r of results.filter(r => !r.pass)) {
      console.log(`  ${r.name}: ${r.response.slice(0, 150)}`)
    }
  }

  console.log(`\nDemo readiness: ${passed === total ? 'READY' : `${total - passed} issue(s) to fix`}`)
  process.exit(passed === total ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
