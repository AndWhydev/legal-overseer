# Research Summary: v1.4 Media, Billing & Growth Roles

**Domain:** Agentic AI platform feature expansion -- file attachments, Stripe billing, growth agent tools
**Researched:** 2026-03-18
**Overall confidence:** HIGH

## Executive Summary

v1.4 introduces three feature tracks that integrate with the existing Supabase + Next.js + agent pipeline architecture. The research reveals that the existing codebase is remarkably well-prepared for all three tracks: attachment processing infrastructure exists (PDF/DOCX extraction via `pdf-parse` and `mammoth`, Gmail attachment pipeline), billing infrastructure is ~90% built (plan gates with 4 tiers, trials, dunning, checkout sessions, webhook handling), and three growth tools already have 700+ line implementations (tender-hunter, ad-script-gen, ai-search-optimizer).

The critical finding is that none of the three tracks require changes to the core agent engine (`engine.ts`). The engine already handles multimodal content blocks via the Anthropic SDK, parallel tool execution, and tool group filtering. All three tracks integrate at the boundaries: chat route (attachments), tool execution layer (plan gating), and tool registration (growth roles).

The stack additions are minimal: 6 new npm packages (`react-dropzone`, `sharp`, `stripe`, `@stripe/stripe-js`, `@googleapis/searchconsole`, `@googleapis/analyticsdata`) with only ~10KB impact on the client bundle. The existing `@supabase/supabase-js` already includes Storage APIs used in the reports system. Social media posting for the Content Role uses raw `fetch()` to platform REST APIs, following the established pattern from `channels/stripe.ts` and `channels/facebook-messenger.ts`.

The main architectural risks are: (1) two Stripe webhook routes handling overlapping events must be consolidated, (2) `checkout.ts` creates a new Stripe Price object per session (must switch to pre-created Products/Prices), (3) growth role token costs can spiral without per-execution budgets, and (4) the `attachments` table that `plan-gates.ts` already queries does not exist in any migration.

## Key Findings

**Stack:** 6 new packages totaling ~10KB client impact. `react-dropzone` for upload UX, `sharp` for thumbnails, `stripe` SDK to replace raw fetch, `@stripe/stripe-js` for checkout redirect, `@googleapis/searchconsole` and `@googleapis/analyticsdata` for the SEO Role. Everything else uses existing packages or raw `fetch()`.

**Architecture:** No engine changes needed. Attachments wire at the chat route level (multimodal content block construction). Billing gates wire at the tool execution layer (`executeAgentTool`). Growth roles register as new tool groups following the exact pattern of `channel-tools.ts`.

**Critical pitfall:** Vercel's 4.5MB body limit means file uploads MUST use Supabase Storage signed upload URLs from day one. Cannot proxy uploads through API routes.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **File Attachments** - Zero dependencies on other tracks, immediately improves UX
   - Addresses: Upload in chat, inline preview, agent can read/analyze attachments
   - Avoids: No engine changes, uses existing `attachment-processor.ts` and Supabase Storage
   - Stack: `react-dropzone`, `sharp`, Supabase Storage (already in `@supabase/supabase-js`)

2. **Billing Hardening** - Required before growth roles ship
   - Addresses: Webhook consolidation, pre-created Stripe Products/Prices, plan gate enforcement at tool execution, pricing page
   - Avoids: Shipping growth tools without plan gating (free users get everything)
   - Stack: `stripe` SDK, `@stripe/stripe-js`

3. **Growth Role Tools** - Depends on billing gates
   - Addresses: SEO/Content/Ads/Builder/Tenders as chat-invokable tools
   - Avoids: Blocking on v1.3 role engine (tools work independently as tool groups)
   - Stack: `@googleapis/searchconsole`, `@googleapis/analyticsdata`, raw `fetch()` for social APIs

**Phase ordering rationale:**
- Attachments have zero dependencies on the other two tracks
- Billing must be hardened before growth roles, otherwise plan gating is broken
- Growth roles wrap existing 700+ line implementations for SEO/Ads/Tenders; Content and Builder are new but follow established patterns
- Within growth roles, Ad Script Generator is simplest (pure LLM, no external API), followed by SEO (needs Google API), then Builder (highest complexity)

**Research flags for phases:**
- Phase 1 (Attachments): Standard patterns, well-documented. Flag: Storage RLS policies need careful setup.
- Phase 2 (Billing): Needs careful webhook consolidation testing -- two routes currently overlap. Flag: ad-hoc Price creation must be fixed.
- Phase 3 (Growth): Content and Builder tools are NEW implementations. SEO/Ads/Tenders wrap existing code. Flag: per-execution token budgets are critical.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack additions | HIGH | All versions verified via npm registry, integration points confirmed in codebase |
| File Attachments | HIGH | Existing attachment-processor.ts validated, Supabase Storage well-documented, Anthropic multimodal API confirmed |
| Billing | HIGH | Existing billing infrastructure analyzed (7 files), Stripe SDK v20.4.1 confirmed current |
| Growth Roles | HIGH for SEO/Ads/Tenders (wrapping existing code), MEDIUM for Content/Builder (new implementations) |
| Integration Points | HIGH | All integration points verified against actual codebase files |
| Build Order | HIGH | Dependency chain clear: attachments independent, billing before growth |

## Gaps to Address

- Google OAuth scope expansion for Search Console / Analytics -- existing Gmail OAuth may need additional scopes
- Builder Role sandbox security model needs deeper investigation during Phase 3
- Stripe Customer Portal configuration (`bpc_*` ID) requires Stripe Dashboard setup -- not automatable via code
- Social media API OAuth flows (Meta Graph API, LinkedIn, X) need org-level credential storage -- follow existing `channel_configs` pattern
- `attachments` table migration must match the schema `plan-gates.ts` already queries (it references `size` column and `org_id`)
- Trial period mismatch: code sets 14 days, PROJECT.md says 30 days -- needs alignment decision
