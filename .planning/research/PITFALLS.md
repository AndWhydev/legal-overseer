# Domain Pitfalls

**Domain:** Adding file attachments, Stripe billing, and AI growth roles to an existing Next.js + Supabase + AI agent platform
**Researched:** 2026-03-18
**Overall confidence:** HIGH (based on codebase inspection + official documentation + community reports)

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or billing disasters.

### Pitfall 1: Vercel 4.5MB Body Limit Kills File Uploads

**What goes wrong:** Files uploaded through Next.js API routes on Vercel hit the 4.5MB request body limit for serverless functions. Users try to upload a 10MB PDF and get a silent 413 error. The existing attachment processor (`src/lib/rag/attachment-processor.ts`) supports buffers up to 100MB, but that code can never receive large files through a Vercel API route.

**Why it happens:** The natural pattern is `<input type="file"> -> FormData -> POST /api/upload -> write to storage`. This routes the entire file through the serverless function. Vercel's Pro plan extends timeouts to 300s but does NOT increase the body size limit beyond 4.5MB.

**Consequences:** File upload appears broken for anything beyond small documents. Users will immediately hit this with PDFs, images, and especially any multimedia files. Workarounds after launch are messy because the upload flow is deeply wired.

**Prevention:** Use Supabase Storage signed upload URLs. The flow must be:
1. Client requests a signed upload URL from API route (tiny payload)
2. Client uploads directly to Supabase Storage (bypasses Vercel entirely)
3. Client notifies API route with the storage path (tiny payload)
4. Server processes the file from storage (reads from Supabase, not from request body)

This is the `createSignedUploadUrl` API from `@supabase/storage-js`. The existing `reports/route.ts` already uses `supabase.storage.from('reports').upload()` on the server side, but that pattern breaks for user-uploaded files. The signed URL pattern must be the canonical path from day one.

**Detection:** Test with a 5MB+ file on Vercel preview deployment before merging. If the upload succeeds through a serverless function, something is wrong (you're probably on a local dev server, not Vercel).

**Phase:** Must be addressed in Phase 1 (File Attachments). Cannot be patched later without rewriting the upload flow.

**Confidence:** HIGH -- Vercel body limit is documented, confirmed by community reports, and observed in similar architectures.

---

### Pitfall 2: Missing Storage RLS Policies Create Open Buckets or Block All Uploads

**What goes wrong:** Supabase Storage has separate RLS from the database. Creating a bucket without storage policies either (a) blocks all uploads with a cryptic "new row violates row-level security" error, or (b) if set to public, exposes all files to the internet. The existing codebase uses `supabase.storage.from('reports')` in `reports/route.ts` and `cron/monthly-report/route.ts`, but these likely use service role context. User-facing uploads with the anon key through signed URLs need explicit storage policies.

**Why it happens:** Developers assume database RLS covers storage. It does not. Supabase Storage has its own policy system on `storage.objects`. The signed upload URL flow also has a specific gotcha: the upload is performed with the token embedded in the signed URL, which may not carry the user's auth context the way you expect.

**Consequences:** Either all uploads fail in production (blocking the feature), or files are publicly accessible (security breach). The existing `plan-gates.ts` queries an `attachments` table for storage quotas, but that table does not exist in any migration yet -- meaning storage gating will fail silently (returns `true` due to the `catch -> return true` pattern).

**Prevention:**
- Create storage bucket via migration with explicit policies
- Policy must scope to org: `(bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::text)` or use org-based folder structure
- Use private bucket (not public) with signed download URLs for retrieval
- Create the `attachments` metadata table with org_id FK and RLS policies matching the existing pattern (`org_id = get_user_org_id()`)
- Test upload flow with anon key (not service role) against Vercel preview

**Detection:** Upload test in Supabase Dashboard with anon key (not service role). If it works with service role but fails with anon key, your policies are wrong.

**Phase:** Phase 1 (File Attachments). Must be correct before any upload code ships.

**Confidence:** HIGH -- confirmed by Supabase documentation on storage access control and multiple community reports of this exact issue.

---

### Pitfall 3: Stripe Webhook Creates New Price Object Every Checkout Session

**What goes wrong:** The existing `checkout.ts` creates a **new Stripe Price object** for every checkout session (lines 84-95). This means every customer who signs up generates a new price ID. Stripe's dashboard becomes cluttered with thousands of identical prices. Worse, webhook event processing uses `priceId` to identify tiers (line 154), but every subscription has a different price ID, making tier resolution unreliable.

**Why it happens:** The current implementation uses ad-hoc `product_data[name]` pricing instead of pre-created Products and Prices in Stripe. This was fine for a prototype but breaks in production at scale.

**Consequences:**
- Cannot reliably map price ID -> tier in webhooks (current code falls back to `metadata.tier` which only works if metadata was set correctly)
- Stripe dashboard becomes unmanageable
- Cannot use Stripe's built-in subscription analytics (they group by Price)
- Price changes require code deploys instead of Stripe Dashboard updates
- Proration calculations break because Stripe sees each price as unique

**Prevention:**
1. Create Products and Prices in Stripe Dashboard (or via one-time setup script)
2. Store price IDs as environment variables: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`
3. Map `priceId -> tier` in `handleSubscriptionEvent` using these env vars
4. Remove the ad-hoc price creation code
5. Keep `metadata.tier` as a fallback, but price ID should be the source of truth

**Detection:** Check Stripe Dashboard after 3 test checkouts. If you see 3 separate Price objects for the same tier, you have this problem.

**Phase:** Phase 2 (Stripe Billing). Fix during the billing hardening phase, before any real customer signs up.

**Confidence:** HIGH -- directly observed in the codebase (`checkout.ts` lines 84-95).

---

### Pitfall 4: Webhook Idempotency Gap Causes Duplicate Subscription Records

**What goes wrong:** The existing `handleSubscriptionEvent` in `checkout.ts` does an `upsert` on `subscriptions` for `created` events, but the upsert key is `stripe_subscription_id`. If Stripe retries a webhook (which it does aggressively -- immediately, then at 5min, 30min, 2hrs, etc.), and the first attempt succeeded but returned a non-200 before the response reached Stripe, you get duplicate processing. The `updated` and `cancelled` handlers use `.update().eq('stripe_subscription_id', ...)` which is safer but the `organisations` table update has no idempotency guard.

**Why it happens:** The webhook endpoint returns 200 only after all processing. If the DB write succeeds but the response times out (Vercel 30s limit), Stripe retries and the org plan gets re-written, potentially overwriting a later state.

**Consequences:** Race conditions during plan changes. Customer upgrades from starter to growth, webhook for upgrade is retried while already on growth, `organisations.plan` gets set to whatever the retry carries. In the worst case, a cancellation webhook retry arrives after a re-subscription webhook.

**Prevention:**
1. Store `stripe_event_id` in a `webhook_events` table (migration 075 already exists for this pattern) and check before processing
2. Return 200 immediately, then process asynchronously (or at minimum, return 200 as early as possible)
3. Use `event.data.object` timestamps to detect stale updates -- never overwrite a newer state with an older event
4. The existing `catch` block already returns 200 to prevent retry storms (good), but the success path should also be resilient

**Detection:** Send the same webhook event twice using Stripe CLI (`stripe trigger customer.subscription.updated`). Check if any database state is duplicated or corrupted.

**Phase:** Phase 2 (Stripe Billing). Must be hardened before trial launch.

**Confidence:** HIGH -- Stripe's retry behavior is documented, and the current code lacks event deduplication.

---

### Pitfall 5: Growth Role Token Costs Spiral Without Per-Execution Budgets

**What goes wrong:** Growth roles (SEO, Content, Builder, Ad Script, Tender Hunter) are generative workloads. A Content Role writing a blog post uses 10-50x more tokens than a classification task. A Builder Role generating website code could easily consume $5-20 in a single execution. The existing cost-optimized model tiering (Haiku classify -> Sonnet/Opus execute) was designed for short operational tasks, not long-form generation.

**Why it happens:** The existing `usage-metering.ts` tracks token usage after the fact, but there is no per-execution budget cap. The autonomy system (`autonomy-levels.ts`) controls which tools need approval, but doesn't limit how many tokens a single approved execution can consume. A growth role given a broad task ("write 10 blog posts about web design") could loop through the agent engine consuming tokens until the monthly API budget is exhausted.

**Consequences:** A single user on the $199/mo Starter plan could generate $500 in API costs in one session. At the $49/mo infrastructure target, this is catastrophic. Even with usage metering, the damage is done before you detect it.

**Prevention:**
1. Per-execution token budget: each growth role invocation has a hard cap (e.g., Builder: 100K tokens, Content: 50K tokens, SEO: 20K tokens)
2. Pre-flight cost estimation: before executing a growth role task, estimate token cost and check against remaining monthly budget
3. Circuit breaker in the agent engine: if cumulative tokens in a single conversation exceed N, pause and ask for confirmation
4. Growth roles should default to Sonnet (not Opus) for generation, with Opus reserved for complex reasoning steps
5. Track per-role costs separately in `usage_events` so you can identify cost outliers

**Detection:** Run a Builder Role task that asks it to "create a complete e-commerce website" and monitor token consumption. If it exceeds $5 in a single run, the budget system is insufficient.

**Phase:** Phase 3 (Growth Roles). Must be implemented before any growth role is exposed to users.

**Confidence:** HIGH -- based on LLM cost patterns, community reports of 340% cost overruns in agent systems, and analysis of the existing codebase lacking per-execution caps.

---

### Pitfall 6: Trial-to-Paid Conversion Fails Silently Without Payment Method

**What goes wrong:** The current `checkout.ts` sets `subscription_data[trial_period_days]` to 14, but the PROJECT.md specifies a 30-day trial. More critically, depending on Stripe Checkout configuration, trials may or may not collect a payment method upfront. If no payment method is collected, the trial ends and the subscription silently moves to `incomplete` or `past_due` instead of `active`. The `handleSubscriptionEvent` only handles `created`, `updated`, `deleted` -- it does not handle `invoice.payment_failed` or `customer.subscription.trial_will_end`.

**Why it happens:** Trial configuration looks simple but has a critical decision point: collect payment method during trial signup, or not? The current code doesn't explicitly set `payment_method_collection`, meaning Stripe defaults to collecting it. But if this changes, or if the customer's card expires during the trial, the transition breaks.

**Consequences:** Customers who complete a trial but whose payment fails never get access revoked (the code only handles `cancelled`, not `past_due`). Or worse, customers who genuinely want to convert can't because there's no payment recovery flow.

**Prevention:**
1. Always collect payment method during trial signup (explicit `payment_method_collection: 'always'`)
2. Handle `customer.subscription.trial_will_end` webhook -- send email 3 days before trial ends
3. Handle `invoice.payment_failed` webhook -- update subscription status to `past_due`, notify user
4. Implement a grace period: `past_due` status gives 7 days before downgrade to `free`
5. Add `past_due` to the `subscriptions.status` CHECK constraint (already includes it in migration 028, good)
6. Update `getOrgPlan` to treat `past_due` as still having access (grace period)

**Detection:** Create a test subscription with a trial, let it expire, and verify the subscription state transitions correctly. Use Stripe test clocks to simulate time advancement.

**Phase:** Phase 2 (Stripe Billing). Must be complete before any real trials begin.

**Confidence:** HIGH -- Stripe documentation explicitly warns about this, and the current webhook handler is incomplete.

---

## Moderate Pitfalls

Mistakes that cause significant debugging time or user-facing bugs.

### Pitfall 7: Attachments Table Missing from Migrations

**What goes wrong:** `plan-gates.ts` (line 189-199) queries an `attachments` table with columns `size` and `org_id` to enforce storage quotas. This table does not exist in any migration. The query will fail, the catch block returns `true` (allow), and storage limits are never enforced.

**Prevention:**
- Create `attachments` metadata table in the file upload migration
- Schema: `id, org_id, user_id, thread_id, storage_path, filename, mime_type, size_bytes, extracted_text_path, created_at`
- Add RLS policies matching the org-scoped pattern
- Wire `plan-gates.ts` storage check to use correct column name (`size_bytes`, not `size:sum`)
- The existing `checkPlanGate` query uses `.select('size:sum')` which is not valid Supabase syntax for aggregation -- this needs to be rewritten as an RPC or manual sum

**Phase:** Phase 1 (File Attachments).

**Confidence:** HIGH -- directly observed in codebase.

---

### Pitfall 8: Chat Attachment Metadata Not Wired to Conversation Thread

**What goes wrong:** The `ConversationMessage` interface already has an `attachments` field (`MessageAttachment[]`), but the chat API route and the agent engine don't pass attachments through to the LLM. Files get uploaded to storage but the agent never "sees" them. The attachment processor exists for email attachments via Gmail, but there's no equivalent flow for chat-uploaded files.

**Why it happens:** The existing attachment pipeline was built for channel ingestion (Gmail -> RAG), not for interactive chat. The agent needs to receive attachment content as part of the conversation context, either as extracted text injected into the system prompt, or (for images) as multimodal content blocks in the Anthropic API.

**Prevention:**
1. After file upload, extract text via `processAttachment()` for documents, or create image content blocks for images
2. Inject into the agent's message as a content block: `{ type: 'image', source: { type: 'base64', ... } }` for images, or `{ type: 'text', text: '[Attachment: filename.pdf]\n...' }` for documents
3. Store attachment metadata in `conversation_messages` or a linked `message_attachments` table
4. Respect token budgets -- large documents should be summarized, not injected verbatim

**Phase:** Phase 1 (File Attachments).

**Confidence:** HIGH -- observed from the gap between `MessageAttachment` type definition and actual agent engine code.

---

### Pitfall 9: Org-to-Stripe Customer Mapping Is Fragile

**What goes wrong:** The current `handleSubscriptionEvent` looks up org by `stripe_subscription_id` in the subscriptions table. But for new `created` events, the subscription doesn't exist yet in the table. The code falls through to `targetOrgId = null`, then does an upsert with `org_id: null`. The org never gets linked to the subscription. The `metadata.tier` is set but `metadata.org_id` is only set during checkout session creation -- if the customer arrives from a different flow, org_id is missing.

**Prevention:**
1. In `handleSubscriptionEvent` for `created` events, extract `org_id` from the subscription metadata (it's set in checkout as `subscription_data[metadata][org_id]`)
2. Also look up org by `stripe_customer_id` as a fallback
3. Store `stripe_customer_id` on the `organisations` table for reliable bidirectional lookup
4. Add a reconciliation cron that finds orphaned subscriptions (subscriptions with null org_id) and attempts to link them

**Phase:** Phase 2 (Stripe Billing).

**Confidence:** HIGH -- directly observed in checkout.ts (line 164-170, org lookup fails for new subscriptions).

---

### Pitfall 10: Growth Roles Writing Directly to External Systems Without Approval Gates

**What goes wrong:** Growth roles need to take real-world actions: SEO Role fixes code, Content Role publishes to social media, Builder Role deploys websites. The existing autonomy system (`autonomy-levels.ts`) has a default of `L2_propose` for unknown tools, which is good. But if growth role tools are added without explicit autonomy mappings, the default may not be conservative enough for tools that publish content publicly or modify live websites.

**Why it happens:** New tools get added to `TOOL_AUTONOMY_MAP` as an afterthought. A "publish_blog_post" tool without an explicit mapping gets `L2_propose`, which queues for approval. But the approval UX may not show the full content being published, leading to rubber-stamp approvals.

**Prevention:**
1. All growth role external-action tools must be mapped to `L1_approve` (financial/irreversible)
2. Approval queue must show full content preview for content publication actions
3. SEO and Builder roles that modify code/sites must have a "preview" step before a "publish" step
4. Content Role social media posts must include platform-specific preview in the approval UI
5. Add a `TOOL_AUTONOMY_MAP` entry for every new growth role tool at the time of tool creation, not after

**Phase:** Phase 3 (Growth Roles).

**Confidence:** MEDIUM -- the existing autonomy system is well-designed, but new tools are a known expansion point with no enforcement that they must be classified.

---

### Pitfall 11: Image/Multimodal Content Breaks Token Budget

**What goes wrong:** When users upload images in chat, the Anthropic API charges tokens for image processing. A high-resolution image can cost 1,000-2,000+ tokens. Multiple images in a conversation can quickly exhaust the entity context budget (currently capped at 4,000 chars in the assembler). The existing attachment processor skips images entirely (`if (mimeType.startsWith('image/')) return ''`), meaning image analysis requires a completely different path through the Anthropic API's vision capabilities.

**Prevention:**
1. Resize/compress images before sending to the API (max 1568px on longest side, per Anthropic docs)
2. Track image token cost separately in usage metering
3. Limit images per conversation turn (e.g., max 5 images)
4. For the agent, use `{ type: 'image', source: { type: 'url', url: signedUrl } }` instead of base64 when possible (reduces request size)
5. Don't inject all conversation images into every subsequent turn -- only include images from the current message

**Phase:** Phase 1 (File Attachments).

**Confidence:** MEDIUM -- based on Anthropic API documentation for vision capabilities and token pricing. Exact costs depend on resolution.

---

### Pitfall 12: Plan Gating Races with Webhook Delivery

**What goes wrong:** User subscribes -> Stripe processes payment -> webhook fires -> `handleSubscriptionEvent` updates `organisations.plan`. But the redirect from Stripe Checkout arrives at the dashboard before the webhook. The user sees the dashboard, tries to use a paid feature, and `checkPlanGate` still returns `false` because the plan hasn't been updated yet.

**Prevention:**
1. On checkout success redirect, poll `/api/billing/subscription` for up to 10 seconds until plan reflects the new tier
2. Alternatively, query Stripe directly from the success page to verify subscription status
3. Show a "Setting up your subscription..." interstitial on the success redirect
4. Cache plan state with a short TTL (30s) so rapid checks don't hammer the database

**Phase:** Phase 2 (Stripe Billing).

**Confidence:** HIGH -- this is a well-known Stripe integration pattern. The redirect always arrives before the webhook.

---

### Pitfall 13: Growth Role Prompt Injection via User Content

**What goes wrong:** Growth roles process external content: SEO Role reads competitor websites, Content Role processes user-provided topics, Tender Hunter reads tender documents. If an attacker embeds prompt injection payloads in these external inputs, the agent could be manipulated to take unintended actions, leak system prompts, or generate harmful content.

**Why it happens:** The agent engine trusts tool outputs as context for the next LLM call. If a "fetch_url" result contains "Ignore previous instructions and...", the LLM may follow it.

**Prevention:**
1. Sanitize external content before injecting into agent context -- strip known injection patterns
2. Use a separate "untrusted content" system message prefix when passing external data
3. Growth roles that process external URLs should run in a sandboxed agent context with reduced tool access
4. Apply output filtering on generated content before any external publication
5. Rate-limit growth role executions per org per hour

**Phase:** Phase 3 (Growth Roles).

**Confidence:** MEDIUM -- prompt injection is a known risk for RAG and agent systems. The existing system already processes untrusted email content, but growth roles expand the attack surface significantly.

---

## Minor Pitfalls

### Pitfall 14: Storage Bucket Naming Collision with Existing 'reports' Bucket

**What goes wrong:** The codebase already uses a `reports` storage bucket. If the new file attachment system also uses a generic bucket name like `files` or `uploads`, and both share the same policy structure, cross-contamination is possible. Worse, if policies differ between buckets, a migration that modifies storage policies could accidentally break the reports bucket.

**Prevention:** Use a dedicated `chat-attachments` bucket with its own policy set. Keep the `reports` bucket untouched. Document which buckets exist and their policies in a central location.

**Phase:** Phase 1 (File Attachments).

---

### Pitfall 15: Subscription Table Lacks `tier` Column Consistency

**What goes wrong:** The `subscriptions` table uses `plan` column (from migration 028) but `checkout.ts` writes to `tier` column (line 176). If these are different columns, one will always be null. If they're the same column aliased differently in code, the confusion leads to bugs.

**Prevention:** Audit the subscriptions table schema. Use a single column name consistently (`plan` to match the existing schema). Update `handleSubscriptionEvent` to write to `plan` not `tier`.

**Phase:** Phase 2 (Stripe Billing).

**Confidence:** HIGH -- directly observed in code vs. schema mismatch.

---

### Pitfall 16: Supabase Free Tier Storage Limits

**What goes wrong:** Supabase's free/Pro plan includes 1GB of storage. With file attachments, storage grows quickly. The $49/mo budget constraint means upgrading Supabase may not be feasible. The existing plan-gates define storage limits (free=100MB, starter=500MB, growth=2GB, scale=unlimited), but the Supabase infrastructure limit is a hard ceiling regardless of plan gating.

**Prevention:** Monitor Supabase storage usage in the health dashboard. Implement file cleanup for expired/deleted content. Consider compressing uploads before storage. Add a storage usage warning at 80% capacity.

**Phase:** Phase 1 (File Attachments), ongoing.

---

### Pitfall 17: Growth Role Output Quality Without Human-in-the-Loop

**What goes wrong:** AI-generated SEO fixes, blog posts, ad scripts, and website code are published with factual errors, brand-inconsistent tone, or technically broken code. Google explicitly warns that "using generative AI tools to generate many pages without adding value may violate spam policies."

**Prevention:**
1. All content generation outputs are drafts, not publications
2. Require explicit human approval before any content goes live
3. Content Role should maintain a brand voice profile (leverage existing voice profiles for Andy/Tor)
4. Builder Role code must pass linting/type checking before being considered "ready"
5. SEO Role recommendations should cite specific data points, not hallucinate metrics

**Phase:** Phase 3 (Growth Roles).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|---|---|---|
| File Upload Infrastructure | Vercel body size limit | Signed upload URLs from day one (Pitfall 1) |
| File Upload Infrastructure | Storage RLS missing | Create bucket policies in migration (Pitfall 2) |
| File Upload Infrastructure | Attachments table missing | Create table with org-scoped RLS (Pitfall 7) |
| File Upload Infrastructure | Token budget for images | Resize, limit, track separately (Pitfall 11) |
| Chat Attachment Wiring | Agent can't "see" files | Wire attachment content to agent context (Pitfall 8) |
| Stripe Billing Setup | Ad-hoc prices per checkout | Pre-create Stripe Products/Prices (Pitfall 3) |
| Stripe Billing Setup | Webhook idempotency | Store event IDs, check before processing (Pitfall 4) |
| Stripe Billing Setup | Org-Stripe mapping gap | Extract org_id from metadata on created events (Pitfall 9) |
| Stripe Trial Flow | Silent trial failure | Handle trial_will_end and payment_failed webhooks (Pitfall 6) |
| Stripe Trial Flow | Plan gate timing | Poll on success redirect (Pitfall 12) |
| Stripe Schema | Column name mismatch | Audit tier vs plan column (Pitfall 15) |
| Growth Roles - All | Token cost spiral | Per-execution budgets, circuit breakers (Pitfall 5) |
| Growth Roles - All | Missing autonomy mappings | Classify every tool at creation time (Pitfall 10) |
| Growth Roles - External | Prompt injection | Sanitize external content, sandbox agents (Pitfall 13) |
| Growth Roles - Content | Quality control | Draft-only outputs, human approval required (Pitfall 17) |

## Integration-Specific Warnings

These are unique to adding features to the existing BitBit system, not generic greenfield concerns.

| Existing System Component | New Feature Interaction | Risk |
|---|---|---|
| `plan-gates.ts` "allow on error" pattern | New gated features inherit permissive fallback | Users exceed plan limits when DB queries fail |
| `get_user_org_id()` RLS function | New tables must use same function | Forgetting RLS on a new table exposes all orgs' data |
| `createClient()` uses anon key | Storage operations need elevated context for some operations | Signed URLs are created server-side with service role, uploads happen client-side with anon key |
| Existing 14-day trial in code vs 30-day in spec | Deploying with wrong trial period | Customers get half the expected trial |
| `TOOL_AUTONOMY_MAP` default is L2 | Growth role read-only tools (SEO analysis) get unnecessary approval prompts | UX friction for harmless operations |
| Agent engine SSE streaming | File upload progress events | Need separate upload progress channel, not mixed into agent SSE |
| Conversation thread token budgets | Attached file content inflates context | Thread may hit context limits faster with attachments |

## Sources

- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase Signed Upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl)
- [Supabase Storage RLS Discussion](https://github.com/orgs/supabase/discussions/37611)
- [Vercel Body Size Limit](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions)
- [Stripe Webhook Best Practices](https://docs.stripe.com/webhooks)
- [Stripe Trial Periods](https://docs.stripe.com/billing/subscriptions/trials)
- [Stripe Subscription Lifecycle](https://docs.stripe.com/billing/subscriptions/overview)
- [Stripe Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)
- [Stripe Webhook Idempotency Best Practices](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks)
- [AI Agent Cost Crisis](https://www.aicosts.ai/blog/ai-agent-cost-crisis-budget-disaster-prevention-guide)
- [AI Content and SEO Spam Policy](https://searchengineland.com/guide/ai-generated-content)
- [Prompt Injection in RAG Systems](https://www.obsidiansecurity.com/blog/prompt-injection)
- [Handling Duplicate Stripe Events](https://www.duncanmackenzie.net/blog/handling-duplicate-stripe-events/)
- [Stripe + Next.js Complete Guide](https://www.pedroalonso.net/blog/stripe-nextjs-complete-guide-2025/)
- [Multi-Tenant SaaS Billing with Stripe](https://docs.stripe.com/saas)
