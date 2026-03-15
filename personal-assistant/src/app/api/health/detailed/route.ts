import { NextResponse } from 'next/server'
import {
  getServiceClient,
  isServiceClientConfigured,
} from '@/lib/supabase/service-client'
import { getIndex } from '@/lib/rag/pinecone-client'
import { logger } from '@/lib/core/logger'

/**
 * Detailed health check endpoint for uptime monitoring services.
 *
 * Publicly accessible — no auth required.
 * Returns structured per-service health with latency measurements.
 *
 * Recommended polling interval: every 60 seconds.
 * Alert threshold: status === 'error' or any critical check failing.
 */

export const dynamic = 'force-dynamic'

type CheckStatus = 'ok' | 'degraded' | 'unconfigured' | 'error'

interface ServiceCheck {
  status:     CheckStatus
  latency_ms: number | null
  message?:   string
}

interface DetailedHealthResponse {
  status:    'ok' | 'degraded' | 'error'
  timestamp: string
  version:   string
  region:    string
  checks: {
    supabase:  ServiceCheck
    pinecone:  ServiceCheck
    api:       ServiceCheck
  }
  summary: {
    total_checks:   number
    passed:         number
    degraded:       number
    failed:         number
  }
}

async function checkSupabase(): Promise<ServiceCheck> {
  if (!isServiceClientConfigured()) {
    return { status: 'unconfigured', latency_ms: null, message: 'SUPABASE env vars not set' }
  }

  const start = Date.now()
  try {
    const supabase = getServiceClient()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    try {
      const { error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .limit(1)
        .abortSignal(controller.signal)

      const latency_ms = Date.now() - start

      if (error) {
        return { status: 'error', latency_ms, message: error.message }
      }
      return { status: 'ok', latency_ms }
    } finally {
      clearTimeout(timeout)
    }
  } catch (err) {
    const latency_ms = Date.now() - start
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('[health/detailed] Supabase check failed', { message })
    return { status: 'error', latency_ms, message }
  }
}

async function checkPinecone(): Promise<ServiceCheck> {
  if (!process.env.PINECONE_API_KEY) {
    return { status: 'unconfigured', latency_ms: null, message: 'PINECONE_API_KEY not set' }
  }

  const start = Date.now()
  try {
    const index = getIndex()
    if (!index) {
      return { status: 'error', latency_ms: Date.now() - start, message: 'Failed to get Pinecone index' }
    }

    // Describe index stats as a lightweight connectivity ping
    const stats = await Promise.race([
      index.describeIndexStats(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Pinecone timeout')), 5000)
      ),
    ])

    const latency_ms = Date.now() - start
    const totalVectors = stats.totalRecordCount ?? 0

    return {
      status: 'ok',
      latency_ms,
      message: `${totalVectors} vectors indexed`,
    }
  } catch (err) {
    const latency_ms = Date.now() - start
    const message = err instanceof Error ? err.message : String(err)
    logger.warn('[health/detailed] Pinecone check failed', { message })
    // Pinecone issues are non-critical — degrade, don't error
    return { status: 'degraded', latency_ms, message }
  }
}

function checkApi(): ServiceCheck {
  // Verify critical env vars are present (without exposing values)
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'ANTHROPIC_API_KEY',
  ]
  const missing = required.filter(k => !process.env[k])

  if (missing.length > 0) {
    return {
      status: 'error',
      latency_ms: 0,
      message: `Missing env vars: ${missing.join(', ')}`,
    }
  }

  // Optional vars — note as degraded if absent
  const optional = ['PINECONE_API_KEY', 'RESEND_API_KEY', 'STRIPE_SECRET_KEY']
  const missingOptional = optional.filter(k => !process.env[k])

  if (missingOptional.length > 0) {
    return {
      status: 'degraded',
      latency_ms: 0,
      message: `Optional env vars missing: ${missingOptional.join(', ')}`,
    }
  }

  return { status: 'ok', latency_ms: 0 }
}

export async function GET(): Promise<NextResponse> {
  const [supabase, pinecone] = await Promise.all([
    checkSupabase(),
    checkPinecone(),
  ])
  const api = checkApi()

  const checks = { supabase, pinecone, api }

  const statusValues = Object.values(checks).map(c => c.status)
  const hasError    = statusValues.some(s => s === 'error')
  const hasDegraded = statusValues.some(s => s === 'degraded' || s === 'unconfigured')

  const overallStatus: DetailedHealthResponse['status'] =
    hasError ? 'error' : hasDegraded ? 'degraded' : 'ok'

  const passed   = statusValues.filter(s => s === 'ok').length
  const degraded = statusValues.filter(s => s === 'degraded' || s === 'unconfigured').length
  const failed   = statusValues.filter(s => s === 'error').length

  const body: DetailedHealthResponse = {
    status:    overallStatus,
    timestamp: new Date().toISOString(),
    version:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
      process.env.npm_package_version ||
      'local',
    region: process.env.VERCEL_REGION || process.env.FLY_REGION || 'unknown',
    checks,
    summary: {
      total_checks: statusValues.length,
      passed,
      degraded,
      failed,
    },
  }

  const httpStatus = overallStatus === 'error' ? 503 : 200

  return NextResponse.json(body, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
