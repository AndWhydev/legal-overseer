# Phase 43 — Post-Deploy Runbook

Phase 43 is shipped. This is a lightweight smoke-test runbook for after a
deploy (or whenever a first real user starts using delegation) — not a gate.
Run whatever's relevant for the change you just pushed.

## Chat smoke (the golden path)

```
User: "put Acme on autopilot"
BitBit: "Got it — I'll take over managing Acme from here..."

# Verify:
select * from delegation_mandates where entity_id = '<acme>';
-- One row, activated_via = 'web' or 'whatsapp', deactivated_at = null.
```

```
User: "stop managing Acme"
BitBit: "Understood — I've stepped back..."

# Verify:
select deactivated_at from delegation_mandates where entity_id = '<acme>';
-- deactivated_at populated.
```

## Ambiguity check

Seed two entities with a shared prefix:

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
# No mandate should be revoked.
```

## Rate-limit kill switch

Under an active `infinite_autopilot` mandate, seed 100 actions in the last hour:

```sql
insert into delegation_action_log (org_id, entity_id, action_type, action_summary)
select '<org>', '<entity>', 'test', 'seed ' || gs
from generate_series(1, 100) gs;
```

Then trigger one more delegated action. Logs should show:

```
[tools] Delegation rate limit hit — demoting to standard routing
  { orgId, entityId, count: 100, limit: 100 }
```

The action routes through normal approval rather than bypassing.

## Dashboard API

```bash
# Authenticated web user:
curl http://$HOST/api/delegation -b "$COOKIE_JAR" | jq
# → { "mandates": [...] }

curl -X DELETE http://$HOST/api/delegation/<entity_id> -b "$COOKIE_JAR" | jq
# → { "revoked": true|false }
```

## RLS sanity (only if you care about defence-in-depth — RLS is on)

```bash
# Anon key, no user session: should 403.
curl -X POST "$SUPABASE_URL/rest/v1/delegation_mandates" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"org_id":"<org>","entity_id":"<e>","mandate_level":"infinite_autopilot","activated_via":"api"}'
# → { "code":"42501", ... }
```

## Mandate persists across turns (regression check for the step-1b fix)

```
Turn 1 (user): "manage Acme on autopilot"
Turn 1 (bitbit): confirmation
Turn 2 (user): "chase the open Acme invoice"
# When the agent's tools target Acme, config.delegationMandate must load
# from delegation_mandates via step 1b and cause the send_email / draft_reply
# tool to auto-execute. Verify in logs: `[autonomy] Delegation bypass: entity
# ... has infinite_autopilot mandate`.
```

## Monitoring hooks to add when you have users

- Sentry alert on `[tools] Delegation rate limit hit` — signals either a real
  runaway or a cap that's too tight.
- Alert on `[taor] Delegation intent processing failed` — silent fallthrough.
- Weekly metric: count of `delegation_action_log` entries per org; flag any
  org whose mandate-driven activity jumps >10x week-over-week.

## Rollback

One migration to revert and two feature surfaces to disable:

```sql
drop table if exists delegation_action_log;
drop table if exists delegation_mandates;
```

Plus:
- Remove the step-1b mandate lookup and step-1c NL detection from
  `taor-loop.ts` (revert the audit commits).
- Delete `/api/delegation/*` routes.

No data migration back — delegation is additive.
