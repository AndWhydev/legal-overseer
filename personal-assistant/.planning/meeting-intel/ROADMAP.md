# Meeting Intelligence — Roadmap

## Phase 26: Meeting Database & Core Pipeline
**Requirements**: MTG-01, MTG-02, MTG-03
**Goal**: Meetings can be uploaded, stored, transcribed, and segments persisted with speaker labels.
**Plans**:
- 26-01: Database schema (meetings, participants, transcript_segments, action_items, summaries)
- 26-02: Upload API + Supabase Storage integration
- 26-03: Transcription pipeline (Whisper integration, chunking, segment storage)

## Phase 27: Intelligence Extraction
**Requirements**: MTG-04, MTG-05, MTG-06, MTG-09
**Goal**: AI extracts action items, generates summaries, drafts follow-up emails, and tracks sentiment.
**Plans**:
- 27-01: Action item extraction (Haiku classify + Sonnet extract)
- 27-02: Meeting summary generation + sentiment analysis
- 27-03: Follow-up email drafting + approval queue integration

## Phase 28: Search & Associations
**Requirements**: MTG-07, MTG-08
**Goal**: Meetings are linked to contacts/projects, searchable across all transcripts.
**Plans**:
- 28-01: Entity association + timeline enrichment
- 28-02: Full-text search (tsvector) + semantic search

## Phase 29: Dashboard UI
**Requirements**: MTG-10
**Goal**: Glassmorphic meeting dashboard with list, detail, transcript viewer, and action items.
**Plans**:
- 29-01: Meeting list + filters
- 29-02: Meeting detail view with transcript player and action items

## Phase 30: Webhook Integrations
**Requirements**: MTG-11
**Goal**: Auto-ingest recordings from Zoom and Google Meet webhooks.
**Plans**:
- 30-01: Zoom + Google Meet webhook handlers
