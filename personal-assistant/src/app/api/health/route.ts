import { NextResponse } from 'next/server'
import {
  getServiceClient,
  isServiceClientConfigured,
} from '@/lib/supabase/service-client'
import { poolConfig, POOL_RECOMMENDATIONS } from '@/lib/supabase/pool-config'
import { logger } from '@/lib/core/logger'

/**
 * Health check endpoint with cold start and pool diagnostics.
 *
 * Publicly accessible (no auth required) for uptime monitoring services.
 * Reports cold start status, Supabase connectivity, and pool configuration.
 *
 * Pro tier benefits:
 * - 60 direct connections (vs 20 on free) gives more headroom
 * - 60s function timeout (vs 10s on hobby) for complex classification chains
 * - With hobby tier, classification must complete in <10s (well within 3s target)
 */

// Module-level boot tracking for cold start detection
const BOOT_TIME = Date.now()
let isFirstRequest = true

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  cold_start: boolean
  uptime_ms: number
  supabase_connected: boolean
  version: string
  pool: {
    configured: boolean
    max_connections: number
    connection_timeout_ms: number
    idle_timeout_ms: number
    tier_notes: string
  }
}

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const wasColdStart = isFirstRequest
  isFirstRequest = false

  const uptimeMs = Date.now() - BOOT_TIME

  let supabaseConnected = false
  let status: HealthResponse['status'] = 'ok'

  // Check Supabase connectivity using service client
  if (isServiceClientConfigured()) {
    try {
      const supabase = getServiceClient()

      // Simple ping with 3s timeout via AbortController
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)

      try {
        const { error } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .limit(1)
          .abortSignal(controller.signal)

        supabaseConnected = !error
        if (error) {
          status = 'degraded'
          logger.warn('[health] Supabase check failed:', { message: error.message })
        }
      } finally {
        clearTimeout(timeout)
      }
    } catch (err) {
      status = 'degraded'
      logger.warn(
        '[health] Supabase connectivity check failed:',
        { error: err instanceof Error ? err.message : String(err) }
      )
    }
  } else {
    status = 'degraded'
  }

  const response: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    cold_start: wasColdStart,
    uptime_ms: uptimeMs,
    supabase_connected: supabaseConnected,
    version:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ||
      process.env.npm_package_version ||
      'local',
    pool: {
      configured: isServiceClientConfigured(),
      max_connections: poolConfig.maxConnections,
      connection_timeout_ms: poolConfig.connectionTimeout,
      idle_timeout_ms: poolConfig.idleTimeout,
      tier_notes: POOL_RECOMMENDATIONS.directPostgresNote,
    },
  }

  return NextResponse.json(response, {
    status: (status as string) === 'error' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
