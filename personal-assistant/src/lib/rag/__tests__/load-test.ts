/**
 * RAG Pipeline Load Test
 *
 * Tests the searchVectors() function under concurrent load to measure
 * p50/p90/p99 latency. Mocks Pinecone and Voyage to isolate our code
 * from external API performance.
 *
 * Run via: npx tsx scripts/load-test-rag.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — isolate from real APIs
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../voyage-client', () => ({
  embedQuery: vi.fn(),
  rerankDocuments: vi.fn(),
  isVoyageConfigured: vi.fn(() => true),
}))

vi.mock('../pinecone-client', () => ({
  queryPinecone: vi.fn(),
  getIndex: vi.fn(() => ({})),
  buildMetadataFilter: vi.fn(() => undefined),
}))

vi.mock('@/lib/core/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { embedQuery, rerankDocuments } from '../voyage-client'
import { queryPinecone } from '../pinecone-client'
import { searchVectors } from '../retriever'
import type { SearchOptions } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Test Data
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a fake 1024-dim embedding vector. */
function fakeEmbedding(): number[] {
  return Array.from({ length: 1024 }, (_, i) => Math.sin(i * 0.01))
}

/** Generate N fake Pinecone results with realistic metadata. */
function fakePineconeResults(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `msg-${i}#chunk0`,
    score: 0.95 - i * 0.01,
    metadata: {
      message_id: `msg-${i}`,
      org_id: 'test-org',
      channel: ['gmail', 'slack', 'whatsapp', 'outlook'][i % 4],
      sender: `sender-${i}@example.com`,
      sender_email: `sender-${i}@example.com`,
      subject: `Test subject ${i}`,
      received_at: new Date(Date.now() - i * 86400000).toISOString(),
      chunk_index: 0,
      total_chunks: 1,
      is_full_body: true,
      content: `This is the content of message ${i}. It contains relevant information about project updates, invoices, and meeting notes that the user might search for.`,
    },
  }))
}

const QUERIES: string[] = [
  'What did we discuss about the invoice last week?',
  'Find WhatsApp messages from Andy',
  'Show me emails from March',
  'Latest project updates',
  'Meeting notes from yesterday',
  'Client feedback on the proposal',
  'Action items from the standup',
  'Budget approval for Q2',
  'Contract renewal discussion',
  'Product roadmap changes',
]

// ─────────────────────────────────────────────────────────────────────────────
// Latency Measurement Utilities
// ─────────────────────────────────────────────────────────────────────────────

interface LatencyResult {
  totalMs: number
  perRequestMs: number[]
  p50: number
  p90: number
  p99: number
  min: number
  max: number
  mean: number
  successCount: number
  errorCount: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

function computeLatencyStats(latencies: number[], totalMs: number, errorCount: number): LatencyResult {
  const sorted = [...latencies].sort((a, b) => a - b)
  const sum = sorted.reduce((acc, v) => acc + v, 0)

  return {
    totalMs: Math.round(totalMs * 100) / 100,
    perRequestMs: sorted.map((v) => Math.round(v * 100) / 100),
    p50: Math.round(percentile(sorted, 50) * 100) / 100,
    p90: Math.round(percentile(sorted, 90) * 100) / 100,
    p99: Math.round(percentile(sorted, 99) * 100) / 100,
    min: Math.round((sorted[0] ?? 0) * 100) / 100,
    max: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
    mean: Math.round((sum / Math.max(sorted.length, 1)) * 100) / 100,
    successCount: latencies.length,
    errorCount,
  }
}

/**
 * Run N concurrent searchVectors() calls and measure latency.
 */
async function runConcurrentBatch(concurrency: number): Promise<LatencyResult> {
  const latencies: number[] = []
  let errorCount = 0

  const options: SearchOptions[] = Array.from({ length: concurrency }, (_, i) => ({
    query: QUERIES[i % QUERIES.length],
    orgId: 'test-org',
    topK: 10,
  }))

  const start = performance.now()

  const results = await Promise.allSettled(
    options.map(async (opt) => {
      const reqStart = performance.now()
      const result = await searchVectors(opt)
      const reqEnd = performance.now()
      return { duration: reqEnd - reqStart, resultCount: result.length }
    }),
  )

  const totalMs = performance.now() - start

  for (const result of results) {
    if (result.status === 'fulfilled') {
      latencies.push(result.value.duration)
    } else {
      errorCount++
    }
  }

  return computeLatencyStats(latencies, totalMs, errorCount)
}

// ─────────────────────────────────────────────────────────────────────────────
// Load Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RAG Pipeline Load Test', () => {
  /** Simulated API latency in ms (realistic for mocked calls). */
  const MOCK_EMBED_LATENCY = 2
  const MOCK_PINECONE_LATENCY = 3

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock embedQuery with small simulated latency
    vi.mocked(embedQuery).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_EMBED_LATENCY))
      return fakeEmbedding()
    })

    // Mock queryPinecone with small simulated latency and realistic results
    vi.mocked(queryPinecone).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, MOCK_PINECONE_LATENCY))
      return fakePineconeResults(30) // Over-fetched (topK * 3)
    })

    // Mock reranker — returns results in same order with score adjustment
    vi.mocked(rerankDocuments).mockImplementation(async (_query, docs, topK) => {
      return docs.slice(0, topK ?? 10).map((doc, idx) => ({
        id: doc.id,
        score: 0.99 - idx * 0.02,
      }))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('handles 10 concurrent searchVectors() calls', async () => {
    const result = await runConcurrentBatch(10)

    expect(result.successCount).toBe(10)
    expect(result.errorCount).toBe(0)
    expect(result.p50).toBeLessThan(500) // p50 under 500ms with mocks
    expect(result.p99).toBeLessThan(2000) // p99 under 2s
    expect(result.mean).toBeGreaterThan(0)

    // Log results for inspection
    console.log('\n--- 10 concurrent calls ---')
    console.log(`  Total:   ${result.totalMs}ms`)
    console.log(`  p50:     ${result.p50}ms`)
    console.log(`  p90:     ${result.p90}ms`)
    console.log(`  p99:     ${result.p99}ms`)
    console.log(`  Min/Max: ${result.min}ms / ${result.max}ms`)
    console.log(`  Mean:    ${result.mean}ms`)
  }, 30_000)

  it('handles 50 concurrent searchVectors() calls', async () => {
    const result = await runConcurrentBatch(50)

    expect(result.successCount).toBe(50)
    expect(result.errorCount).toBe(0)
    expect(result.p50).toBeLessThan(1000)
    expect(result.p99).toBeLessThan(5000)

    console.log('\n--- 50 concurrent calls ---')
    console.log(`  Total:   ${result.totalMs}ms`)
    console.log(`  p50:     ${result.p50}ms`)
    console.log(`  p90:     ${result.p90}ms`)
    console.log(`  p99:     ${result.p99}ms`)
    console.log(`  Min/Max: ${result.min}ms / ${result.max}ms`)
    console.log(`  Mean:    ${result.mean}ms`)
  }, 60_000)

  it('handles 100 concurrent searchVectors() calls', async () => {
    const result = await runConcurrentBatch(100)

    expect(result.successCount).toBe(100)
    expect(result.errorCount).toBe(0)
    expect(result.p50).toBeLessThan(2000)
    expect(result.p99).toBeLessThan(10000)

    console.log('\n--- 100 concurrent calls ---')
    console.log(`  Total:   ${result.totalMs}ms`)
    console.log(`  p50:     ${result.p50}ms`)
    console.log(`  p90:     ${result.p90}ms`)
    console.log(`  p99:     ${result.p99}ms`)
    console.log(`  Min/Max: ${result.min}ms / ${result.max}ms`)
    console.log(`  Mean:    ${result.mean}ms`)
  }, 120_000)

  it('identifies bottlenecks: embedding vs retrieval', async () => {
    // Measure embedding cost separately
    const embedStart = performance.now()
    for (let i = 0; i < 10; i++) {
      await embedQuery(QUERIES[i % QUERIES.length])
    }
    const embedTotalMs = performance.now() - embedStart
    const embedAvgMs = embedTotalMs / 10

    // Measure pinecone cost separately
    const pineconeStart = performance.now()
    for (let i = 0; i < 10; i++) {
      await queryPinecone(fakeEmbedding(), 'test-org', { topK: 30 })
    }
    const pineconeTotalMs = performance.now() - pineconeStart
    const pineconeAvgMs = pineconeTotalMs / 10

    // Full pipeline (10 calls)
    const fullResult = await runConcurrentBatch(10)

    console.log('\n--- Bottleneck Analysis (10 calls) ---')
    console.log(`  Avg embed:    ${Math.round(embedAvgMs * 100) / 100}ms`)
    console.log(`  Avg pinecone: ${Math.round(pineconeAvgMs * 100) / 100}ms`)
    console.log(`  Full pipeline mean: ${fullResult.mean}ms`)
    console.log(`  Overhead:     ${Math.round((fullResult.mean - embedAvgMs - pineconeAvgMs) * 100) / 100}ms`)

    // Embedding + Pinecone should account for most of the latency
    expect(embedAvgMs).toBeGreaterThan(0)
    expect(pineconeAvgMs).toBeGreaterThan(0)
  }, 30_000)

  it('maintains consistent latency under repeated load', async () => {
    const rounds: LatencyResult[] = []

    // Run 3 rounds of 10-concurrent-call batches
    for (let i = 0; i < 3; i++) {
      const result = await runConcurrentBatch(10)
      rounds.push(result)
    }

    // All rounds should complete without errors
    for (const round of rounds) {
      expect(round.errorCount).toBe(0)
      expect(round.successCount).toBe(10)
    }

    // Latency should not degrade significantly between rounds
    // (no memory leaks or resource exhaustion in our code)
    const p50s = rounds.map((r) => r.p50)
    const maxP50Ratio = Math.max(...p50s) / Math.max(Math.min(...p50s), 0.1)

    console.log('\n--- Consistency (3 rounds of 10) ---')
    rounds.forEach((r, i) => {
      console.log(`  Round ${i + 1}: p50=${r.p50}ms, p90=${r.p90}ms, p99=${r.p99}ms`)
    })
    console.log(`  Max/Min p50 ratio: ${Math.round(maxP50Ratio * 100) / 100}x`)

    // p50 should not vary more than 10x between rounds (generous margin for CI)
    expect(maxP50Ratio).toBeLessThan(10)
  }, 60_000)

  it('handles errors gracefully under load', async () => {
    // Make 20% of embedQuery calls fail
    let callCount = 0
    vi.mocked(embedQuery).mockImplementation(async () => {
      callCount++
      if (callCount % 5 === 0) {
        return null // Simulate embedding failure
      }
      await new Promise((r) => setTimeout(r, MOCK_EMBED_LATENCY))
      return fakeEmbedding()
    })

    const options: SearchOptions[] = Array.from({ length: 20 }, (_, i) => ({
      query: QUERIES[i % QUERIES.length],
      orgId: 'test-org',
      topK: 10,
    }))

    const results = await Promise.allSettled(
      options.map(async (opt) => {
        const result = await searchVectors(opt)
        return result
      }),
    )

    // All calls should resolve (not throw) — graceful degradation
    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    expect(fulfilled.length).toBe(20) // All should resolve, even on embed failure

    // Some should return empty arrays (embed failed)
    const emptyResults = fulfilled.filter(
      (r) => r.status === 'fulfilled' && r.value.length === 0,
    )
    expect(emptyResults.length).toBeGreaterThan(0)

    console.log('\n--- Error handling under load ---')
    console.log(`  Total calls:    ${results.length}`)
    console.log(`  Fulfilled:      ${fulfilled.length}`)
    console.log(`  Empty (degraded): ${emptyResults.length}`)
  }, 30_000)
})

// ─────────────────────────────────────────────────────────────────────────────
// Exported types and runner for the standalone script
// ─────────────────────────────────────────────────────────────────────────────

export type { LatencyResult }
export { runConcurrentBatch, computeLatencyStats, fakePineconeResults, fakeEmbedding }
