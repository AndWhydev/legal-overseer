/**
 * Pinecone Index Monitoring & Cost Estimation
 *
 * Tracks index health, estimates monthly costs based on vector count + queries,
 * and generates alerts for approaching limits.
 */

import { getIndex } from './pinecone-client'
import { logger } from '@/lib/core/logger'

export interface IndexStatsSnapshot {
  timestamp: string
  totalVectors: number
  namespaceVectors: Record<string, number>
  indexFullness: number
  indexCapacity: number
}

export interface CostEstimate {
  /** Estimated monthly cost in USD */
  monthlyCost: number
  /** Breakdown: storage cost */
  storageCost: number
  /** Breakdown: query cost (estimated) */
  queryCost: number
  /** Breakdown: metadata cost */
  metadataCost: number
  /** Cost per million vectors stored */
  costPer1MVectors: number
}

export interface MonitoringAlert {
  level: 'info' | 'warning' | 'critical'
  message: string
  metric: string
  currentValue: number
  threshold?: number
}

/**
 * Get index statistics from Pinecone.
 * Returns vector counts per namespace and overall index fullness.
 */
export async function getIndexStats(): Promise<IndexStatsSnapshot | null> {
  const index = getIndex()
  if (!index) {
    logger.debug('[monitor] Pinecone not configured')
    return null
  }

  try {
    const indexStats = await index.describeIndexStats()

    // Extract total vector count (Pinecone SDK property is 'totalVectorCount')
    const totalVectors = (indexStats as Record<string, unknown>).totalVectorCount as number ?? 0

    // Extract per-namespace stats (we use org_id as namespace)
    const namespaceVectors: Record<string, number> = {}
    if (indexStats.namespaces && typeof indexStats.namespaces === 'object') {
      for (const [ns, stats] of Object.entries(indexStats.namespaces)) {
        if (typeof stats === 'object' && stats !== null && 'vectorCount' in stats) {
          namespaceVectors[ns] = (stats as Record<string, unknown>).vectorCount as number ?? 0
        }
      }
    }

    // Pinecone Serverless capacity (typical, adjust if using different tier)
    const indexCapacity = 100_000_000

    // Calculate index fullness
    const indexFullness = totalVectors > 0 ? Math.round((totalVectors / indexCapacity) * 100) : 0

    return {
      timestamp: new Date().toISOString(),
      totalVectors,
      namespaceVectors,
      indexFullness,
      indexCapacity,
    }
  } catch (err) {
    logger.warn('[monitor] Failed to fetch index stats', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Estimate monthly costs based on vector count and usage patterns.
 * Pinecone Serverless pricing (as of Mar 2024):
 * - $0.00001 per read query
 * - $0.00003 per write query
 * - $0.00001 per delete query
 * - $0.20 per million vectors stored (storage)
 * - $0.10 per GB metadata storage
 */
export function estimateCosts(stats: IndexStatsSnapshot): CostEstimate {
  const vectorCount = stats.totalVectors
  const avgMetadataPerVector = 0.5 * 1024 // ~500 bytes per vector metadata

  // Storage costs: $0.20 per million vectors
  const storageCost = (vectorCount / 1_000_000) * 0.2

  // Metadata costs: $0.10 per GB
  const metadataGBTotal = (vectorCount * avgMetadataPerVector) / (1024 * 1024 * 1024)
  const metadataCost = metadataGBTotal * 0.10

  // Query cost estimation (assume 10k queries/month for typical org)
  // Mix: 70% reads (0.00001), 20% writes (0.00003), 10% deletes (0.00001)
  const queriesPerMonth = 10_000
  const queryCost =
    queriesPerMonth * 0.7 * 0.00001 +
    queriesPerMonth * 0.2 * 0.00003 +
    queriesPerMonth * 0.1 * 0.00001

  const monthlyCost = storageCost + metadataCost + queryCost

  return {
    monthlyCost: Math.round(monthlyCost * 100) / 100, // Round to 2 decimals
    storageCost: Math.round(storageCost * 100) / 100,
    metadataCost: Math.round(metadataCost * 100) / 100,
    queryCost: Math.round(queryCost * 100) / 100,
    costPer1MVectors: 0.2, // Storage cost only (queries variable by usage)
  }
}

/**
 * Check for alerts based on index stats and thresholds.
 * Returns array of alerts (sorted by severity: critical > warning > info).
 */
export function checkAlerts(stats: IndexStatsSnapshot): MonitoringAlert[] {
  const alerts: MonitoringAlert[] = []

  // Alert: Index nearing capacity
  if (stats.indexFullness >= 90) {
    alerts.push({
      level: 'critical',
      message: `Index at ${stats.indexFullness}% capacity. Approaching 100M vector limit.`,
      metric: 'indexFullness',
      currentValue: stats.indexFullness,
      threshold: 90,
    })
  } else if (stats.indexFullness >= 70) {
    alerts.push({
      level: 'warning',
      message: `Index at ${stats.indexFullness}% capacity. Consider scaling.`,
      metric: 'indexFullness',
      currentValue: stats.indexFullness,
      threshold: 70,
    })
  }

  // Alert: Large namespace (org with many vectors)
  const largestNamespace = Object.entries(stats.namespaceVectors).reduce(
    (max, [ns, count]) => (count > max.count ? { ns, count } : max),
    { ns: '', count: 0 }
  )

  if (largestNamespace.count > 50_000_000) {
    alerts.push({
      level: 'warning',
      message: `Namespace '${largestNamespace.ns}' has ${largestNamespace.count.toLocaleString()} vectors.`,
      metric: 'largestNamespace',
      currentValue: largestNamespace.count,
      threshold: 50_000_000,
    })
  }

  // Info: Current index fullness status
  if (stats.totalVectors > 0 && stats.indexFullness < 70) {
    alerts.push({
      level: 'info',
      message: `Index healthy. ${stats.indexFullness}% capacity, ${stats.totalVectors.toLocaleString()} vectors.`,
      metric: 'indexFullness',
      currentValue: stats.indexFullness,
    })
  }

  // Sort by severity
  const severityRank = { critical: 0, warning: 1, info: 2 }
  alerts.sort((a, b) => severityRank[a.level] - severityRank[b.level])

  return alerts
}

/**
 * Get index stats, estimate costs, and check for alerts (complete monitoring report).
 */
export async function getMonitoringReport(): Promise<{
  stats: IndexStatsSnapshot | null
  costs: CostEstimate | null
  alerts: MonitoringAlert[]
}> {
  const stats = await getIndexStats()

  let costs: CostEstimate | null = null
  let alerts: MonitoringAlert[] = []

  if (stats) {
    costs = estimateCosts(stats)
    alerts = checkAlerts(stats)
  }

  return { stats, costs, alerts }
}
