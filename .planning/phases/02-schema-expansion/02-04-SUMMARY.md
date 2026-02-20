---
plan: 02-04
status: complete
commit: d040ef3
---

## Result
Created `017_rls_new_tables.sql` with RLS policies for all 12 new tables:
- 12 ENABLE ROW LEVEL SECURITY statements
- 10 full CRUD tables (4 policies each = 40 policies)
- 2 append-only tables (SELECT + INSERT only = 4 policies)
- Total: 44 CREATE POLICY statements, all using `org_id = get_user_org_id()`

Append-only tables (entity_timeline, agent_runs) have no UPDATE/DELETE policies. Contacts table skipped (already has RLS from 002).

## Deviations
None.
