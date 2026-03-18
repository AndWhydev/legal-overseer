# Meeting Intelligence — Requirements

## MTG-01: Recording Ingestion
Accept uploaded audio/video recordings (MP3, WAV, M4A, MP4, WebM) via API. Store in Supabase Storage with org-scoped paths. Support files up to 500MB. Validate format and size before accepting.

## MTG-02: Transcription Pipeline
Transcribe recordings using OpenAI Whisper API (reuse existing `voice-transcription.ts`). For large files (>25MB Whisper limit), chunk audio into segments. Store transcript segments with timestamps. Support language hints. Heavy processing routed to Fly.io workers (not Vercel — 30s timeout).

## MTG-03: Speaker Diarization
Simple speaker labeling using Whisper word-level timestamps + heuristic pause detection. Store speaker labels per segment. Allow manual speaker name assignment post-transcription.

## MTG-04: Action Item Extraction
AI extracts commitments from transcript: "I'll send that by Friday" → action item with assignee, deadline, description. Two-pass: Haiku classifies segments as actionable, Sonnet extracts structured action items. Auto-creates kanban tasks via existing task API.

## MTG-05: Meeting Summary
AI-generated summary with: key decisions, discussion points, action items, follow-ups. Generated after transcription completes. Stored as meeting metadata.

## MTG-06: Follow-up Email Drafting
Auto-generate post-meeting summary email with action items and owners. Route through existing approval queue before sending. Use existing Resend integration for delivery.

## MTG-07: Client Association
Link meetings to contacts and projects via entity resolution. Enrich contact timelines with meeting events. Speaker names resolved to existing contacts where possible.

## MTG-08: Meeting Search
Full-text search across all transcripts via tsvector. Natural language queries return relevant transcript segments with context. Filter by date, participant, project.

## MTG-09: Sentiment Analysis
Track participant sentiment per meeting segment. Aggregate to meeting-level sentiment score. Surface sentiment trends across meetings with same contact.

## MTG-10: Meeting Dashboard UI
Glassmorphic meeting list with filters (date, contact, project). Meeting detail view with transcript player, action items, and summary. Inline transcript search. Meeting stats overview.

## MTG-11: Webhook Ingestion
Accept Zoom and Google Meet recording webhooks. Auto-process recordings when meetings end. Store meeting metadata from webhook payload (participants, duration, title).
