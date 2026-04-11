/**
 * Test: Invoice generation from email history
 *
 * BitBit should:
 * 1. Search past emails for invoices you've sent
 * 2. Extract the format/template from those
 * 3. Generate a new invoice for Andy ($150) using that format
 * 4. Present it for approval (not send)
 */
import { config } from 'dotenv'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env.local') })

import { createClient } from '@supabase/supabase-js'
const { runAgentChat } = require('../src/lib/agent/engine') as typeof import('../src/lib/agent/engine')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function main() {
  console.log('=== Invoice Generation Test ===\n')
  console.log('Prompt: Full end-to-end invoice creation from email history\n')

  const tools: string[] = []
  let response = ''
  const start = Date.now()

  const prompt = `I need to send Andy that $150 invoice we discussed. Can you look at how I've done invoices before (check my sent emails for any past invoices I've sent to anyone) and then draft one in the same style for Andy Taleb at All Webbed Up? The invoice is for BitBit development services. Don't send it yet, just draft it and show me.`

  for await (const event of runAgentChat(prompt, {
    orgId: '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9',
    supabase,
    userId: '02ce2616-c01b-45a5-a2ad-16ebe936a6b2',
    userEmail: 'amatorri847@gmail.com',
    userDisplayName: 'Tor',
    skipCostGuard: true,
  })) {
    if (event.type === 'tool_call') {
      const name = (event.data as { name: string }).name
      tools.push(name)
      console.log(`  [tool] ${name}`)
    }
    if (event.type === 'tool_result') {
      const d = event.data as { name: string; success: boolean }
      console.log(`  [result] ${d.name}: ${d.success ? 'OK' : 'FAIL'}`)
    }
    if (event.type === 'message') response = event.data as string
    if (event.type === 'content_delta') response += event.data as string
  }

  const duration = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`\nTools: ${tools.length} (${[...new Set(tools)].join(', ')})`)
  console.log(`Duration: ${duration}s`)
  console.log('\n' + '='.repeat(60))
  console.log('RESPONSE:')
  console.log('='.repeat(60))
  console.log(response)

  // Validation
  const l = response.toLowerCase()
  console.log('\n--- Validation ---')
  const checks = [
    ['Mentions Andy/All Webbed Up', l.includes('andy') || l.includes('all webbed up')],
    ['Mentions $150', l.includes('150')],
    ['Has invoice structure', l.includes('invoice') && (l.includes('from:') || l.includes('to:') || l.includes('total') || l.includes('amount') || l.includes('description'))],
    ['Searched sent emails', tools.includes('find_messages')],
    ['Used memory', tools.includes('search_memory')],
    ['Did NOT auto-send', !tools.includes('send_email') && !tools.includes('send_gmail') && !tools.includes('send_outlook')],
  ]
  for (const [name, pass] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'} | ${name}`)
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
