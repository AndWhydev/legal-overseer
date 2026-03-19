# Feature Landscape

**Domain:** Agentic AI operations platform -- file attachments, SaaS billing, growth agent roles
**Researched:** 2026-03-18
**Confidence:** MEDIUM-HIGH (existing codebase patterns well understood; growth role scope varies)

---

## Category 1: File Attachments & Multimedia in Chat

### Table Stakes

Features users expect from any AI chat with file support. Missing = feels broken.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Paperclip button in chat composer | Universal pattern (ChatGPT, Gemini, Claude.ai) | Low | Chat interface UI | Hidden `<input type="file">` triggered by icon button |
| Drag-and-drop file onto chat | Every modern chat supports this | Low | Chat interface UI | `onDragOver`/`onDrop` handlers on chat container |
| Upload progress indicator | Users need feedback on large files | Low | None | Local state bar, no backend dependency |
| Inline image preview | Images should render in chat, not just filename | Medium | Supabase Storage signed URLs | Generate thumbnail + signed download URL |
| Inline PDF preview | PDFs are the most common business file type | Medium | Existing `attachment-processor.ts` | Embed viewer or first-page thumbnail |
| File size limits with clear error | Prevent 500MB uploads silently failing | Low | None | Client-side validation, 10MB default per file |
| Accepted file type filtering | Don't accept .exe, .dmg etc. | Low | None | `accept` attribute on input + server validation |
| Agent can read/analyze uploaded files | Core value -- "here's the brief, summarize it" | High | Claude Vision API, `attachment-processor.ts` | Pass images as base64 to Claude vision; extract text from docs |
| Attachment metadata on messages | Messages with files show filename, size, type | Low | `ChannelMetadata.attachments` (already typed) | Existing type has `attachments` array in conversation types |
| Storage scoped to org | Multi-tenant isolation | Medium | Supabase Storage RLS, `org_id` | Bucket path: `{org_id}/{thread_id}/{filename}` |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Agent auto-ingests docs to knowledge graph | "Upload your client folder, BitBit learns everything" | High | RAG pipeline, embedding service | Trigger embedding + entity extraction on upload |
| Multi-file upload (batch) | Upload 5 files at once, agent processes all | Medium | Queue/concurrency management | Promise.allSettled pattern already used in gmail-attachments |
| Image analysis via Claude Vision | "What's in this screenshot?" / "Read this receipt" | Medium | Claude API (vision already supported) | base64 encode, send as image content block |
| Voice note upload + transcription | Parity with WhatsApp voice notes (already built) | Medium | Whisper API (already integrated) | Reuse WhatsApp voice note pipeline |
| File reference in future messages | "That PDF I uploaded yesterday" -- agent finds it | High | Thread-scoped file registry | Query attachments table by thread/org |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Real-time collaborative editing | Not a Google Docs competitor; massive complexity | View-only previews, download links |
| Video file processing | Huge storage costs, slow, low ROI for agency use | Accept video but don't process; link to YouTube/Vimeo |
| File versioning | Premature; agencies don't version files in chat | Store latest only; if needed later, add append-only history |
| Custom file type plugins | Over-engineering for launch | Support standard formats (PDF, DOCX, images, CSV, TXT) |

### Feature Dependencies

```
Paperclip button --> Supabase Storage bucket --> Signed upload URL --> File stored
File stored --> Message metadata updated --> Inline preview rendered
File stored --> Agent analysis triggered (optional, user-initiated or auto)
File stored + Image type --> Claude Vision API --> Response with visual analysis
File stored + Document type --> attachment-processor.ts --> Text extraction --> RAG pipeline
```

### Existing Code to Leverage

- `ChannelMetadata.attachments` -- already typed with `{ type, url, name }` array
- `attachment-processor.ts` -- PDF (pdf-parse) and DOCX (mammoth) text extraction working
- `gmail-attachments.ts` -- Gmail attachment download + processing pipeline
- `plan-gates.ts` -- Storage limit checking already implemented per plan tier

---

## Category 2: Stripe Billing & Trial Infrastructure

### Table Stakes

Features required for any SaaS to charge money. Missing = cannot launch publicly.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Stripe Checkout Session for signup | Standard pattern; Stripe hosts the payment page | Medium | Stripe SDK, API route | `stripe.checkout.sessions.create()` with price IDs |
| Webhook handler for subscription events | Without this, app never knows payment status | Medium | API route at `/api/stripe/webhook` | Must verify signature with `stripe.webhooks.constructEvent()` |
| Subscription status sync to Supabase | App needs local subscription state | Medium | `subscriptions` table (referenced in existing code) | Sync on `customer.subscription.*` events |
| Plan gating (feature access by tier) | Already partially built in `plan-gates.ts` | Low | Extend existing `PLAN_FEATURES` | Add growth role agents to plan tiers |
| 30-day free trial | Standard SaaS expectation | Medium | Stripe trial periods | `subscription_data: { trial_period_days: 30 }` |
| Trial expiry handling | Users must convert or lose access | Medium | Cron job + webhook | Listen for `customer.subscription.updated` with `status: past_due` |
| Pricing page | Users need to see what they're paying for | Medium | Static page + Stripe price IDs | Server-render prices from Stripe or hardcode |
| Billing portal (manage subscription) | Users expect self-serve upgrade/cancel | Low | Stripe Customer Portal | `stripe.billingPortal.sessions.create()` -- Stripe hosts everything |
| Subscription lifecycle: create/upgrade/downgrade/cancel | Full CRUD on subscriptions | High | Multiple webhook events | Handle `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted` |
| Grace period on failed payment | Don't instantly cut access on card decline | Low | Stripe retry settings | Configure Stripe's Smart Retries; 3-day grace via `past_due` status |

### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Usage metering per role/agent | "See exactly what each agent costs you" | Medium | `usage-metering.ts` (already built) | Extend to track per-role usage (SEO role tokens vs Content role tokens) |
| AI cost transparency dashboard | Show token consumption, estimated cost, projected monthly | Medium | Usage metering + dashboard component | Users trust products that show costs openly |
| Role-based upsell nudges | "Upgrade to Growth to unlock SEO Role" | Low | Plan gates + UI component | Soft gate: show feature locked, link to upgrade |
| Hybrid pricing (base + usage overage) | Predictable base fee + fair usage-based overage | High | Stripe metered billing | Base subscription + metered price for token overages |
| Trial conversion flow (in-app) | "3 days left -- here's what you've accomplished" | Medium | Trial end date tracking | Show value delivered during trial to drive conversion |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Custom payment processor | Stripe is the standard; rolling your own is liability | Use Stripe exclusively |
| Free tier with agent access | AI costs are real; free users cost money | Free trial (time-limited), then paid only |
| Annual billing at launch | Premature optimization; monthly is simpler to start | Add annual after product-market fit signal |
| In-app invoice/receipt generation | Stripe handles this automatically | Link to Stripe-hosted invoices |
| Complex per-seat pricing | AWU is 1-2 users; per-seat adds friction | Simple plan tiers; add seat pricing in v2 if orgs grow |

### Feature Dependencies

```
Stripe Products/Prices created in Stripe Dashboard
  --> Pricing page renders plan options
  --> Checkout Session created --> Stripe hosted payment
  --> Webhook receives checkout.session.completed
  --> Subscription row created in Supabase
  --> plan-gates.ts reads subscription status
  --> Features gated/ungated based on plan

Trial flow:
  Signup --> 30-day trial (trialing status) --> trial_will_end event (7 days before)
  --> In-app notification --> Convert or expire --> past_due/canceled
```

### Existing Code to Leverage

- `plan-gates.ts` -- Plan definitions (free/starter/growth/scale), feature checking, gate enforcement all working
- `usage-metering.ts` -- Track/query usage events (tokens, agent runs, storage) with cost estimation
- `usage-metering.test.ts` -- Full test suite for usage tracking
- `subscriptions` table -- Already referenced in plan-gates queries (status, plan, current_period_start)
- OAUTH-06 -- Stripe OAuth/API key flow already connected in channel settings

### Critical Webhook Events to Handle

| Event | What Happens | Action |
|-------|-------------|--------|
| `checkout.session.completed` | User completes payment | Create/update subscription in Supabase |
| `invoice.paid` | Renewal succeeds | Update `current_period_start/end`, ensure `active` status |
| `invoice.payment_failed` | Card declined | Set `past_due`, notify user via email + in-app |
| `customer.subscription.updated` | Plan change, trial end, cancellation scheduled | Sync all fields to Supabase |
| `customer.subscription.deleted` | Subscription fully ended | Set `canceled` status, gate features |
| `customer.subscription.trial_will_end` | 3 days before trial expires | Send conversion email + in-app prompt |

---

## Category 3: Growth Roles

All Growth Roles depend on the v1.3 Role Engine (agent registry, role configuration, permission model). Each role registers via `self-registration` pattern already in the agent registry.

### 3a: SEO Role (Ranking Monitor + Fix Implementation)

#### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Keyword rank tracking (daily) | Core SEO tool function | High | External rank API (SerpAPI/DataForSEO) | Cannot build rank checking from scratch; need a data provider |
| Position change alerts | "Your main keyword dropped 5 positions" | Medium | Rank data + notification system | Trigger via cron, deliver via inbox/WhatsApp |
| Basic technical audit | Broken links, missing meta tags, slow pages | Medium | Site crawl (Lighthouse API or custom) | Run Lighthouse programmatically, parse results |
| Competitor keyword tracking | "Your competitor ranks #2, you rank #8" | Medium | Same rank API, competitor config | Store competitor domains in role config |
| Search Console integration | Real data source for impressions/clicks | Medium | Google Search Console API + OAuth | Reuse existing Google OAuth pattern |
| Actionable recommendations | "Add H1 tag to /about page" not just "H1 missing" | Medium | LLM analysis of audit results | Agent interprets raw data into specific tasks |

#### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Auto-fix implementation | Agent directly edits site meta/content (for sites BitBit has access to) | Very High | Builder Role or CMS API access | Requires write access to client's site -- scope carefully |
| AI Overview / LLM citation tracking | Track when brand appears in AI-generated search results | High | Custom scraping or specialized API | Emerging field; no standard API yet. Flag as LOW confidence |
| Content decay detection | "This blog post lost 40% traffic in 30 days" | Medium | Search Console data + trend analysis | Compare 30-day windows |
| SEO task auto-creation | Audit findings become kanban tasks automatically | Low | Existing task creation tools | Agent creates tasks via existing `create_task` tool |

#### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full site crawler (Screaming Frog clone) | Massive engineering effort; commodity tool | Integrate with DataForSEO Site Audit API or Lighthouse |
| Backlink building/outreach | Spam risk, reputation liability | Monitor backlinks only; flag lost/toxic ones |
| Content generation for SEO | Overlap with Content Role | SEO Role identifies opportunities; Content Role writes |

---

### 3b: Content Role (Social Scheduling + Blog Writing)

#### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Generate social post copy | "Write a LinkedIn post about our new project" | Low | LLM (existing engine) | Agent writes copy using org voice profile |
| Multi-platform formatting | LinkedIn vs Instagram vs X have different norms | Low | Template/prompt per platform | Different character limits, hashtag conventions, tone |
| Content calendar view | See upcoming scheduled posts | Medium | New UI component + `scheduled_content` table | Calendar grid or timeline view |
| Blog post drafting | "Write a blog post about web accessibility" | Medium | LLM + voice profile | Generate with SEO keywords from SEO Role |
| Draft review/edit flow | User approves before publish | Low | Approval pattern (already built for invoices/leads) | Reuse existing approval flow |
| Publish to social platforms | Actually post to LinkedIn, Instagram, etc. | High | Platform APIs (LinkedIn, Meta, X) | Each platform has its own API + OAuth |

#### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Optimal time scheduling | Post when audience is most active | Medium | Platform analytics API | Use engagement data to predict best times |
| Content repurposing | Blog post --> 5 social posts --> email newsletter | Medium | LLM transformation prompts | Agent generates variants from one source |
| Engagement tracking | "Your last post got 3x more engagement than average" | Medium | Platform APIs for metrics | Pull post performance data |
| Brand voice consistency scoring | Rate draft against established voice profile | Low | Voice profiles (already built) | Score draft similarity to voice profile |

#### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Image/graphic generation | Separate domain (Canva, Midjourney) | Accept uploaded images; don't generate |
| Community management / reply automation | High risk of brand damage if agent replies poorly | Flag engagement opportunities; human replies |
| Full CMS integration | Too many CMS platforms to support | Publish via API to WordPress/Ghost, or generate markdown for manual paste |

---

### 3c: Builder Role (Agentic Website/App Construction)

#### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Generate website from brief | "Build a landing page for client X" | High | Code generation via LLM | Output HTML/CSS/JS or framework components |
| Live preview | See generated site before deploying | Medium | Sandboxed iframe or preview service | Render generated code in isolated environment |
| Iterative refinement | "Make the hero bigger, change the CTA color" | Medium | Conversation-driven code edits | Agent maintains code state across turns |
| Template library | Starting points for common site types | Medium | Pre-built templates (landing, portfolio, services) | Accelerate generation with good starting points |
| Responsive output | Generated sites must work on mobile | Medium | LLM prompt engineering | Enforce responsive patterns in generation |

#### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Deploy to hosting | One-click deploy to Vercel/Netlify/client hosting | High | Hosting API integration | Vercel API for deployments is well-documented |
| Client brand auto-application | Pull brand colors/fonts from knowledge graph | Medium | Knowledge graph data | Agent uses stored brand guidelines |
| SEO-optimized output | Generated sites score well on Lighthouse | Low | Prompt engineering + Lighthouse validation | Include meta tags, semantic HTML, performance |
| Component library generation | Generate reusable React/Vue components, not just pages | High | Framework-specific code gen | More powerful than page-level generation |

#### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full IDE/code editor in-app | Competing with VS Code/Cursor is foolish | Generate code, provide download or deploy |
| Database/backend generation | Backend is orders of magnitude more complex than frontend | Generate frontend only; use existing SaaS backends |
| E-commerce store builder | Shopify/WooCommerce own this space | Generate marketing sites, link to existing e-commerce |
| Custom domain management | DNS/SSL complexity, support burden | Deploy to Vercel (they handle domains) |

---

### 3d: Ad Script Generator

#### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| Generate video ad scripts | "Write a 30-second ad for client X's new service" | Low | LLM + voice profile + project context | Structured output: hook, body, CTA |
| Multiple hook variations | A/B testing requires variation | Low | LLM generates N variants | 3-5 hook variations per script |
| Platform-specific formatting | TikTok vs YouTube vs Instagram Reels differ | Low | Platform templates in prompt | Duration limits, aspect ratio notes, tone |
| Script structure (hook/body/CTA) | Industry-standard format for video ads | Low | Structured output format | JSON schema or markdown sections |
| Client/project context injection | Scripts should reference actual services/offers | Low | Existing context assembler | Pull client, project, service details from knowledge graph |

#### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Storyboard generation | Visual shot-by-shot breakdown alongside script | Medium | LLM structured output | Text-based storyboard (scene descriptions) |
| Performance framework templates | AIDA, PAS, BAB frameworks as starting points | Low | Prompt library | Pre-built prompt patterns for proven frameworks |
| Script-to-social-post conversion | Generate social captions from ad scripts | Low | Content Role collaboration | Cross-role capability |

#### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Video production/rendering | Totally different domain; use Creatify/Arcads | Generate scripts only; user produces video separately |
| AI avatar generation | Uncanny valley risk, brand safety concerns | Script + storyboard; human talent records |
| Ad platform integration (Meta Ads, Google Ads) | Complex APIs, compliance risk, budget liability | Generate creative; user uploads to ad platform |

---

### 3e: Tender Hunter

#### Table Stakes

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| AusTender monitoring | Primary Australian government tender source | High | AusTender OCDS API (auth token required) | Official API exists at `api.tenders.gov.au` |
| Keyword/category filtering | Only show relevant tenders (web, digital, design) | Medium | Filter configuration per org | CPV codes + keyword matching |
| Tender summary generation | AI reads tender doc, produces executive summary | Medium | LLM + document processing | Reuse attachment-processor for tender PDFs |
| Relevance scoring | "90% match for your capabilities" | Medium | LLM scoring against org profile | Compare tender requirements vs org capabilities |
| Alert on new matches | "3 new tenders matching your profile" | Medium | Cron job + notification system | Daily check, deliver via inbox/WhatsApp |
| Tender pipeline view | See all tracked tenders with status/deadlines | Medium | New UI component + `tenders` table | Kanban-like view: discovered/evaluating/responding/submitted |

#### Differentiators

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Go/No-Go recommendation | Agent advises whether to bid based on fit, competition, capacity | Medium | LLM analysis + org capacity data | "Recommend GO: 85% capability match, 3 week timeline fits" |
| Response draft generation | Auto-generate tender response sections from org knowledge | High | Knowledge graph + LLM | Pull past project descriptions, team bios, methodology |
| State government tender sources | QLD, NSW, VIC each have separate portals | High | Multiple scrapers/APIs | Queensland: QTenders; NSW: eTendering; etc. |
| Deadline tracking with reminders | "Tender closes in 3 days, response not started" | Low | Cron job + deadline field | Escalating reminders at 7d, 3d, 1d |
| Compliance checklist extraction | Parse tender doc, extract all mandatory requirements | Medium | LLM document analysis | Output structured checklist from tender PDF |

#### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full proposal writing | Massive scope; each tender is unique | Generate sections/drafts, human assembles final |
| Bid management (pricing/costing) | Financial decisions need human judgment | Provide tender scope summary; human sets price |
| International tender sources | AWU is Brisbane-based; Australian focus first | Start with AusTender only; add state portals later |
| Direct tender submission | Compliance risk; tenders have strict format requirements | Generate response content; human submits on portal |

---

## Cross-Cutting Feature Dependencies

### All Growth Roles depend on:

```
v1.3 Role Engine (agent registry + role config + permissions)
  --> Role self-registration pattern
  --> Role-specific tools registered
  --> Plan gates check role access per plan tier

Billing infrastructure:
  Growth roles gated to 'growth' and 'scale' plans
  --> plan-gates.ts needs role-level gating (not just agent-level)
  --> Usage metering needs per-role tracking

File attachments (indirect):
  SEO Role: upload competitor reports, audit exports
  Content Role: upload images for social posts
  Builder Role: upload brand assets, logos
  Tender Hunter: upload tender documents for analysis
```

### Dependency Graph (build order)

```
File Attachments (no dependencies on other v1.4 features)
  |
Stripe Billing (no dependencies on other v1.4 features)
  |
  +--> Plan gates extended for growth roles
  |
Growth Roles (depend on v1.3 Role Engine + extended plan gates)
  |
  +--> Ad Script Generator (simplest, no external API)
  +--> Content Role (needs platform APIs for publish)
  +--> SEO Role (needs external rank data provider)
  +--> Builder Role (needs preview/deploy infrastructure)
  +--> Tender Hunter (needs AusTender API access)
```

---

## MVP Recommendation

### Phase 1 -- Build First (no external dependencies)

1. **File Attachments** -- Paperclip button, drag-and-drop, Supabase Storage, inline preview, agent analysis. Already 60% of the plumbing exists.
2. **Stripe Billing** -- Webhook handler, subscription sync, pricing page, trial flow. Existing plan-gates and usage-metering provide strong foundation.
3. **Ad Script Generator** -- Pure LLM, no external API needed. Quick win to prove growth role pattern.

### Phase 2 -- Build Next (external API dependencies)

4. **Content Role** -- Social copy generation (LLM only) first, then platform publishing APIs.
5. **SEO Role** -- Needs DataForSEO or SerpAPI subscription; start with Search Console integration.
6. **Tender Hunter** -- Needs AusTender API token; start with monitoring, then add response generation.

### Defer

7. **Builder Role** -- Highest complexity, most uncertain value. Ship after other roles prove the pattern. The agency (AWU) builds sites manually today and may not trust AI-generated sites for clients yet.

---

## Complexity Summary

| Feature Area | Overall Complexity | Existing Foundation | External Dependencies |
|-------------|-------------------|--------------------|-----------------------|
| File Attachments | Medium | Strong (types, processor, gmail pipeline) | Supabase Storage (already provisioned) |
| Stripe Billing | Medium | Strong (plan-gates, usage-metering, Stripe OAuth) | Stripe SDK + Dashboard config |
| Ad Script Generator | Low | Medium (LLM engine, voice profiles) | None |
| Content Role | Medium-High | Medium (LLM engine, approval flow) | Platform APIs (LinkedIn, Meta, X) |
| SEO Role | High | Low (no SEO infra exists) | Rank API provider, Search Console API |
| Tender Hunter | High | Low (no tender infra exists) | AusTender API token, PDF processing |
| Builder Role | Very High | Low (no code gen infra exists) | Preview service, deployment API |

---

## Sources

### File Attachments
- [Supabase Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control) -- MEDIUM confidence
- [Supabase Signed Upload URLs](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) -- HIGH confidence
- [Claude Vision API](https://platform.claude.com/docs/en/build-with-claude/vision) -- HIGH confidence
- [Supabase Storage Implementation Guide](https://nikofischer.com/supabase-storage-file-upload-guide) -- MEDIUM confidence

### Stripe Billing
- [Stripe Subscription Lifecycle in Next.js 2026](https://dev.to/thekarlesi/stripe-subscription-lifecycle-in-nextjs-the-complete-developer-guide-2026-4l9d) -- MEDIUM confidence
- [Stripe Usage-Based Billing Docs](https://docs.stripe.com/billing/subscriptions/usage-based) -- HIGH confidence
- [Stripe Pay-As-You-Go Implementation](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide) -- HIGH confidence
- [Stripe Webhooks with Supabase](https://supabase.com/docs/guides/functions/examples/stripe-webhooks) -- MEDIUM confidence
- [Vercel Next.js Subscription Starter](https://github.com/vercel/nextjs-subscription-payments) -- HIGH confidence

### SEO Monitoring
- [AI SEO Tracking Tools 2026 Analysis](https://www.searchinfluence.com/blog/ai-seo-tracking-tools-2026-analysis-platforms/) -- MEDIUM confidence
- [Best AI SEO Agents 2026](https://www.allaboutai.com/ai-agents/best-ai-seo-agents/) -- MEDIUM confidence

### Content Scheduling
- [Best AI Social Media Automation Tools 2026](https://www.enrichlabs.ai/blog/best-ai-social-media-automation-tools) -- MEDIUM confidence
- [AI Agents Replacing Manual Social Media Management](https://nackemedia.com/how-ai-agents-are-replacing-manual-social-media-management-in-2026/) -- MEDIUM confidence

### Agentic Coding / Builder
- [Top 5 Agentic AI Website Builders](https://machinelearningmastery.com/top-5-agentic-ai-website-builders-that-actually-ship/) -- MEDIUM confidence
- [Agentic Engineering Patterns (Simon Willison)](https://simonwillison.net/2026/Feb/23/agentic-engineering-patterns/) -- HIGH confidence

### Tender Hunting
- [AusTender OCDS API](https://github.com/austender/austender-ocds-api) -- HIGH confidence
- [AI Tender Management Software 2026](https://autorfp.ai/blog/tender-software) -- MEDIUM confidence
- [Sweetspot - AI for Government Contracting](https://www.sweetspot.so/) -- MEDIUM confidence

### Ad Script Generation
- [Creatify AI Scriptwriter](https://creatify.ai/features/ai-scriptwriter) -- MEDIUM confidence
- [Zeely AI Ad Script Generator](https://zeely.ai/ai-ad-script-generator/) -- MEDIUM confidence
