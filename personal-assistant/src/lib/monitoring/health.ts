import { getServiceClient, isServiceClientConfigured } from '@/lib/supabase/service-client'

export type HealthStatus = 'ok' | 'degraded' | 'down'

export interface HealthCheck {
  name: 'database' | 'memory' | 'uptime'
  status: HealthStatus
  details: Record<string, unknown>
  error?: string
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function checkDatabaseConnectivity(): Promise<HealthCheck> {
  const startedAt = Date.now()

  if (!isServiceClientConfigured()) {
    return {
      name: 'database',
      status: 'down',
      details: { configured: false, latencyMs: 0 },
      error: 'Supabase service client is not configured',
    }
  }

  try {
    const supabase = getServiceClient()
    const { error } = await supabase.from('organizations').select('id').limit(1)
    const latencyMs = Date.now() - startedAt

    if (error) {
      return {
        name: 'database',
        status: 'down',
        details: { configured: true, latencyMs },
        error: error.message,
      }
    }

    return {
      name: 'database',
      status: latencyMs > 2000 ? 'degraded' : 'ok',
      details: { configured: true, latencyMs },
    }
  } catch (error) {
    return {
      name: 'database',
      status: 'down',
      details: { configured: true, latencyMs: Date.now() - startedAt },
      error: toErrorMessage(error),
    }
  }
}

function checkMemoryUsage(): HealthCheck {
  const memory = process.memoryUsage()
  const heapUtilization = memory.heapTotal > 0 ? memory.heapUsed / memory.heapTotal : 0

  let status: HealthStatus = 'ok'
  if (heapUtilization >= 0.95) {
    status = 'down'
  } else if (heapUtilization >= 0.85) {
    status = 'degraded'
  }

  return {
    name: 'memory',
    status,
    details: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external,
      arrayBuffers: memory.arrayBuffers,
      heapUtilization,
    },
  }
}

function checkUptime(): HealthCheck {
  const uptimeSeconds = process.uptime()

  let status: HealthStatus = 'ok'
  if (uptimeSeconds <= 0) {
    status = 'down'
  } else if (uptimeSeconds < 60) {
    status = 'degraded'
  }

  return {
    name: 'uptime',
    status,
    details: {
      uptimeSeconds,
      uptimeMinutes: uptimeSeconds / 60,
    },
  }
}

export async function getHealthStatus(): Promise<{ status: HealthStatus; checks: HealthCheck[] }> {
  const checks = await Promise.all([
    checkDatabaseConnectivity(),
    Promise.resolve(checkMemoryUsage()),
    Promise.resolve(checkUptime()),
  ])

  const status: HealthStatus = checks.some((check) => check.status === 'down')
    ? 'down'
    : checks.some((check) => check.status === 'degraded')
      ? 'degraded'
      : 'ok'

  return { status, checks }
}
