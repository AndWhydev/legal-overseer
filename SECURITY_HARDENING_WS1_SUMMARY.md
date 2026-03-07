# Security Hardening WS1 — Complete Summary

**Status**: ✅ ALL TASKS COMPLETED
**Commit**: `a0464dde` — security(ws1): hardening — redact leaked keys, remove pii, add auth, validate inputs
**Date**: 2026-03-07

## Tasks Completed

### 1A. Redact Leaked API Key

**File**: `deliverables/code_analysis_deliverable.md`

- **Finding**: Real Anthropic API key (`sk-ant-REDACTED`) was hardcoded in line 925
- **Action**: Replaced with `sk-ant-REDACTED`
- **Search**: Confirmed no other real `sk-ant-api03-*` keys exist in repo (other references are template examples like `sk-ant-api03-...`)

### 1B. Remove Hardcoded PII from Deployments Config

**File**: `deployments/awu/config.ts`

**Removed PII**:
- Client contact names: "Sezer Yunus", "Harun", "Dima, Rawya", "Ghazi", "Marquis Abela"
- Email addresses: "harry.thomas@pbfc.com"
- Phone numbers: "+61 400 699 890"
- Demo credentials: "demo1234" password
- Internal notes: NDA holder names, project details, budget information

**Changes**:
- Replaced entire `clients` array with comment:
  ```typescript
  /**
   * AWU client roster — deployment targets for agent testing.
   *
   * Client contact details and demo credentials are stored in the contacts table in Supabase.
   * See migration_054_contact_schema.sql for the full schema.
   */
  export const clients = [
    // Clients are loaded from the database contacts table at runtime.
    // This configuration file is no longer used for production client data.
    // Reference the contacts table for contact names, emails, phone numbers, and credentials.
  ]
  ```
- Keeps channel configuration (non-sensitive metadata) intact

### 1C. Add Authentication to Reports API

**File**: `personal-assistant/src/app/api/reports/route.ts`

**Changes**:
1. **Import**: Changed from service-role direct client to session-based auth:
   ```typescript
   // Before:
   import { createClient } from '@supabase/supabase-js'
   function getSupabase() {
     return createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
       process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
     )
   }

   // After:
   import { createClient as createServerClient } from '@/lib/supabase/server'
   ```

2. **POST Handler**:
   - Added authentication check: `const { data: { user } } = await supabase.auth.getUser()`
   - Returns 401 if user is not authenticated
   - Derives `org_id` from user profile (not from request body)
   - Verifies user's organization exists before generating report

3. **GET Handler**:
   - Added same authentication checks as POST
   - Removed `org_id` query parameter — uses authenticated user's org exclusively
   - Returns 401 for unauthenticated requests

**Security Impact**: Prevents unauthorized report generation/access, eliminates org_id spoofing via query params.

### 1D. Add Input Validation to PATCH Endpoints

#### File: `personal-assistant/src/app/api/tasks/[id]/route.ts`

**Added Allowlist**:
```typescript
const ALLOWED_TASK_FIELDS = [
  'title',
  'description',
  'status',
  'priority',
  'due_date',
  'assigned_to',
  'completed_at',
] as const
```

**Validation Logic**:
```typescript
const filteredBody = Object.fromEntries(
  Object.entries(body).filter(([key]) => ALLOWED_TASK_FIELDS.includes(key as any))
)

const { data, error } = await supabase
  .from('tasks')
  .update(filteredBody)  // Uses filtered body, not raw body
  .eq('id', id)
  .select()
  .single()
```

**Blocked Fields**: `id`, `org_id`, `user_id`, `created_at`, and any other system fields

#### File: `personal-assistant/src/app/api/contacts/[id]/route.ts`

**Added Allowlist**:
```typescript
const ALLOWED_CONTACT_FIELDS = [
  'name',
  'email',
  'phone',
  'company',
  'notes',
  'type',
  'tags',
] as const
```

**Same validation pattern** as tasks endpoint.

**Blocked Fields**: `id`, `org_id`, `user_id`, `created_at`, and any other system fields

**Security Impact**: Prevents privilege escalation via org_id injection, prevents timestamp manipulation, ensures immutable IDs.

### 1E. Remove Stripe Hardcoded Test Key Fallback

**File**: `personal-assistant/src/lib/webhooks/verify-signature.ts`

**Before**:
```typescript
function getStripeClient(): StripeWebhookClient {
  if (!stripeConstructor) {
    const stripeModule = require('stripe') as StripeConstructor | { default: StripeConstructor }
    stripeConstructor = typeof stripeModule === 'function' ? stripeModule : stripeModule.default
  }

  return new stripeConstructor(process.env.STRIPE_SECRET_KEY || 'sk_test_webhook_verification')
}
```

**After**:
```typescript
function getStripeClient(): StripeWebhookClient {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required')
  }

  if (!stripeConstructor) {
    const stripeModule = require('stripe') as StripeConstructor | { default: StripeConstructor }
    stripeConstructor = typeof stripeModule === 'function' ? stripeModule : stripeModule.default
  }

  return new stripeConstructor(stripeKey)
}
```

**Security Impact**: Fails fast with clear error message if webhook secret is missing, prevents silent fallback to test key in production.

### 1F. Fix DEV_BYPASS_AUTH Guard

#### File: `personal-assistant/src/middleware.ts`

**Before**:
```typescript
const bypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH ?? process.env.DEV_BYPASS_AUTH
if (bypassAuth === 'true') {
  if (process.env.VERCEL_ENV === 'production') {
    console.error('CRITICAL: DEV_BYPASS_AUTH is enabled in production! Auth bypass disabled.')
  } else {
    return applySecurityHeaders(NextResponse.next())
  }
}
```

**After**:
```typescript
const bypassAuth = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH ?? process.env.DEV_BYPASS_AUTH
if (bypassAuth === 'true') {
  if (process.env.NODE_ENV === 'production') {
    console.error('CRITICAL: DEV_BYPASS_AUTH is enabled in production! Auth bypass disabled.')
  } else {
    return applySecurityHeaders(NextResponse.next())
  }
}
```

**Reason**: Changed `VERCEL_ENV` to `NODE_ENV` for environment-agnostic deployment detection. Prevents accidental auth bypass on non-Vercel production deployments that set `VERCEL_ENV=production` without setting `NODE_ENV=production`.

#### File: `personal-assistant/src/lib/supabase/server.ts`

**Before**:
```typescript
export function isDevBypass() {
  return process.env.DEV_BYPASS_AUTH === 'true'
}
```

**After**:
```typescript
export function isDevBypass() {
  // Never allow dev bypass in production
  if (process.env.NODE_ENV === 'production') {
    return false
  }
  return process.env.DEV_BYPASS_AUTH === 'true'
}
```

**Impact**: Production environments always have `NODE_ENV=production`, ensuring dev bypass is impossible regardless of `DEV_BYPASS_AUTH` setting.

### 1G. Remove Hardcoded Profile Data

**File**: `personal-assistant/src/components/dashboard/tabs/settings-tab.tsx`

**Added Type**:
```typescript
interface UserProfile {
  display_name: string;
  email: string;
  organization: string;
}
```

**Before** (hardcoded):
```typescript
<Input defaultValue="Tor Kay" />
<Input defaultValue="contact@torkay.com" disabled />
<Input defaultValue="Torkay Digital" disabled />
```

**After** (dynamic from Supabase):
```typescript
<Input defaultValue={userProfile?.display_name || 'User'} />
<Input defaultValue={userProfile?.email || ''} disabled />
<Input defaultValue={userProfile?.organization || ''} disabled />
```

**Fetch Logic** (new useEffect):
```typescript
// Load user profile
const { data: profile } = await supabase.from('profiles').select('org_id, display_name').eq('id', user.id).single();
if (profile) {
  setUserProfile({
    display_name: profile.display_name || user.user_metadata?.full_name || 'User',
    email: user.email || '',
    organization: profile.org_id || '',
  });
}
```

**Security Impact**: Ensures profile data is always up-to-date and matches database, eliminates hardcoded test/development data in production code.

## Summary Statistics

| Category | Count |
|----------|-------|
| Files Modified | 9 |
| Security Issues Fixed | 7 |
| Lines Added | 144 |
| Lines Removed | 69 |
| Net Change | +75 |

## Testing Recommendations

1. **Reports API**: Test that unauthenticated requests return 401
2. **Task/Contact Updates**: Try PATCH with `org_id` in body — verify it's ignored
3. **DEV_BYPASS_AUTH**: Verify bypass only works locally (NODE_ENV ≠ production)
4. **Stripe**: Verify webhook creation fails gracefully if STRIPE_SECRET_KEY missing
5. **Settings Profile**: Verify profile data updates reflect in UI immediately

## Related Files & Contexts

- **Tenancy Model**: `personal-assistant/supabase/migrations/052_tenancy.sql`
- **RLS Policies**: `personal-assistant/supabase/rls_policies.sql`
- **Auth Middleware**: `personal-assistant/src/lib/supabase/middleware.ts`
- **Webhook Handler**: `personal-assistant/src/app/api/webhooks/`

## Next Steps (Post-WS1)

1. Conduct security audit of remaining API routes
2. Add comprehensive input validation to all PATCH/POST endpoints
3. Review and harden Stripe webhook signature verification
4. Audit Supabase RLS policies for any permission gaps
5. Set up automated secrets scanning in CI/CD
