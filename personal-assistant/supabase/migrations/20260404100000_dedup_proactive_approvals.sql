-- 20260404100000_dedup_proactive_approvals.sql
-- Fix: Deduplicate existing proactive approval_queue entries and prevent recurrence.
--
-- Problem: The proactive-intelligence cron creates a new approval_queue row for the
-- same overdue invoice (or stale project) every 15-minute tick because there was no
-- cross-run deduplication. This migration:
--   1. Expires all but the newest pending proactive approval per unique entity
--   2. Adds a partial unique index to prevent future DB-level duplicates

BEGIN;

-- Step 1: Expire duplicate pending proactive approvals.
-- Keep only the most recent row per (org_id, action_type, md5(action_summary)).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, action_type, md5(action_summary)
      ORDER BY created_at DESC
    ) AS rn
  FROM approval_queue
  WHERE status = 'pending'
    AND action_type LIKE 'proactive:%'
)
UPDATE approval_queue
SET
  status = 'auto_expired',
  resolved_at = now(),
  resolved_via = 'auto_expire'
FROM ranked
WHERE approval_queue.id = ranked.id
  AND ranked.rn > 1;

-- Step 2: Partial unique index — only one pending proactive approval per entity.
-- Uses md5(action_summary) as a stable, fixed-length dedup key.
CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_queue_proactive_dedup
  ON approval_queue (org_id, action_type, md5(action_summary))
  WHERE status = 'pending' AND action_type LIKE 'proactive:%';

COMMIT;
