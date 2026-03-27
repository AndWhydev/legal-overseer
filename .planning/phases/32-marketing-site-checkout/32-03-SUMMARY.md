---
phase: 32-marketing-site-checkout
plan: 03
subsystem: seo
tags: [json-ld, open-graph, sitemap, robots, structured-data, seo, metadata, next-metadata]

requires:
  - phase: 32-01
    provides: Landing page, industry pages, NavBar/Footer
  - phase: 32-02
    provides: Pricing page with FAQ, case study page

provides:
  - Complete sitemap.xml with all 10 marketing page URLs
  - robots.txt allowing all marketing pages, blocking dashboard/api
  - Root layout with Open Graph, Twitter cards, metadataBase, target SEO keywords
  - JSON-LD structured data on landing (Organization + SoftwareApplication), pricing (FAQPage), case study (Article), all industry pages (WebPage)
  - Industry-specific SEO keywords on all industry pages

affects: [marketing, seo, social-sharing, search-indexing]

tech-stack:
  added: []
  patterns: [next-metadata-api, json-ld-script-injection, server-component-structured-data]

key-files:
  created: []
  modified:
    - personal-assistant/src/app/sitemap.ts
    - personal-assistant/src/app/robots.ts
    - personal-assistant/src/app/layout.tsx
    - personal-assistant/src/app/page.tsx
    - personal-assistant/src/app/(public)/pricing/page.tsx
    - personal-assistant/src/app/(public)/case-study/page.tsx
    - personal-assistant/src/app/(public)/industries/agencies/page.tsx
    - personal-assistant/src/app/(public)/industries/trades/page.tsx
    - personal-assistant/src/app/(public)/industries/professional-services/page.tsx

key-decisions:
  - "JSON-LD via dangerouslySetInnerHTML in server components -- standard Next.js pattern for structured data"
  - "metadataBase with relative canonical -- lets Next.js resolve all relative URLs against https://bitbit.chat"
  - "AUD pricing in structured data ($0-$599, 4 offers) matching actual pricing tiers"
  - "Separate JSON-LD per page rather than only in layout -- enables page-specific schema types (FAQPage, Article, WebPage)"

patterns-established:
  - "JSON-LD pattern: const jsonLd = {...}; <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />"
  - "Page-level OG metadata: each server component page.tsx exports metadata with page-specific openGraph override"
  - "Industry page SEO: keywords array in metadata + WebPage JSON-LD with industry-specific description"

requirements-completed: [MKTG-05]

duration: 26min
completed: 2026-03-27
---

# Phase 32 Plan 03: SEO Foundation Summary

**Complete SEO foundation with sitemap (10 pages), robots.txt, Open Graph/Twitter cards, and JSON-LD structured data (Organization, SoftwareApplication, FAQPage, Article, WebPage) across all marketing pages**

## Performance

- **Duration:** 26 min
- **Started:** 2026-03-27T03:08:09Z
- **Completed:** 2026-03-27T03:34:54Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Sitemap updated with all 10 marketing pages, proper priorities (1.0 landing, 0.9 pricing, 0.8 industries/case-study), and removed non-existent /docs route
- Robots.txt allows all new marketing routes including case-study and all 3 industry pages
- Root layout enhanced with metadataBase, updated OG/Twitter descriptions targeting "AI business assistant" keywords, AUD pricing in JSON-LD
- Landing page has dedicated Organization + SoftwareApplication JSON-LD schemas
- Pricing page has FAQPage JSON-LD with all 5 FAQ items for rich search results
- Case study page has Article JSON-LD with publication date and OG article type
- All 3 industry pages have WebPage JSON-LD and industry-specific SEO keywords

## Task Commits

Each task was committed atomically:

1. **Task 1: Sitemap, robots, and global metadata with Open Graph** - `0f3d8cae` (feat -- changes included in prior session commit)
2. **Task 2: Add JSON-LD structured data to key marketing pages** - `048b8778` (feat)

## Files Created/Modified
- `personal-assistant/src/app/sitemap.ts` - 10 marketing page entries with priorities and changeFrequency
- `personal-assistant/src/app/robots.ts` - Allow list for all public marketing routes
- `personal-assistant/src/app/layout.tsx` - metadataBase, OG, Twitter, updated keywords, AUD JSON-LD
- `personal-assistant/src/app/page.tsx` - Organization + SoftwareApplication JSON-LD
- `personal-assistant/src/app/(public)/pricing/page.tsx` - FAQPage JSON-LD with 5 FAQ items
- `personal-assistant/src/app/(public)/case-study/page.tsx` - Article JSON-LD, OG article type
- `personal-assistant/src/app/(public)/industries/agencies/page.tsx` - WebPage JSON-LD, agency keywords
- `personal-assistant/src/app/(public)/industries/trades/page.tsx` - WebPage JSON-LD, trades keywords
- `personal-assistant/src/app/(public)/industries/professional-services/page.tsx` - WebPage JSON-LD, professional services keywords

## Decisions Made
- Used `dangerouslySetInnerHTML` for JSON-LD injection -- standard Next.js server component pattern, safe because the data is static
- Set metadataBase to `new URL('https://bitbit.chat')` with relative canonical `'/'` -- Next.js resolves all relative URLs against this base
- Pricing in structured data uses AUD ($0-$599, 4 offers) matching the actual pricing tiers on the page
- Removed fake aggregateRating from SoftwareApplication JSON-LD (no real ratings yet) -- avoids search engine penalties for fabricated data
- Cleared sameAs array in Organization schema (no verified social profiles yet)
- Each page gets its own JSON-LD schema type rather than relying solely on the layout's global schemas -- enables richer search result features per page

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed fabricated aggregateRating from JSON-LD**
- **Found during:** Task 1 (layout metadata update)
- **Issue:** Existing JSON-LD had fake aggregateRating (4.8 stars, 150 reviews) which could trigger Google search penalties
- **Fix:** Removed aggregateRating entirely from SoftwareApplication schema
- **Files modified:** personal-assistant/src/app/layout.tsx
- **Verification:** JSON-LD no longer contains unverifiable claims
- **Committed in:** 0f3d8cae (Task 1 -- prior session)

**2. [Rule 1 - Bug] Corrected logo URL in Organization JSON-LD**
- **Found during:** Task 1 (layout metadata update)
- **Issue:** Logo pointed to non-existent `logo.png`; actual icon is `bitbit-app-icon-192.png`
- **Fix:** Updated logo URL to `https://bitbit.chat/bitbit-app-icon-192.png`
- **Files modified:** personal-assistant/src/app/layout.tsx
- **Verification:** Logo URL matches existing file in public directory

**3. [Rule 1 - Bug] Corrected pricing currency and range in JSON-LD**
- **Found during:** Task 1 (layout metadata update)
- **Issue:** Existing JSON-LD showed USD with $29-$299 range; actual pricing is AUD $0-$599 with 4 paid tiers
- **Fix:** Updated to AUD, lowPrice 0, highPrice 599, offerCount 4
- **Files modified:** personal-assistant/src/app/layout.tsx
- **Verification:** Matches pricing tiers on pricing page (Free $0, Starter $199, Growth $349, Scale $599)

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes improve SEO correctness. No scope creep.

## Issues Encountered
- Next.js build TypeScript type checker fails on pre-existing errors in unrelated files (beta-invite/route.ts, onboarding/page.tsx) -- not caused by SEO changes. Turbopack compilation passes successfully ("Compiled successfully").
- Task 1 changes (sitemap, robots, layout) were already committed in a prior session as part of commit 0f3d8cae -- edits produced identical content, no new commit needed.

## User Setup Required

None - no external service configuration required.

Note: `og-image.png` is referenced in Open Graph metadata but does not exist yet. Generate a 1200x630px image at `personal-assistant/public/og-image.png` for social sharing previews.

## Next Phase Readiness
- All marketing pages fully SEO-optimized with structured data, meta tags, and social sharing support
- Phase 32 (Marketing Site & Checkout Flow) is now complete: landing page, industry pages, case study, pricing with Stripe Checkout, and SEO foundation
- Ready for Phase 33 (Beta Program Infrastructure)

## Self-Check: PASSED

- All 9 modified files exist on disk
- Commit 048b8778 (Task 2) found in git history
- Commit 0f3d8cae (Task 1) found in git history
- Sitemap has 10 URL entries
- Robots allows /case-study and /industries/* routes
- Layout has openGraph and twitter metadata
- Landing page has 2 JSON-LD script tags (Organization + SoftwareApplication)
- Pricing page has FAQPage JSON-LD
- Case study page has Article JSON-LD
- All industry pages have WebPage JSON-LD

---
*Phase: 32-marketing-site-checkout*
*Completed: 2026-03-27*
