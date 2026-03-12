# Session Handoff: Context Baseplate Pipeline — 2026-03-13

## Session Summary

Wired the pre-computed baseplate context into the agent conversation flow. Previously, `buildEntityAwarePrompt` in `prompt-builder.ts` assembled entity context by running 5 cascading DB queries per word in the user's message (via `assembleContext` + `assembleEntityBriefing`), hitting raw tables at query time. This session replaced that with a two-stage approach: (1) pure string matching against known contacts via `entity-mention-scanner.ts` (no DB calls, no LLM calls), then (2) loading pre-computed `entity_profiles` snapshots for matched contacts. The result: the agent now receives a `## Entity Context` section in its system prompt with pre-compiled relationship, memory, and event data for any contact mentioned by name, email, phone, or alias.

Separately, closed the contact bootstrap gap. The synthesizer's `reflectInboundMessage` function previously silently dropped messages from unknown senders (no contact in DB = no timeline write). Added `autoCreateContact` to automatically create contacts from inbound messages, with a conservative no-reply filter (15 regex patterns) to avoid creating contacts for `noreply@`, `mailer-daemon@`, `notifications@`, etc. New senders now get a contact record with `source: 'auto_ingest'` and `first_seen_channel` metadata, then proceed through the normal timeline-write flow.

## Changes Made (with file paths and what each does)

- `personal-assistant/src/lib/context/entity-mention-scanner.ts` — **NEW**. Pure function `scanForEntityMentions()` that string-matches a user message against known contacts (name, email, phone, alias). Returns `MentionMatch[]` ordered by match quality, capped at 5 results. Min 3-char threshold on names/aliases to avoid false positives.
- `personal-assistant/src/lib/context/entity-mention-scanner.test.ts` — **NEW**. 14 unit tests covering name/email/alias/phone matching, case insensitivity, short-name filtering, deduplication, limit parameter, match priority ordering, multi-word aliases.
- `personal-assistant/src/lib/agent/prompt-builder.ts` — **MODIFIED**. Replaced `assembleContext`/`assembleEntityBriefing` calls in `buildEntityAwarePrompt()` with scanner + snapshot approach. Added `loadContactsForScanning()` (1 DB query for all contacts), `formatSnapshotContext()` (formats snapshot into ~500-token natural-language line per entity). Preserved `buildSystemPrompt()` unchanged.
- `personal-assistant/src/lib/context/index.ts` — **MODIFIED**. Added barrel exports for `scanForEntityMentions`, `ScanContact`, `MentionMatch`, `getBaseplateSnapshot`, `BaseplateSnapshot`.
- `personal-assistant/src/lib/channels/synthesizer.ts` — **MODIFIED**. Added `NOREPLY_PATTERNS` (15 regexes), `isNoReplyAddress()`, `extractNameFromSender()`, `autoCreateContact()`. Modified `reflectInboundMessage()` to auto-create contacts for unknown non-automated senders before writing timeline events.
- `personal-assistant/src/lib/channels/auto-contact.test.ts` — **NEW**. 25 unit tests covering `isNoReplyAddress` (14 tests: noreply, no-reply, notifications, mailer-daemon, bounce, donotreply, autonotify, alerts, SES feedback, newsletter, marketing, postmaster, daemon, real addresses) and `extractNameFromSender` (11 tests: angle-bracket format, plain names, email-to-name conversion, underscore/hyphen handling, whitespace trimming, phone senders).
- `personal-assistant/supabase/migrations/066_channel_messages_classification.sql` — **EXISTING**. Adds `classification TEXT` column to `channel_messages` (relay-daemon writes pending/unclassified; without it, every insert triggers 3 retries with exponential backoff).

## Architecture State

### How the pipeline works NOW

**Inbound flow** (message arrives from Gmail/WhatsApp/SMS/etc):
1. Channel adapter pulls messages → `synthesize()` in `synthesizer.ts`
2. Keyword pre-filter + LLM classification (if Anthropic key present) → task creation for actionable messages
3. `writeMessageEvent()` writes to `entity_timeline` (channel-level event)
4. `reflectInboundMessage()` fires (fire-and-forget):
   - Resolves sender via `resolveEntity()` (5-step cascading: alias → email → phone → name → phone_variant)
   - **NEW**: If no match and sender is not a no-reply address → `autoCreateContact()` creates contact → re-resolves
   - Writes `message_received` event on the **contact's** timeline
   - Invalidates cross-reference cache for that contact

**Profile refresh** (Vercel cron, `/api/cron/entity-profile-refresh`):
1. Queries `entity_profiles` where `valid_until < now()` (batch of 50)
2. For each stale profile: `computeEntityProfile()` in `entity-profile-builder.ts`
   - Staleness check: compares `event_count_at_compute` vs current `entity_timeline` count — skips if no new events
   - Fetches last 50 timeline events, all relationships, all active semantic memories
   - Upserts compiled `profile_data` JSON into `entity_profiles` (6-hour TTL)
3. Runs 4 pattern extractors alongside each profile refresh:
   - `extractPaymentPattern` — avg days between invoice_created → invoice_paid
   - `extractResponseLatency` — avg hours between message_sent → message_received
   - `extractActivityFrequency` — events/week, most active day/hour, 30d trend
   - `extractChannelPreference` — primary/secondary channel, per-channel response rates

**Context assembly** (on every chat message, `buildEntityAwarePrompt` in `prompt-builder.ts`):
1. `buildSystemPrompt()` assembles base prompt: persona, goals, tasks, contacts, recent activity, channels, schedule, reminders, policies, voice profile
2. `loadContactsForScanning()` — 1 query: `SELECT id, name, emails, phones, aliases FROM contacts WHERE org_id = $1`
3. `scanForEntityMentions()` — pure string match of user message against contact list (name ≥ 3 chars, aliases ≥ 3 chars, emails, phones ≥ 6 chars). Max 5 matches.
4. `getBaseplateSnapshot()` — 1 query per matched contact: reads `entity_profiles.profile_data`
5. `formatSnapshotContext()` — formats each snapshot into a natural-language line: event count, channels, last contact date, thread subjects, high-confidence memories (≥0.6), relationship types. Hard limit 2000 chars per entity, 10000 chars total.
6. Appends `## Entity Context` section to system prompt

**Outbound write-back** (`reflectAction` in `action-reflector.ts`, called from `engine.ts` line 447):
1. After any successful tool execution (send_email, send_sms, send_whatsapp, create_task), engine fires `reflectAction()`
2. Resolves recipient → contact via `resolveEntity()`
3. Writes `message_sent` or `task_created` event on the contact's timeline
4. Invalidates cross-reference cache
5. Next profile refresh picks up the new events → recomputed profile → next chat message sees updated context

**Two-pass planning** (engine.ts lines 160-207):
1. `entityCtxMatch` regex extracts `## Entity Context` content from system prompt
2. Haiku planner receives entity context + user message → selects tool groups
3. Sonnet receives filtered tools (5-12 from ~24 total) → executes with entity-aware system prompt

```mermaid
flowchart TD
    subgraph Inbound["Inbound Message Flow"]
        A[Channel Adapter\ngmail/whatsapp/sms] -->|pull| B[synthesize\nsynthesizer.ts]
        B --> C[writeMessageEvent\ntimeline-writer.ts]
        B --> D[reflectInboundMessage\nsynthesizer.ts]
        D --> E{resolveEntity?}
        E -->|found| F[writeTimelineEvent\ncontact timeline]
        E -->|not found| G{isNoReplyAddress?}
        G -->|yes| H[skip]
        G -->|no| I[autoCreateContact\nsynthesizer.ts]
        I --> E
        F --> J[invalidateCrossRefs\nxref-cache.ts]
    end

    subgraph Refresh["Profile Refresh Cron"]
        K[/api/cron/entity-profile-refresh] --> L{valid_until < now?}
        L -->|stale| M[computeEntityProfile\nentity-profile-builder.ts]
        M --> N[entity_timeline\n+ entity_relationships\n+ semantic_memories]
        N --> O[UPSERT entity_profiles\nprofile_data JSON]
        M --> P[4x Pattern Extractors\npayment, latency,\nfrequency, channel]
        P --> Q[UPSERT entity_patterns]
    end

    subgraph Chat["Chat Context Assembly"]
        R[User message] --> S[buildEntityAwarePrompt\nprompt-builder.ts]
        S --> T[buildSystemPrompt\nbase context]
        S --> U[loadContactsForScanning\n1 DB query]
        U --> V[scanForEntityMentions\npure string match]
        V --> W[getBaseplateSnapshot\n1 query per match]
        W --> X[formatSnapshotContext\n~500 tokens/entity]
        X --> Y["## Entity Context\nappended to system prompt"]
    end

    subgraph Engine["Agent Engine"]
        Y --> Z[engine.ts\nrunAgentChat]
        Z --> AA[Haiku planner\ntool group selection]
        Z --> AB[Sonnet API\nwith filtered tools]
        AB -->|tool_use| AC[executeAgentTool]
        AC -->|success| AD[reflectAction\naction-reflector.ts]
        AD --> AE[writeTimelineEvent\noutbound event]
        AE --> AF[invalidateCrossRefs]
    end

    J -.->|next refresh| K
    AF -.->|next refresh| K
    O -.->|next chat| W
```

## Verified Working

- **Entity mention scanner**: 14 unit tests passing. Covers name, email, alias, phone matching; case insensitivity; short-name filtering (names < 3 chars like "Jo" are skipped); deduplication; limit parameter; match priority ordering (name > alias > email > phone); multi-word aliases.
- **Auto-contact creation**: 25 unit tests passing. Covers 15 no-reply patterns, name extraction from `"Name <email>"` format, email-to-name conversion, phone-based sender detection.
- **Entity profile builder**: 5 unit tests passing. Covers profile computation from timeline + relationships + memories, empty data handling, staleness skip, stale recomputation, upsert failure tolerance.
- **Pattern extractors**: 10 unit tests passing. Covers payment timing (avg days), activity frequency (events/week, trend detection: increasing/decreasing/stable), channel preference (primary/secondary, response rates), edge cases (insufficient data returns null).
- **TypeScript**: Clean compile, zero type errors.
- **Existing test suite**: All channel tests pass (362/363 — the 1 failure is the pre-existing `sms.test.ts` signature verification test, unrelated to this work).
- **Context injection regex**: Engine.ts line 161 regex `/## Entity Context\n\n([\s\S]*?)(?:\n## |$)/` correctly captures the new format's preamble line and entity summaries, verified by inspection.

**Not verified with real data this session**: The full end-to-end chain (send a chat message mentioning "Steve West" → confirm baseplate snapshot appears in system prompt → confirm agent response references entity context). This requires a running Supabase connection and was deferred.

## Known Issues

1. **org_integrations table missing** — Credential storage falls back to `channel_connections.config` JSONB field. No dedicated credential table exists. This works but is fragile (config conflates connection state with secrets).
2. **No-reply contacts already in DB** — Before the auto-create filter was added, 22 contacts were seeded via a Gmail import script. Some of these are newsletter/notification senders (e.g., noreply@legalsign.com.au). These should be cleaned up: either deleted or flagged as `type: 'automated'`.
3. **entity_profile_builder relationship and memory queries return empty** — The queries for `entity_relationships` and `semantic_memories` work correctly (tested with mocks) but return empty arrays in production because no relationship or memory data has been seeded yet. Entity profiles compute correctly but contain `relationships: []` and `memories: []`.
4. **Outlook adapter not connected** — `tor@allwebbedup.com.au` is where real client correspondence lives (Andy Taleb, Steve West, etc.). Microsoft Azure AD app registration is deferred (no account set up). Gmail adapter is connected but Tor's primary business email is Outlook.
5. **Cron auth returns 401 on direct curl** — Vercel internal scheduler invokes cron routes successfully, but `curl` from outside returns 401. The `withCronGuard` middleware checks for Vercel's `CRON_SECRET` header. Manual triggering requires passing the correct header.
6. **migration 066 not yet applied to remote** — `066_channel_messages_classification.sql` adds `classification TEXT` to `channel_messages`. It exists locally but is listed as untracked in git status. Needs to be committed and pushed, then applied via `supabase db push`.
7. **assembleContext still exported** — The old `assembleContext()` and `assembleEntityBriefing()` functions in `assembler.ts` are still exported and used by 6 other files (voice route, text route, classifier, command parser, etc.). They were not removed — only the prompt-builder's usage was replaced.

## Next Priorities (ordered)

1. **org_integrations migration** — Create a dedicated table for OAuth tokens and API keys, separate from `channel_connections.config`. Credential rotation and multi-provider support depend on this.
2. **Outlook adapter for tor@allwebbedup.com.au** — Real client data lives here. Requires Azure AD app registration (Microsoft Graph API). Gmail has data but it's secondary for business correspondence.
3. **Test outbound action-reflector loop** — Send an email via the agent (`send_email` tool) → verify `reflectAction` writes `message_sent` to the contact's timeline → verify next profile refresh picks up the event → verify next chat message includes updated entity context. This is the write-back half of the bidirectional loop.
4. **BitBit personality/voice in system prompt** — `conductor/product-guidelines.md` defines brand voice but it's not currently injected into the agent's system prompt via `loadVoiceProfile()`. The voice loader exists but may return empty if no voice profile is stored in Supabase for the org.
5. **Contact cleanup** — Remove or reclassify auto-created no-reply contacts. Options: (a) delete contacts where `profile_data.source = 'auto_ingest'` and email matches `NOREPLY_PATTERNS`, (b) set `type: 'automated'` and filter them from the contact list in `loadContactsForScanning()`.
6. **Apply migration 066 to remote** — Commit `066_channel_messages_classification.sql` and `supabase db push`.
7. **End-to-end verification** — Send a real chat message mentioning "Steve West" through the running app, confirm the `## Entity Context` section appears in logs with his baseplate data, confirm the agent's response demonstrates awareness of his email history.

## Tracks to Update

### T009 — Context Baseplate
**Status**: Update from "Phase 2 complete" to "Phase 3 in progress (~80% against spec)"

Current notes say: "Foundation tables, xref-cache, mention-extractor, entity profiles, baseplate snapshot, refresh cron, entity patterns. All migrations applied (053-061)"

**Updated notes**: Foundation tables, xref-cache, mention-extractor, entity profiles, baseplate snapshot, refresh cron, entity patterns (4 extractors), entity-mention-scanner, baseplate-to-prompt wiring (buildEntityAwarePrompt), auto-contact creation from inbound messages. All migrations applied (053-061, 066 pending). Bidirectional context loop wired: inbound messages write timeline events → profile refresh computes snapshots → chat assembly injects entity context → outbound actions write back via action-reflector. Remaining: end-to-end verification with real data, outbound write-back testing, relationship/memory data seeding.

**New bugs/notes to add**:
- BUG: No-reply contacts exist in DB from pre-filter Gmail import (need cleanup or reclassification)
- BUG: entity_profiles.relationships and memories arrays empty (no seed data)
- NOTE: migration 066 (channel_messages classification column) not yet committed or pushed to remote

### T011 — Production Validation & Deployment
**No status change needed**, but add note: Cron routes work via Vercel scheduler but return 401 on direct curl (CRON_SECRET header required).

## Working Dynamic

This project uses a two-layer development approach:
- **Claude (chat interface)** acts as strategic planner, architect, and QA reviewer. It produces scoped task prompts with clear acceptance criteria, reviews architecture decisions, and maintains conductor artifacts.
- **Claude Code (Opus 4.6 in terminal)** executes the implementation. It reads specified files, writes code, runs tests, and reports back findings and results. It follows the task constraints literally and does not freelance beyond scope.
- **Parallel execution** across Ghostty panes when tasks don't share files (e.g., entity-mention-scanner.ts and auto-contact creation in synthesizer.ts were developed in sequence this session because synthesizer.ts depends on understanding the scanner pattern, but could have been parallelized if the interfaces were pre-defined).
- **Sequential execution** when tasks touch shared files (e.g., prompt-builder.ts depends on entity-mention-scanner.ts, so scanner was written first).
- The chat-layer Claude needs the conductor artifacts and this handoff to maintain continuity across sessions. Without this document, the next session would need to re-read all files to understand the pipeline state.
