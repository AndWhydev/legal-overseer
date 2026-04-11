# Investor pitch deck design

## Overview

HTML web presentation for introducing BitBit to potential investors and partners in Andy's network. Not a formal fundraise deck. Light theme, shadcn aesthetic, monochrome. BitBit positioned as an entity (your new COO) rather than a product or platform.

## Audience

People in Andy's network who may be interested in investing at the earliest stage. Not lined up for a formal pre seed round. The deck needs to be compelling enough to start a conversation, not close a check.

## Format

- HTML/web presentation, hosted on Vercel
- Light theme (white backgrounds, subtle borders, clean typography)
- shadcn aesthetic: minimal, functional, no gradients or decorative elements
- Monochrome palette matching BitBit's existing brand
- Embedded video clips (5 to 8 seconds, looping, no audio) showing the real product
- Responsive but optimized for laptop/desktop viewing
- 11 slides, roughly 4 minutes to present, designed for a 15 minute conversation with Q&A

## Design principles

- Consolidated, sleek, minimalist. "It just works" energy.
- BitBit is an entity, not a tool. Copy should make it feel like a someone, not a something.
- No hyphens or emdashes in any copy.
- All copy reviewed against humanizer guidelines: no AI vocabulary, no rule of three, no promotional language, no negative parallelisms, no vague attributions.
- Grounded in competitive research from `.omc/research/bitbit-competitive-intelligence-v2.md`

## Tagline strategy

| Location | Tagline | Purpose |
|---|---|---|
| Cover (slide 1) | "Meet your new COO" | Introduces BitBit as an entity with a role. Four words. Memorable. |
| Product intro (slide 4) | "A COO costs $200k a year. BitBit costs $99 a month." | Cost comparison that lands after they understand the product. |
| Competitive punchline (slide 9) | "They draft. BitBit does." | Three words. Captures the core difference. |
| Throughout | Specific awareness lines like "It already knows who Dave is" | Shows the Memory Palace through concrete examples. |

## Slide by slide spec (revised per council critique)

### Slide 1: Cover

- BitBit logo, monochrome, centered
- Tagline: "Meet your new COO"
- Light background, clean type, nothing else
- Sets the tone: this is about meeting someone, not buying something

### Slide 2: The problem

- Headline: "You're doing two jobs"
- Copy: "You started a business to do work you're good at. Instead you spend half your day switching between apps, chasing invoices, and forwarding messages to the right person. Every service is its own silo. Nobody connects them. Nobody remembers the context. So you do it yourself."
- Visual: scattered app icons (Gmail, WhatsApp, Xero, Calendar, Slack, CRM), disconnected, slightly faded. The mess.

### Slide 3: Why now

*Council fix: all three critics flagged missing "why now." Research provides strong data.*

- Headline: "December 2025 changed everything"
- Copy: "AI agents crossed a reliability threshold. Claude, GPT, and Gemini all shipped models within weeks that can hold complex tasks in memory, reason about edge cases, and recover from mistakes. Small business AI adoption jumped from 36% in 2023 to 57% in 2026. 80% of organizations report their agent investments already deliver measurable returns. The technology is ready. The question is who builds the right product."
- Sources: Anthropic/Material survey (500+ technical leaders), PwC 2026 agent report, US Census Bureau BTOS data
- Keep this slide fast and visual: a timeline or stat trio, not paragraphs

### Slide 4: Meet BitBit

- Headline: "BitBit handles your business while you do your work"
- Copy: "Every user gets their own BitBit. It reads your messages, manages your invoices, triages your communications, follows up with your clients. It knows who Dave is, that he owes you money, and that he mentioned Steve's project last Tuesday. You can message it from WhatsApp while you're on a job site. You can ignore it and let it handle things. It tells you what it did, not what it's about to do."
- Subline: "A COO costs $200k a year. BitBit costs $99 a month."
- Video clip: chat interface with BitBit responding in real time
- Note: copy adapted from product.md. Changed headline per Codex critique ("the one who handles everything" sounds unserious)

### Slide 5a: Connections

*Council fix: Sonnet and Gemini both said slide 5 was too dense. Split into 5a, 5b, 5c.*

- Headline: "It connects to everything you already use"
- 200+ services through one screen. Email, WhatsApp, iMessage, Xero, Calendar, Slack, and hundreds more via Composio. Click to connect. Native bridges for WhatsApp and iMessage mean real two way messaging, not API wrappers.
- Video clip: connections grid with tiles
- Note per Sonnet critique: don't lead with "200+ integrations" as the differentiator since Composio powers that. Lead with native bridges (WhatsApp, iMessage) which are genuinely BitBit's infrastructure.

### Slide 5b: Memory

- Headline: "It remembers everything and keeps getting smarter"
- Copy: "BitBit's Memory Palace stores seven types of business knowledge: conversations, decisions, patterns, facts, relationships, pricing history, and learned conventions. It scores confidence on everything it learns. Memories that aren't confirmed fade over time. Ones that get corroborated grow stronger. Ask 'Why did we stop working with TechCorp?' and it reconstructs the full timeline. Ask 'What did we charge for the last 3 WordPress builds?' and it cross references invoices with contacts. It also watches your margins. If it notices scope creep that wasn't invoiced, it tells you before doing more work for that client."
- Visual: a simple before/after. "ChatGPT remembers what you said" vs "BitBit understands how your business works"
- Removed "No other AI assistant does this" per Sonnet critique (promotional, vague claim)

### Slide 5c: Trust levels

- Headline: "You choose how much it does"
- Copy: "Three levels of trust, set per role. Observer: it watches and tells you what it sees. Co pilot: it drafts and you approve. Autopilot: it acts and reports back. You can also delegate specific contacts entirely. Say 'Handle Steve for me' and BitBit manages all communications, invoicing, and follow ups for Steve, then sends you a morning summary. Say 'Stop' and it stops instantly."
- Visual: a simple dial or slider graphic showing the spectrum
- Renamed "Infinite Delegation" to "full delegation" per Codex critique ("Infinite Delegation" sounds made up)
- This slide also serves as the liability answer: users control the autonomy dial. BitBit doesn't go rogue because the user sets the boundary.

### Slide 6: Team

*Council fix: Gemini said team should come before market size. Moved up from slide 10.*

- Two co founders, 50/50
- Torrin (technical founder): Solo built the full stack. Agent engine with confidence routing validated against 65 real and adversarial scenarios with no false positives in production. Multi channel bridge architecture with per user WhatsApp and iMessage instances. Memory Palace with seven knowledge types and confidence decay. 120+ migrations, 2,072 tests, 10 agent packages.
- Andy (operations and distribution): Runs All Webbed Up (marketing agency). First deployment. Agency network across AU as the distribution channel. Knows the customer because he is the customer.
- Framing: "One person who can build it. One person who can sell it."
- Scaling line per Sonnet critique: "The architecture is documented, tested, and built to hand off. Hiring a second engineer is one of the first things funding unlocks."
- Reframed "0% false positive" per Sonnet critique: "validated against 65 real and adversarial scenarios with no false positives in production" instead of a statistical claim.

### Slide 7: It's already working

*Council fix: Sonnet critical issue about co founder as only customer. Reframed.*

- Headline: "Built for real operations, tested by real work"
- Reframed per Sonnet critique: NOT a case study format with Andy quoted as external validation. Instead, framed as "we built this for ourselves and it works."
- What's live:
  - Full agency workflow running at All Webbed Up (10 agents)
  - Multi channel messaging across WhatsApp, iMessage, SMS, email, Slack
  - 2,072 tests, 120+ migrations, 15 engineering phases
  - Waitlist at bitbit.chat (include count if available)
- Video clip: real product interaction
- If any non founder beta users exist by deck time, include them. If not, don't fake external validation.

### Slide 8: How we make money and how we grow

*Council fix: combined business model + GTM per Codex/Gemini critiques about missing acquisition strategy and unclear gross margin.*

- Headline: "Per agent pricing. Agency network distribution."
- Pricing:
  - Trades bundle: 4 agents, ~$99/mo
  - Agency bundle: 10 agents, ~$499/mo
  - Enterprise: Tender Hunter, $1,000 to $2,000/mo
- Gross margin clarity per Codex critique: "Compute costs ~$150/mo for the full agency bundle. Before support and infrastructure, that's ~70% gross margin on the agency tier."
- GTM: "Andy's agency network is the distribution channel. Agencies sell to agencies. The first 10 customers come from Andy's direct network. After that, every deployment is a reference customer that sells the next one."
- Retention: "Once BitBit handles your operations, switching means doing everything yourself again."
- Research backing: AI agent workflows for SMBs show 85% margins at the $1,000/mo tier and 30 to 40% conversion from free audit to paid client (Digital Applied, 2026)

### Slide 9: Market

*Council fix: TAM now sourced. Competitor funding data used as validation alongside.*

- Headline: "The market exists and it's paying"
- TAM: Global SMB software market valued at $79.8B in 2026, growing to $151.7B by 2035 at 7.4% CAGR (Business Research Insights, March 2026). Alternative estimate: $187B in 2025 to $436B by 2035 at 8.8% CAGR (Market Research Future).
- SAM: Service businesses (agencies, trades, professional services) in English speaking markets. SMBs are 99% of all businesses globally, employing 70% of the workforce (OECD).
- SOM: AU/NZ agencies and trades, year one. Andy's agency network as initial distribution.
- Market validation: Sintra has 40,000+ users at $39 to $197/mo. Hynge has 2,374 users at $59 to $149/mo. Ambiguous has a16z backing. ai.work raised $10M seed. Maisa raised $30M seed. The willingness to pay is proven.
- Visual: concentric circles with sourced numbers

### Slide 10: The competition

- Headline: "Others are building chat interfaces. We built autonomous infrastructure."
- Per Gemini/Codex critique: replaced "Everyone's building the wrong thing" and "Nobody's built the foundation" with grounded language.
- Comparison table (shadcn table styling):

| | Channels | Memory | Invoicing | Autonomy | Price |
|---|---|---|---|---|---|
| Zo | SMS, Email, Telegram | Conversational recall | No | On/off | $18/mo |
| Hynge | Telegram, WhatsApp, Slack | Conversational recall | No | Draft only | $59 to $149/mo |
| Sintra | Chat only | Brand voice | No | No | $39 to $197/mo |
| Lindy | Email, Slack, Phone | Per agent | Via integrations | Per agent | $20 to $299/mo |
| Ambiguous | Email, Slack | Agentic memory | No | No | TBD (a16z) |
| BitBit | WhatsApp, iMessage, SMS, Email, Slack | Memory Palace: typed, scored, pattern detecting | Built in, autonomous | Observer / Co pilot / Autopilot | $99 to $499/mo |

- Punchline: "They draft. BitBit does."
- Source: `.omc/research/bitbit-competitive-intelligence-v2.md`

### Slide 11: What's next

*Council fix: all three flagged this as critical. Framework provided, founders fill specifics.*

- Headline: "What we're looking for"
- Framework (founders fill exact numbers):
  - Amount: $[X] to get to [milestone]
  - Use of funds: First engineering hire (reduce bus factor), beta program (5 to 10 agencies from Andy's network), infrastructure scale (bridge ops, compute)
  - 12 month milestone: [X] paying customers, $[X] MRR, second vertical (trades)
- Contact information
- Tone: invitation to a conversation, not a hard close

## What's built vs what's coming (engineering depth)

For investor conversations that go deep on technical capability:

### Shipped (7 phases)
- Production infrastructure across Vercel + Cloudflare Workers + Fly.io
- Live channel connectivity for 6 channels with OAuth, token refresh, dedup
- WhatsApp pipeline with voice transcription, multi turn context, approval flow
- Confidence routing: 4 layer cascade, validated against 65 scenarios, 0% false positives
- Invoice entity resolution with fuzzy matching and duplicate detection
- Dedicated WhatsApp bridge on Fly.io with persistent auth and health monitoring
- Integration hardening and tech debt cleanup

### In progress (4 phases, agents running 24/7)
- Engine flexibility: per entity overrides, LTV multipliers, auto delegated decisions
- Fiduciary memory: game theory margin protection, invisible to user
- Tool priority chain: model selects execution tier per task (API vs browser vs workspace vs human handoff), learns from reliability history
- Infinite delegation: per entity NL delegation, morning briefings, instant revocation

### Planned (4 phases)
- Async task infrastructure: durable execution surviving worker restarts, conversational control
- Multimodal web automation: autonomous browser control with Browserbase/Stagehand/CUA
- Ephemeral workspaces: runtime dev environments (Vercel Sandbox or E2B)
- Living Brain v2: write heavy consolidation architecture, 12x cost reduction, predictive coding engine, System 1/2 query gating, competitive context selection

## Video clip plan

Record short screen captures (5 to 8 seconds each, looping, no audio) of the real product:

| Slide | Clip | What it shows |
|---|---|---|
| 4 | Chat interface | BitBit responding, reasoning visible, real conversation |
| 5 | Connections grid | Tiles for services, some connected, dense |
| 6 | WhatsApp or messenger | A message coming in and being triaged, or an invoice created from chat |

Keep clips casual and real. Screen recordings, not polished demos. Polished looks like a prototype. Casual looks like production software.

## Technical implementation

- Standalone Next.js app or new route group in the existing personal assistant app
- Slide transitions via framer motion (already a dependency in the project)
- Styling: Tailwind CSS 4 + shadcn component patterns (matching existing design system)
- Video: MP4 clips, autoplay, muted, looping, lazy loaded
- Hosting: Vercel (existing infrastructure)
- Keyboard navigation: arrow keys to advance/retreat slides
- Location in repo: to be decided during planning (separate directory preferred to avoid coupling with the main app)

## Copy guidelines

All text in the deck must follow these rules:

1. No hyphens or emdashes
2. No AI vocabulary (delve, crucial, landscape, tapestry, foster, underscore, etc.)
3. No rule of three lists
4. No negative parallelisms ("not just X, it's Y")
5. No promotional language (vibrant, groundbreaking, stunning, breathtaking)
6. No vague attributions (experts say, industry reports suggest)
7. BitBit is always referred to as "it" (entity), never "the platform" or "the tool"
8. Vary sentence length. Short sentences. Then longer ones that take their time.
9. Be specific. "It knows Dave owes you money" beats "it provides business intelligence."
10. Have personality. The deck should sound like a person talking, not a press release.

## Research backing

Every major claim in the deck maps to sourced research:

| Deck claim | Source |
|---|---|
| "Meet your new COO" | Competitive research: no competitor claims COO role. Hynge uses "Chief of Staff" but lacks autonomy. |
| "$200k hire for $99/mo" | Enterprise agents charge $50K to $150K/yr for single functions (11x, Sierra). |
| "December 2025 changed everything" | Anthropic/Material survey (500+ leaders), PwC 2026, US Census BTOS, Gartner 2025 forecast. |
| SMB software TAM $79.8B | Business Research Insights, March 2026 report. Alternative: $187B (Market Research Future). |
| SMBs = 99% of businesses | OECD data, cited in Emergen Research 2025 report. |
| Memory Palace differentiation | Competitive analysis: no competitor has typed, scored, decaying memory with pattern detection. |
| "They draft. BitBit does." | Every competitor stops at output generation. BitBit acts in Autopilot/full delegation. |
| Confidence routing validated | 65 real and adversarial scenarios, no false positives in production. |
| 85% gross margin at scale | Digital Applied 2026 AI agent workflow analysis: $50 to $80 cost vs $500 to $1,000 price. |
| Agent adoption 36% to 57% | US Census Bureau BTOS data, cited in multiple 2026 SMB reports. |

## Investor Q&A prep

*Council critique identified these as questions the deck must be ready to answer. Not in the slides, but prepared for conversation.*

### "What happens when BitBit sends the wrong invoice?"
BitBit's autonomy spectrum is the answer. Users start at Observer (watch only) and graduate to Autopilot as trust builds. Confidence routing validates every autonomous action against a 4 layer cascade with risk appropriate thresholds (invoice actions require 0.92 confidence). Full audit trail on every action. Professional Liability / E&O insurance covers deploying organizations. The liability framework is clear: errors are the deployer's responsibility, but BitBit's architecture minimizes them by design. (Sources: Alera Group 2026, Clifford Chance 2026, MintMCP 2026)

### "Why won't OpenAI or Google just build this?"
They're building platforms, not products. Claude Managed Agents is infrastructure for developers. Google's agent efforts target enterprise IT. Neither is building a turnkey operations product for 5 person agencies and tradies. The same reason Stripe didn't kill Shopify: platforms enable products, they don't replace them. BitBit could run on Claude Managed Agents. The moat is domain expertise, not model access.

### "Is this a software business or a services business?"
Software. Per user infrastructure (bridge instances, Memory Palace) is automated. No manual onboarding, no custom implementation. The role engine is configured once per vertical (agency, trades, enterprise) and applies to all users in that vertical. Compare to Sintra (40,000 users, no human in the loop) or Hynge (2,374 users at $59 to $149/mo). Both are software businesses at lower price points with less depth.

### "What's the real gross margin?"
Agency bundle: $499/mo revenue. Compute: ~$150/mo (LLM inference + bridge hosting + embedding pipeline). Before support and infrastructure overhead, that's ~70% gross. At scale with the Living Brain v2 architecture (12x cost reduction target), compute drops to ~$40/mo, pushing gross margin toward 90%. Compare to SaaS benchmarks: best in class is 75 to 85%.

### "How do you acquire customers profitably at $99/mo?"
Andy's agency network is the wedge. Agencies sell to agencies. The first 10 customers come from direct outreach in Andy's network (zero CAC). After that, every deployment is a reference customer. Research shows 30 to 40% conversion from free operational audit to paid client in this segment (Digital Applied 2026). At $499/mo for agencies, payback period on even a $500 CAC is one month. The trades bundle at $99/mo scales through referral and word of mouth, not paid acquisition.

### "What's your retention story?"
Once BitBit handles your messaging triage, invoicing, and follow ups, switching means doing all of that yourself again. The Memory Palace compounds value over time: the longer you use it, the more it knows about your business. Churning means losing that accumulated knowledge. This is the same retention dynamic as a CRM, except BitBit also does the work the CRM records.

## Council critique log

Three AI models reviewed this spec on 2026-04-10. Key fixes applied:

| Issue | Raised by | Fix applied |
|---|---|---|
| Co founder as only customer | Sonnet (critical) | Reframed slide 7 as "built for real operations" not case study |
| Market sizing unvalidated | Sonnet (critical), Codex | Sourced: $79.8B SMB software TAM (BRI 2026) |
| Slide 11 empty | Sonnet (major), Codex | Framework provided with amount/use/milestone structure |
| 0% false positive overclaim | Sonnet (major), Gemini (critical) | Reframed to "no false positives in production" |
| No GTM plan | Gemini (critical), Codex (critical) | Added to slide 8: Andy's network, agency to agency |
| Slide 5 too dense | Gemini (critical), Codex (major) | Split into 5a (connections), 5b (memory), 5c (trust) |
| No "why now" | Codex (major) | Added slide 3 with sourced adoption data |
| "Infinite Delegation" sounds made up | Codex (major) | Renamed to "full delegation" |
| Arrogant competitive claims | Gemini, Codex | Replaced with grounded language |
| Bus factor risk | Sonnet (major) | Added scaling line to team slide |
| Composio dependency | Sonnet (major) | Lead with native bridges, not integration count |
| Gross margin unclear | Codex (critical) | Added margin breakdown to slide 8 |
| Liability question | Gemini (critical) | Prepared Q&A answer with sourced legal context |
| Missing retention story | Codex | Added Q&A answer with Memory Palace compounding |

## Open items

- [ ] Slide 11: founders fill exact raise amount, milestone, and timeline
- [ ] Video clips need to be recorded from the live product
- [ ] Waitlist count at bitbit.chat: include if meaningful
- [ ] Decide repo location for the presentation (route in main app vs separate directory)
- [ ] Composio integration count: confirm exact number for slide 5a
- [ ] Any non founder beta users or interest signals to add to slide 7
