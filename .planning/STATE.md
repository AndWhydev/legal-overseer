# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-18)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** v1.4 Media, Billing & Growth Roles -- Phase 20 (File Attachments & Multimedia)

## Current Position

Phase: 20 of 24 (File Attachments & Multimedia)
Plan: 2 of 3 in current phase
Status: Executing
Last activity: 2026-03-18 -- Completed 20-02 (Upload Hook & Multimodal Chat Wiring)

Progress: v1.0 ======== | v1.1 ======== | v1.2 ======== | v1.4 [==#________] 18%

## Performance Metrics

**Delivery totals:**
- Total plans completed: 59 (v1.0: 19, v1.1: 16, v1.2: 22, v1.4: 2)
- Milestones shipped: v1.0 (2026-02-21), v1.1 (2026-02-22), v1.2 (2026-03-02)

**v1.4 Phases:**

| Phase | Plans | Status |
|-------|-------|--------|
| 20. File Attachments & Multimedia | 3 | 2 of 3 done |
| 21. Billing Infrastructure | 3 | Not started |
| 22. Cost Controls & Ad Script Generator | 2 | Not started |
| 23. SEO Monitor & Tender Hunter | 2 | Not started |
| 24. Content Creator | 1 | Not started |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table.

- [v1.4 roadmap] File attachments first -- zero dependencies, immediate UX improvement
- [v1.4 roadmap] Billing must precede growth roles -- plan gating broken otherwise
- [v1.4 roadmap] Cost controls bundled with Ad Script Generator -- validate budget guard with simplest role
- [v1.4 roadmap] SEO + Tender Hunter paired -- both wrap existing 700+ LOC implementations
- [v1.4 roadmap] Content Creator last -- new build, most novel growth role code
- [v1.4 roadmap] Builder Role deferred to v1.5 -- highest risk, lowest validated demand
- [20-01] Signed upload URL pattern: server validates + creates DB record, client PUTs directly to Supabase Storage
- [20-01] Storage quota via RPC: replaced broken .select('size:sum') with get_org_storage_bytes() function
- [20-02] XHR over fetch for uploads: XHR.upload.onprogress provides reliable progress tracking unavailable in fetch API
- [20-02] Custom event bridge (CHAT_ATTACHMENTS_EVENT): decoupled attachment ID delivery between VoicePill and ChatInterface
- [20-02] Engine-level multimodal injection: contentBlocks in EngineConfig replaces last user message with ContentBlockParam[]
- [20-02] Graceful attachment failure: individual block failures logged and skipped, message still sends

### Pending Todos

- [ ] Complete WhatsApp production setup (requires Andy's Meta Business access)
- [ ] Run `npx supabase db lint` when Docker available

### Blockers/Concerns

- WhatsApp production setup requires Andy's Meta Business access (affects Phase 15, not v1.4)
- Local Docker unavailable for supabase lint
- Fragmented Stripe webhook handling (two routes) must be consolidated in Phase 21 before growth roles ship
- Growth role token costs can spiral 10-50x vs classification tasks -- Phase 22 cost controls are critical path

## Session Continuity

Last session: 2026-03-18
Stopped at: Completed 20-02-PLAN.md (Upload Hook & Multimodal Chat Wiring) -- ready for 20-03
Resume file: None
