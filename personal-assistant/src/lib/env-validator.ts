/**
 * Runtime environment variable validation.
 * Call once at app startup (e.g. from instrumentation.ts).
 */

interface EnvVarSpec {
  name: string
  required: boolean
}

const ENV_VARS: EnvVarSpec[] = [
  // Required — app will not function without these
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true },
  { name: 'ANTHROPIC_API_KEY', required: true },

  // Optional — degraded functionality without these
  { name: 'SENTRY_DSN', required: false },
  { name: 'CRON_SECRET', required: false },
  { name: 'STRIPE_SECRET_KEY', required: false },
  { name: 'WHATSAPP_VERIFY_TOKEN', required: false },
  { name: 'WHATSAPP_APP_SECRET', required: false },
  { name: 'MONTHLY_REPORT_RECIPIENTS', required: false },
]

export function validateEnv(): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  const warnings: string[] = []

  for (const spec of ENV_VARS) {
    const value = process.env[spec.name]
    if (!value || value.trim() === '') {
      if (spec.required) {
        missing.push(spec.name)
      } else {
        warnings.push(spec.name)
      }
    }
  }

  if (missing.length > 0) {
    logger.error(
      `[env-validator] Missing required environment variables:\n  ${missing.join('\n  ')}`
    )
  }

  if (warnings.length > 0) {
    logger.warn(
      `[env-validator] Missing optional environment variables (degraded functionality):\n  ${warnings.join('\n  ')}`
    )
  }

  if (missing.length === 0 && warnings.length === 0) {
    logger.info('[env-validator] All environment variables present')
  }

  return { valid: missing.length === 0, missing }
}
