# Credential Vault for CUA Browser Sessions — Design Spec

## Problem

Phase 40 (Multimodal Web Automation / CUA) needs BitBit to log into websites, fill forms, and navigate authenticated pages on behalf of users. The current architecture makes browser containers ephemeral — "no session data persists between tasks or orgs." This creates a hard problem: every CUA session starts from scratch, requiring fresh logins, and there's no way to handle 2FA/MFA challenges that require persistent state.

## Current Credential Infrastructure

BitBit already has a mature credential layer:

| System | Table | Encryption | Purpose |
|--------|-------|-----------|---------|
| `credentials.ts` | `org_integrations` | AES-256-GCM (`CREDENTIALS_KEY` + scrypt) | OAuth tokens for app integrations (Gmail, Outlook, Xero, etc.) |
| `credentials.ts` | `channel_connections.config` | Same AES-256-GCM (fallback path) | Channel-specific credentials |
| `credentials.ts` | `channel_configs` | Same AES-256-GCM | Channel adapter OAuth tokens |
| Composio MCP | External (Composio-hosted) | Composio-managed | Third-party app OAuth (HubSpot, Notion, etc.) |

**What works:** `encryptCredential()` / `decryptCredential()` with AES-256-GCM, `storeOrgCredential()` / `getOrgCredential()` with audit logging.

**What's missing for CUA:**
- No storage for website login credentials (username/password pairs)
- No TOTP/MFA seed storage
- No browser session/cookie persistence
- No per-site credential categorization
- No credential rotation or freshness tracking for website logins

## Design

### New Table: `org_site_credentials`

```sql
CREATE TABLE org_site_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  
  -- Site identification
  domain TEXT NOT NULL,                    -- e.g., 'xero.com', 'myob.com.au'
  display_name TEXT NOT NULL,              -- e.g., 'Xero Accounting'
  category TEXT NOT NULL DEFAULT 'web',    -- web, api, ssh, ftp
  
  -- Encrypted credential blob (AES-256-GCM, same key as org_integrations)
  credentials_encrypted TEXT NOT NULL,
  credential_type TEXT NOT NULL,           -- 'password', 'totp', 'session', 'api_key', 'certificate'
  
  -- Metadata (NOT encrypted — queryable)
  username_hint TEXT,                      -- first 3 chars + *** for display only
  has_totp BOOLEAN DEFAULT false,          -- quick check without decryption
  last_used_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,           -- last successful login
  failure_count INTEGER DEFAULT 0,         -- consecutive failures
  
  -- Domain allowlist integration
  allowed_by_policy BOOLEAN DEFAULT true,  -- ties to org domain allowlist
  
  -- Lifecycle
  expires_at TIMESTAMPTZ,                 -- for session cookies, tokens
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(org_id, domain, credential_type)
);

-- RLS: org-scoped access only
ALTER TABLE org_site_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_site_credentials_policy ON org_site_credentials
  USING (org_id = (current_setting('request.jwt.claims', true)::json->>'org_id')::uuid);

CREATE INDEX idx_site_creds_org_domain ON org_site_credentials(org_id, domain);
```

### Credential Blob Schema

The `credentials_encrypted` field contains AES-256-GCM encrypted JSON. Structure varies by `credential_type`:

```typescript
// credential_type: 'password'
{ username: string; password: string; login_url?: string }

// credential_type: 'totp'
{ secret: string; algorithm?: 'SHA1' | 'SHA256'; digits?: 6 | 8; period?: 30 | 60 }

// credential_type: 'session'
{ cookies: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>; user_agent?: string }

// credential_type: 'api_key'
{ key: string; header_name?: string }
```

### CUA Login Flow

```
User: "Log into our Xero and download the March BAS"

1. TAOR planner routes to CUA (browser tier)
2. CUA checks org_site_credentials for domain='xero.com'
   a. Found 'session' type AND not expired → inject cookies into browser, skip login
   b. Found 'password' type → navigate to login_url, fill credentials
   c. Found 'password' + has_totp=true → also fetch 'totp' credential, generate current OTP
   d. Not found → ask user for credentials (store for next time with consent)
3. After successful login, capture session cookies → store as 'session' credential
4. Session credential has expires_at set to cookie expiry (or 24h default)
5. Next CUA task for same domain reuses session (step 2a)
```

### 2FA/TOTP Handling

```typescript
import { authenticator } from 'otplib'

function generateTOTP(secret: string, algorithm = 'SHA1', digits = 6, period = 30): string {
  authenticator.options = { algorithm, digits, step: period }
  return authenticator.generate(secret)
}
```

The CUA vision loop detects 2FA prompts via screenshot analysis:
1. Screenshot shows "Enter verification code" / "2FA" / "Authenticator" pattern
2. CUA checks `has_totp=true` for current domain
3. If TOTP seed exists: generate OTP, fill the field, continue
4. If no TOTP seed: pause task, send user a notification asking for the code (or the TOTP secret for future use)
5. If SMS/email 2FA: check if BitBit has access to that channel (iMessage, Gmail, etc.) and intercept the code automatically

### Channel-Aware 2FA Interception

This is where connected channels create a superpower:

| 2FA Method | BitBit Can Handle | How |
|-----------|-------------------|-----|
| TOTP (Authenticator) | Yes, if seed stored | Generate OTP from `org_site_credentials` |
| SMS code | Yes, if SMS/iMessage connected | Read incoming message via channel relay, extract code |
| Email code | Yes, if Gmail/Outlook connected | Read verification email via channel relay, extract code |
| Push notification | No | Pause, ask user to approve on their device |
| Hardware key | No | Pause, ask user to touch their key |

**iMessage advantage**: If the user has iMessage connected, BitBit can automatically intercept SMS 2FA codes sent to their phone number. This is a massive UX win — the user never has to manually copy codes.

### Session Persistence Strategy

Browser containers are still ephemeral (security requirement). But sessions persist in the database:

1. **Pre-inject**: Before CUA starts, load session cookies from `org_site_credentials` and inject into the fresh browser via CDP `Network.setCookie`
2. **Post-capture**: After CUA completes, extract cookies via CDP `Network.getAllCookies`, encrypt and store/update the session credential
3. **Expiry management**: Cron job cleans expired sessions. `last_used_at` tracks freshness.
4. **Failure recovery**: If injected session is stale (login page appears despite cookies), fall back to password login, capture new session

### Security Model

- **Same encryption**: Reuse existing `encryptCredential()` / `decryptCredential()` (AES-256-GCM, `CREDENTIALS_KEY`)
- **Org-scoped RLS**: Users can only access their own credentials
- **Domain allowlist**: `allowed_by_policy` field ties to existing per-org domain allowlist from Phase 40
- **Audit trail**: All credential access logged via `logAuditEvent()`
- **No plaintext in logs**: Credential blob never appears in any log, only `domain` and `credential_type`
- **User consent**: First-time credential storage requires explicit user approval ("Store these credentials for future logins?")
- **Credential deletion**: User can delete any stored credential from dashboard settings

### API Surface

```typescript
// src/lib/credentials/site-credentials.ts

/** Store a site credential (encrypts automatically) */
async function storeSiteCredential(supabase, orgId, domain, credentialType, credentials, options?)

/** Retrieve and decrypt a site credential */
async function getSiteCredential(supabase, orgId, domain, credentialType): Promise<DecryptedCredential | null>

/** Get all credentials for a domain (without decryption — metadata only) */
async function getSiteCredentialMeta(supabase, orgId, domain): Promise<CredentialMeta[]>

/** Delete a site credential */
async function deleteSiteCredential(supabase, orgId, domain, credentialType)

/** Update last_used_at and reset failure_count on successful login */
async function markCredentialUsed(supabase, credentialId)

/** Increment failure_count; if >3, mark credential as stale */
async function markCredentialFailed(supabase, credentialId)

/** Store session cookies after successful CUA login */
async function storeSessionCookies(supabase, orgId, domain, cookies, expiresAt?)

/** Load session cookies for pre-injection */
async function loadSessionCookies(supabase, orgId, domain): Promise<Cookie[] | null>
```

### Dashboard UI

Settings → Security → Stored Credentials:
- List all domains with stored credentials
- For each: domain, type (password/totp/session), last used, status
- Actions: delete, re-verify, view (shows username hint, never password)
- Add new: domain, username, password, optional TOTP seed

### Client Projects / Software BitBit Builds

For Phase 41 (Ephemeral Workspaces) where BitBit builds software:
- Workspace files persist in Supabase Storage (org-scoped bucket) or git repos
- Build artifacts (websites, scripts) are output objects with signed URLs
- No credential vault needed for workspaces — they use the SDK's existing `fetch()` for APIs
- If a workspace needs to deploy (e.g., push to Vercel, commit to GitHub), it uses `org_integrations` OAuth tokens via the SDK, not stored passwords

## Non-Goals

- Password manager features (browser extension, autofill outside CUA)
- Credential sharing between orgs
- Hardware security module (HSM) integration — overkill for current scale
- Passkey/WebAuthn storage — CUA uses traditional login flows

## Dependencies

- Phase 39 (Async Task Infrastructure) — CUA runs as async tasks
- Phase 40 (Multimodal Web Automation) — the consumer of this vault
- Existing `credentials.ts` encryption infrastructure — reused as-is
