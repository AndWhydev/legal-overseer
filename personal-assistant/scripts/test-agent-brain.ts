/**
 * Agent Brain Comprehensive Test
 *
 * Tests whether BitBit can embody the full agent brain —
 * not just find facts, but reason, act, and demonstrate agency.
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
const __dir = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dir, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'
const USER = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'

import { runAgentChat } from '../src/lib/agent/engine'

interface TestResult {
  prompt: string
  response: string
  tools: string[]
  iterations: number
  durationMs: number
  pass: boolean
  criteria: string
}

async function runTest(prompt: string, criteria: string, validator: (response: string, tools: string[]) => boolean): Promise<TestResult> {
  const start = Date.now()
  const tools: string[] = []
  let response = ''
  let iterations = 0

  try {
    const events = runAgentChat(prompt, {
      orgId: ORG,
      supabase,
      userId: USER,
      userEmail: 'amatorri847@gmail.com',
      userDisplayName: 'Tor',
      skipCostGuard: true,
    })

    for await (const event of events) {
      if (event.type === 'tool_call') tools.push((event.data as { name: string }).name)
      if (event.type === 'message') response = event.data as string
      if (event.type === 'content_delta') response += event.data as string
      if (event.type === 'stage') {
        const d = event.data as Record<string, unknown>
        if (d.stage === 'api_streaming' && d.status === 'start') iterations = (d.meta as Record<string, number>)?.iteration ?? iterations
      }
    }
  } catch (e) {
    response = `ERROR: ${e instanceof Error ? e.message : String(e)}`
  }

  const pass = validator(response, tools)
  return { prompt, response: response.slice(0, 500), tools, iterations, durationMs: Date.now() - start, pass, criteria }
}

async function main() {
  console.log('=== BitBit Agent Brain — Comprehensive Test ===\n')

  const results: TestResult[] = []

  // Test 1: Does it know Steve's URL without searching?
  console.log('Test 1: Steve West URL knowledge...')
  results.push(await runTest(
    "What's Steve West's website URL?",
    'Finds stevewestpresaleservices.com from memory',
    (r) => r.toLowerCase().includes('stevewestpresaleservices') || r.toLowerCase().includes('presaleservices'),
  ))
  console.log(`  ${results[results.length - 1].pass ? 'PASS' : 'FAIL'} (${results[results.length - 1].tools.length} tools, ${(results[results.length - 1].durationMs / 1000).toFixed(1)}s)`)

  // Test 2: Does it know the user's identity?
  console.log('Test 2: User identity...')
  results.push(await runTest(
    "What's my name and what do I do?",
    'Knows user is Torrin Kay, web developer',
    (r) => {
      const l = r.toLowerCase()
      return (l.includes('torrin') || l.includes('tor')) && (l.includes('web') || l.includes('developer') || l.includes('torkay'))
    },
  ))
  console.log(`  ${results[results.length - 1].pass ? 'PASS' : 'FAIL'} (${results[results.length - 1].tools.length} tools, ${(results[results.length - 1].durationMs / 1000).toFixed(1)}s)`)

  // Test 3: Agency — does it ACT instead of listing options?
  console.log('Test 3: Agency (no option menus)...')
  results.push(await runTest(
    "Check if Steve has any outstanding invoices",
    'Searches and reports findings, does NOT list "options" or ask "want me to"',
    (r, tools) => {
      const l = r.toLowerCase()
      const hasOptions = l.includes('option') && (l.includes('1)') || l.includes('1.'))
      const asksPermission = l.includes('want me to') || l.includes('should i') || l.includes('would you like me')
      const didSearch = tools.length > 0
      return didSearch && !hasOptions && !asksPermission
    },
  ))
  console.log(`  ${results[results.length - 1].pass ? 'PASS' : 'FAIL'} (${results[results.length - 1].tools.length} tools, ${(results[results.length - 1].durationMs / 1000).toFixed(1)}s)`)

  // Test 4: Cross-entity knowledge
  console.log('Test 4: Relationship knowledge...')
  results.push(await runTest(
    "How are Steve West and Maya Mendoza connected?",
    'Knows Maya is Steve\'s sister',
    (r) => {
      const l = r.toLowerCase()
      return l.includes('sister') || l.includes('sibling') || l.includes('family') || l.includes('related')
    },
  ))
  console.log(`  ${results[results.length - 1].pass ? 'PASS' : 'FAIL'} (${results[results.length - 1].tools.length} tools, ${(results[results.length - 1].durationMs / 1000).toFixed(1)}s)`)

  // Test 5: Identity — no "as an AI" or model disclosure
  console.log('Test 5: Identity (no model disclosure)...')
  results.push(await runTest(
    "Are you Claude?",
    'Says BitBit, no model disclosure speech',
    (r) => {
      const l = r.toLowerCase()
      const saysName = l.includes('bitbit')
      const noDisclosure = !l.includes('unable to disclose') && !l.includes('not able to disclose') && !l.includes('underlying model')
      return saysName && noDisclosure
    },
  ))
  console.log(`  ${results[results.length - 1].pass ? 'PASS' : 'FAIL'} (${results[results.length - 1].tools.length} tools, ${(results[results.length - 1].durationMs / 1000).toFixed(1)}s)`)

  // Test 6: Comprehensive world awareness
  console.log('Test 6: World awareness...')
  results.push(await runTest(
    "Give me a quick status on all my active clients",
    'Mentions at least Steve and Maya with real context',
    (r) => {
      const l = r.toLowerCase()
      return l.includes('steve') && (l.includes('maya') || l.includes('mendoza'))
    },
  ))
  console.log(`  ${results[results.length - 1].pass ? 'PASS' : 'FAIL'} (${results[results.length - 1].tools.length} tools, ${(results[results.length - 1].durationMs / 1000).toFixed(1)}s)`)

  // Scorecard
  const passed = results.filter(r => r.pass).length
  const total = results.length
  console.log(`\n${'='.repeat(60)}`)
  console.log(`SCORECARD: ${passed}/${total} passed`)
  console.log('='.repeat(60))
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'} | ${r.criteria}`)
    if (!r.pass) {
      console.log(`  Response: ${r.response.slice(0, 200)}...`)
    }
  }
  console.log()

  process.exit(passed === total ? 0 : 1)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
