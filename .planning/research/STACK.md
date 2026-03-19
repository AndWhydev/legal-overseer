# Technology Stack: v1.4 Additions

**Project:** BitBit AWU -- Media, Billing & Growth Roles
**Researched:** 2026-03-18
**Overall confidence:** HIGH

## What Already Exists (DO NOT ADD)

Before listing additions, these are already installed and working -- do not re-add or replace:

| Capability | Already Have | Version |
|-----------|-------------|---------|
| Supabase client | `@supabase/supabase-js` | 2.95.3 |
| Supabase SSR auth | `@supabase/ssr` | 0.8.0 |
| PDF text extraction | `pdf-parse` | 1.1.1 |
| DOCX text extraction | `mammoth` | 1.9.0 |
| AI SDK (streaming) | `ai` | 6.0.116 |
| Anthropic SDK | `@anthropic-ai/sdk` | 0.74.0 |
| Email transport | `resend` | 6.9.2 |
| Supabase Storage API | Built into `@supabase/supabase-js` | via 2.95.3 |
| Stripe REST calls | Raw `fetch()` to `api.stripe.com` | Already in `checkout.ts` |
| Stripe webhook verify | `stripe` (dynamic require) | Transient dep |
| Plan gates | `plan-gates.ts` | Fully built |
| Usage metering | `usage-metering.ts` | Fully built |
| Trial management | `trial-manager.ts` | Fully built |
| Dunning sequence | `dunning.ts` | Fully built |
| Checkout session | `checkout.ts` | Fully built |
| Webhook handler | `billing/webhook/route.ts` | Fully built |
| Attachment processor | `rag/attachment-processor.ts` | PDF, DOCX, TXT, CSV |
| Gmail attachments | `channels/gmail-attachments.ts` | Download + extract |
| Generated content DB | `generated_content` table | With scheduling |
| Tender hunter | `agent/tender-hunter.ts` | Types + scraper |
| Content scheduling | `generated_content.scheduled_for` column | Migration 081 |

**Key insight:** The billing infrastructure is ~90% built. File attachment text extraction is built. Storage upload works for reports. The v1.4 additions are smaller than they appear.

## Recommended New Stack Additions

### 1. File Upload UX -- `react-dropzone`

| | |
|---|---|
| **Package** | `react-dropzone` |
| **Version** | `^15.0.0` |
| **Purpose** | Drag-and-drop file upload zone for chat attachments |
| **Why this** | Hook-based API (`useDropzone`) fits React 19. Zero dependencies. 15M+ weekly downloads. Handles drag-over styling, file type validation, size limits, and multi-file selection in one hook. Building this from scratch with raw `<input type="file">` means reimplementing drop-zone UX, MIME validation, and accessibility -- not worth it for a chat attachment button. |
| **Integration** | Wraps the Paperclip button in chat-interface.tsx. Returns `File[]` which feeds directly into Supabase Storage `upload()`. |
| **Confidence** | HIGH -- stable, widely adopted, hooks-based |

```bash
npm install react-dropzone
```

### 2. Image Processing -- `sharp`

| | |
|---|---|
| **Package** | `sharp` |
| **Version** | `^0.34.5` |
| **Purpose** | Server-side image thumbnail generation, format conversion, EXIF stripping |
| **Why this** | Chat image previews need thumbnails (avoid sending 5MB originals as inline previews). Sharp is the standard -- 30M+ weekly downloads, uses libvips (C-level performance), produces WebP/AVIF thumbnails. The alternative is client-side Canvas API which is unreliable for quality and doesn't strip EXIF data (privacy risk). |
| **Integration** | API route receives uploaded image -> sharp generates 400px thumbnail + strips EXIF -> uploads both original + thumbnail to Supabase Storage -> returns thumbnail URL for inline preview. |
| **Confidence** | HIGH -- industry standard, works with Vercel (they pre-bundle libvips) |

```bash
npm install sharp
```

**Note:** `sharp` has native bindings. Vercel includes pre-built sharp binaries automatically. For Fly.io workers, the Docker image already uses a Node base that supports sharp.

### 3. Stripe Node SDK -- `stripe`

| | |
|---|---|
| **Package** | `stripe` |
| **Version** | `^20.4.1` |
| **Purpose** | Type-safe Stripe API calls, Customer Portal, proper webhook typing |
| **Why this** | The current codebase uses raw `fetch()` to `api.stripe.com/v1` with manual URL-encoded form params (see `checkout.ts`). This works for basic checkout creation but becomes painful for: (a) Customer Portal sessions, (b) subscription modification (proration), (c) metered billing records, (d) proper TypeScript types on webhook event objects. The SDK provides typed responses, automatic pagination, retry logic, and idempotency keys. At $199-599/mo subscription pricing, type safety on billing operations is worth the 300KB bundle addition. |
| **Integration** | Replace raw fetch calls in `checkout.ts` and `channels/stripe.ts`. The webhook verify-signature code already dynamically requires `stripe` -- making it a proper dependency makes this explicit. |
| **API Version** | `2026-02-25.clover` (latest stable) |
| **Confidence** | HIGH -- v20.4.1 current, official SDK |

```bash
npm install stripe
```

### 4. Stripe Frontend -- `@stripe/stripe-js`

| | |
|---|---|
| **Package** | `@stripe/stripe-js` |
| **Version** | `^8.10.0` |
| **Purpose** | Client-side Stripe.js loader for Checkout redirect and Customer Portal |
| **Why this** | PCI compliance requires loading Stripe.js from `js.stripe.com` (not self-hosted). This package handles the async load. Needed for: (a) redirectToCheckout from pricing page, (b) embedded payment element if we later add in-app payment forms. Without it, you'd need a manual `<script>` tag + global type declarations. |
| **Integration** | Pricing page component loads Stripe.js, creates checkout session via API route, redirects to Stripe Checkout. |
| **Confidence** | HIGH -- official Stripe package |

```bash
npm install @stripe/stripe-js
```

### 5. Google APIs -- `@googleapis/searchconsole`

| | |
|---|---|
| **Package** | `@googleapis/searchconsole` |
| **Version** | `^5.0.0` |
| **Purpose** | SEO Role -- query Search Console data for ranking monitoring |
| **Why this** | Lightweight single-API package (vs full `googleapis` at 171.4.0 which bundles every Google API). The SEO Role needs: clicks, impressions, CTR, average position per query/page. GSC API provides up to 25,000 rows per call (vs 1,000 in web UI), supports 16 months of date range. Authentication uses existing Google OAuth tokens already stored in `channel_configs`. |
| **Integration** | SEO Role tool calls this to pull ranking data, detect drops, suggest fixes. Uses the same OAuth credentials from Gmail/Google integration already in place. |
| **Confidence** | MEDIUM -- package is real and current, but integration complexity with existing OAuth token refresh flow needs validation |

```bash
npm install @googleapis/searchconsole
```

### 6. Google Analytics -- `@googleapis/analyticsdata`

| | |
|---|---|
| **Package** | `@googleapis/analyticsdata` |
| **Version** | `^6.0.0` |
| **Purpose** | SEO Role -- traffic metrics, page performance, conversion data |
| **Why this** | Companion to Search Console data. GA4 Data API provides page-level metrics (sessions, bounce rate, engagement time) that Search Console doesn't have. Same lightweight single-API pattern. The SEO Role needs both GSC (search performance) and GA4 (on-site behavior) for complete ranking analysis. |
| **Integration** | Same Google OAuth flow. SEO Role combines GSC ranking data with GA4 traffic data for actionable insights like "Page X ranks #4 for keyword Y, gets 2,000 impressions but only 2% CTR -- title tag needs work." |
| **Confidence** | MEDIUM -- same OAuth integration concern as GSC |

```bash
npm install @googleapis/analyticsdata
```

## Considered and Rejected

| Package | Considered For | Why Rejected |
|---------|---------------|-------------|
| `@stripe/react-stripe-js` (v5.6.1) | React Stripe Elements | Overkill -- BitBit uses Stripe Checkout (redirect flow), not embedded payment forms. `@stripe/stripe-js` alone handles redirect-based checkout. If we later add in-app card forms, add this then. |
| `tus-js-client` | Resumable uploads >6MB | Chat attachments are capped at 10MB (see `MAX_ATTACHMENT_BYTES` in gmail-attachments.ts). Standard Supabase `.upload()` handles up to 5GB and works fine for our use case. Resumable uploads add complexity (TUS endpoint config, upload state management) for no benefit at 10MB cap. |
| `googleapis` (171.4.0) | Google API access | Bundles every Google API -- massive install. Use per-API packages (`@googleapis/searchconsole`, `@googleapis/analyticsdata`) instead. |
| `@codesandbox/sandpack-react` (2.20.0) | Builder Role code preview | Wrong abstraction. The Builder Role generates static site code (HTML/CSS/JS/React), not interactive coding environments. An `<iframe srcDoc={generatedHtml}>` with CSP sandbox is simpler, lighter, and matches what Anthropic does with Claude Artifacts. Sandpack is for teaching/playground UX, not AI-generated code preview. |
| `puppeteer` / `playwright` | Website screenshot for Builder Role | Heavy dependencies (Chromium download). For v1.4, the Builder Role generates code -- previewing it in an iframe is sufficient. Screenshot-as-a-service can be added later via Cloudflare Browser Rendering or a dedicated screenshot API. |
| `cheerio` / `jsdom` | SEO page analysis | The SEO Role works from GSC/GA4 data (rankings, CTR, traffic), not by crawling pages. For on-page SEO audits, use Claude's vision capability to analyze page screenshots, or fetch raw HTML with standard `fetch()`. No heavy DOM library needed. |
| `node-cron` / `cron` | Social media scheduling | Already have Cloudflare edge cron + Vercel cron + `generated_content` table with `scheduled_for` column. The scheduling infrastructure exists. |
| `openai` | Alternative AI for content generation | Already on Anthropic stack with model routing. No reason to add OpenAI for content generation when Claude handles this well. |
| `react-runner` | Runtime React rendering for Builder Role | Too much magic for the current scope. Iframe sandbox with CSP is simpler and more secure. |

## Stack Decisions: What to NOT Add

These are deliberate non-additions based on what already exists:

### File Storage: Use Existing Supabase Storage API

The `@supabase/supabase-js` v2.95.3 already includes the full Storage API:
- `supabase.storage.from('bucket').upload(path, file, options)` -- standard upload
- `supabase.storage.from('bucket').createSignedUrl(path, expiresIn)` -- signed download URLs
- `supabase.storage.from('bucket').createSignedUploadUrl(path)` -- signed upload URLs (2hr expiry)
- `supabase.storage.from('bucket').getPublicUrl(path)` -- public bucket URLs

Already used in `api/reports/route.ts` and `api/cron/monthly-report/route.ts`. No new package needed.

### Attachment Text Extraction: Already Built

`rag/attachment-processor.ts` already handles PDF (via `pdf-parse`), DOCX (via `mammoth`), TXT, and CSV. For images, Claude's vision API accepts base64-encoded images directly in the message content -- no additional library needed. Supported formats: PNG, JPEG, GIF, WebP. Cost: ~$4.80 per 1,000 images at 1568x1568 with Sonnet.

### Social Media Posting: Use Direct REST Calls

Meta Graph API, LinkedIn API, and Twitter/X API all use simple REST endpoints with OAuth tokens. The codebase already has a pattern for this (see `channels/stripe.ts`, `channels/facebook-messenger.ts`). Adding SDK packages for each social platform would add dependency weight for simple POST requests. Keep the raw `fetch()` pattern.

Pattern:
```typescript
// Content Role: schedule a Facebook post
const res = await fetch(
  `https://graph.facebook.com/v21.0/${pageId}/feed`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: generatedContent,
      scheduled_publish_time: unixTimestamp,
      published: false,
      access_token: pageAccessToken,
    }),
  }
)
```

### Stripe Billing Infrastructure: Mostly Built

The entire billing stack exists:
- `checkout.ts` -- creates Stripe Checkout sessions with trial periods
- `plan-gates.ts` -- 4-tier plan feature gating (free/starter/growth/scale)
- `usage-metering.ts` -- token usage, agent run, and storage tracking
- `trial-manager.ts` -- 14-day trial with grace period
- `dunning.ts` -- 5-step payment recovery sequence
- `billing/webhook/route.ts` -- subscription lifecycle events

The `stripe` SDK addition is to replace raw fetch with typed calls, not to build billing from scratch.

### Builder Role Code Preview: Iframe Sandbox

Use native browser `<iframe sandbox="allow-scripts" srcDoc={html}>` with a Content Security Policy. This is the same pattern Anthropic uses for Claude Artifacts. No external library needed.

## Installation Summary

```bash
# New production dependencies (6 packages)
npm install react-dropzone sharp stripe @stripe/stripe-js @googleapis/searchconsole @googleapis/analyticsdata
```

### Bundle Impact Estimate

| Package | Approx Size | Tree-shakeable | Notes |
|---------|-------------|----------------|-------|
| `react-dropzone` | ~8KB gzipped | Yes | Client-side only |
| `stripe` | ~300KB | N/A (server only) | Not in client bundle |
| `@stripe/stripe-js` | ~2KB (loader) | N/A | Loads from CDN at runtime |
| `sharp` | ~30MB (native) | N/A (server only) | Native binaries, Vercel pre-bundles |
| `@googleapis/searchconsole` | ~50KB | Partial | Server-side only |
| `@googleapis/analyticsdata` | ~80KB | Partial | Server-side only |

**Client bundle impact:** ~10KB gzipped (react-dropzone + stripe-js loader). Negligible.

## Environment Variables Needed

```env
# Already configured (verify they exist)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# New for v1.4
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...  # For @stripe/stripe-js client-side load
STRIPE_CUSTOMER_PORTAL_CONFIG_ID=bpc_...   # Create in Stripe Dashboard > Customer Portal

# SEO Role: reuses existing Google OAuth from channel_configs
# If service account approach needed: GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

## Supabase Storage Buckets Needed

```sql
-- New buckets (create via migration or dashboard)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('chat-attachments', 'chat-attachments', false, 10485760,  -- 10MB limit
   ARRAY['image/jpeg','image/png','image/gif','image/webp',
         'application/pdf',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'text/plain','text/csv']),
  ('chat-thumbnails', 'chat-thumbnails', true, 524288,  -- 512KB, public for inline preview
   ARRAY['image/webp','image/jpeg']);

-- RLS for chat-attachments (private bucket, org-scoped paths)
CREATE POLICY "Upload to own org" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = get_user_active_org_id()::text
  );

CREATE POLICY "Read own org files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM get_user_accessible_org_ids()
    )
  );
```

## New Database Tables

```sql
-- Chat attachments metadata (complement to storage.objects)
CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  conversation_id uuid,
  storage_path text NOT NULL,        -- path in chat-attachments bucket
  filename text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,             -- bytes
  thumbnail_path text,               -- path in chat-thumbnails bucket
  extracted_text text,               -- from attachment-processor.ts
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- SEO ranking snapshots (populated by SEO Role via GSC API)
CREATE TABLE seo_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  query text NOT NULL,
  page_url text,
  position numeric(6,2),
  clicks integer DEFAULT 0,
  impressions integer DEFAULT 0,
  ctr numeric(6,4),
  snapshot_date date NOT NULL,
  source text DEFAULT 'gsc',         -- 'gsc' or 'ga4'
  created_at timestamptz DEFAULT now()
);
```

## Sources

- [Stripe Node.js SDK releases](https://github.com/stripe/stripe-node/releases) -- v20.4.1 confirmed
- [Stripe npm](https://www.npmjs.com/package/stripe) -- v20.4.1
- [@stripe/stripe-js npm](https://www.npmjs.com/package/@stripe/stripe-js) -- v8.10.0
- [@stripe/react-stripe-js npm](https://www.npmjs.com/package/@stripe/react-stripe-js) -- v5.6.1 (rejected)
- [react-dropzone npm](https://www.npmjs.com/package/react-dropzone) -- v15.0.0
- [sharp npm](https://www.npmjs.com/package/sharp) -- v0.34.5
- [Supabase Storage uploads docs](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Supabase Storage signed upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)
- [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) -- rejected for our use case
- [@googleapis/searchconsole npm](https://www.npmjs.com/package/@googleapis/searchconsole) -- v5.0.0
- [@googleapis/analyticsdata npm](https://www.npmjs.com/package/@googleapis/analyticsdata) -- v6.0.0
- [Google Search Console API](https://developers.google.com/webmaster-tools) -- official reference
- [Sandpack](https://sandpack.codesandbox.io/) -- v2.20.0 (rejected)
- [Claude Vision API](https://platform.claude.com/docs/en/build-with-claude/vision) -- image analysis via existing SDK
- [Meta Graph API scheduling](https://developers.facebook.com/docs/graph-api/reference/page/scheduled_posts/)
- [Anthropic Artifacts architecture](https://newsletter.pragmaticengineer.com/p/how-anthropic-built-artifacts) -- iframe sandbox pattern
