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
- Grounded in the competitive research from `.omc/research/bitbit-market-analysis.md`.

## Tagline strategy

| Location | Tagline | Purpose |
|---|---|---|
| Cover (slide 1) | "Meet your new COO" | Introduces BitBit as an entity with a role. Four words. Memorable. |
| Product intro (slide 4) | "A COO costs $200k a year. BitBit costs $99 a month." | Lindy style cost comparison. Lands after they understand the product. |
| Competitive punchline (slide 9) | "They automate tasks. BitBit runs your business." | Positions against Zapier/Lindy in one sentence. |
| Throughout | Specific awareness lines like "It already knows who Dave is" | Shows the Context Baseplate moat through concrete examples. |

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
  - Bottom right (turnkey + multi function): BitBit, alone in the quadrant
- Copy: "Horizontal platforms make you build your own agent from scratch. Vertical tools handle one job. Nobody ships something that just handles your business. All of it. Without setup."
- Source: competitive research validated this gap across 13 competitors

### Slide 4: Meet BitBit

- Headline: "BitBit is the one who handles everything"
- Copy: "Every user gets their own BitBit. It reads your messages, manages your invoices, triages your communications, follows up with your clients. It knows who Dave is, that he owes you money, and that he mentioned Steve's project last Tuesday. It connects everything and it remembers everything. You can message it from WhatsApp while you're on a job site. You can ignore it and let it handle things. It tells you what it did, not what it's about to do."
- Subline: "A COO costs $200k a year. BitBit costs $99 a month."
- Video clip: chat interface with BitBit responding in real time
- Note: copy adapted from product.md, which already captures the entity voice naturally

### Slide 5: How BitBit thinks

Three panels framed as traits, not architecture:

**It connects to everything.**
200+ services through one screen. Email, WhatsApp, iMessage, Xero, Calendar, Slack, and hundreds more via Composio. Click to connect.
Video clip: connections grid with tiles.

**It builds context on its own.**
BitBit does its thinking when information arrives, not when you ask. It maps people, relationships, patterns, and active threads before you need them.

**You choose how much it does.**
Observer: it watches and tells you what it sees. Co pilot: it drafts and you approve. Autopilot: it acts and reports back. Per role, your call.

### Slide 6: It's already working

- Headline: "Built and running with a real agency"
- Case study: All Webbed Up, marketing agency, AU
  - 10 agents deployed across the full agency workflow
  - Andy (co founder): "This thing can be sold to a marketing agency worldwide and they'd probably jump at it."
- Video clip: a real interaction (WhatsApp triage or invoice from chat)
- Proof points:
  - Multi channel messaging live across WhatsApp, iMessage, SMS, email, Slack
  - 2,072 tests across 768 suites
  - 120 database migrations
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
- **Action required:** market sizing numbers need primary source validation before presenting. These are directional estimates from the competitive research, not cited figures.

### Slide 9: The landscape

- Headline: "We mapped every player. Nobody's here."
- Comparison table (shadcn table styling):

| | Messaging | Invoicing | Triage | Autonomy | Turnkey | Price |
|---|---|---|---|---|---|---|
| Zapier | Via zaps | Via zaps | Rules based | Low | Yes | $20/mo |
| Lindy.ai | Email, Slack, Phone | Via integrations | Agent handoff | Medium | Partial | $50/mo |
| OpenClaw | All (DIY) | Community built | Manual | High | No | Free + infra |
| 11x | Outbound only | No | No | High | Yes | $50K/yr |
| BitBit | All channels, native | Built in | AI driven | Configurable | Yes | $99 to $499/mo |

- Punchline: "They automate tasks. BitBit runs your business."
- Source: full competitive analysis in `.omc/research/bitbit-market-analysis.md`

### Slide 10: Team

- Two co founders, 50/50
- Torrin (technical founder): Solo built the full stack. Agent engine, multi channel bridge architecture, 120 migrations, 2,072 tests, 10 agent packages.
- Andy (operations and distribution): Runs All Webbed Up. First deployment, agency network for expansion. Knows the customer because he is the customer.
- Framing: "One person who can build it. One person who can sell it."

### Slide 11: What's next

- Headline: "What we're looking for"
- What funding unlocks (3 to 4 bullets, content TBD by founders)
- Key milestones ahead
- Contact information
- Soft close, not a formal ask

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
| "Meet your new COO" | No competitor claims the COO role. Validated empty niche. |
| "$200k hire for $99/mo" | Enterprise agents charge $50k to $150k/yr for single functions |
| Empty quadrant in 2x2 matrix | 13 competitors mapped, none in turnkey + multi function |
| "It already knows who Dave is" | No competitor has persistent cross channel context (Context Baseplate) |
| "They automate tasks. BitBit runs your business." | Zapier/Lindy are horizontal, 11x/Sierra are single function |
| 200+ connections | Composio integration provides broad service coverage |

## Open items

- [ ] Market sizing (slide 8) needs primary source validation
- [ ] Slide 11 content (what we're looking for, milestones) needs founder input
- [ ] Video clips need to be recorded from the live product
- [ ] Decide repo location for the presentation (route in main app vs separate directory)
- [ ] Composio integration count: confirm exact number of available services
