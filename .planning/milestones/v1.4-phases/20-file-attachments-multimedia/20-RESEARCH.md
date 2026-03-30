# Phase 20: File Attachments & Multimedia - Research

**Researched:** 2026-03-18
**Domain:** File upload, Supabase Storage, multimodal AI content blocks, inline media rendering
**Confidence:** HIGH

## Summary

Phase 20 adds user-initiated file uploads to the BitBit chat interface, with inline previews for images and PDFs, and intelligent analysis via Claude's multimodal capabilities. The codebase already has ~60% of the plumbing: `ChannelMetadata.attachments` type, `attachment-processor.ts` for PDF/DOCX/TXT/CSV text extraction, `gmail-attachments.ts` for the download+process pattern, and a dead Paperclip button in `voice-pill.tsx`. The missing pieces are: Supabase Storage bucket + signed upload URLs, an `attachments` database table with RLS, the upload API route, chat route modification to accept attachment IDs and build multimodal content blocks, frontend upload hook with progress tracking, and inline preview components.

The critical architectural constraint is Vercel's 4.5MB body limit for serverless functions. File bytes must NEVER flow through the API route. Instead, the client requests a signed upload URL from the server, uploads directly to Supabase Storage, then notifies the server. The Anthropic API supports three content block approaches for files: `type: "image"` with `source.type: "url"` for images (Claude fetches the signed URL directly), `type: "document"` with `source.type: "base64"` or `source.type: "url"` for PDFs (Claude processes pages as images + text), and `type: "text"` for extracted text from DOCX/CSV/TXT files.

**Primary recommendation:** Implement the signed-URL upload pattern from day one, create an `attachments` table with org-scoped RLS, and pass uploaded content to Claude as multimodal content blocks -- images via URL, PDFs via URL or base64 (under 10MB), documents via text extraction.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEDIA-01 | User can upload files via Paperclip button (images, PDFs, DOCX, CSV, TXT) | Paperclip button exists in `voice-pill.tsx` (line 255), needs `onClick` wiring to hidden `<input type="file">` with accept filter |
| MEDIA-02 | User can drag-and-drop files onto chat area | Standard `onDragOver`/`onDrop` handlers on chat container, reuse same upload hook |
| MEDIA-03 | Upload uses Supabase Storage signed URLs (bypasses Vercel 4.5MB limit) | `createSignedUploadUrl` returns a token-secured URL valid for 2 hours; client uploads directly to storage |
| MEDIA-04 | Upload progress indicator during file transfer | XHR `upload.onprogress` or `fetch` with `ReadableStream` tracking against signed URL upload |
| MEDIA-05 | Uploaded images render inline as previews | `type: "image"` content block with URL source; frontend shows `<img>` from signed download URL |
| MEDIA-06 | PDFs render with first-page thumbnail and download link | Generate thumbnail via canvas/pdf.js on client, or show PDF icon + filename; `type: "document"` block for Claude |
| MEDIA-07 | File size limit (10MB per file) with clear error | Client-side `File.size` check + server-side validation in upload route |
| MEDIA-08 | Accepted file types filtered (block executables) | Client `accept` attribute + server MIME type allowlist |
| MEDIA-09 | BitBit can read/analyse files (images via Vision, docs via text extraction) | Images: URL content block. PDFs: document content block. DOCX/CSV/TXT: existing `processAttachment()` extracts text |
| MEDIA-10 | Attachments table with org-scoped storage paths and RLS | New migration with RLS policies matching existing `get_user_org_id()` pattern |
| MEDIA-11 | Storage paths scoped to org/thread (`{org_id}/{thread_id}/{filename}`) | Supabase Storage folder structure enforced in signed URL path generation |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | Already installed | Storage signed URLs, DB operations | Already the project's data layer; Storage API is part of the same SDK |
| `@anthropic-ai/sdk` | Already installed | Multimodal content blocks (image, document, text) | Already the project's AI engine SDK |
| `pdf-parse` | Already installed | Server-side PDF text extraction | Already used in `attachment-processor.ts` |
| `mammoth` | Already installed | Server-side DOCX text extraction | Already used in `attachment-processor.ts` |
| `lucide-react` | Already installed | Paperclip, FileText, Image, Download icons | Already the project's icon library |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pdfjs-dist` | 4.x | Client-side PDF first-page thumbnail generation | Only if we want canvas-rendered PDF thumbnails instead of a file icon |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Supabase Storage signed URLs | Direct server upload + S3 | Adds complexity, requires separate S3 config; Supabase Storage is simpler and already provisioned |
| `pdfjs-dist` for thumbnails | Static PDF icon + filename | Icon approach is simpler, faster to build, and avoids a 2MB+ client dependency; defer thumbnails to a later iteration |
| Anthropic Files API (`file_id`) | Base64/URL content blocks | Files API is still in beta (`files-api-2025-04-14` header required); URL and base64 are GA and sufficient for our use case |

**Installation:**
No new packages required. All dependencies are already installed.

## Architecture Patterns

### Recommended Upload Flow
```
[Frontend: Paperclip/DnD]
    |
    | File selected, client-side validation (size, type)
    v
[API: POST /api/attachments/upload]
    |
    | 1. Auth check (Supabase session)
    | 2. Validate file metadata (size, mime type)
    | 3. Generate storage path: {org_id}/{thread_id}/{uuid}/{filename}
    | 4. Create signed upload URL via supabase.storage.createSignedUploadUrl()
    | 5. Insert `attachments` row (status: 'uploading')
    | 6. Return { signedUrl, token, attachmentId }
    v
[Frontend: Direct PUT to Supabase Storage via signed URL]
    |
    | XHR with progress tracking
    v
[Frontend: PATCH /api/attachments/:id/confirm]
    |
    | Mark status: 'ready'
    v
[Frontend: Submit message with attachmentIds[]]
    |
    v
[Chat Route: POST /api/agent/chat]
    |
    | Load attachment records from DB
    | Build multimodal Anthropic content blocks
    | Pass to pipeline
    v
[UnifiedConversationPipeline -> AgentEngine]
    |
    | Claude processes image/document/text blocks natively
    v
[Post-process (fire-and-forget)]
    |
    | Extract text for RAG embedding (reuse attachment-processor.ts)
    | Update storage usage metric
```

### Recommended Project Structure
```
src/
├── app/api/attachments/
│   ├── upload/route.ts           # POST: create signed URL + DB record
│   └── [id]/
│       ├── route.ts              # PATCH: confirm upload, GET: signed download URL
│       └── confirm/route.ts      # POST: mark upload complete (alternative)
├── lib/attachments/
│   ├── attachment-service.ts     # Upload orchestration, validation, storage quota
│   ├── content-blocks.ts         # Build Anthropic content blocks from attachments
│   └── constants.ts              # MIME allowlist, size limits, accepted extensions
├── hooks/
│   └── use-file-upload.ts        # Frontend: upload state, progress, preview gen
├── components/chat/
│   └── chat-attachment.tsx        # Inline preview (image thumb, PDF icon, file card)
└── supabase/migrations/
    └── 092_attachments.sql        # Table + RLS + storage bucket config
```

### Pattern 1: Signed Upload URL (NEW -- critical path)
**What:** Server generates a time-limited upload URL; client uploads directly to Supabase Storage, bypassing the API route entirely.
**When to use:** Every user-initiated file upload.
**Example:**
```typescript
// Server: /api/attachments/upload/route.ts
// Source: Supabase Storage docs
const storagePath = `${orgId}/${threadId}/${crypto.randomUUID()}/${filename}`
const { data, error } = await supabase.storage
  .from('chat-attachments')
  .createSignedUploadUrl(storagePath)

// Returns: { signedUrl: string, token: string, path: string }
// Client uploads via: PUT signedUrl with file body + token query param
```

### Pattern 2: Multimodal Content Blocks (Anthropic API)
**What:** Build `Anthropic.ContentBlockParam[]` from uploaded attachments before passing to the engine.
**When to use:** When the chat route receives a message with attachment IDs.
**Example:**
```typescript
// Source: Anthropic Vision docs + PDF support docs (verified 2026-03-18)

// Images: use URL source (Claude fetches the signed URL)
{
  type: 'image',
  source: {
    type: 'url',
    url: signedDownloadUrl  // Supabase signed URL, 1hr expiry
  }
}

// PDFs: use URL source (GA, no beta header needed)
{
  type: 'document',
  source: {
    type: 'url',
    url: signedDownloadUrl
  }
}

// PDFs: alternative base64 source (for files under ~5MB to avoid URL fetch issues)
{
  type: 'document',
  source: {
    type: 'base64',
    media_type: 'application/pdf',
    data: base64PdfContent
  }
}

// Text files (DOCX, CSV, TXT): extract text, inject as text block
{
  type: 'text',
  text: `[Attached file: ${filename}]\n\n${extractedText}`
}
```

### Pattern 3: Fire-and-Forget Side Effects (EXISTING)
**What:** Non-critical operations (embedding, usage tracking) run as `.catch(() => {})` promises.
**When to use:** After the upload response is sent and after the chat response is streaming.
**Apply to:** Text extraction for RAG embedding, storage usage metering.

### Anti-Patterns to Avoid
- **Proxying file uploads through API routes:** Vercel 4.5MB body limit will silently reject large files. ALWAYS use signed upload URLs.
- **Base64-encoding large images for Anthropic API:** Use `source.type: 'url'` with signed URLs instead. Reduces request payload size by 33%.
- **Using the Anthropic Files API in production:** Still in beta (`files-api-2025-04-14` header). URL and base64 source types are GA and sufficient.
- **Storing extracted text in the message content column:** Keep it in the `attachments.extracted_text` column. The message content should reference the attachment, not embed the full text.
- **Creating the storage bucket as public:** Use a PRIVATE bucket. All access via signed download URLs with configurable expiry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File upload to cloud storage | Custom S3 upload handler | `supabase.storage.createSignedUploadUrl()` | Handles auth, CORS, multipart, CDN -- all built-in |
| PDF text extraction | Custom PDF parser | `pdf-parse` (already in `attachment-processor.ts`) | Battle-tested, handles edge cases (encrypted pages, OCR layers) |
| DOCX text extraction | Custom XML parser | `mammoth` (already in `attachment-processor.ts`) | Handles complex DOCX structures (tables, footnotes, styles) |
| Image analysis by AI | Custom OCR pipeline | Anthropic `type: "image"` content block with URL source | Claude Vision is built-in, no extra service needed |
| PDF analysis by AI | Extract text then send to LLM | Anthropic `type: "document"` content block | Claude processes PDF pages natively (text + visual layout); better than text-only extraction |
| Upload progress tracking | Custom WebSocket progress | XHR `upload.onprogress` event on signed URL PUT | Standard browser API, works with any HTTP upload target |
| File type validation | Custom MIME sniffing | `File.type` (client) + MIME allowlist (server) | Browser provides MIME type; server validates against allowlist |

**Key insight:** The Anthropic API now handles PDFs natively as `document` content blocks, processing both text and visual elements (charts, tables, diagrams). This is superior to the existing `attachment-processor.ts` text-only extraction for AI analysis. However, `attachment-processor.ts` remains valuable for RAG embedding (we want text, not visual analysis, for search indexing).

## Common Pitfalls

### Pitfall 1: Vercel 4.5MB Body Limit Kills File Uploads
**What goes wrong:** Files uploaded through Next.js API routes hit the body limit. A 10MB PDF gets a silent 413 error.
**Why it happens:** Natural instinct is `<input> -> FormData -> POST /api/upload`. This routes bytes through the serverless function.
**How to avoid:** Use Supabase Storage signed upload URLs from day one. The server only creates the URL and tracks the record; file bytes never touch the API route.
**Warning signs:** Upload works in local dev (no body limit) but fails on Vercel preview deployment.

### Pitfall 2: Storage RLS Policies Missing or Misconfigured
**What goes wrong:** Supabase Storage has SEPARATE RLS from the database. Creating a bucket without storage policies either blocks all uploads or makes files publicly accessible.
**Why it happens:** Developers assume database RLS covers storage. It does not. Storage has its own policy system on `storage.objects`.
**How to avoid:** Create storage policies in the migration. For signed upload URLs, the upload is performed with the token in the URL, not the user's auth context. The server (service role) creates the signed URL and tracks the record. RLS on the `attachments` DB table (not the storage bucket) provides org isolation.
**Warning signs:** Upload works with service role key but fails with anon key; or files are accessible without authentication.

### Pitfall 3: Attachments Table Does Not Exist
**What goes wrong:** `plan-gates.ts` already queries an `attachments` table (lines 189-199) for storage quota checking. The table does not exist in any migration. The `catch` block returns `true` (allow), meaning storage limits are never enforced.
**Why it happens:** The quota code was written anticipating this table but the migration was never created.
**How to avoid:** Create the `attachments` table in migration 092. Also fix `plan-gates.ts` -- the current query uses `.select('size:sum')` which is not valid Supabase syntax for aggregation. Replace with an RPC or manual sum query.
**Warning signs:** Storage quota always returns "allowed" even for free-tier users who should be limited.

### Pitfall 4: Image Token Costs Inflate Context Budget
**What goes wrong:** Images sent to Claude cost 54-1,590+ tokens each depending on resolution. Multiple images in a conversation quickly exhaust the context budget. The existing attachment processor skips images entirely (`if (mimeType.startsWith('image/')) return ''`).
**Why it happens:** Images are processed as visual tokens, not text tokens. A 1000x1000 image costs ~1,334 tokens.
**How to avoid:** (1) Limit images per message turn (max 5). (2) Use URL source type instead of base64 to reduce request payload. (3) Only include images from the current message, not all conversation history. (4) Track image token costs in usage metering.
**Warning signs:** API calls start failing with context length exceeded errors after a few image uploads.

### Pitfall 5: Chat Route Message Format Not Updated for Multimodal
**What goes wrong:** The chat route currently sends `{ role: 'user', content: message }` (a string). Multimodal requires `{ role: 'user', content: [{ type: 'text', text: message }, { type: 'image', ... }] }` (an array of content blocks).
**Why it happens:** The engine was built for text-only chat. The `content` field needs to accept both `string` and `ContentBlockParam[]`.
**How to avoid:** Modify the chat route to build content blocks when attachments are present. The engine already handles `Anthropic.MessageParam[]` with arbitrary content arrays (confirmed in engine.ts). The `messages` array supports both string and block array formats.
**Warning signs:** Claude responds "I don't see any image" even though a file was uploaded.

### Pitfall 6: Signed URL Expiry During Long Conversations
**What goes wrong:** Supabase signed download URLs default to a configurable expiry. If a user uploads an image, chats for 2 hours, then scrolls back, the inline preview is broken.
**Why it happens:** The signed URL embedded in the message metadata has expired.
**How to avoid:** (1) Store the `storage_path` in the attachments table, not the signed URL. (2) Generate signed download URLs on-demand when rendering messages. (3) Set a reasonable expiry (e.g., 1 hour) and refresh when loading conversation history.
**Warning signs:** Old message images show as broken after a few hours.

## Code Examples

### Example 1: Upload API Route
```typescript
// Source: Supabase Storage docs + project patterns
// /api/attachments/upload/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/csv',
])

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('org_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 400 })

  const { filename, mimeType, size, threadId } = await request.json()

  // Validate
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ error: `File type ${mimeType} not allowed` }, { status: 400 })
  }
  if (size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 400 })
  }

  // Generate storage path
  const fileId = crypto.randomUUID()
  const storagePath = `${profile.org_id}/${threadId || 'unthreaded'}/${fileId}/${filename}`

  // Create signed upload URL (2-hour expiry, not configurable)
  const { data: signedData, error: signedError } = await supabase.storage
    .from('chat-attachments')
    .createSignedUploadUrl(storagePath)

  if (signedError) {
    return NextResponse.json({ error: 'Failed to create upload URL' }, { status: 500 })
  }

  // Insert attachment record
  const { data: attachment, error: dbError } = await supabase
    .from('attachments')
    .insert({
      id: fileId,
      org_id: profile.org_id,
      user_id: user.id,
      thread_id: threadId || null,
      filename,
      mime_type: mimeType,
      size,
      storage_path: storagePath,
      status: 'uploading',
    })
    .select('id')
    .single()

  if (dbError) {
    return NextResponse.json({ error: 'Failed to create record' }, { status: 500 })
  }

  return NextResponse.json({
    attachmentId: attachment.id,
    signedUrl: signedData.signedUrl,
    token: signedData.token,
    path: signedData.path,
  })
}
```

### Example 2: Frontend Upload Hook
```typescript
// Source: Project patterns + Supabase Storage docs
// hooks/use-file-upload.ts

interface UploadState {
  id: string
  filename: string
  mimeType: string
  size: number
  progress: number  // 0-100
  status: 'pending' | 'uploading' | 'ready' | 'error'
  previewUrl?: string  // Object URL for local preview
  error?: string
}

// Key concept: upload via XHR to get progress events
function uploadToSignedUrl(
  signedUrl: string,
  token: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`))
    xhr.onerror = () => reject(new Error('Upload failed'))

    // Supabase signed upload URL expects PUT with token as query param
    const url = new URL(signedUrl)
    url.searchParams.set('token', token)
    xhr.open('PUT', url.toString())
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.send(file)
  })
}
```

### Example 3: Building Multimodal Content Blocks
```typescript
// Source: Anthropic Vision docs + PDF support docs (verified 2026-03-18)
// lib/attachments/content-blocks.ts

import type Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

interface AttachmentRecord {
  id: string
  filename: string
  mime_type: string
  storage_path: string
  extracted_text: string | null
}

export async function buildAttachmentContentBlocks(
  supabase: SupabaseClient,
  attachments: AttachmentRecord[]
): Promise<Anthropic.ContentBlockParam[]> {
  const blocks: Anthropic.ContentBlockParam[] = []

  for (const att of attachments) {
    if (att.mime_type.startsWith('image/')) {
      // Images: use URL source -- Claude fetches directly
      const { data } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(att.storage_path, 3600) // 1hr expiry

      if (data?.signedUrl) {
        blocks.push({
          type: 'image',
          source: { type: 'url', url: data.signedUrl }
        })
      }
    } else if (att.mime_type === 'application/pdf') {
      // PDFs: use URL source for Claude's native PDF processing
      const { data } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(att.storage_path, 3600)

      if (data?.signedUrl) {
        blocks.push({
          type: 'document',
          source: { type: 'url', url: data.signedUrl }
        })
      }
    } else if (att.extracted_text) {
      // Text documents: inject extracted text
      blocks.push({
        type: 'text',
        text: `[Attached file: ${att.filename}]\n\n${att.extracted_text}`
      })
    }
  }

  return blocks
}
```

### Example 4: Database Migration
```sql
-- Source: Project migration patterns + Supabase Storage docs
-- 092_attachments.sql

CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  thread_id UUID REFERENCES conversation_threads(id),
  message_id UUID REFERENCES conversation_messages(id),
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'ready', 'processing', 'failed', 'deleted')),
  extracted_text TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY attachments_org_read ON attachments
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY attachments_org_insert ON attachments
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY attachments_org_update ON attachments
  FOR UPDATE USING (org_id = get_user_org_id());

-- Indexes
CREATE INDEX idx_attachments_org ON attachments (org_id) WHERE status != 'deleted';
CREATE INDEX idx_attachments_thread ON attachments (thread_id) WHERE status = 'ready';
CREATE INDEX idx_attachments_message ON attachments (message_id) WHERE message_id IS NOT NULL;

-- Storage quota aggregate (replace broken plan-gates.ts query)
CREATE OR REPLACE FUNCTION get_org_storage_bytes(p_org_id UUID)
RETURNS BIGINT AS $$
  SELECT COALESCE(SUM(size), 0)
  FROM attachments
  WHERE org_id = p_org_id AND status != 'deleted'
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Image: base64 only | Image: base64 OR URL source | 2024 | Use URL source to reduce request size by 33% |
| PDF: extract text, send as string | PDF: native `document` content block | Oct 2024 | Claude sees layout, charts, tables -- not just extracted text |
| PDF base64 only | PDF: base64 OR URL source | 2025 | Use URL source for cleaner code, smaller payloads |
| Anthropic Files API (beta) | Still beta (`files-api-2025-04-14`) | Apr 2025 | Do NOT use in production yet. URL/base64 source types are GA and sufficient |
| Supabase Storage: server upload | Signed upload URLs | 2023+ | Client uploads directly, bypassing server body limits |

**Deprecated/outdated:**
- `attachment-processor.ts` image skip: Currently returns `''` for images. This is correct for text extraction but the AI analysis path must use Vision content blocks instead.
- `plan-gates.ts` storage query: Uses `.select('size:sum')` which is invalid Supabase syntax. Must be replaced with the `get_org_storage_bytes()` RPC function.

## Open Questions

1. **PDF Thumbnail Generation**
   - What we know: `pdfjs-dist` can render a PDF first page to canvas on the client. This adds a ~2MB dependency.
   - What's unclear: Whether a static PDF icon + filename is sufficient UX for v1.4.
   - Recommendation: Ship with a static PDF icon + filename + download link. Add canvas thumbnails in a future iteration if users request it. Keeps the bundle small.

2. **Multi-file Upload UX**
   - What we know: Users may want to upload 3-5 files at once (e.g., "here are the project briefs").
   - What's unclear: How to handle progress for multiple simultaneous uploads.
   - Recommendation: Allow multi-file select, upload in parallel with `Promise.allSettled`, show individual progress bars. Cap at 5 files per message.

3. **Signed URL Accessibility for Claude API**
   - What we know: The `image.source.type: "url"` and `document.source.type: "url"` require the URL to be publicly fetchable by Anthropic's servers.
   - What's unclear: Whether Supabase Storage signed URLs are accessible from Anthropic's infrastructure (they should be, as they're standard HTTPS URLs with a token parameter).
   - Recommendation: Test with a real signed URL in the first implementation task. If Anthropic cannot fetch signed URLs, fall back to base64 encoding (download from storage on server, encode, send to API).

4. **Storage Bucket Creation Method**
   - What we know: Supabase Storage buckets can be created via Dashboard, CLI, or SQL migration.
   - What's unclear: Whether the migration can include `INSERT INTO storage.buckets` or if it must be done via the Supabase Dashboard.
   - Recommendation: Try SQL migration first (`INSERT INTO storage.buckets (id, name, public) VALUES ('chat-attachments', 'chat-attachments', false)`). If that fails, create via Dashboard and document the manual step.

## Sources

### Primary (HIGH confidence)
- [Anthropic Vision Docs](https://platform.claude.com/docs/en/build-with-claude/vision) - Image content block formats (base64, URL, file), supported formats (JPEG, PNG, GIF, WebP), size limits (5MB API, 8000x8000px max), token costs
- [Anthropic PDF Support Docs](https://platform.claude.com/docs/en/build-with-claude/pdf-support) - Document content block format (base64, URL, file), 32MB request limit, 600 pages max, native visual+text processing
- [Anthropic Files API Docs](https://platform.claude.com/docs/en/docs/build-with-claude/files) - Beta API (`files-api-2025-04-14`), supports PDF, plain text, images; 500MB per file, 100GB per org
- [Supabase createSignedUploadUrl](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) - 2-hour expiry, token-secured, requires insert RLS policy on objects table
- Codebase analysis: `attachment-processor.ts`, `gmail-attachments.ts`, `voice-pill.tsx`, `conversation/types.ts`, `unified-pipeline.ts`, `engine.ts`, `plan-gates.ts`, `chat/route.ts`

### Secondary (MEDIUM confidence)
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control) - Storage RLS is separate from database RLS
- Architecture research: `.planning/research/ARCHITECTURE.md` - Upload flow design, component map, integration points

### Tertiary (LOW confidence)
- PDF thumbnail rendering via `pdfjs-dist` -- not yet verified for this project's build pipeline

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and working in the codebase
- Architecture: HIGH - upload flow verified against Supabase docs and Anthropic API docs; integration points confirmed via code inspection
- Pitfalls: HIGH - directly observed in codebase (missing table, broken query, body limit); confirmed by official documentation
- Content blocks: HIGH - exact JSON formats verified against current official Anthropic documentation (March 2026)
- Storage RLS: MEDIUM - general pattern confirmed but exact signed-URL-with-RLS interaction needs testing

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable domain, all APIs are GA except Files API)
