/**
 * Engine Stress Test Harness
 *
 * Calls runAgentChat directly with test prompts and monitors:
 * - Tool calls (count, names, parallel vs sequential timing)
 * - Iterations used vs max
 * - Progress nudge / convergence hint triggered
 * - Final response quality (length, whether it's a real answer)
 * - Total duration and token usage
 *
 * Usage: npx tsx scripts/stress-test-engine.ts [test-number]
 *   Run all:  npx tsx scripts/stress-test-engine.ts
 *   Run one:  npx tsx scripts/stress-test-engine.ts 1
 */

import { config as loadEnv } from 'dotenv'
import { resolve } from 'path'
loadEnv({ path: resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'
import { runAgentChat } from '../src/lib/agent/engine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const TOR_USER_ID = '02ce2616-c01b-45a5-a2ad-16ebe936a6b2'
const TOR_ORG_ID = '7abcbfb1-67e5-4a3b-aa08-a17cfd2867e9'

interface TestCase {
  id: number
  name: string
  prompt: string
  expectation: string
}

const TEST_CASES: TestCase[] = [
  {
    id: 1,
    name: 'Multi-entity research',
    prompt: 'Give me a full briefing on everything happening with ASA Australian Spatial Analytics — who\'s involved, what\'s the status, and any outstanding items',
    expectation: 'Parallel tool calls, synthesizes within 12 iterations',
  },
  {
    id: 2,
    name: 'Cross-domain synthesis',
    prompt: 'What\'s my financial exposure right now? Check invoices, outstanding payments, any mentions of money in recent emails, and what tasks are tied to billing',
    expectation: 'Searches across invoices, tasks, messages, memory concurrently',
  },
  {
    id: 3,
    name: 'Relationship mapping',
    prompt: 'Map out everyone connected to Steve West — who he\'s talked to, what projects he\'s involved in, any invoices or tasks linked to him',
    expectation: 'Entity resolution chain, progress eval lets it go deep',
  },
  {
    id: 4,
    name: 'Dense context query',
    prompt: 'Read my last 5 emails and tell me what themes are emerging, who needs a response, and what I can ignore',
    expectation: 'Holds multiple email contents simultaneously in expanded context',
  },
  {
    id: 5,
    name: 'Broad identity query',
    prompt: 'What do you know about me?',
    expectation: 'Depth protocol: sent emails, received, memory. Synthesizes after 3-4 sources',
  },
  {
    id: 6,
    name: 'Deliberately vague',
    prompt: 'Catch me up on everything',
    expectation: 'Broad search, progress nudge prevents infinite loop',
  },
  {
    id: 7,
    name: 'Convergence stress',
    prompt: 'Research every person in my contacts, cross-reference with emails, and give me a relationship map with status for each one',
    expectation: 'Hits many tools, convergence at iteration 14, produces synthesis',
  },
]

interface TestResult {
  testId: number
  name: string
  toolCalls: string[]
  toolCallCount: number
  iterations: number
  progressNudgeTriggered: boolean
  convergenceTriggered: boolean
  finalResponseLength: number
  finalResponsePreview: string
  hitMaxIterations: boolean
  durationMs: number
  inputTokens: number
  outputTokens: number
  errors: string[]
}

async function runTest(test: TestCase): Promise<TestResult> {
  const start = Date.now()
  const toolCalls: string[] = []
  let finalResponse = ''
  let inputTokens = 0
  let outputTokens = 0
  const errors: string[] = []
  let iterationCount = 0

  console.log(`\n${'='.repeat(60)}`)
  console.log(`TEST ${test.id}: ${test.name}`)
  console.log(`Prompt: "${test.prompt.slice(0, 80)}..."`)
  console.log(`Expected: ${test.expectation}`)
  console.log('='.repeat(60))

  try {
    const events = runAgentChat(test.prompt, {
      orgId: TOR_ORG_ID,
      supabase,
      userId: TOR_USER_ID,
      userEmail: 'tor@torkay.com',
      userDisplayName: 'Tor',
      skipCostGuard: true,
    })

    for await (const event of events) {
      switch (event.type) {
        case 'tool_call':
          toolCalls.push(event.data.name)
          console.log(`  [tool] ${event.data.name}`)
          break
        case 'tool_result':
          const success = event.data.success ? 'OK' : 'FAIL'
          console.log(`  [result] ${event.data.name}: ${success}`)
          break
        case 'message':
          finalResponse = event.data
          break
        case 'content_delta':
          finalResponse += event.data
          break
        case 'error':
          errors.push(event.data)
          console.log(`  [ERROR] ${event.data}`)
          break
        case 'stage': {
          const stageData = event.data as Record<string, unknown>
          if (stageData.stage === 'api_streaming' && stageData.status === 'start') {
            const meta = stageData.meta as Record<string, number> | undefined
            iterationCount = meta?.iteration ?? iterationCount
          }
          break
        }
        case 'done': {
          const doneData = event.data as Record<string, unknown> | undefined
          const tokens = doneData?.tokens as Record<string, number> | undefined
          if (tokens) {
            inputTokens = tokens.input_tokens ?? 0
            outputTokens = tokens.output_tokens ?? 0
          }
          break
        }
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err))
    console.log(`  [FATAL] ${errors[errors.length - 1]}`)
  }

  const durationMs = Date.now() - start
  const hitMaxIterations = finalResponse.includes('maximum iterations')
  const progressNudgeTriggered = toolCalls.length >= 8
  const convergenceTriggered = iterationCount >= 14

  const result: TestResult = {
    testId: test.id,
    name: test.name,
    toolCalls,
    toolCallCount: toolCalls.length,
    iterations: iterationCount,
    progressNudgeTriggered,
    convergenceTriggered,
    finalResponseLength: finalResponse.length,
    finalResponsePreview: finalResponse.slice(0, 200).replace(/\n/g, ' '),
    hitMaxIterations,
    durationMs,
    inputTokens,
    outputTokens,
    errors,
  }

  // Print summary
  console.log(`\n  --- Results ---`)
  console.log(`  Tools: ${toolCalls.length} (${[...new Set(toolCalls)].join(', ')})`)
  console.log(`  Iterations: ${iterationCount}`)
  console.log(`  Duration: ${(durationMs / 1000).toFixed(1)}s`)
  console.log(`  Tokens: ${inputTokens} in / ${outputTokens} out`)
  console.log(`  Response: ${finalResponse.length} chars`)
  console.log(`  Hit max iterations: ${hitMaxIterations ? 'YES (BAD)' : 'NO (GOOD)'}`)
  console.log(`  Progress nudge eligible: ${progressNudgeTriggered ? 'YES' : 'NO'}`)
  console.log(`  Errors: ${errors.length > 0 ? errors.join('; ') : 'none'}`)
  console.log(`  Preview: "${result.finalResponsePreview}..."`)

  return result
}

async function main() {
  const selectedTest = process.argv[2] ? parseInt(process.argv[2]) : null

  const testsToRun = selectedTest
    ? TEST_CASES.filter(t => t.id === selectedTest)
    : TEST_CASES

  if (testsToRun.length === 0) {
    console.error(`Test ${selectedTest} not found. Available: ${TEST_CASES.map(t => t.id).join(', ')}`)
    process.exit(1)
  }

  console.log(`\nBitBit Engine Stress Test`)
  console.log(`Running ${testsToRun.length} test(s)...\n`)

  const results: TestResult[] = []

  for (const test of testsToRun) {
    const result = await runTest(test)
    results.push(result)
  }

  // Final scorecard
  console.log(`\n\n${'='.repeat(60)}`)
  console.log('SCORECARD')
  console.log('='.repeat(60))
  console.log(`| # | Name                    | Tools | Iters | Time   | MaxIter? | Response |`)
  console.log(`|---|-------------------------|-------|-------|--------|----------|----------|`)
  for (const r of results) {
    const name = r.name.padEnd(23).slice(0, 23)
    const tools = String(r.toolCallCount).padStart(5)
    const iters = String(r.iterations).padStart(5)
    const time = `${(r.durationMs / 1000).toFixed(1)}s`.padStart(6)
    const maxIter = r.hitMaxIterations ? '  YES   ' : '   NO   '
    const resp = `${r.finalResponseLength}ch`.padStart(8)
    console.log(`| ${r.testId} | ${name} | ${tools} | ${iters} | ${time} | ${maxIter} | ${resp} |`)
  }

  const failures = results.filter(r => r.hitMaxIterations || r.errors.length > 0)
  if (failures.length > 0) {
    console.log(`\n${failures.length} test(s) need attention:`)
    for (const f of failures) {
      console.log(`  - Test ${f.testId} (${f.name}): ${f.hitMaxIterations ? 'hit max iterations' : ''} ${f.errors.join('; ')}`)
    }
  } else {
    console.log(`\nAll ${results.length} tests passed without hitting max iterations.`)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
