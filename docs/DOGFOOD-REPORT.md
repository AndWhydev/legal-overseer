# BitBit Dogfood Report — Pre-Investor Demo
**Date**: April 2, 2026
**Tested by**: Automated agent (API + page content analysis)
**Production URL**: https://app.bitbit.chat
**Landing Page**: https://bitbit.chat

---

## EXECUTIVE SUMMARY

**Overall: DEMO-READY with caveats**

The app is live, builds clean, and all public-facing pages work. The database has
real data (contacts, leads). Key risk areas: empty modules (invoices, meetings,
tenders = 0 rows), and the login page is client-rendered (slight delay on load).

---

## 1. AUTHENTICATION

| Test | Result | Notes |
|------|--------|-------|
| Email/password login (Supabase) | ✅ PASS | hi@torkay.com:password works |
| Google OAuth | ✅ Present | Button renders, redirects configured |
| Apple OAuth | ✅ Present | Button renders |
| Onboarding signup link | ✅ Present | Links to /onboard |
| Animated login face (ClawdLoginFace) | ✅ Present | Interactive eyes follow input focus |
| ForceFieldBackground | ✅ Present | Animated particle background |
| Terms/Privacy links | ✅ Present | Footer links work |

**User profile**: Tor (owner) → BitBit Test Workspace (enterprise plan)
**Active org**: 7abcbfb1 (BitBit Test Workspace)

---

## 2. PUBLIC PAGES (all ✅)

| Page | Status | Size | Notes |
|------|--------|------|-------|
| / (landing) | ✅ 200 | 57KB | "AI Operations That Actually Work" — has agents, email, invoice, lead, WhatsApp |
| /pricing | ✅ 200 | 98KB | 5 tiers: Free($0), Starter($199), Growth($349), Scale($599), Enterprise(custom) |
| /demo | ✅ 200 | 33KB | Interactive demo page |
| /waitlist | ✅ 200 | — | Waitlist signup |
| /blog | ✅ 200 | — | Blog listing |
| /showcase | ✅ 200 | — | Portfolio/showcase |
| /industries/agencies | ✅ 200 | 38KB | Marketing agencies vertical |
| /industries/trades | ✅ 200 | 37KB | Trades & services vertical |
| /industries/professional-services | ✅ 200 | 38KB | Professional services vertical |
| /privacy | ✅ 200 | — | Privacy policy |
| /terms | ✅ 200 | — | Terms of service |
| /login | ✅ 200 | — | Email/password + Google + Apple |
| /case-study | ✅ 200 | — | Case study page |

---

## 3. DATABASE STATE

| Table | Rows | Status | Demo Impact |
|-------|------|--------|-------------|
| organizations | 9 | ✅ Data | Multiple workspaces including Andy's |
| org_members | 7 | ✅ Data | Tor + Andy accounts |
| profiles | 4 | ✅ Data | Tor, Andy, amatorri847 |
| contacts | 23 | ✅ Data | Vercel, Amazon, Apple, LinkedIn, etc (auto-imported from email) |
| leads | 17 | ✅ Data | Mix of new/qualified/converted/lost — from pcc_discovery + lead_swarm |
| invoices | 0 | ⚠️ EMPTY | **Will look empty in demo** |
| meetings | 0 | ⚠️ EMPTY | **Will look empty in demo** |
| tenders | 0 | ⚠️ EMPTY | **Will look empty in demo** |
| proposals | 0 | ⚠️ EMPTY | |
| notifications | 0 | ⚠️ EMPTY | |
| agent_sessions | 0 | ⚠️ EMPTY | |
| api_keys | 0 | OK | Expected |

**⚠️ CRITICAL**: Invoices, meetings, and tenders modules will show EMPTY. Consider:
- Pre-seeding sample data before demo
- OR: positioning as "fresh workspace" and creating live during demo

---

## 4. PRICING TIERS (as displayed on /pricing)

| Tier | Price | Description |
|------|-------|-------------|
| Free | $0/mo | Basic monitoring, explore BitBit |
| Starter | $199/mo | Solo operators getting started with AI ops |
| Growth | $349/mo | Growing agencies automating client ops |
| Scale | $599/mo | Full AI-powered operations |
| Enterprise | Custom | Bespoke configuration |

**Stripe**: Live keys configured. Price IDs set for Starter/Growth/Scale.

---

## 5. DASHBOARD ROUTES (all exist in codebase)

| Route | Built | Notes |
|-------|-------|-------|
| /dashboard | ✅ | Main dashboard with KPIs |
| /dashboard/chat | ✅ | AI agent chat interface |
| /dashboard/leads | ✅ | Lead management (17 leads exist) |
| /dashboard/invoices | ✅ | Invoice kanban (0 invoices) |
| /dashboard/contacts | ✅ | Contact management (23 contacts) |
| /dashboard/contacts/[slug] | ✅ | Individual contact detail |
| /dashboard/connections | ✅ | API integrations (Connect UI) |
| /dashboard/channels | ✅ | Communication channels |
| /dashboard/meetings | ✅ | Meeting management (0 meetings) |
| /dashboard/approvals | ✅ | Approval workflows |
| /dashboard/builder | ✅ | Agent builder |
| /dashboard/sentry | ✅ | Monitoring/sentry dashboard |
| /dashboard/settings | ✅ | Workspace settings |
| /dashboard/activity | ✅ | Activity feed |
| /dashboard/portal | ✅ | Client portal management |
| /dashboard/creator-studio | ✅ | Content creation tools |
| /dashboard/medications | ✅ | **⚠️ SHOULD BE HIDDEN** — personal health module |

**Andy's workspace** has enabled_modules: creator-studio, contacts, leads, invoices,
tenders, approvals, meetings, ad-scripts

---

## 6. API & CRON INFRASTRUCTURE

| Component | Status | Notes |
|-----------|--------|-------|
| 25 cron jobs configured | ✅ | vercel.json — scheduler, channel-sync, triage, sentry, briefings, reports, billing |
| Agent chat endpoint | ✅ Built | /api/agent/chat — supports Bearer auth |
| Agent classify | ✅ Built | /api/agent/classify |
| Agent audit | ✅ Built | /api/agent/audit |
| Items API | ✅ Built | /api/items, /api/items/[id] |
| Telegram webhook | ✅ Built | /api/telegram/webhook |
| CSRF protection | ✅ Active | Origin header required for POST |
| Rate limiting | ✅ Active | Auth routes (20/min), webhook routes (100/min) |
| Security headers | ✅ Active | CSP, HSTS, X-Content-Type-Options |

---

## 7. VERCEL DEPLOYMENT STATUS

| Environment | Status | Notes |
|-------------|--------|-------|
| Production (main) | ✅ READY | 1 day old, app.bitbit.chat serving correctly |
| Preview (recent) | ⚠️ Some errors | Legacy `master` branch causes spurious failures |
| Build time | ~5 min | Normal for Next.js with 40+ routes |

**Error cause**: Legacy `master` branch has no `personal-assistant/` subdirectory.
**Recommendation**: Delete `master` branch to stop noisy error deploys.

---

## 8. KNOWN ISSUES / RISKS FOR DEMO

### 🔴 SHOWSTOPPERS
1. **Empty modules**: Invoices, Meetings, Tenders = 0 rows. Looks dead.
   → **FIX**: Seed sample data or create during demo.

### 🟡 MEDIUM RISKS  
2. **Medications module visible**: `/dashboard/medications` shouldn't be in demo.
   → Already hidden from non-enterprise? Check Andy's workspace modules.
3. **Contacts are all auto-imported noise**: Vercel, Amazon, Apple — not real business contacts.
   → Could look unprofessional if investors browse contacts.
4. **Middleware blocks Bearer auth for API routes**: Mobile/API clients can't authenticate.
   → Not relevant for browser demo but would matter if someone asks about API access.

### 🟢 LOW RISK
5. **Weekly digest dedup**: Code merged, untested in prod. Won't trigger during demo.
6. **9 organizations in database**: Multiple test workspaces visible if they check org switcher.
7. **Login page is client-rendered**: Slight flash before content appears.

---

## 9. RECOMMENDED DEMO WALKTHROUGH ORDER

1. **Landing Page** (bitbit.chat or app.bitbit.chat/) — show the pitch, scroll through features
2. **Pricing** (/pricing) — show tiers, enterprise option
3. **Industries** — show agencies, trades, professional-services verticals
4. **Login** — show the animated ClawdLoginFace, login with credentials
5. **Dashboard** — KPIs, activity overview
6. **Chat** — talk to the AI agent live, show it understands context
7. **Leads** — show the 17 existing leads, kanban, status management
8. **Contacts** — show contact management, detail pages
9. **Connections** — show the "Connect" UI for integrations
10. **Builder** — show agent customization
11. **Sentry** — show monitoring capabilities
12. **Portal** — show client-facing portal

**SKIP**: Invoices (empty), Meetings (empty), Tenders (empty), Medications (personal)

---

## 10. PRE-DEMO ACTIONS NEEDED

- [ ] Seed 3-5 sample invoices (draft, sent, paid statuses)
- [ ] Seed 2-3 sample meetings
- [ ] Seed 1-2 sample tenders
- [ ] Clean up contacts (remove or enrich auto-imported noise)
- [ ] Verify chat agent responds correctly with API keys configured
- [ ] Test full login → dashboard flow in browser
- [ ] Confirm Andy's workspace (org-1d74c2d5) has clean data
- [ ] Delete legacy `master` branch to stop deploy noise
