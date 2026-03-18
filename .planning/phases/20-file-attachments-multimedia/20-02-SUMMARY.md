---
phase: 20-file-attachments-multimedia
plan: 02
subsystem: ui, api, conversation
tags: [file-upload, drag-and-drop, multimodal, anthropic-vision, content-blocks, xhr-progress]

# Dependency graph
requires:
  - "20-01: attachments table, storage bucket, signed URL API routes, validateFile()"
provides:
  - "useFileUpload hook with XHR progress tracking and signed URL upload flow"
  - "Paperclip button wired to file picker with MIME type filtering"
  - "Drag-and-drop file upload on chat container with visual drop zone"
  - "CHAT_ATTACHMENTS_EVENT custom event for cross-component attachment ID delivery"
  - "buildAttachmentContentBlocks() — converts attachment records to Anthropic ContentBlockParam[]"
  - "Chat route accepts attachmentIds, loads records, builds multimodal content"
  - "Pipeline and engine support multimodal user messages (text + image + document blocks)"
  - "InboundMessage.attachmentIds field for attachment tracking through pipeline"
affects: [20-03, engine-context-assembly]

# Tech tracking
tech-stack:
  added: []
  patterns: ["XHR upload with onprogress for real-time progress tracking", "Custom event bridge for cross-component attachment state delivery", "Multimodal user message content (string | ContentBlockParam[]) through engine"]

key-files:
  created:
    - personal-assistant/src/hooks/use-file-upload.ts
    - personal-assistant/src/lib/attachments/content-blocks.ts
  modified:
    - personal-assistant/src/components/dashboard/voice-pill.tsx
    - personal-assistant/src/components/chat/chat-interface.tsx
    - personal-assistant/src/app/api/agent/chat/route.ts
    - personal-assistant/src/lib/conversation/types.ts
    - personal-assistant/src/lib/conversation/unified-pipeline.ts
    - personal-assistant/src/lib/agent/engine.ts

key-decisions:
  - "XHR over fetch for upload: XHR.upload.onprogress provides reliable upload progress tracking unavailable in fetch API"
  - "Custom event bridge (CHAT_ATTACHMENTS_EVENT): VoicePill dispatches attachment IDs via window event before CHAT_SEND_EVENT, avoiding prop drilling through overlay/dock hierarchy"
  - "Engine-level multimodal injection: last user message in history replaced with ContentBlockParam[] when attachments present, preserving ContextAssembler compatibility"
  - "Graceful attachment failure: individual attachment block failures are logged and skipped rather than failing the entire message"

patterns-established:
  - "CHAT_ATTACHMENTS_EVENT pattern: attachment IDs dispatched before text submission for decoupled file-upload-to-send coordination"
  - "Content block builder pattern: per-MIME-type block construction with signed URL generation and text extraction fallback"
  - "Engine multimodal override: contentBlocks in EngineConfig triggers ContentBlockParam[] user message instead of plain string"

requirements-completed: [MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, MEDIA-09]

# Metrics
duration: 17min
completed: 2026-03-18
---

# Phase 20 Plan 02: Upload Hook & Multimodal Chat Wiring Summary

**useFileUpload hook with XHR progress, Paperclip/drag-and-drop upload UI, and multimodal content block construction for images/PDFs/documents through the Anthropic engine**

## Performance

- **Duration:** 17 min
- **Started:** 2026-03-18T16:26:19Z
- **Completed:** 2026-03-18T16:43:19Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created useFileUpload React hook managing the full upload lifecycle: validation, signed URL request, XHR upload with progress, confirmation, and cleanup
- Wired Paperclip button in VoicePill to hidden file input with MIME type filtering and upload progress indicators
- Added drag-and-drop file upload on chat container with visual drop zone overlay
- Built buildAttachmentContentBlocks() that converts DB attachment records to Anthropic API content blocks (URL images, URL documents, extracted text)
- Extended chat route to accept attachmentIds, load org-scoped attachment records, and pass multimodal content through the pipeline to the engine
- Updated engine to construct ContentBlockParam[] user messages when attachments are present, replacing the last history message with multimodal content

## Task Commits

Each task was committed atomically:

1. **Task 1: Upload hook and Paperclip/drag-and-drop wiring** - `7c8901ae` (feat)
2. **Task 2: Chat route multimodal wiring and pipeline content blocks** - `8179cf95` (feat)

## Files Created/Modified
- `personal-assistant/src/hooks/use-file-upload.ts` - React hook: file validation, signed URL upload via XHR, progress tracking, cleanup
- `personal-assistant/src/lib/attachments/content-blocks.ts` - Builds Anthropic ContentBlockParam[] from attachment records (image/document/text)
- `personal-assistant/src/components/dashboard/voice-pill.tsx` - Paperclip button wired to file picker, upload progress indicators, attachment event dispatch
- `personal-assistant/src/components/chat/chat-interface.tsx` - Drag-and-drop handlers, attachment ID capture from custom events, attachmentIds in fetch body
- `personal-assistant/src/app/api/agent/chat/route.ts` - Accepts attachmentIds, loads attachment records, builds multimodal content blocks
- `personal-assistant/src/lib/conversation/types.ts` - Added attachmentIds to InboundMessage interface
- `personal-assistant/src/lib/conversation/unified-pipeline.ts` - Added contentBlocks to PipelineConfig, passes to engine
- `personal-assistant/src/lib/agent/engine.ts` - Added contentBlocks to EngineConfig, builds multimodal user messages

## Decisions Made
- Used XHR instead of fetch for file uploads — XHR.upload.onprogress provides reliable progress tracking unavailable in the fetch API
- Used custom window event (CHAT_ATTACHMENTS_EVENT) for VoicePill-to-ChatInterface attachment ID delivery — avoids prop drilling through the BitBitOverlay/dock component hierarchy which uses the existing CHAT_SEND_EVENT pattern
- Multimodal content injection at engine level — replaces the last user message in history (added by ContextAssembler as plain text) with ContentBlockParam[] when attachments are present, keeping the assembler simple while supporting multimodal
- Individual attachment failure is non-fatal — each attachment block is built independently, failures are logged and skipped so the message still sends with whatever succeeds

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Anthropic SDK `ContentBlockParam` type not accessible via `import('@anthropic-ai/sdk').ContentBlockParam` inline syntax — required proper `import type Anthropic from '@anthropic-ai/sdk'` for namespace access
- Pre-existing TypeScript error in `tools.ts:765` (out of scope, noted in 20-01-SUMMARY)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Upload-to-analysis pipeline complete: file selection -> upload -> content blocks -> engine
- Plan 20-03 (inline previews and attachment display in chat UI) can begin immediately
- The ChannelMetadata.attachments field is already populated for message display purposes

## Self-Check: PASSED

All 8 files verified present on disk. Both task commits (7c8901ae, 8179cf95) verified in git history.

---
*Phase: 20-file-attachments-multimedia*
*Completed: 2026-03-18*
