/**
 * Supabase Connection Pool Configuration
 *
 * Supabase uses Supavisor as its built-in connection pooler (no self-managed
 * PgBouncer needed). The JS client uses REST API by default, so these settings
 * primarily document infrastructure-side pooling behavior and guide future
 * direct Postgres access.
 *
 * For serverless workloads (Vercel), use Supavisor transaction mode on port 6543.
 */

export const poolConfig = {
  /** Max connections reserved for service-role operations (agents, crons, background tasks) */
  maxConnections: 10,
  /** Max time (ms) to wait for a connection from the pool */
  connectionTimeout: 5000,
  /** Time (ms) a connection can sit idle before being released */
  idleTimeout: 30000,
  /** Supavisor pooler port for transaction mode */
  poolerPort: 6543,
  /** Direct connection port (bypasses pooler) */
  directPort: 5432,
} as const

/**
 * Connection pool recommendations by Supabase tier.
 *
 * These guide capacity planning for concurrent agent operations and
 * help determine when a tier upgrade is needed.
 */
export const POOL_RECOMMENDATIONS = {
  free: {
    directConnections: 20,
    recommendation:
      'Use Supavisor transaction mode (port 6543) for all serverless workloads. ' +
      'Reserve ~10 connections for dashboard/API, ~10 for agents/crons.',
    notes:
      'Free tier has 20 direct connections. With 10 concurrent agent requests, ' +
      'pool exhaustion is possible without Supavisor.',
  },
  pro: {
    directConnections: 60,
    recommendation:
      'More headroom for concurrent operations. Still use Supavisor for serverless ' +
      'to avoid connection churn on cold starts.',
    notes:
      'Pro plan provides 60 direct connections and 60s function timeout. ' +
      'Classification can safely use up to 10s (well within 3s target).',
  },
  directPostgresNote:
    'If direct Postgres access is needed later (e.g., for multi-statement transactions), ' +
    'use the pooler URL with port 6543 in transaction mode. The JS client REST API ' +
    'does not consume Postgres connections directly.',
} as const

export type PoolConfig = typeof poolConfig
export type PoolRecommendations = typeof POOL_RECOMMENDATIONS
