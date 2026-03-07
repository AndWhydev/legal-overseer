import { z } from 'zod'

/**
 * Validates all required and optional environment variables at startup.
 * Import and call validateEnv() in your app entrypoint or instrumentation.ts.
 */

const envSchema = z.object({
  // Supabase (required)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('Must be a valid Supabase URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key is required'),
  SUPABASE_URL: z.string().url().optional(),

  // Anthropic (required)
  ANTHROPIC_API_KEY: z.string().min(1, 'Anthropic API key is required'),

  // Application
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  DEFAULT_ORG_ID: z.string().uuid().optional(),
  BITBIT_DEPLOYMENT: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),

  // Auth secrets
  CRON_SECRET: z.string().min(16, 'CRON_SECRET must be at least 16 characters'),
  SCHEDULER_SECRET: z.string().min(16, 'SCHEDULER_SECRET must be at least 16 characters'),
  RELAY_SECRET: z.string().min(16).optional(),
  CREDENTIALS_KEY: z.string().min(16).optional(),

  // OpenAI (optional)
  OPENAI_API_KEY: z.string().optional(),

  // Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  NOTIFICATION_FROM_EMAIL: z.string().email().optional(),
  NOTIFICATION_TO_EMAIL: z.string().email().optional(),
  MONTHLY_REPORT_FROM_EMAIL: z.string().email().optional(),
  MONTHLY_REPORT_RECIPIENTS: z.string().optional(),

  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_ANDY_PHONE: z.string().optional(),

  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Sentry
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),
  SENTRY_PROFILES_SAMPLE_RATE: z.string().optional(),

  // Microsoft / Outlook
  OUTLOOK_TENANT_ID: z.string().optional(),
  OUTLOOK_CLIENT_ID: z.string().optional(),
  OUTLOOK_CLIENT_SECRET: z.string().optional(),
  OUTLOOK_USER_ID: z.string().optional(),

  // Google
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GSC_SERVICE_ACCOUNT: z.string().optional(),
  GSC_SITE_URL: z.string().url().optional(),

  // Asana
  ASANA_PAT: z.string().optional(),
  ASANA_ACCESS_TOKEN: z.string().optional(),
  ASANA_WORKSPACE_GID: z.string().optional(),
  ASANA_CLIENT_ID: z.string().optional(),
  ASANA_CLIENT_SECRET: z.string().optional(),

  // Calendly
  CALENDLY_API_KEY: z.string().optional(),
  CALENDLY_ACCESS_TOKEN: z.string().optional(),
  CALENDLY_CLIENT_ID: z.string().optional(),
  CALENDLY_CLIENT_SECRET: z.string().optional(),

  // Telnyx (SMS fallback)
  TELNYX_API_KEY: z.string().optional(),
  TELNYX_FROM_NUMBER: z.string().optional(),
  TELNYX_MESSAGING_PROFILE_ID: z.string().optional(),
  TELNYX_WEBHOOK_SECRET: z.string().optional(),

  // Slack
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),

  // Xero
  XERO_CLIENT_ID: z.string().optional(),
  XERO_CLIENT_SECRET: z.string().optional(),

  // Instagram
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().optional(),
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  // Facebook Messenger
  FACEBOOK_MESSENGER_PAGE_ACCESS_TOKEN: z.string().optional(),
  FACEBOOK_MESSENGER_VERIFY_TOKEN: z.string().optional(),
  FACEBOOK_MESSENGER_BUSINESS_ACCOUNT_ID: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
})

export type EnvConfig = z.infer<typeof envSchema>

export function validateEnv(env: Record<string, string | undefined> = process.env): EnvConfig {
  const result = envSchema.safeParse(env)

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n')

    throw new Error(`Environment validation failed:\n${formatted}`)
  }

  return result.data
}
