import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

import { createClient } from '@supabase/supabase-js'
import { runAgentChat } from '../src/lib/agent/engine'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  console.log('=== Demo Test: Andy Invoice (Draft Only) ===\n')
  const tools: string[] = []
  let response = ''
  const start = Date.now()

  for await (const event of runAgentChat(
    "Hey BitBit! Can you draft that $150 invoice for Andy?",
    {
      orgId: '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9',
      supabase,
      userId: '02ce2616-c01b-45a5-a2ad-16ebe936a6b2',
      userEmail: 'amatorri847@gmail.com',
      userDisplayName: 'Tor',
      skipCostGuard: true,
    }
  )) {
    if (event.type === 'tool_call') { tools.push((event.data as { name: string }).name); console.log(`  [tool] ${(event.data as { name: string }).name}`) }
    if (event.type === 'message') response = event.data as string
    if (event.type === 'content_delta') response += event.data as string
    if (event.type === 'tool_result') {
      const d = event.data as { name: string; success: boolean; queued?: boolean }
      console.log(`  [result] ${d.name}: ${d.success ? 'OK' : 'FAIL'}${d.queued ? ' (QUEUED)' : ''}`)
    }
  }

  console.log(`\nTools: ${tools.length} (${[...new Set(tools)].join(', ')})`)
  console.log(`Duration: ${((Date.now() - start) / 1000).toFixed(1)}s`)
  console.log('\n--- Response ---')
  console.log(response)

  // Validation
  const l = response.toLowerCase()
  const checks = [
    ['Mentions Andy', l.includes('andy')],
    ['Mentions $150', l.includes('150')],
    ['Mentions invoice', l.includes('invoice')],
    ['Doesn\'t ask "want me to"', !l.includes('want me to')],
    ['Took action (used tools)', tools.length > 0],
  ]

  console.log('\n--- Validation ---')
  for (const [name, pass] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}`)
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
