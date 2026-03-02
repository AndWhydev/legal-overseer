/**
 * Uptime and Latency Tracking
 *
 * Tracks request latency, endpoint availability, and generates uptime reports.
 * Follows DI pattern: all functions accept SupabaseClient as first parameter.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface UptimeMetric {
  service: string;
  period: string;
  uptime_pct: number;
  downtime_minutes: number;
  total_requests: number;
  failed_requests: number;
  avg_latency_ms: number;
  p99_latency_ms: number;
}

export interface LatencyRecord {
  timestamp: string;
  endpoint: string;
  method: string;
  status: number;
  latency_ms: number;
}

// In-memory metrics for the current runtime
const metricsBuffer: LatencyRecord[] = [];
const BUFFER_SIZE = 10000;

/**
 * Record a request metric.
 */
export function recordMetric(
  endpoint: string,
  method: string,
  statusCode: number,
  latencyMs: number
): void {
  metricsBuffer.push({
    timestamp: new Date().toISOString(),
    endpoint,
    method,
    status: statusCode,
    latency_ms: latencyMs,
  });

  // Keep buffer bounded
  if (metricsBuffer.length > BUFFER_SIZE) {
    metricsBuffer.shift();
  }
}

/**
 * Get uptime percentage for a service over a period.
 */
export async function getUptimeMetrics(
  supabase: SupabaseClient,
  service: string,
  period: 'today' | '7d' | '30d'
): Promise<UptimeMetric> {
  const now = new Date();
  let startDate: Date;

  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
  }

  // Query metrics from database if available
  const { data: records, error } = await supabase
    .from('service_metrics')
    .select('status, latency_ms')
    .eq('service', service)
    .gte('created_at', startDate.toISOString())
    .lt('created_at', now.toISOString());

  if (error) {
    console.warn('[uptime] Failed to fetch metrics:', error.message);
    return {
      service,
      period,
      uptime_pct: 100,
      downtime_minutes: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 0,
      p99_latency_ms: 0,
    };
  }

  const metrics = records || [];
  if (metrics.length === 0) {
    return {
      service,
      period,
      uptime_pct: 100,
      downtime_minutes: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 0,
      p99_latency_ms: 0,
    };
  }

  const failedCount = metrics.filter((m: any) => m.status >= 500).length;
  const uptime = ((metrics.length - failedCount) / metrics.length) * 100;

  // Calculate latencies
  const latencies = (metrics as any[])
    .map((m) => m.latency_ms || 0)
    .filter((l) => l > 0)
    .sort((a, b) => a - b);

  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;

  const p99Index = Math.ceil(latencies.length * 0.99) - 1;
  const p99Latency = latencies[Math.max(0, p99Index)] || 0;

  return {
    service,
    period,
    uptime_pct: Math.round(uptime * 10) / 10,
    downtime_minutes: Math.round((1 - uptime / 100) * (period === 'today' ? 1440 : period === '7d' ? 10080 : 43200)),
    total_requests: metrics.length,
    failed_requests: failedCount,
    avg_latency_ms: avgLatency,
    p99_latency_ms: p99Latency,
  };
}

/**
 * Get latency percentiles.
 */
export function getLocalMetricsPercentiles(endpoint?: string): {
  p50: number;
  p90: number;
  p99: number;
  p999: number;
} {
  let records = metricsBuffer;
  if (endpoint) {
    records = records.filter((r) => r.endpoint === endpoint);
  }

  if (records.length === 0) {
    return { p50: 0, p90: 0, p99: 0, p999: 0 };
  }

  const latencies = records
    .map((r) => r.latency_ms)
    .sort((a, b) => a - b);

  const percentile = (p: number) => {
    const idx = Math.ceil((latencies.length * p) / 100) - 1;
    return latencies[Math.max(0, idx)] || 0;
  };

  return {
    p50: percentile(50),
    p90: percentile(90),
    p99: percentile(99),
    p999: percentile(99.9),
  };
}

/**
 * Log metrics to database for persistence.
 */
export async function persistMetrics(supabase: SupabaseClient, service: string): Promise<boolean> {
  if (metricsBuffer.length === 0) {
    return true;
  }

  // Aggregate metrics by endpoint
  const aggregated = new Map<string, { count: number; errors: number; total_latency: number }>();

  for (const metric of metricsBuffer) {
    const key = `${metric.endpoint}|${metric.method}`;
    const current = aggregated.get(key) || { count: 0, errors: 0, total_latency: 0 };
    current.count++;
    if (metric.status >= 400) current.errors++;
    current.total_latency += metric.latency_ms;
    aggregated.set(key, current);
  }

  // Persist to database
  const records = Array.from(aggregated.entries()).map(([key, data]) => {
    const [endpoint, method] = key.split('|');
    return {
      service,
      endpoint,
      method,
      request_count: data.count,
      error_count: data.errors,
      avg_latency_ms: Math.round(data.total_latency / data.count),
      created_at: new Date().toISOString(),
    };
  });

  try {
    await supabase.from('service_metrics').insert(records);
    return true;
  } catch (err) {
    console.warn('[uptime] Failed to persist metrics:', err);
    return false;
  }
}

/**
 * Get a human-readable uptime report.
 */
export function formatUptimeReport(metrics: UptimeMetric): string {
  const lines = [
    '# Uptime Report',
    '',
    `Service: ${metrics.service}`,
    `Period: ${metrics.period}`,
    `Uptime: ${metrics.uptime_pct}%`,
    `Downtime: ${metrics.downtime_minutes} minutes`,
    '',
    `Total Requests: ${metrics.total_requests}`,
    `Failed Requests: ${metrics.failed_requests}`,
    `Average Latency: ${metrics.avg_latency_ms}ms`,
    `P99 Latency: ${metrics.p99_latency_ms}ms`,
  ];

  return lines.join('\n');
}
