---
phase: 20-file-attachments-multimedia
plan: 01
subsystem: api, database, storage
tags: [supabase-storage, signed-urls, file-upload, rls, rpc, attachments]

# Dependency graph
requires: []
provides:
  - "attachments table with org-scoped RLS"
  - "get_org_storage_bytes() RPC for quota enforcement"
  - "chat-attachments private storage bucket (10MB, MIME allowlist)"
  - "POST /api/attachments/upload — signed upload URL creation"
  - "PATCH /api/attachments/[id] — upload confirmation"
  - "GET /api/attachments/[id] — signed download URL"
  - "validateFile() for client/server-side file validation"
  - "Fixed plan-gates.ts storage quota check (RPC replaces broken .select)"
affects: [20-02, 20-03, 21-billing-infrastructure]

# Tech tracking
tech-stack:
  added: []
  patterns: ["signed-upload-url pattern (server creates URL, client PUTs directly to storage)"]

key-files:
  created:
    - personal-assistant/supabase/migrations/092_attachments.sql
    - personal-assistant/src/lib/attachments/constants.ts
    - personal-assistant/src/lib/attachments/attachment-service.ts
    - personal-assistant/src/app/api/attachments/upload/route.ts
    - personal-assistant/src/app/api/attachments/[id]/route.ts
  modified:
    - personal-assistant/src/lib/billing/plan-gates.ts

key-decisions:
  - "Reused existing update_updated_at() trigger from 001_core_schema rather than creating new one"
  - "Storage path convention: {org_id}/{thread_id|unthreaded}/{uuid}/{filename} for org isolation"
  - "plan-gates.ts storage check replaced with RPC call to get_org_storage_bytes()"

patterns-established:
  - "Signed upload URL pattern: server validates + creates DB record + returns signed URL; client PUTs directly to Supabase Storage"
  - "Attachment service layer: createUploadUrl/confirmUpload/getDownloadUrl as reusable functions"

requirements-completed: [MEDIA-03, MEDIA-07, MEDIA-08, MEDIA-10, MEDIA-11]

# Metrics
duration: 16min
completed: 2026-03-18
---

# Phase 20 Plan 01: Storage Infrastructure Summary

**Attachments table with RLS, Supabase Storage signed upload URLs, upload/confirm/download API routes, and fixed plan-gates storage quota via RPC**

## Performance

- **Duration:** 16 min
- **Started:** 2026-03-18T16:06:44Z
- **Completed:** 2026-03-18T16:22:43Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created `attachments` table with 5 status values, org-scoped RLS, and partial indexes
- Built `get_org_storage_bytes()` RPC function for accurate storage quota enforcement
- Implemented signed upload URL pattern (server creates URL, client uploads directly to storage)
- Created upload/confirm/download API routes following project auth conventions
- Fixed broken `.select('size:sum')` in plan-gates.ts with proper RPC call

## Task Commits

Each task was committed atomically:

1. **Task 1: Database migration and Supabase Storage bucket** - `18964e10` (feat)
2. **Task 2: Attachment constants, service layer, API routes, and plan-gates fix** - `43ec3ca0` (feat)

## Files Created/Modified
- `personal-assistant/supabase/migrations/092_attachments.sql` - Table, RLS, indexes, RPC, trigger, bucket
- `personal-assistant/src/lib/attachments/constants.ts` - MIME allowlist, size limits, blocked extensions, validateFile()
- `personal-assistant/src/lib/attachments/attachment-service.ts` - createUploadUrl, confirmUpload, getDownloadUrl
- `personal-assistant/src/app/api/attachments/upload/route.ts` - POST endpoint for signed upload URL creation
- `personal-assistant/src/app/api/attachments/[id]/route.ts` - PATCH confirm + GET download URL
- `personal-assistant/src/lib/billing/plan-gates.ts` - Storage quota check fixed to use RPC

## Decisions Made
- Reused existing `update_updated_at()` trigger function from migration 001 instead of creating a new one
- Storage path follows `{org_id}/{thread_id|unthreaded}/{uuid}/{filename}` convention for clean org isolation
- Replaced broken `.select('size:sum')` Supabase syntax with `rpc('get_org_storage_bytes')` for reliable aggregation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript not installed in node_modules; installed as devDependency to run compilation check
- Pre-existing TypeScript error in `tools.ts:765` (unrelated to our changes, out of scope)

## User Setup Required

Storage bucket creation via SQL migration (`INSERT INTO storage.buckets`) may fail on some Supabase setups. If the migration fails on that statement, create the bucket manually via Supabase Dashboard:
- Name: `chat-attachments`
- Public: OFF
- File size limit: 10MB
- Allowed MIME types: image/jpeg, image/png, image/gif, image/webp, application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain, text/csv

## Next Phase Readiness
- Storage infrastructure complete: table, bucket, signed URLs, API routes all ready
- Plan 20-02 (chat route multimodal + frontend upload hook) can begin immediately
- Plan 20-03 (inline previews + content blocks) depends on 20-02

## Self-Check: PASSED

All 7 files verified present on disk. Both task commits (18964e10, 43ec3ca0) verified in git history.

---
*Phase: 20-file-attachments-multimedia*
*Completed: 2026-03-18*
