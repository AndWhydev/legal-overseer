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

## Slide by slide spec

### Slide 1: Cover

- BitBit logo, monochrome, centered
- Tagline: "Meet your new COO"
- Light background, clean type, nothing else
- Sets the tone: this is about meeting someone, not buying something

### Slide 2: The problem

- Headline: "You're doing two jobs"
- Copy: "You started a business to do work you're good at. Instead you spend half your day switching between apps, chasing invoices, and forwarding messages to the right person. Every service is its own silo. Nobody connects them. Nobody remembers the context. So you do it yourself."
- Visual: scattered app icons (Gmail, WhatsApp, Xero, Calendar, Slack, CRM), disconnected, slightly faded. The mess.

### Slide 3: The gap

- Headline: "Everyone's building the wrong thing"
- Visual: 2x2 matrix
  - X axis: Single function to Multi function
  - Y axis: Assemble it yourself to Works out of the box
  - Top right (DIY + multi function): OpenClaw, n8n
  - Bottom left (turnkey + single function): 11x (sales), Sierra (support), Devin (code)
  - Bottom right (turnkey + multi function): BitBit. Competitors arriving but surface level.
- Copy: "Horizontal platforms make you build your own agent from scratch. Vertical tools handle one job. A few new players are showing up in the middle. They're chat wrappers with names. BitBit is the one with infrastructure."
- Source: competitive research validated this across 13+ competitors including Zo, Hynge, Sintra, Ambiguous

### Slide 4: Meet BitBit

- Headline: "BitBit is the one who handles everything"
- Copy: "Every user gets their own BitBit. It reads your messages, manages your invoices, triages your communications, follows up with your clients. It knows who Dave is, that he owes you money, and that he mentioned Steve's project last Tuesday. It connects everything and it remembers everything. You can message it from WhatsApp while you're on a job site. You can ignore it and let it handle things. It tells you what it did, not what it's about to do."
- Subline: "A COO costs $200k a year. BitBit costs $99 a month."
- Video clip: chat interface with BitBit responding in real time
- Note: copy adapted from product.md, which already captures the entity voice naturally

### Slide 5: How BitBit thinks

Three panels framed as traits, not architecture:

**It connects to everything.**
200+ services through one screen. Email, WhatsApp, iMessage, Xero, Calendar, Slack, and hundreds more via Composio. Click to connect. WhatsApp voice notes get transcribed automatically. You say "invoice him" and it knows who you mean from the conversation.
Video clip: connections grid with tiles.

**It remembers everything and keeps getting smarter.**
BitBit's Memory Palace stores seven types of business knowledge: conversations, decisions, patterns, facts, relationships, pricing history, and learned conventions. It scores confidence on everything it learns. Memories that aren't corroborated fade over time. Ones that get confirmed grow stronger. It detects behavioral patterns across your contacts automatically. Late payers. Scope creep. Communication gaps. You can ask it "Why did we stop working with TechCorp?" and it reconstructs the full timeline from real data. Ask "What did we charge for the last 3 WordPress builds?" and it cross references invoices with project types and contacts. It also watches your margins. If it notices two projects had scope creep that wasn't invoiced, it tells you before doing more work for that client.
No other AI assistant does this. They remember what you said. BitBit understands how your business works.

**You choose how much it does.**
Three levels of trust, set per role. Observer: it watches and tells you what it sees. Co pilot: it drafts and you approve. Autopilot: it acts and reports back. And for entities you fully trust it with, you can say "Take Steve off my hands." BitBit then handles all communications, invoicing, and follow ups for Steve autonomously and sends you a morning briefing of what it did. Say "Stop managing Steve" and it stops instantly.

### Slide 6: It's already working

- Headline: "Built and running with a real agency"
- Case study: All Webbed Up, marketing agency, AU
  - 10 agents deployed across the full agency workflow
  - Andy (co founder): "This thing can be sold to a marketing agency worldwide and they'd probably jump at it."
- Video clip: a real interaction (WhatsApp triage or invoice from chat)
- Proof points:
  - Multi channel messaging live across WhatsApp, iMessage, SMS, email, Slack
  - 2,072 tests across 768 suites
  - 120+ database migrations
  - Confidence routing validated against 65 scenarios including adversarial inputs, 0% false positive rate
  - Waitlist collecting signups at bitbit.chat

### Slide 7: How we make money

- Headline: "Per agent pricing. Predictable revenue."
- Three tiers:
  - Trades bundle: 4 agents, ~$99/mo
  - Agency bundle: 10 agents, ~$499/mo
  - Enterprise: Tender Hunter, $1,000 to $2,000/mo
- Copy: "Compute costs around $150/mo for the full agency bundle. Once BitBit handles your operations, switching means doing everything yourself again."

### Slide 8: Market size

- TAM: Global SMB operations and admin software, $50B+ annually
- SAM: Service businesses (agencies, trades, professional services) in English speaking markets
- SOM: AU/NZ agencies and trades, year one
- Visual: concentric circles narrowing down
- Market validation callout: Sintra has 40,000+ users paying $39 to $197/mo for AI that can't send an email autonomously. Hynge has 2,374 users paying $59 to $149/mo for AI that drafts but doesn't act. Ambiguous has a16z backing. ai.work raised $10M seed. Maisa raised $30M seed. The willingness to pay is proven. The technology depth is not.
- **Action required:** TAM/SAM/SOM numbers need primary source validation before presenting.

### Slide 9: The competition

- Headline: "Everyone's arriving. Nobody's built the foundation."
- Comparison table (shadcn table styling):

| | Channels | Memory | Invoicing | Autonomy | Price |
|---|---|---|---|---|---|
| Zo | SMS, Email, Telegram | Conversational recall | No | On/off | $18/mo |
| Hynge | Telegram, WhatsApp, Slack | Conversational recall | No | Draft only | $59 to $149/mo |
| Sintra | Chat only | Brand voice | No | No | $39 to $197/mo |
| Lindy | Email, Slack, Phone | Per agent | Via integrations | Per agent | $20 to $299/mo |
| Ambiguous | Email, Slack | Agentic memory | No | No | TBD (a16z) |
| BitBit | WhatsApp, iMessage, SMS, Email, Slack | Memory Palace: typed, scored, decaying, pattern detecting, margin protecting | Built in, autonomous, fiduciary aware | Observer to Co pilot to Autopilot to Infinite Delegation | $99 to $499/mo |

- Punchline: "They draft. BitBit does."
- Source: `.omc/research/bitbit-competitive-intelligence-v2.md`

### Slide 10: Team

- Two co founders, 50/50
- Torrin (technical founder): Solo built the full stack. Agent engine with confidence routing validated against 65 scenarios. Multi channel bridge architecture with per user WhatsApp and iMessage instances. Memory Palace with seven knowledge types and confidence decay. 120+ migrations, 2,072 tests, 10 agent packages. 15 engineering phases shipped or in progress.
- Andy (operations and distribution): Runs All Webbed Up. First deployment, agency network for expansion. Knows the customer because he is the customer.
- Framing: "One person who can build it. One person who can sell it."

### Slide 11: What's next

- Headline: "What we're looking for"
- What funding unlocks (3 to 4 bullets, content TBD by founders)
- Key milestones ahead
- Contact information
- Soft close, not a formal ask

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

Every major claim in the deck maps to the competitive analysis:

| Deck claim | Research evidence |
|---|---|
| "Meet your new COO" | No competitor claims the COO role. Hynge uses "Chief of Staff" but lacks autonomy. |
| "$200k hire for $99/mo" | Enterprise agents charge $50k to $150k/yr for single functions |
| "Everyone's arriving. Nobody's built the foundation." | 13+ competitors mapped. Zo, Hynge, Sintra, Ambiguous all entering. All surface level. |
| Memory Palace | No competitor has typed, scored, decaying memory with pattern detection and pricing intelligence |
| "They draft. BitBit does." | Every competitor stops at generating output. BitBit acts autonomously in Autopilot/Infinite Delegation. |
| Fiduciary constraints | No competitor evaluates whether actions serve the user's financial interest |
| Confidence routing validated | No competitor publishes validation data for autonomy decisions. BitBit: 65 scenarios, 0% false positives. |
| 200+ connections | Composio integration provides broad service coverage |

## Open items

- [ ] Market sizing (slide 8) needs primary source validation
- [ ] Slide 11 content (what we're looking for, milestones) needs founder input
- [ ] Video clips need to be recorded from the live product
- [ ] Decide repo location for the presentation (route in main app vs separate directory)
- [ ] Composio integration count: confirm exact number of available services
