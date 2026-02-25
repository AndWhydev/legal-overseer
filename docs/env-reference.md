# Environment Variable Reference

All environment variables used by BitBit, organized by service.

---

## Supabase (required)

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Supabase Dashboard > Settings > API | `https://abcdefg.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key | Supabase Dashboard > Settings > API | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) | Supabase Dashboard > Settings > API | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_URL` | Alias for project URL (used by some cron routes) | Same as `NEXT_PUBLIC_SUPABASE_URL` | `https://abcdefg.supabase.co` |

---

## Anthropic (required for AI)

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude models | [console.anthropic.com](https://console.anthropic.com) > API Keys | `sk-ant-api03-...` |

---

## Application

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `NEXT_PUBLIC_APP_URL` | Public URL of the deployed app | Your Vercel domain | `https://app.bitbit.chat` |
| `DEFAULT_ORG_ID` | Default organization UUID for single-tenant setups | From your Supabase `organizations` table | `289083e9-2143-44eb-9b6a-cfc615f1e81c` |
| `BITBIT_DEPLOYMENT` | Deployment slug for policy/voice loading | Choose a slug for your instance | `awu` |
| `NODE_ENV` | Node.js environment | Set by platform | `production` |

---

## Auth Secrets (required)

Shared secrets for authenticating cron and service-to-service calls.

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `CRON_SECRET` | Bearer token for Vercel cron endpoints | Generate: `openssl rand -hex 32` | `a1b2c3d4e5f6...` |
| `SCHEDULER_SECRET` | Bearer token for scheduler/lead-ack endpoints | Generate: `openssl rand -hex 32` | `f6e5d4c3b2a1...` |
| `RELAY_SECRET` | Bearer token for channel relay endpoint | Generate: `openssl rand -hex 32` | `1a2b3c4d5e6f...` |
| `CREDENTIALS_KEY` | AES key for encrypting stored credentials | Generate: `openssl rand -hex 16` | `deadbeef01234567...` |

---

## Email (Resend)

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `RESEND_API_KEY` | Resend API key for sending emails | [resend.com](https://resend.com) > API Keys | `re_123abc...` |
| `RESEND_FROM_EMAIL` | Sender address for invoices | Must be verified domain in Resend | `invoices@bitbit.chat` |
| `NOTIFICATION_FROM_EMAIL` | Sender address for notifications | Must be verified domain in Resend | `bitbit@allwebbedup.com.au` |
| `NOTIFICATION_TO_EMAIL` | Default recipient for notifications | Owner email | `andy@allwebbedup.com.au` |

---

## WhatsApp (Meta Business)

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID | Meta Business Suite > WhatsApp > Phone Numbers | `123456789` |
| `WHATSAPP_ACCESS_TOKEN` | Permanent access token | Meta Business Suite > System Users | `EAAxxxxxxx...` |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verification token | You choose this during webhook setup | `my-verify-token` |
| `WHATSAPP_APP_SECRET` | App secret for webhook signature verification | Meta Developers > App Dashboard > Settings | `abc123def456` |
| `WHATSAPP_ANDY_PHONE` | Owner's phone number for alerts/briefings | Phone number with country code (no +) | `61400000000` |

---

## Stripe

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `STRIPE_SECRET_KEY` | Stripe secret key | [dashboard.stripe.com](https://dashboard.stripe.com) > Developers > API Keys | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | Stripe Dashboard > Developers > Webhooks | `whsec_...` |

---

## Sentry

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `SENTRY_DSN` | Sentry Data Source Name | Sentry > Project > Settings > Client Keys | `https://xxx@o123.ingest.sentry.io/456` |
| `SENTRY_ENVIRONMENT` | Environment tag | Set manually | `production` |
| `SENTRY_RELEASE` | Release tag | Auto-set from git or manual | `bitbit@1.3.0` |
| `SENTRY_TRACES_SAMPLE_RATE` | Performance trace sampling rate | 0.0 to 1.0 | `0.1` |
| `SENTRY_PROFILES_SAMPLE_RATE` | Profile sampling rate | 0.0 to 1.0 | `0.1` |

---

## Microsoft (Outlook)

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `OUTLOOK_TENANT_ID` | Azure AD tenant ID | Azure Portal > App Registrations | `12345-abcde-...` |
| `OUTLOOK_CLIENT_ID` | Azure AD app client ID | Azure Portal > App Registrations | `67890-fghij-...` |
| `OUTLOOK_CLIENT_SECRET` | Azure AD app secret | Azure Portal > App Registrations > Certificates & Secrets | `secret~value` |
| `OUTLOOK_USER_ID` | User ID or UPN to read mail for | Azure AD user | `user@company.com` |

---

## Google

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `GMAIL_USER` | Gmail address for IMAP access | Your Gmail account | `user@gmail.com` |
| `GMAIL_APP_PASSWORD` | Gmail app-specific password | Google Account > Security > App Passwords | `abcd efgh ijkl mnop` |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID | Google Cloud Console > APIs & Services > Credentials | `123-abc.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret | Google Cloud Console > APIs & Services > Credentials | `GOCSPX-...` |
| `GSC_SERVICE_ACCOUNT` | Google Search Console service account JSON (full JSON string) | Google Cloud Console > IAM > Service Accounts | `{"type":"service_account",...}` |
| `GSC_SITE_URL` | Site URL registered in Search Console | Your verified property URL | `https://example.com` |

---

## Asana

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `ASANA_PAT` | Asana Personal Access Token | Asana > My Settings > Apps > Developer Apps | `1/12345:abcdef...` |
| `ASANA_ACCESS_TOKEN` | Alternative to PAT (OAuth) | OAuth flow | `eyJ...` |
| `ASANA_WORKSPACE_GID` | Workspace GID to scope queries | Asana API or URL | `1234567890` |
| `ASANA_CLIENT_ID` | Asana OAuth client ID | Asana Developer Console | `12345` |
| `ASANA_CLIENT_SECRET` | Asana OAuth client secret | Asana Developer Console | `secret123` |

---

## Calendly

| Variable | Description | How to obtain | Example |
|----------|-------------|---------------|---------|
| `CALENDLY_CLIENT_ID` | Calendly OAuth client ID | Calendly Developer Portal | `abc123` |
| `CALENDLY_CLIENT_SECRET` | Calendly OAuth client secret | Calendly Developer Portal | `secret456` |

---

## Vercel (auto-set)

These are set automatically by Vercel at build/runtime:

| Variable | Description |
|----------|-------------|
| `VERCEL_GIT_COMMIT_SHA` | Git commit SHA of the deployment |
| `VERCEL_ENV` | Vercel environment (production, preview, development) |

---

## Quick Setup Checklist

Minimum required to get BitBit running:

1. `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
2. `ANTHROPIC_API_KEY`
3. `CRON_SECRET` + `SCHEDULER_SECRET`
4. `NEXT_PUBLIC_APP_URL`

Everything else enables specific features and can be added incrementally.
