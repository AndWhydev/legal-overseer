import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Singleton service-role Supabase client for background operations.
 *
 * This client is for cron jobs, agent processing, and background tasks where
 * there is no user session. Dashboard/API routes serving user requests should
 * continue using the cookie-based server.ts client.
 *
 * Key differences from the server.ts client:
 * - Uses service role key (bypasses RLS) -- use with caution
 * - No cookie/session handling (stateless)
 * - Singleton: created once per serverless instance, reused across requests
 * - Reduces cold start overhead by avoiding per-request client creation
 *
 * If direct Postgres access is needed later (e.g., for transactions),
 * the pooler URL (port 6543) should be used instead of direct connections.
 */

let serviceClient: SupabaseClient | null = null

/**
 * Returns a singleton service-role Supabase client.
 *
 * The client is created on first call and reused for the lifetime of the
 * serverless instance. This avoids per-request initialization overhead
 * and is safe because the service role key does not depend on user context.
 *
 * @throws {Error} If SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set
 */
export function getServiceClient(): SupabaseClient {
  if (serviceClient) {
    return serviceClient
  }

  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    throw new Error(
      'Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL environment variable'
    )
  }

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
  }

  serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-connection-pool': 'bitbit-service',
      },
    },
  })

  return serviceClient
}

/**
 * Check if the service client is configured (env vars present).
 * Useful for health checks without throwing errors.
 */
export function isServiceClientConfigured(): boolean {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return !!(supabaseUrl && serviceRoleKey)
}
