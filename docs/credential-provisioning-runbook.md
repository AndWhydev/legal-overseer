# Credential Provisioning Runbook

Step-by-step guide for provisioning OAuth credentials and deploying the WhatsApp bridge for BitBit. Each section covers one integration provider.

**Prerequisites:**
- Access to Vercel project dashboard (for setting environment variables)
- Admin access to the relevant cloud consoles (Google, Azure, Asana, Calendly)
- Fly.io CLI installed and authenticated (for WhatsApp bridge)
- Your app domain: `{APP_DOMAIN}` (e.g., `app.bitbit.au`)

---

## Table of Contents

1. [Google Cloud (Gmail OAuth)](#1-google-cloud-gmail-oauth)
2. [Microsoft Azure AD (Outlook OAuth)](#2-microsoft-azure-ad-outlook-oauth)
3. [Asana OAuth](#3-asana-oauth)
4. [Calendly OAuth](#4-calendly-oauth)
5. [WhatsApp Bridge Deployment](#5-whatsapp-bridge-deployment)
6. [Vercel Environment Variables Checklist](#6-vercel-environment-variables-checklist)
7. [Post-Provisioning Verification](#7-post-provisioning-verification)

---

## 1. Google Cloud (Gmail OAuth)

**Requirement:** OAUTH-01, CHAN-01

### Prerequisites

- Google Cloud account with billing enabled
- Access to Google Cloud Console (https://console.cloud.google.com)

### Steps

1. **Go to Google Cloud Console** > APIs & Services > Credentials
   - URL: https://console.cloud.google.com/apis/credentials

2. **Create OAuth 2.0 Client ID**
   - Click "Create Credentials" > "OAuth Client ID"
   - Application type: **Web application**
   - Name: `BitBit Gmail Integration`

3. **Add Authorized Redirect URI**
   ```
   https://{APP_DOMAIN}/callback/gmail
   ```

4. **Enable Gmail API**
   - Go to APIs & Services > Library
   - Search for "Gmail API"
   - Click "Enable"
   - Also enable "Google People API" (for contact name resolution)

5. **Configure OAuth Consent Screen** (if not already done)
   - Go to APIs & Services > OAuth consent screen
   - User Type: **External** (or Internal if using Google Workspace)
   - App name: `BitBit`
   - Scopes: `gmail.readonly`, `gmail.send`, `gmail.modify`
   - Add test users during development

6. **Copy Credentials**
   - Client ID: `xxxx.apps.googleusercontent.com`
   - Client Secret: `GOCSPX-xxxx`

7. **Set in Vercel**
   ```bash
   vercel env add GOOGLE_CLIENT_ID
   vercel env add GOOGLE_CLIENT_SECRET
   ```

### Verification

1. Navigate to Settings > Channels > Gmail > Connect
2. Complete the OAuth consent flow
3. Verify the channel shows "Connected" status
4. Send a test email to the connected inbox and verify it appears in the dashboard

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `redirect_uri_mismatch` | Redirect URI doesn't match exactly | Check trailing slashes, http vs https, exact domain match |
| `access_denied` | User denied consent | User must click "Allow" on consent screen |
| `invalid_client` | Wrong Client ID/Secret | Re-copy from Google Cloud Console |
| `deleted_client` | OAuth client was deleted | Create a new OAuth client |

> **Warning:** Google requires app verification for sensitive scopes (gmail.send, gmail.modify) in production. During development, add test users to the OAuth consent screen. For production, submit the app for verification — this can take 2-6 weeks.

---

## 2. Microsoft Azure AD (Outlook OAuth)

**Requirement:** OAUTH-02, CHAN-02

### Prerequisites

- Microsoft Azure account (https://portal.azure.com)
- Azure Active Directory access

### Steps

1. **Go to Azure Portal** > Azure Active Directory > App registrations
   - URL: https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade

2. **New Registration**
   - Name: `BitBit Outlook Integration`
   - Supported account types: **Accounts in any organizational directory** (multi-tenant)
   - Redirect URI (Web): `https://{APP_DOMAIN}/callback/outlook`

3. **Configure API Permissions**
   - Go to "API permissions" > "Add a permission"
   - Select "Microsoft Graph"
   - Choose "Delegated permissions"
   - Add:
     - `Mail.Read`
     - `Mail.Send`
     - `offline_access` (for refresh tokens)
     - `User.Read` (for profile info)
   - Click "Grant admin consent for [your org]"

4. **Create Client Secret**
   - Go to "Certificates & secrets" > "New client secret"
   - Description: `BitBit production`
   - Expiry: 24 months (set calendar reminder to rotate)
   - **Copy the Value immediately** — it won't be shown again

5. **Copy Credentials**
   - Application (client) ID: from "Overview" page
   - Directory (tenant) ID: from "Overview" page (use `common` for multi-tenant)
   - Client secret: the Value you just copied

6. **Set in Vercel**
   ```bash
   vercel env add OUTLOOK_CLIENT_ID
   vercel env add OUTLOOK_CLIENT_SECRET
   vercel env add OUTLOOK_TENANT_ID
   ```

### Verification

1. Navigate to Settings > Channels > Outlook > Connect
2. Complete the Microsoft login and consent flow
3. Verify the channel shows "Connected" status
4. Send a test email and verify it appears in the dashboard

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `AADSTS50011` | Redirect URI mismatch | Check exact URI in App registration > Authentication |
| `AADSTS65001` | Admin consent required | Admin must grant consent in Azure portal |
| `AADSTS700016` | App not found in tenant | Check Application ID, ensure multi-tenant is enabled |
| `invalid_client` | Secret expired | Create new client secret, update Vercel env |

> **Note:** For multi-tenant support, set "Supported account types" to "Accounts in any organizational directory and personal Microsoft accounts". Use `common` as the tenant ID in OAuth URLs.

> **Warning:** Azure client secrets expire. Set a calendar reminder 30 days before expiry to rotate the secret. When rotating, create new secret first, update env, then delete old secret.

---

## 3. Asana OAuth

**Requirement:** OAUTH-04

### Prerequisites

- Asana account with admin access
- Access to Asana Developer Console (https://app.asana.com/0/developer-console)

### Steps

1. **Go to Asana Developer Console**
   - URL: https://app.asana.com/0/developer-console

2. **Create New App**
   - Click "Create new app"
   - App name: `BitBit`
   - Accept the API terms

3. **Configure OAuth**
   - Go to "OAuth" tab in your app settings
   - Redirect URI: `https://{APP_DOMAIN}/callback/asana`

4. **Copy Credentials**
   - Client ID: displayed on the app settings page
   - Client Secret: displayed on the app settings page

5. **Set in Vercel**
   ```bash
   vercel env add ASANA_CLIENT_ID
   vercel env add ASANA_CLIENT_SECRET
   ```

### Verification

1. Navigate to Settings > Channels > Asana > Connect
2. Complete the Asana OAuth flow
3. Verify the channel shows "Connected" status
4. Create a test task in Asana and verify it appears in the dashboard

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_redirect_uri` | Redirect URI doesn't match | Update in Asana Developer Console |
| `invalid_client` | Wrong credentials | Re-copy from Developer Console |
| `unauthorized_client` | App not authorized | Ensure app is published or user is in the workspace |

---

## 4. Calendly OAuth

**Requirement:** OAUTH-05

### Prerequisites

- Calendly account (Professional plan or higher for API access)
- Access to Calendly Developer Portal (https://developer.calendly.com)

### Steps

1. **Go to Calendly Developer Portal**
   - URL: https://developer.calendly.com

2. **Create OAuth Application**
   - Navigate to "My Apps" > "Create new app"
   - App name: `BitBit`
   - Kind: **OAuth**

3. **Configure Redirect URI**
   - Redirect URI: `https://{APP_DOMAIN}/callback/calendly`

4. **Copy Credentials**
   - Client ID: displayed on the app page
   - Client Secret: displayed on the app page

5. **Set in Vercel**
   ```bash
   vercel env add CALENDLY_CLIENT_ID
   vercel env add CALENDLY_CLIENT_SECRET
   ```

### Verification

1. Navigate to Settings > Channels > Calendly > Connect
2. Complete the Calendly OAuth flow
3. Verify the channel shows "Connected" status
4. Check that upcoming events are synced

### Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid_redirect_uri` | Redirect URI mismatch | Update in Calendly Developer Portal |
| `access_denied` | User denied or plan too low | Calendly Professional plan required for OAuth |
| `invalid_client` | Wrong credentials | Re-copy from Developer Portal |

> **Note:** Calendly API access requires a Professional plan or higher. Free/Basic plans do not support OAuth integrations.

---

## 5. WhatsApp Bridge Deployment

**Requirement:** CHAN-03

The WhatsApp bridge runs as a standalone persistent process on Fly.io, separate from the main app. It maintains a Baileys WebSocket connection to WhatsApp servers.

### Prerequisites

- Fly.io CLI installed: `curl -L https://fly.io/install.sh | sh`
- Fly.io authenticated: `fly auth login`
- Supabase project URL and service role key
- A phone number with WhatsApp installed for pairing

### Steps

1. **Navigate to the bridge deployment directory**
   ```bash
   cd deployments/whatsapp-bridge
   ```

2. **Create the Fly.io app**
   ```bash
   fly apps create bitbit-whatsapp-bridge
   ```

3. **Create persistent volume** (for auth state between deploys)
   ```bash
   fly volumes create bridge_data --region syd --size 1
   ```

4. **Set secrets**
   ```bash
   fly secrets set \
     SUPABASE_URL="https://your-project.supabase.co" \
     SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..." \
     DEFAULT_ORG_ID="your-org-uuid" \
     BRIDGE_SECRET="$(openssl rand -hex 32)"
   ```

   > **Important:** Save the BRIDGE_SECRET value — you'll need it to call management endpoints.

5. **Deploy**
   ```bash
   fly deploy
   ```

6. **Verify deployment**
   ```bash
   fly status
   # Should show 1 machine running in syd region

   fly logs
   # Should show "[whatsapp-bridge] Server listening on port 3000"
   ```

7. **Pair with WhatsApp**
   ```bash
   # Get QR code for pairing
   curl -H "Authorization: Bearer YOUR_BRIDGE_SECRET" \
     https://bitbit-whatsapp-bridge.fly.dev/bridge/qr

   # If QR is returned, scan it with WhatsApp on your phone:
   # WhatsApp > Settings > Linked Devices > Link a Device
   ```

8. **Verify connection**
   ```bash
   curl -H "Authorization: Bearer YOUR_BRIDGE_SECRET" \
     https://bitbit-whatsapp-bridge.fly.dev/bridge/status
   # Should show: {"running": true, "status": "connected"}
   ```

### Monitoring

```bash
# Live logs
fly logs -a bitbit-whatsapp-bridge

# Health check (public, used by Fly.io)
curl https://bitbit-whatsapp-bridge.fly.dev/health

# Bridge status (authenticated)
curl -H "Authorization: Bearer YOUR_BRIDGE_SECRET" \
  https://bitbit-whatsapp-bridge.fly.dev/bridge/status
```

### Management Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | None | Health check (Fly.io monitoring) |
| POST | `/bridge/start` | Bearer | Start bridge for org (body: `{"org_id": "..."}`) |
| POST | `/bridge/stop` | Bearer | Stop bridge for org (body: `{"org_id": "..."}`) |
| GET | `/bridge/status` | Bearer | Detailed bridge status |
| GET | `/bridge/qr` | Bearer | Current QR code for pairing |

### Troubleshooting

| Issue | Fix |
|-------|-----|
| Bridge keeps disconnecting | Check phone is online, WhatsApp hasn't revoked session |
| QR code not appearing | Restart bridge: `fly machines restart` |
| "Max reconnect attempts exceeded" | Check Fly.io logs, manually restart: POST `/bridge/start` |
| Auth state lost after deploy | Volume must be mounted — check `fly volumes list` |

> **Warning:** Baileys is an unofficial WhatsApp library. WhatsApp can revoke the session at any time. Keep the paired phone online and connected to the internet. If the session is revoked, you'll need to re-pair by scanning a new QR code.

---

## 6. Vercel Environment Variables Checklist

All environment variables needed for OAuth integrations:

| Variable | Source | Required | Set? |
|----------|--------|----------|------|
| `GOOGLE_CLIENT_ID` | Google Cloud Console > Credentials | Yes (Gmail) | [ ] |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console > Credentials | Yes (Gmail) | [ ] |
| `OUTLOOK_CLIENT_ID` | Azure Portal > App registrations | Yes (Outlook) | [ ] |
| `OUTLOOK_CLIENT_SECRET` | Azure Portal > Certificates & secrets | Yes (Outlook) | [ ] |
| `OUTLOOK_TENANT_ID` | Azure Portal > App registrations (use `common` for multi-tenant) | Yes (Outlook) | [ ] |
| `ASANA_CLIENT_ID` | Asana Developer Console | Yes (Asana) | [ ] |
| `ASANA_CLIENT_SECRET` | Asana Developer Console | Yes (Asana) | [ ] |
| `CALENDLY_CLIENT_ID` | Calendly Developer Portal | Yes (Calendly) | [ ] |
| `CALENDLY_CLIENT_SECRET` | Calendly Developer Portal | Yes (Calendly) | [ ] |
| `SUPABASE_URL` | Supabase project settings | Yes (all) | [ ] |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project settings | Yes (bridge) | [ ] |
| `BRIDGE_SECRET` | Generated (`openssl rand -hex 32`) | Yes (bridge) | [ ] |

### Verify in Vercel

```bash
# List all environment variables
vercel env ls

# Or check in Vercel Dashboard:
# Project > Settings > Environment Variables
```

### Verify in Fly.io (WhatsApp Bridge)

```bash
fly secrets list -a bitbit-whatsapp-bridge
```

---

## 7. Post-Provisioning Verification

After all credentials are provisioned, run through this checklist:

### Connectivity Checks

- [ ] **Gmail:** Settings > Channels > Gmail > Connect completes OAuth flow
- [ ] **Outlook:** Settings > Channels > Outlook > Connect completes OAuth flow
- [ ] **Asana:** Settings > Channels > Asana > Connect completes OAuth flow
- [ ] **Calendly:** Settings > Channels > Calendly > Connect completes OAuth flow
- [ ] **WhatsApp:** Bridge shows "connected" status, test message received

### Functional Checks

- [ ] **Gmail:** Inbound email appears in dashboard inbox
- [ ] **Gmail:** Outbound email sends successfully
- [ ] **Outlook:** Inbound email appears in dashboard inbox
- [ ] **Outlook:** Outbound email sends successfully
- [ ] **Asana:** Tasks sync to dashboard
- [ ] **Calendly:** Events sync to dashboard
- [ ] **WhatsApp:** Inbound message appears in dashboard inbox
- [ ] **WhatsApp:** Outbound message sends via outbox

### Token Refresh Checks

- [ ] **Gmail:** Token refreshes after 1 hour (check channel_connections table)
- [ ] **Outlook:** Token refreshes before expiry (check channel_connections table)
- [ ] **Asana:** Token refreshes on 401 retry
- [ ] **Calendly:** Token refreshes on 401 retry

### Health Monitoring

- [ ] **WhatsApp Bridge:** `/health` returns OK
- [ ] **Channel health:** `/api/channels/sync` returns all channels with status
- [ ] All channels show in the dashboard channel grid

> **Next step:** Run smoke test scripts (Plan 19-03) for automated verification of all integrations.
