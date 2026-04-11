/**
 * Health check handler for Fly.io worker
 *
 * Returns system status including uptime, memory usage, and environment info.
 * Used by Fly.io health checks at /api/monitoring/health.
 */

const BOOT_TIME = Date.now();

export interface HealthStatus {
  status: "ok" | "degraded" | "error";
  uptime_seconds: number;
  timestamp: string;
  environment: string;
  memory: {
    rss_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
  };
  version: string;
}

export function healthCheck(): HealthStatus {
  const mem = process.memoryUsage();

  return {
    status: "ok",
    uptime_seconds: Math.floor((Date.now() - BOOT_TIME) / 1000),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    version: "1.0.0",
  };
}
