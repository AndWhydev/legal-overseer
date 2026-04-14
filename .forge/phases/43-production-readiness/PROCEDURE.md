# Phase 43 — Production Readiness Verification Procedure

This document describes the tests that can only be performed against a real
Postgres + authenticated Supabase environment. The unit-test suite cannot
exercise them — RLS, foreign keys, unique constraints, and concurrency
behaviour only fire against actual Postgres.

Run this before declaring Phase 43 production-ready.

## Prerequisites

- A Supabase project (staging). Environment variables set:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- The project has `organizations`, `profiles`, and `entity_nodes` tables
  populated (at least one test org + one test entity).
- `supabase` CLI installed, or direct `psql` access.

## 1. Apply the migration

```bash
cd personal-assistant
supabase db push                       # applies all pending migrations
# OR, direct:
psql "$SUPABASE_DB_URL" -f supabase/migrations/20260410000003_delegation_mandates.sql
```

**Expected:** zero errors. Two new tables exist:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'delegation_%';
-- delegation_mandates
-- delegation_action_log
```

## 2. Verify RLS policies are enabled

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename like 'delegation_%';
-- Both rows should have rowsecurity = true.

select polname, tablename
from pg_policies
where schemaname = 'public' and tablename like 'delegation_%';
-- Expect 5 policies: 3 for delegation_mandates (select/insert/update),
-- 2 for delegation_action_log (select/insert).
```

## 3. Verify the unique active-mandate index

```sql
select indexdef
from pg_indexes
where tablename = 'delegation_mandates' and indexname = 'idx_delegation_mandates_active';
-- Expect: CREATE UNIQUE INDEX ... ON public.delegation_mandates
--          USING btree (org_id, entity_id) WHERE (deactivated_at IS NULL);
```

**Race-condition smoke test** (concurrent activate should fail the second one):

```sql
-- In two concurrent psql sessions against the same org + entity:
insert into delegation_mandates (org_id, entity_id, mandate_level, activated_via)
values ('<org>', '<entity>', 'infinite_autopilot', 'api');
-- First: success. Second: ERROR: duplicate key value violates unique constraint
-- This proves setEntityMandate's revoke-then-insert race has a safety net.
```

## 4. RLS smoke — anon key without auth cannot insert

```bash
# Using the anon key (no user auth headers). Expected: 401 or empty auth.uid().
curl -X POST "$SUPABASE_URL/rest/v1/delegation_mandates" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<org>","entity_id":"<entity>","mandate_level":"infinite_autopilot","activated_via":"api"}'
# Expected: { "code":"42501", "message":"new row violates row-level security policy..." }
```

## 5. RLS smoke — authenticated user of wrong org is blocked

```bash
# Token for user A in org O1, attempting to insert a mandate in org O2.
curl -X POST "$SUPABASE_URL/rest/v1/delegation_mandates" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer <JWT_FOR_ORG_O1>" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<ORG_O2>","entity_id":"<entity>","mandate_level":"infinite_autopilot","activated_via":"api"}'
# Expected: 401/42501. User cannot write outside their org.
```

## 6. Service-role path succeeds

```bash
# Service role key bypasses RLS; this is the path taken by webhooks, cron, TAOR.
curl -X POST "$SUPABASE_URL/rest/v1/delegation_mandates" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<org>","entity_id":"<entity>","mandate_level":"infinite_autopilot","activated_via":"api"}'
# Expected: 201 Created, row inserted.
```

## 7. End-to-end smoke via /api/delegation

With the dev server running (`npm run dev`):

```bash
# As an authenticated web user (cookie set):
curl -s http://localhost:3000/api/delegation -b "$COOKIE_JAR" | jq
# Expected: { "mandates": [ ... ] } with the row inserted in step 6.

# Revoke it:
curl -X DELETE http://localhost:3000/api/delegation/<entity_id> -b "$COOKIE_JAR" | jq
# Expected: { "revoked": true }

# Subsequent GET returns empty list.
```

## 8. TAOR NL-activation smoke

Start the dev server, connect a test WhatsApp thread (or use the chat UI):

```
User: "put Acme Corp on autopilot"
BitBit: "Got it — I'll take over managing Acme Corp from here..."

# Verify:
select * from delegation_mandates where entity_id = '<acme entity id>';
-- Expected: 1 active mandate, activated_via='whatsapp' (or 'web').
```

```
User: "stop managing Acme"
BitBit: "Understood — I've stepped back..."

# Verify:
select deactivated_at, deactivated_via
from delegation_mandates where entity_id = '<acme>';
-- Expected: deactivated_at populated.
```

## 9. Ambiguity check

Seed two entities with names starting with the same prefix:

```sql
insert into entity_nodes (org_id, entity_type, name) values
  ('<org>', 'person', 'John Smith'),
  ('<org>', 'person', 'John Doe');
```

```
User: "stop managing John"
BitBit: "I found a few matches for 'John' — which one did you mean?
         • John Smith
         • John Doe
         Reply with the full name or the distinguishing detail."
# Expected: no mandate revoked.
```

## 10. Rate-limit kill switch

Under an active `infinite_autopilot` mandate, manually insert 100 actions
in the last hour:

```sql
insert into delegation_action_log (org_id, entity_id, action_type, action_summary)
select '<org>', '<entity>', 'test', 'seed ' || gs
from generate_series(1, 100) gs;
```

Trigger one more delegated action (e.g. via chat under the mandated entity).
In the logs, expect:

```
[tools] Delegation rate limit hit — demoting to standard routing
  { orgId, entityId, count: 100, limit: 100 }
```

And the action should route through normal approval rather than bypassing.

## 11. Verify the build

```bash
cd personal-assistant && npm run build
# Expected: next build succeeds. If Google Fonts 403s block build, it's a
# network/CI issue not a code issue — verify with NEXT_DISABLE_FONTS or a
# local cache.
```

## Sign-off checklist

- [ ] Migration applied cleanly to staging.
- [ ] RLS policies listed and enforced.
- [ ] Unique active-mandate index prevents concurrent duplicates.
- [ ] Anon insert without auth is denied.
- [ ] Cross-org insert is denied.
- [ ] Service-role insert succeeds.
- [ ] `/api/delegation` GET + DELETE work with cookie auth.
- [ ] TAOR NL activation writes a mandate row; revocation flips deactivated_at.
- [ ] Ambiguity prompt fires for multi-match mentions.
- [ ] Rate limit demotes the 101st action to standard routing.
- [ ] `npm run build` succeeds.
- [ ] Sentry / logs capture `[tools] Delegation rate limit hit` events.

Once all boxes ticked, Phase 43 is production-ready.
