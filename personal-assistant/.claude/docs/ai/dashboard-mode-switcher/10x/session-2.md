# 10x Analysis: Dashboard Mode Switcher (Post-Ship)

Session 2 | Date: 2026-04-25 | Status: PR #93 merged · flag `BITBIT_DASHBOARD_MODES` off in prod

## Current Value (post-ship reality)

The mode switcher is shipped. What's actually in the codebase now is more interesting than the UX it produced:

- `currentMode: 'chat' | 'inbox' | 'work' | 'money'` flows end-to-end: UI store → `chat-interface.tsx:820` → `/api/agent/chat/route.ts:46` → `taor-loop.ts:402` → system prompt + retrieval bias.
- `mode-personas.ts` is a typed registry of four personas. Each carries: `systemPromptFragment`, `toneDirectives`, `retrievalBias.namespaces`, `retrievalBias.weight`, `suggestedTools`. It's a fully-extensible context pack.
- `MODE_TO_VARIANT` (`spa-shell.tsx:53`) is an exhaustive `Record<Mode, SidebarVariant>` — the type system now requires that every mode commit to its own canvas. Adding a 5th mode is a one-line change with full compile-time enforcement.
- `ModeActionCard` carries `targetMode | targetPageId | selectionId` and teleports on click. Agent → mode-jump is a real wire.
- Per-mode state persists in localStorage (`bitbit-mode-state`, debounced 500ms).

The shipped artifact is *not* a navigation refactor. It's a **runtime context primitive** with a UI rendering. Session 1 predicted this; session 2 is about what to build *on top of it* now that it exists.

## The Question

> "What can we build *because* mode is a runtime primitive, that we couldn't build with pages alone?"

Filter: anything you could ship to a flat-page UI doesn't qualify. We're hunting for things that are only possible because mode is now a first-class context signal carried into the agent, the retrieval layer, the action cards, and the sidebar contract.

---

## Massive Opportunities

### 1. Modes as SKUs (Bundled Pricing Surface)

**What**: Each mode becomes an independently-purchasable product tier. `BitBit Inbox` ($9/mo, just triage), `BitBit Money` ($19/mo, finance only), `BitBit Work` ($29/mo, work mgmt), `BitBit Chat` (free, conversational only), `BitBit Pro` ($49/mo, all four). Modes are already gated by `BITBIT_DASHBOARD_MODES`; extending to a per-mode entitlement check is a `Record<Mode, boolean>` from billing. Locked modes show a paywall card in the canvas instead of disappearing — preserves discoverability.

**Why 10x**: Today BitBit is one $X/mo product. After this, it's four products that share infrastructure but have independent pricing power, conversion funnels, and unit economics. Every comparison to a competitor becomes "vs. just *that* mode of BitBit." Money mode competes with Bonsai/QuickBooks-light at $19. Inbox mode competes with Superhuman at $9. Work mode competes with Linear at $29. None of them compete with all of BitBit at $49 — that's our position.

**Unlocks**:
- Lower-friction first purchase ($9 Inbox vs. $49 Pro)
- Land-and-expand revenue motion (start with Money, upsell to Work after invoice → task workflow lands)
- Seat-based vs. usage-based pricing per mode (Inbox per-mailbox, Money per-invoice, Work per-seat)
- Free tier = Chat mode (always free) → conversion is "unlock other modes" not "upgrade your plan"
- Discount-code trials map to per-mode unlocks (matches the open-signup decision in `onboarding-v2-decisions-2026-04-16`)

**Effort**: Medium. Need: per-mode entitlement table in Postgres, paywall component, Stripe products × 4 modes, mode-locked state in `mode-store`. Two-week scope.

**Risk**: Fragmenting positioning. Mitigation: lead marketing with Pro, list per-mode SKUs as entry points.

**Score**: Must do — this is the clearest revenue-side 10x the primitive enables.

---

### 2. Per-Mode Specialized Models (Cost + Quality Routing)

**What**: Use `currentMode` in `taor-loop.ts:402` not just to pick a persona but to pick the *model*. Inbox mode → Haiku 4.5 (cheap, fast, triage doesn't need depth). Money mode → Opus 4.7 with extended thinking (high-stakes, numerical reasoning matters). Work mode → Sonnet 4.6 (balanced planning). Chat mode → Sonnet 4.6 default. Same orchestration, different brains per context.

**Why 10x**: Two compounding wins from one primitive — Inbox costs 12× less per call (Haiku vs. Opus), Money gets ~30% better numeric reasoning (verified Opus extended-thinking advantage). Across a typical user mix (60% Inbox, 20% Chat, 15% Work, 5% Money) this is plausibly a **40–60% reduction in agent COGS** with a **quality bump in the highest-stakes mode**. Mode is already the disambiguation signal — we're just letting the cost-router consume it.

**Unlocks**:
- COGS reduction directly funds the SKU pricing in #1 (Inbox at $9 is plausible because Haiku makes it cheap)
- Mode-specific eval: "Money mode acceptance is 92%, Inbox is 78%" → discrete optimization targets
- Mode-specific fine-tuning eventually (per-mode datasets emerge from real usage)
- Per-mode latency SLAs (Inbox can promise <500ms, Money can take 5s)

**Effort**: Low. The model picker is one switch in the engine; `mode-personas.ts` already has the right shape — add a `model` field. Half-day implementation, two weeks of measurement before tuning.

**Risk**: User asks an Inbox-mode question that needs Opus reasoning. Mitigation: agent self-escalates ("this needs deeper analysis, switching to extended-thinking"). Mode is a prior, not a wall — same rule as `mode-personas.ts:8`.

**Score**: Must do — high-leverage and low-effort.

---

### 3. Two-Layer Memory: Unified AGI Brain + Mode-Scoped Lenses

**What**: One brain, two access policies. Every memory still writes to a single unified personal store — never partitioned. What changes is *who reads what*:

- **Personal AGI layer (you, the user)**: Always reads the unified brain across all modes. Whether you're chatting via the dashboard, Telegram, WhatsApp, iMessage, SMS, or voice — the assistant has full cross-domain comprehension. Inbox patterns inform Money advice, Money cash-flow informs Work prioritization, Chat history threads through everything. This is the BitBit you correspond with as your operator.
- **Mode-scoped agent layer (shared/delegated contexts)**: When a session is *delegated* (#4 — accountant in Money mode, assistant in Inbox), the agent sees only memories tagged with the shared mode + retrieval bias from `mode-personas.ts:60-99`. Compartmentalization is an *access lens*, not a storage partition.

So memories carry a `mode` tag (write-time), but the tag is consumed only by scoped sessions. The personal AGI layer ignores it.

**Why 10x**: Resolves the tension between privacy/delegation (real moat) and comprehension (real product magic). You don't trade one for the other — you get both because the compartmentalization is a *view*, not a wall.

1. **AGI comprehension preserved**: Your assistant in iMessage knows your invoices *and* your inbox *and* your tasks. Cross-domain insight is what makes it feel intelligent — never sacrifice it for the personal layer.
2. **Privacy moat for sharing**: When the accountant logs in (delegation token, scoped to Money mode), they see Money-tagged memories only. "Delete my Money mode" still works as a one-click button — but for *delegations*, not for the user's personal brain.
3. **Retrieval quality where it matters**: The mode-bias in `getRetrievalBias` becomes the *ranking* signal for the personal AGI (Money mode in dashboard → Money memories rank higher) and the *filter* signal for delegations (accountant only ever sees Money). Same data, two consumers.
4. **Cross-channel correspondence**: Your Telegram/WhatsApp/iMessage/SMS conversations all hit the same personal AGI layer. The assistant remembers what you said in Chat mode last week when you ask about an invoice via SMS today. No mode-channel binding — channel is transport, mode is dashboard context, brain is unified.

**Unlocks**:
- Personal AGI experience (full-context assistant) is the *default* for the user
- Delegation surfaces (#4) get a clean, defensible privacy story without diluting the user-facing intelligence
- Per-mode retention only applies to *delegated views* and *audit trails* — your personal memory is yours to keep forever
- EU AI Act Art 14 / 7-yr retention satisfied at the *delegation* layer where regulated parties exist; the personal layer is your own data
- Patent claim sharpens: "Method for context-routed agent runtime where the same memory store serves both an unscoped personal-AGI layer and mode-scoped delegated agent layers via metadata-tagged access policies." More novel than simple compartmentalization.

**Effort**: Medium. Memory writes already happen — adding a `mode` metadata field is trivial. The architectural piece is the *access policy layer*: a thin shim that decides "this session is personal-AGI → unfiltered" vs. "this session is delegated → mode-filter." That's where the work is.

**Risk**: Inconsistent mode tagging on writes (heuristics required when the write source isn't a clear mode). Mitigation: untagged memories are visible to the personal AGI always, and to delegations only via explicit opt-in. Default-private for delegations.

**Score**: Must do — this is the architecture that makes both the AGI experience and the sharing moat work simultaneously.

---

### 4. Mode-Scoped Sharing & Delegation (Multiplayer on One Brain)

**What**: Each mode becomes a shareable unit with independent permissions. Share Money mode with your accountant (read-only, scoped to invoices/payments). Share Work mode with a virtual assistant (full delegation). Share Inbox with a coworker for vacation coverage. The sharing surface is *the mode* — its sidebar, canvas, agent persona, and memory namespace.

The Tenancy Model C (dual-tier personal + org) is already built. RLS already exists. Mode adds the per-domain granularity the org tier was missing.

**Why 10x**: Today BitBit is solo-ops software. After this, it's a multiplayer ops platform without redesigning auth, RLS, or the agent runtime. The mode is the sharing perimeter; the existing org/personal split is the macro frame; everything else is unchanged. Notion does this with pages. Linear does it with workspaces. Nobody has done it with *agent personas + memory + tools* as a unit — because nobody has the primitive.

**Unlocks**:
- Pricing: share-per-seat is mode-scoped (delegate Money mode to accountant: $5/mo seat). Multiplies seat-revenue without complicating the per-user UX.
- Asymmetric trust: "Andy can read my Inbox mode but not draft." Per-mode autonomy levels (session 1 #4) become per-collaborator.
- Activation via delegation: power user shares Inbox with assistant → assistant becomes a paid user → viral expansion.
- Compliance: "show my accountant only finance data, no chat history" — provable via mode-compartmentalized memory (#3).

**Effort**: Medium. RLS extension + share-link UI + scoped agent context (drop non-Money tools when collaborator session is in Money mode).

**Risk**: Permissions complexity. Mitigation: ship view-only first; full delegation later.

**Score**: Must do — turns BitBit from solo tool into a network platform.

---

### 5. Modes as MCP Servers (BitBit-as-Platform)

**What**: Expose each mode as a public MCP server that other AI clients can call. `bitbit-money.mcp.bitbit.chat` exposes Money-mode tools (`generate_invoice`, `list_invoices`, `search_clients`). `bitbit-inbox.mcp.bitbit.chat` exposes Inbox tools. Cursor, Claude Code, ChatGPT desktop, custom agents — anyone with MCP support can mount BitBit's mode-shaped capabilities.

Mode is *already* the right unit because `mode-personas.ts` already defines `suggestedTools` per mode. The MCP server per mode is just that tool list re-exposed with auth.

**Why 10x**: Distribution flip. Today BitBit owns the UI. After MCP, BitBit owns the *capability* that lives in every AI workflow. A developer using Cursor for code can ask BitBit Money "what's my MRR?" without leaving Cursor. The mode is the interface contract; the dashboard is one of *many* clients. This is the move from "app" → "infrastructure".

This also matches one of the Daniel advisor directives: composable AI capability you can rent.

**Unlocks**:
- Cursor/Claude Code/Continue users discover BitBit as a tool, not an app
- Per-mode MCP = per-mode pricing for API access ("Money MCP $0.10/call")
- BitBit becomes embeddable in third-party agentic workflows
- Mode boundaries make rate limits / billing trivially scoped

**Effort**: Medium. MCP servers are thin. The auth layer (org/personal tenancy + per-mode entitlement from #1) is the real work — but #1 already requires that.

**Risk**: Cannibalizes the dashboard. Counter-argument: the dashboard is for end users, MCP is for developers — different markets. Same backend.

**Score**: Strong — biggest moat play on this list. Defer to Q3 if #1–#4 take all bandwidth.

---

### 6. Cross-Mode Workflows (Mode Recipes)

**What**: A user-authorable (or AI-suggested) recipe spans modes. Example: "When invoice email arrives in Inbox → log in Money → create follow-up task in Work." Each step happens in its native mode using that mode's tools and persona. The recipe engine is a state machine over mode transitions; `ModeActionCard.targetMode` is already the atomic primitive.

**Why 10x**: This is "Zapier inside BitBit" but mode-shaped, which makes the recipes legible and debuggable. A flat-UI competitor can't articulate the steps because they have no domain boundaries. Here, every step is "do X in mode Y" — the user can reason about it.

**Unlocks**:
- Recipe marketplace (community-shared, mode-typed)
- Per-recipe pricing (premium recipes for power users)
- Compounding usage (each recipe runs N times/week, multiplies token spend per user — good for usage-based pricing in #1)
- Self-improving via real run logs (which recipes have high acceptance, which fail)
- "Shared recipe": team uses the same mode pipeline → multi-user activation (#4)

**Effort**: Medium-High. Recipe storage schema, runner, UI builder, per-step audit log. Punt the visual builder, ship YAML recipes first for power users.

**Risk**: Complexity creep. Mitigation: ship 5 hardcoded recipes first ("invoice → log → task" being one), measure usage, then open authoring.

**Score**: Strong — exact pattern Tor/Andy/Maya/Steve will use daily.

---

## Medium Opportunities

### 7. Mode-Aware Daily Briefings (Push Digest)

**What**: 8am daily push: "Inbox: 4 needing reply. Money: 2 invoices overdue ($4.5K). Work: 3 tasks due today, 1 blocker. Tap a line to enter that mode focused on the items." Currently, Phase 51 has streaming iMessage and `connector_last_activity`; this becomes the digest source.

**Why powerful**: This is the killer reason a personal-AI exists — to tell you what matters before you ask. Mode-shaped digest is **legible** ("4 inbox + $4.5K money + 3 work" is parseable) where a flat digest is mush. Each digest line is a deep-link.

**Effort**: Low-Medium. Cron job per-user querying mode-scoped counts (already partial via Phase 45 brain consolidation). Push via existing notification infra. iMessage delivery via Phase 51 outbound guard.

**Score**: Must do.

---

### 8. Mode Auto-Switch (Predictive UX)

**What**: Calendar/clock/event signals trigger mode pre-selection. Calendar event "Client Call - Acme" starting in 5min → soft-suggest Work mode with the project pre-filtered. 9am on weekdays (Tor's pattern) → land on Inbox. Invoice notification arrives → suggest Money mode. Predictive priors over Tor's actual usage data already collected.

**Why powerful**: Anticipatory UX. The product moves before the user asks. Combined with the brain consolidation cron, this is a clear AI-first competitive advantage over flat-UI tools.

**Effort**: Medium. Need a per-user mode-usage time-series + a simple prior model. Half a phase.

**Score**: Strong.

---

### 9. Per-Mode Voice Personas (ElevenLabs Mapping)

**What**: The voice-pill in `voice-pill.tsx` already exists with mode-aware placeholders. Extend it: each mode gets a distinct synthesis voice. Money formal/precise. Chat warm/conversational. Inbox terse/professional. Work directive/action-forward. Same `toneDirectives` from `mode-personas.ts:58-95` already documents this — voice matching is just rendering it.

**Why powerful**: Reinforces mode as a felt identity. Voice-first users (ambient/in-car) get mode-distinguishing audio without looking at the screen. Multimodal mode signaling.

**Effort**: Low. Map mode → ElevenLabs voice ID. Already have voice-feedback hook.

**Score**: Strong.

---

### 10. Per-Mode Notification Policies

**What**: Each mode has its own notification rules. Mute Money during weekends. Real-time Inbox. Daily digest for Work. Quiet hours per mode. The `connector_last_activity` view already tracks freshness; notification rules are downstream.

**Why powerful**: Fine-grained focus. Today BitBit is either chatty or silent globally. Mode-shaped notifications = users can be deeply notified about Inbox while completely silent on Money.

**Effort**: Medium. Notification policy table + UI + worker. Half a phase.

**Score**: Strong.

---

### 11. Per-Mode Onboarding Funnels

**What**: First-run picks a *starting mode*, not a flat tour. Money-first user → connect Stripe/QuickBooks first, see invoices populate, draft first invoice in 5min. Inbox-first user → connect Gmail, see triage queue. Different first-day metrics per mode. The Phase 51 onboarding-reorder decision (email/knowledge first → triggers crawl, chat-surface last) is mode-shapeable now.

**Why powerful**: Activation = one mode that works perfectly. Today the pitch is "connect everything"; with mode-onboarding, the pitch is "pick your superpower."

**Effort**: Medium. Onboarding flow per mode + landing page per mode (also feeds #16).

**Score**: Strong.

---

### 12. Per-Mode Eval Datasets & Continuous Tuning

**What**: Real user interactions auto-bucket into per-mode eval sets. Money mode answers get judged against numeric-precision rubrics. Inbox against decision-quality rubrics. Work against deadline-awareness. Each mode evolves independently. Mode-scoped LangSmith/Helicone traces.

**Why powerful**: Model improvement becomes mode-scoped, which makes it measurable. "Money mode acceptance went from 78% to 92% after the prompt change" is a real metric. Without mode bounds this is statistical mush.

**Effort**: Medium. Eval pipeline that filters by mode tag + per-mode rubrics.

**Score**: Strong (enables #2's quality narrative).

---

## Small Gems

### 13. Mode Badge in Browser Tab + Favicon
Tab title: `Inbox · BitBit (3)`. Favicon shifts to mode color (subtle dot). Glanceable across all browser tabs. Effort: Very Low. Score: Must do.

### 14. Mode History (Cmd+Shift+1–4)
Cmd+Shift+M restores Money's previous selection (last invoice viewed, scroll position). Per-mode breadcrumb stack of size 5. Effort: Low. Score: Strong.

### 15. Per-Mode Drafts (Resume-Where-You-Left)
Auto-save in-progress invoice (Money), task creation (Work), reply draft (Inbox). Persist per `(userId, mode, draftType)`. Switch modes without losing flow. Effort: Low. Score: Must do.

### 16. Mode-Shaped Marketing Site / SEO Surfaces
`bitbit.chat/inbox`, `/money`, `/work`, `/chat` — four landing pages with mode-specific positioning, integrations callout, demo. SEO surface area × 4. Each page targets the corresponding competitor (vs Superhuman, vs Bonsai, vs Linear). Already doable post-#1. Effort: Medium (marketing). Score: Strong.

### 17. Cross-Mode "Send to" Right-Click Actions
In Inbox, right-click email → "Send to Work as task" → creates task with email link. Right-click invoice mention → "Send to Money as draft." Modes communicate via the existing `ModeActionCard.targetMode` machinery. Effort: Low. Score: Strong.

### 18. Mode Time Tracking (Self-Awareness Dashboard)
"You spent 2h in Work today, 30m in Money, 15m in Inbox." Shown weekly in `/dev` style report. Reflective, not creepy. Effort: Low. Score: Maybe.

### 19. Mode-Specific Cmd+K Recent Actions
Cmd+K already mode-scoped. Show recent 5 actions per mode at top of palette. Effort: Very Low. Score: Strong.

### 20. Mode-Shaped Mobile Navigation
The mobile/ dir exists. Bottom-tab nav = 4 modes, perfect parity with web. Architecture-aligned, reduces cognitive translation across devices. Effort: Medium (mobile build). Score: Strong (when mobile ships).

---

## Strategic / Compounding

### 21. Mode = Patent Surface
The Daniel advisor directive (`daniel-advisor-meeting-2026-04-15`) called out patents-as-moat. The mode primitive is patentable as **"Method for context-routed agent runtime where domain-mode signals modulate persona, retrieval, tools, and memory namespace simultaneously."** This is *not* obvious — competitors have either (a) personas without retrieval bias, (b) projects without persona, or (c) routing without memory compartmentalization. The combination is novel. File before competitors notice.

### 22. Mode = Marketing Ontology
"BitBit organizes your AI life into 4 modes" is the simplest possible positioning. Easier to explain than "general AI assistant." Each mode = a comparable product to a specific competitor. The two-product split (Bit/BitBit) discussed with Daniel maps cleanly: Bit = Chat mode standalone (free, viral), BitBit = the four-mode operator suite (paid). Mode is the unit of brand.

### 23. Mode = Compounding Memory Asset (Unified, Mode-Tagged)
With #3 (two-layer memory), the unified personal brain accumulates everything tagged by mode. After a year, your BitBit knows your clients, payment patterns, recurring expenses, tax categories, message rhythms, project history, and how all of those interconnect — full cross-domain intelligence the personal AGI layer reads in any conversation (dashboard, Telegram, WhatsApp, iMessage, SMS). Switching cost = leaving the unified brain entirely (high). The mode tags also let any *delegated* surface get a clean slice without leaking the rest. Best of both: maximum lock-in via comprehension, surgical privacy via tagging.

### 24. Mode = Eval Moat
The `currentMode` signal lets BitBit run **per-mode model competitions** continuously. A/B test Haiku vs. Sonnet on Inbox; A/B test Opus vs. extended-thinking on Money. Whichever wins becomes the Inbox/Money model. Mode bounds make these tests sharp. Over time, BitBit runs a model-performance benchmark inside production usage that competitors cannot replicate without their own mode primitive.

---

## Recommended Priority

### Do Now (next 2 weeks, ride the post-ship momentum)
1. **Per-mode model routing** (#2) — half-day implementation, biggest cost win
2. **Mode badges in browser tab** (#13) — 30min, glance-value forever
3. **Per-mode drafts** (#15) — low effort, stops user friction immediately
4. **Cross-mode "Send to" actions** (#17) — leverages `ModeActionCard` already shipped
5. **Mode-shaped daily briefing** (#7) — kicks off the "BitBit tells me what matters" loop

### Do Next (month 2, foundational bets)
6. **Modes as SKUs** (#1) — pricing experiment, highest revenue lever
7. **Two-layer memory: unified AGI brain + mode-scoped lenses** (#3) — preserves cross-domain intelligence, enables safe delegation
8. **Per-mode onboarding funnels** (#11) — activation step-change
9. **Per-mode eval datasets** (#12) — turns model improvement into a measured loop
10. **Cross-mode workflows / recipes** (#6) — the killer power-user feature

### Explore (Q3, strategic bets)
11. **Mode-scoped sharing & delegation** (#4) — multiplayer pivot, big build
12. **Modes as MCP servers** (#5) — distribution flip, platform play
13. **Mobile mode parity** (#20) — when mobile is on the roadmap
14. **Mode auto-switch (predictive)** (#8) — needs usage data first
15. **Mode = patent filing** (#21) — coordinate with legal advisor

### Backlog (good but not now)
- Mode time tracking (#18)
- Per-mode notification policies (#10) — wait for notification redesign
- Per-mode voice personas (#9) — wait for voice product priority
- Mode-shaped marketing pages (#16) — wait for #1 to ship first

---

## Why This Is 10x, Not Just More Features

The shipped artifact gave BitBit a typed runtime context primitive that flows through every layer of the stack. Every opportunity in this doc reuses the *same* primitive:

| Primitive piece | Used by |
|------|---------|
| `currentMode` signal end-to-end | #1, #2, #5, #11, #12 |
| `mode-personas.ts` registry | #2, #9, #12 |
| `getRetrievalBias` namespaces | #3, #4, #5 |
| `MODE_TO_VARIANT` ontological commit | #1, #4, #5, #20 |
| `ModeActionCard` teleport | #6, #17 |
| Per-mode localStorage state | #14, #15 |

Six product surfaces compounding off five primitive pieces. That's the leverage. The dashboard refactor wasn't the feature — it was the *instrumentation* the rest of the product can now hang off. Every feature in "Do Now" ships because the wire is already there. Every feature in "Do Next" extends one wire. Every feature in "Explore" is a category-shift the mode contract makes legible.

The 1.5x payoff was the UX. The 10x payoff is that **mode is now the unit of pricing, the unit of agent specialization, the unit of memory, the unit of sharing, and the unit of marketing.** Same primitive, five strategic surfaces.

---

## Questions

### Answered
- **Q**: What does the mode primitive enable beyond UX? **A**: A pricing axis, an agent-specialization axis, a memory-tagging axis (unified brain + scoped lenses), a sharing perimeter, an MCP/API surface, and a marketing ontology. Six axes from one shipped primitive.
- **Q**: Doesn't compartmentalizing memory by mode hurt the personal assistant's cross-domain comprehension? **A**: Yes — that's why #3 is *unified storage with mode tags*, not partitioned storage. The personal AGI layer (you talking to BitBit via dashboard, Telegram, WhatsApp, iMessage, SMS) always reads unfiltered. Tags are consumed only by *delegated* sessions (accountant scoped to Money). One brain, two access policies.
- **Q**: Is per-mode model routing risky for cross-domain questions? **A**: Mode is a prior, not a wall (already enforced in `mode-personas.ts:8`). Same rule extends to model picking — agent self-escalates when needed.

### Blockers (need user input)
- **Q**: Do we ship the per-mode SKU split before or after Daniel-advisor patent filing? Patent first reduces copycat risk before pricing exposure.
- **Q**: For #4 (sharing), is the v1 unit a *mode* shared or a *page within a mode*? Mode-level is simpler and probably correct, but "share this one invoice" is a real ask.
- **Q**: Is Chat mode in the SKU split (free) or pulled out entirely as the "Bit" product (Daniel two-product naming)?
- **Q**: For #2 (model routing), do we want mode-locked models (cleaner) or mode-suggested with self-escalation (smarter, more expensive)?
- **Q**: For #3 mode-tagging on writes, do we tag historical memories heuristically (fast, error-prone but enables instant delegation slicing) or accept that pre-mode memories are visible to the personal AGI but invisible to delegations until manually tagged (clean, conservative)?
- **Q**: For #3, where does the access-policy boundary actually live — at the retrieval layer (filter results by tag for delegated sessions) or at a session-context layer (delegation token carries a `scopeMode` that all queries inherit)? Token-level is cleaner architecturally but harder to retrofit; retrieval-level is incremental.

## Next Steps

- [ ] Validate #2 (per-mode model routing) — half-day spike, measure cost+quality on a 100-message sample per mode
- [ ] Cost model for #1 (SKU split) — what's the COGS-vs-LTV per mode given #2's savings?
- [ ] Confirm patent filing scope with Daniel — does "context-routed agent runtime" claim cover this?
- [ ] First quick-win PR: per-mode model routing + browser tab badges (#2 + #13)
- [ ] Second quick-win PR: per-mode drafts (#15)
- [ ] Strategic spike: prototype mode-tagged memory write + delegation-scoped read filter (#3) for new memories only — verify (a) the personal AGI layer reads unfiltered cross-domain, (b) a simulated delegated Money session sees only Money-tagged memories
