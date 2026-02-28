# BitBit Deployment Guide

BitBit uses a multi-service deployment: Vercel (dashboard + API), Supabase (database + auth), optional VPS (cron workers), optional Fly.io (edge services).

---

## 1. Supabase Project Setup

1. Create a project at [supabase.com](https://supabase.com) in the `ap-southeast-2` (Sydney) region.

2. Note your project credentials from Settings > API:
   - Project URL (`NEXT_PUBLIC_SUPABASE_URL`)
   - Anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - Service role key (`SUPABASE_SERVICE_ROLE_KEY`)

3. Run database migrations:
   ```bash
   # Install Supabase CLI
   npm install -g supabase

   # Link to your project
   supabase link --project-ref YOUR_PROJECT_REF

   # Push migrations
   supabase db push
   ```

4. Enable Row Level Security (RLS) on all tables. The migrations handle this.

5. Configure Auth:
   - Enable email/password auth in Authentication > Providers
   - Set redirect URLs to include your Vercel domain

---

## 2. Vercel Deployment

### Initial Setup

1. Import the repo in Vercel, setting the root directory to `personal-assistant/`.

2. Framework preset: **Next.js**

3. Build settings:
   - Build command: `npm run build`
   - Output directory: `.next`
   - Install command: `npm install`
   - Node.js version: 20.x

### Environment Variables

Set these in Vercel > Settings > Environment Variables:

```
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Anthropic (required for AI features)
ANTHROPIC_API_KEY=sk-ant-...

# Cron/Scheduler auth (required)
CRON_SECRET=your-random-secret
SCHEDULER_SECRET=your-random-secret
RELAY_SECRET=your-random-secret

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
DEFAULT_ORG_ID=uuid-of-default-org
BITBIT_DEPLOYMENT=awu

# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=invoices@yourdomain.com
NOTIFICATION_FROM_EMAIL=bitbit@yourdomain.com
NOTIFICATION_TO_EMAIL=owner@yourdomain.com

# WhatsApp (Meta Business)
WHATSAPP_PHONE_NUMBER_ID=123456
WHATSAPP_ACCESS_TOKEN=EAA...
WHATSAPP_VERIFY_TOKEN=your-verify-token
WHATSAPP_APP_SECRET=your-app-secret
WHATSAPP_ANDY_PHONE=61400000000

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Sentry
SENTRY_DSN=https://xxx@sentry.io/yyy

# Integrations (optional)
OUTLOOK_TENANT_ID=...
OUTLOOK_CLIENT_ID=...
OUTLOOK_CLIENT_SECRET=...
OUTLOOK_USER_ID=...
GMAIL_USER=user@gmail.com
GMAIL_APP_PASSWORD=xxxx
ASANA_PAT=...
ASANA_WORKSPACE_GID=...
GSC_SERVICE_ACCOUNT={"type":"service_account",...}
GSC_SITE_URL=https://yourdomain.com
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
CALENDLY_CLIENT_ID=...
CALENDLY_CLIENT_SECRET=...
ASANA_CLIENT_ID=...
ASANA_CLIENT_SECRET=...
CREDENTIALS_KEY=32-byte-hex-key
```

### Vercel Cron

Update `personal-assistant/vercel.json` with your desired cron schedule:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm install",
  "framework": "nextjs",
  "crons": [
    { "path": "/api/cron/scheduler", "schedule": "* * * * *" },
    { "path": "/api/cron/channel-sync", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/triage", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/sentry", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/morning-briefing", "schedule": "0 21 * * *" },
    { "path": "/api/cron/proactive-alerts", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/daily-digest", "schedule": "0 7 * * *" },
    { "path": "/api/cron/weekly-report", "schedule": "0 8 * * MON" },
    { "path": "/api/cron/monthly-report", "schedule": "0 9 1 * *" }
  ]
}
```

**Note:**
- Vercel cron on the free plan is limited to once per day. Pro plan supports every minute.
- All cron routes require the `CRON_SECRET` header: `Authorization: Bearer ${CRON_SECRET}`
- Cron routes must complete within the Vercel 5-minute timeout limit.

---

## 3. VPS Setup (Hetzner)

For running cron workers externally (alternative to Vercel cron), set up a Hetzner CX22 VPS.

### Automated Setup

```bash
# Run setup script on a fresh Ubuntu 24.04 server
ssh root@your-server 'bash -s' < deployments/vps/setup.sh
```

This script (`deployments/vps/setup.sh`) handles:
- System updates and security packages
- SSH hardening (key-only auth, max 3 attempts)
- Firewall (UFW: SSH + HTTPS only)
- Docker and Docker Compose installation
- `deploy` user creation
- Application directory at `/opt/bitbit`
- Log rotation
- Systemd service for Docker Compose

### Manual Cron Setup

After VPS setup, configure cron to hit your Vercel endpoints:

```bash
# /etc/cron.d/bitbit
* * * * * deploy curl -s -X GET https://your-app.vercel.app/api/cron/scheduler -H "Authorization: Bearer $CRON_SECRET"
*/5 * * * * deploy curl -s -X GET https://your-app.vercel.app/api/cron/channel-sync -H "Authorization: Bearer $CRON_SECRET"
```

---

## 4. Fly.io Deployment

The `deployments/fly/fly.toml` configures Fly.io deployment targeting Sydney (`syd` region).

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Authenticate
fly auth login

# Launch (first time)
fly launch --config deployments/fly/fly.toml

# Set environment variables and secrets
fly secrets set NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
fly secrets set NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
fly secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly secrets set CRON_SECRET=your-random-secret
fly secrets set SCHEDULER_SECRET=your-random-secret

# Deploy
fly deploy
```

Configuration highlights:
- Shared CPU, 512 MB RAM
- Auto-stop/start machines (cost optimization)
- Minimum 1 machine running
- Health check at `/api/monitoring/health` every 30s
- Next.js server on port 3000
- Located in `syd` (Sydney) region for optimal AU performance

---

## 5. DNS and Domain Configuration

### Vercel Custom Domain

1. In Vercel, go to Settings > Domains
2. Add your domain (e.g., `app.bitbit.chat`)
3. Add the DNS records Vercel provides (CNAME or A record)

### Webhook Domains

Configure callback URLs in each service:

| Service | Webhook URL |
|---------|-------------|
| Stripe | `https://app.bitbit.chat/api/webhooks/stripe` and `/api/billing/webhook` |
| Asana | `https://app.bitbit.chat/api/webhooks/asana` |
| Calendly | `https://app.bitbit.chat/api/webhooks/calendly` |
| WhatsApp (Meta) | `https://app.bitbit.chat/api/channels/whatsapp` |

### SSL

- Vercel handles SSL automatically for custom domains.
- Fly.io handles SSL automatically via `force_https = true`.
- VPS: Use Caddy or Certbot for Let's Encrypt if exposing endpoints.

---

## 6. Migration Rollback Strategy

Supabase does not natively support down migrations. Use the following strategies to safely roll back schema changes.

### Pre-Migration Backup

Always back up before running migrations:

```bash
# Option 1: pg_dump via Supabase CLI
supabase db dump -f backup_$(date +%Y%m%d_%H%M%S).sql

# Option 2: Supabase Dashboard
# Settings > Database > Backups > Create backup
# Free plan: daily automatic backups with 7-day retention
# Pro plan: point-in-time recovery (PITR) up to 7 days
```

### Rollback Methods

**Method 1: Manual SQL reversal**

Write compensating SQL to undo the migration. Common patterns:

| Migration action | Reversal |
|-----------------|----------|
| `CREATE TABLE foo (...)` | `DROP TABLE IF EXISTS foo` |
| `ALTER TABLE foo ADD COLUMN bar text` | `ALTER TABLE foo DROP COLUMN IF EXISTS bar` |
| `CREATE INDEX idx_foo ON bar (col)` | `DROP INDEX IF EXISTS idx_foo` |
| `CREATE POLICY pol ON foo ...` | `DROP POLICY IF EXISTS pol ON foo` |
| `CREATE FUNCTION fn() ...` | `DROP FUNCTION IF EXISTS fn()` |
| `INSERT INTO foo VALUES (...)` | `DELETE FROM foo WHERE ...` |

Run reversal SQL in Supabase SQL Editor (Dashboard > SQL Editor) or via CLI:

```bash
supabase db execute --file rollback.sql
```

**Method 2: Point-in-time recovery (Pro plan)**

1. Supabase Dashboard > Settings > Database > Backups
2. Select a point-in-time before the migration
3. Restore — this creates a new database branch
4. Verify data integrity, then promote

**Method 3: Restore from backup file**

```bash
# Restore a pg_dump backup
psql $DATABASE_URL < backup_20260228_120000.sql
```

### Staging-First Migration Testing

1. Create a Supabase branch (Pro plan) or a separate staging project
2. Run the migration against staging: `supabase db push --db-url $STAGING_DB_URL`
3. Run the application test suite against staging
4. Verify RLS policies work: test as both authenticated and anonymous users
5. Only after staging passes, run against production

### Writing Reversible Migrations

Use `IF NOT EXISTS` / `IF EXISTS` guards so migrations and their reversals are idempotent:

```sql
-- Forward
CREATE TABLE IF NOT EXISTS new_feature (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organizations(id),
  data jsonb NOT NULL DEFAULT '{}'
);

-- Reversal (save alongside as rollback_NNN.sql)
DROP TABLE IF EXISTS new_feature;
```

### Migration Tracking

The `supabase_migrations.schema_migrations` table tracks which migrations have been applied. After a manual rollback, you may need to remove the migration record:

```sql
DELETE FROM supabase_migrations.schema_migrations
WHERE version = '040_ui_profile';
```

---

## 7. Post-Deployment Verification

```bash
# Health check
curl https://app.bitbit.chat/api/monitoring/health

# Channel status
curl https://app.bitbit.chat/api/channels/status

# Trigger scheduler (verify cron auth)
curl -X POST https://app.bitbit.chat/api/agent/scheduler \
  -H "Authorization: Bearer YOUR_SCHEDULER_SECRET"
```
