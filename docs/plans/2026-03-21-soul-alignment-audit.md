# Soul Alignment Audit — UI vs Product Principles

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 21 conflicts between BitBit's UI and its core product principles (SOUL.md, Product Vision, Style Guide).

**Architecture:** Five phases targeting five violation categories: (A) marketing identity crisis, (B) passive UI in an autonomous product, (C) machinery exposure, (D) collective "we" language violations, (E) style guide violations. Phases are independent — each can be committed separately.

**Tech Stack:** React inline styles, Next.js pages, TypeScript. All visual changes use inline `React.CSSProperties` per STYLE_GUIDE.md. No Tailwind for visual design.

**Reference Documents:**
- `personal-assistant/SOUL.md` — Core identity & voice definition
- `personal-assistant/STYLE_GUIDE.md` — Design system tokens & rules
- Memory: `project_product-vision.md` — Collective language rules

---

## Phase 1: Marketing Identity Crisis (A1–A7)

All changes in this phase target the marketing/landing page to align external messaging with SOUL.md identity.

---

### Task 1.1: Fix hero headline and subheading

**Files:**
- Modify: `personal-assistant/src/components/marketing/marketing-page-client.tsx:45-46`
- Modify: `personal-assistant/src/app/page.tsx` (static SSR version — find equivalent headline)

**Step 1: Update headline in marketing-page-client.tsx**

Find line 45:
```tsx
<h1 style={{ fontSize: 'clamp(36px, 8vw, 72px)', fontWeight: 500, lineHeight: 1.2, marginBottom: 24, letterSpacing: '-0.03em', color: '#F1F5F9' }}>Your AI operations co-pilot</h1>
```

Replace headline text:
```
"Your AI operations co-pilot"  →  "Operations, handled."
```

**Why:** SOUL.md explicitly says BitBit is "Not a 'co-pilot'" and the PRD positions BitBit as "an autonomous team." The new headline communicates that things get done without positioning BitBit as a sidekick.

**Step 2: Update subheading**

Find line 46:
```tsx
BitBit remembers every conversation, understands every relationship, and handles the admin so you can do the work you&apos;re good at.
```

Replace with:
```
We remember every conversation, understand every relationship, and handle the admin — so you can focus on the work that matters.
```

**Why:** Collective "we" voice per SOUL.md. Remove "you're good at" — it's subjective and slightly patronising. "The work that matters" is more direct.

**Step 3: Update the same headline in page.tsx (SSR version)**

Find the equivalent `<h1>` in `personal-assistant/src/app/page.tsx` and apply the same text changes. The SSR page likely has a similar hero section.

**Step 4: Commit**

```bash
git add personal-assistant/src/components/marketing/marketing-page-client.tsx personal-assistant/src/app/page.tsx
git commit -m "fix(marketing): align hero headline with SOUL.md — not a co-pilot"
```

---

### Task 1.2: Rewrite feature descriptions to collective voice

**Files:**
- Modify: `personal-assistant/src/components/marketing/marketing-page-client.tsx:22-27`

**Step 1: Update FEATURES array**

Find:
```tsx
const FEATURES = [
  { emoji: '🧠', title: 'Semantic Memory', description: 'AI remembers every conversation, context, and relationship. No more searching through threads or forgetting critical details.' },
  { emoji: '⚡', title: 'Smart Triage', description: 'Automatically categorizes and prioritizes incoming communications. Your agents learn what matters most to you.' },
  { emoji: '✅', title: 'Approval Queue', description: 'Set guardrails. Review important decisions before AI acts. Build trust through graduated automation.' },
  { emoji: '📋', title: 'Kanban + CRM', description: 'Unified view of leads, projects, and tasks. AI agents handle status updates, follow-ups, and reminders automatically.' },
]
```

Replace with:
```tsx
const FEATURES = [
  { emoji: '🧠', title: 'Total Recall', description: 'Every conversation, every relationship, every detail — remembered permanently. Nothing slips through the cracks.' },
  { emoji: '⚡', title: 'Smart Triage', description: 'Incoming messages are categorised and prioritised automatically. We learn what matters and surface it first.' },
  { emoji: '✅', title: 'Graduated Trust', description: 'High-confidence actions happen automatically. Medium-confidence decisions come to you for approval. Full control, zero busywork.' },
  { emoji: '📋', title: 'Live Operations', description: 'Leads, projects, and tasks in one place. Status updates, follow-ups, and reminders happen without being asked.' },
]
```

**Why:**
- "AI remembers" → passive voice naming the tool. "Remembered permanently" → outcome-first.
- "Your agents learn" → possessive tool language. "We learn" → collective partner.
- "Approval Queue" → internal machinery name. "Graduated Trust" → describes the value.
- "Kanban + CRM" → internal features. "Live Operations" → describes the experience.
- "AI agents handle" → tool language. "happen without being asked" → autonomous outcome.

**Step 2: Commit**

```bash
git add personal-assistant/src/components/marketing/marketing-page-client.tsx
git commit -m "fix(marketing): rewrite features to collective voice per SOUL.md"
```

---

### Task 1.3: Fix CTAs — remove "Watch Demo", fix "Start Free Trial"

**Files:**
- Modify: `personal-assistant/src/components/marketing/marketing-page-client.tsx:47-50`

**Step 1: Replace CTAs**

Find:
```tsx
<Link href="/onboard" className="bb-cta-primary" style={{ padding: '14px 32px', borderRadius: 12, background: '#10b981', color: '#fff', fontSize: 16, fontWeight: 500, textDecoration: 'none', display: 'inline-block', transition: 'all 200ms' }}>Start Free Trial</Link>
<button className="bb-cta-secondary" style={{ padding: '14px 32px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F5F9', fontSize: 16, fontWeight: 500, cursor: 'pointer', transition: 'all 200ms' }}>Watch Demo</button>
```

Replace with:
```tsx
<Link href="/onboard" className="bb-cta-primary" style={{ padding: '14px 32px', borderRadius: 12, background: '#10b981', color: '#fff', fontSize: 16, fontWeight: 500, textDecoration: 'none', display: 'inline-block', transition: 'all 200ms' }}>Get Started</Link>
<Link href="#features" className="bb-cta-secondary" style={{ padding: '14px 32px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F5F9', fontSize: 16, fontWeight: 500, textDecoration: 'none', display: 'inline-block', transition: 'all 200ms' }}>See How It Works</Link>
```

**Why:**
- "Start Free Trial" → "Get Started" (no trial infrastructure exists yet; don't promise what doesn't exist)
- "Watch Demo" → "See How It Works" (scrolls to features section; action-oriented, no dead link)
- Changed `<button>` to `<Link>` for the secondary CTA since it now navigates

**Step 2: Commit**

```bash
git add personal-assistant/src/components/marketing/marketing-page-client.tsx
git commit -m "fix(marketing): replace Watch Demo CTA, fix trial language"
```

---

### Task 1.4: Remove "Powered by Claude 3.5 Sonnet"

**Files:**
- Modify: `personal-assistant/src/components/marketing/marketing-page-client.tsx:52`
- Modify: `personal-assistant/src/app/page.tsx:233-242`

**Step 1: Remove from marketing-page-client.tsx**

Find:
```tsx
<p style={{ fontSize: 14, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Powered by Claude 3.5 Sonnet</p>
```

Replace with:
```tsx
<p style={{ fontSize: 14, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trusted by agencies across Australia</p>
```

**Step 2: Remove from page.tsx**

Find the `Powered by Claude 3.5 Sonnet` text in `src/app/page.tsx` around line 241 and apply the same replacement.

**Why:** SOUL.md: "Stay invisible. The machinery behind us — the models, the tools, the APIs — stays hidden." Also factually wrong (now Claude 4.x). Replace with a trust signal that doesn't expose internals.

**Step 3: Commit**

```bash
git add personal-assistant/src/components/marketing/marketing-page-client.tsx personal-assistant/src/app/page.tsx
git commit -m "fix(marketing): remove model name from hero — stay invisible"
```

---

### Task 1.5: Fix integration list to only show real integrations

**Files:**
- Modify: `personal-assistant/src/components/marketing/marketing-page-client.tsx:7-20`

**Step 1: Replace INTEGRATION_LOGOS with actual integrations**

Find:
```tsx
const INTEGRATION_LOGOS = [
  { name: 'Gmail', icon: '📧' },
  { name: 'Outlook', icon: '📨' },
  { name: 'WhatsApp', icon: '💬' },
  { name: 'Slack', icon: '🔔' },
  { name: 'Stripe', icon: '💳' },
  { name: 'Google Calendar', icon: '📅' },
  { name: 'Zoom', icon: '📹' },
  { name: 'HubSpot', icon: '📊' },
  { name: 'Salesforce', icon: '🎯' },
  { name: 'LinkedIn', icon: '🤝' },
  { name: 'Twitter', icon: '𝕏' },
  { name: 'GitHub', icon: '🐙' },
]
```

Replace with only integrations that actually exist:
```tsx
const INTEGRATION_LOGOS = [
  { name: 'Gmail', icon: '📧' },
  { name: 'Outlook', icon: '📨' },
  { name: 'WhatsApp', icon: '💬' },
  { name: 'Slack', icon: '💭' },
  { name: 'Stripe', icon: '💳' },
  { name: 'Google Calendar', icon: '📅' },
  { name: 'Asana', icon: '📋' },
  { name: 'Xero', icon: '📊' },
  { name: 'iMessage', icon: '💬' },
  { name: 'Telegram', icon: '✈' },
  { name: 'WordPress', icon: '🌐' },
  { name: 'Calendly', icon: '📆' },
]
```

**Step 2: Update the integration count text**

Find:
```tsx
<h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 32, color: '#F1F5F9' }}>20+ Channel Integrations</h3>
```

Replace with:
```tsx
<h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 32, color: '#F1F5F9' }}>15+ Integrations</h3>
```

**Why:** SOUL.md: "Earn trust through honesty. If we didn't build it, don't claim we did." Zoom, HubSpot, Salesforce, LinkedIn, Twitter, GitHub are not integrated. Actual count is ~15.

**Step 3: Commit**

```bash
git add personal-assistant/src/components/marketing/marketing-page-client.tsx
git commit -m "fix(marketing): only list real integrations — earn trust through honesty"
```

---

### Task 1.6: Note on emoji icons (A7) and pricing model (A4)

**No code changes in this task — these are product decisions to document.**

**Emoji icons (A7):** The feature cards and integration grid use emoji (🧠⚡✅📋📧📨💬 etc) instead of premium SVG icons or real brand logos. This works for MVP but conflicts with the glassmorphic premium aesthetic. **Recommendation:** Replace with monochrome lucide-react icons for features and actual brand SVG logos for integrations in a future design pass. This is a design asset task, not a code task.

**Pricing model (A4):** The current tiered pricing (Starter $29, Growth $99, Scale $299) contradicts the stated "per-agent pricing" model from the PRD. **This is a product/business decision**, not a UI bug. Options:
1. Redesign pricing UI to show per-agent pricing ($X/agent/month)
2. Update PRD to match the tier model
3. Hybrid: tiers that include N agents with add-on pricing

**Action:** Flag both for product review. No code change here.

---

## Phase 2: Collective "We" Language Sweep (D1)

This phase is a mechanical find-and-replace across 15+ files. Each task targets one file. The rule: "Your X" → collective phrasing. Not always "Our X" — sometimes the possessive should just be dropped or reframed.

**Reference:** SOUL.md Voice section: "BitBit speaks as a shared entity. The business, the tasks, the contacts, the schedule — these belong to 'us,' not 'you.'"

**Important exception:** Messages that come FROM external services (Asana notifications, LinkedIn alerts, Stripe receipts) correctly say "you/your" because those services are talking to the user. Don't change those. Only change BitBit's own UI copy.

---

### Task 2.1: topbar-configs.tsx

**Files:**
- Modify: `personal-assistant/src/components/dashboard/topbar-configs.tsx:125`

**Step 1: Fix "Your integrations"**

Find:
```tsx
breadcrumb: <IconBreadcrumb icon={Radio} text="Your integrations" />,
```

Replace with:
```tsx
breadcrumb: <IconBreadcrumb icon={Radio} text="Connected channels" />,
```

---

### Task 2.2: creator-studio-generator.tsx

**Files:**
- Modify: `personal-assistant/src/components/dashboard/creator-studio-generator.tsx:307,318`

**Step 1: Fix line 307**

Find:
```tsx
<p style={sectionDesc}>Your generated content appears here</p>
```

Replace with:
```tsx
<p style={sectionDesc}>Generated content appears here</p>
```

**Step 2: Fix line 318**

Find:
```tsx
<p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No content generated yet. Create your first one!</p>
```

Replace with:
```tsx
<p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Nothing generated yet.</p>
```

---

### Task 2.3: contacts-tab.tsx

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/contacts-tab.tsx:190`

**Step 1: Fix empty state**

Find:
```
"Import or add your first contact to get started."
```

Replace with:
```
"Import or add a contact to get started."
```

---

### Task 2.4: knowledge-tab.tsx

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/knowledge-tab.tsx:270,716-717`

**Step 1: Fix entity graph empty state (line ~270)**

Find:
```
No entities yet. Add contacts and relationships to see your knowledge graph.
```

Replace with:
```
No entities yet. Add contacts and relationships to build the knowledge graph.
```

**Step 2: Fix search placeholder (lines ~716-717)**

Find:
```tsx
title="Search your knowledge base"
description="Find contacts, projects, invoices, and tasks to see how they connect across your organization."
```

Replace with:
```tsx
title="Search the knowledge base"
description="Find contacts, projects, invoices, and tasks to see how they connect across the organisation."
```

---

### Task 2.5: ad-scripts-tab.tsx

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/ad-scripts-tab.tsx:765`

**Step 1: Fix empty state**

Find:
```
"Create offer packages or service tiers in your system to generate ad scripts."
```

Replace with:
```
"Create offer packages or service tiers to generate ad scripts."
```

---

### Task 2.6: analytics-tab.tsx

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/analytics-tab.tsx:638`

**Step 1: Fix empty state description**

Find:
```
'Connect your billing system to see MRR metrics, token usage, and churn analysis.'
```

Replace with:
```
'Connect billing to see MRR metrics, usage, and churn analysis.'
```

---

### Task 2.7: settings-tab.tsx (4 fixes)

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/settings-tab.tsx:19,21,25,196,317,450`

**Step 1: Fix automation descriptions**

Line 19 — Find:
```tsx
{ id: 'sentry', label: 'Monitoring', description: 'Watch for issues and alert you' },
```
Replace with:
```tsx
{ id: 'sentry', label: 'Monitoring', description: 'Watch for issues and raise alerts' },
```

Line 21 — Find:
```tsx
{ id: 'client_comms', label: 'Client Emails', description: 'Draft email responses for your clients' },
```
Replace with:
```tsx
{ id: 'client_comms', label: 'Client Emails', description: 'Draft email responses for clients' },
```

Line 25 — Find:
```tsx
{ id: 'ai_search', label: 'SEO', description: 'Audit and improve your search visibility' },
```
Replace with:
```tsx
{ id: 'ai_search', label: 'SEO', description: 'Audit and improve search visibility' },
```

**Step 2: Fix WhatsApp section (line 196)**

Find:
```tsx
{alreadyConnected ? 'Your account is active and receiving messages' : 'Link your WhatsApp account to BitBit'}
```
Replace with:
```tsx
{alreadyConnected ? 'Connected and receiving messages' : 'Link WhatsApp to start receiving messages'}
```

**Step 3: Fix integrations heading (line 317)**

Find:
```tsx
<p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Connect your communication channels</p>
```
Replace with:
```tsx
<p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Connect communication channels</p>
```

**Step 4: Fix theme heading (line 450)**

Find:
```tsx
<p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Choose your visual style.</p>
```
Replace with:
```tsx
<p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Choose a visual style.</p>
```

---

### Task 2.8: ai-search-tab.tsx (5 fixes)

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/ai-search-tab.tsx:807-808,1045,1050,1111`

**Step 1: Fix empty state (lines 807-808)**

Find:
```tsx
title="Run your first visibility audit"
description="Discover how your website ranks in AI search engines like Perplexity, ChatGPT, and Gemini."
```
Replace with:
```tsx
title="Run a visibility audit"
description="Discover how the website ranks in AI search engines like Perplexity, ChatGPT, and Gemini."
```

**Step 2: Fix content generator text (line 1045)**

Find:
```
to cite your business.
```
Replace with:
```
to cite the business.
```

**Step 3: Fix audit recommendation (line 1050)**

Find:
```
Based on your audit, focus content on these absent/partial queries:
```
Replace with:
```
Based on the audit, focus content on these absent/partial queries:
```

**Step 4: Fix schema generator text (line 1111)**

Find:
```
Generate JSON-LD structured data for your client websites. Copy and paste the output
```
Replace with:
```
Generate JSON-LD structured data for client websites. Copy and paste the output
```

---

### Task 2.9: creator-studio-tab.tsx

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/creator-studio-tab.tsx:62,1197`

**Step 1: Fix blog post description (line 62)**

Find:
```
'Full articles, outlines, and introductions for your audience'
```
Replace with:
```
'Full articles, outlines, and introductions for the target audience'
```

**Step 2: Fix empty state (line ~1197)**

Find:
```
Generate your first piece of content to see it here.
```
Replace with:
```
Generated content will appear here.
```

---

### Task 2.10: Remaining files — activity, sidebar, inbox, approval, command-center, reports, onboarding

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/activity-tab.tsx:287`
- Modify: `personal-assistant/src/components/dashboard/sidebar-nav.tsx:242`
- Modify: `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx:1002`
- Modify: `personal-assistant/src/components/dashboard/approval-queue.tsx:271`
- Modify: `personal-assistant/src/components/dashboard/tabs/command-center-tab.tsx:466`
- Modify: `personal-assistant/src/components/dashboard/tabs/reports-tab.tsx:358`
- Modify: `personal-assistant/src/components/dashboard/onboarding-tour.tsx:36,44`

**Step 1: activity-tab.tsx:287**

Find: `"Activity will appear here as you and your agents get to work"`
Replace: `"Activity will appear here as things get moving"`

**Step 2: sidebar-nav.tsx:242**

Find: `Manage your account`
Replace: `Account settings`

**Step 3: inbox-tab.tsx:1002**

Find: `"No messages to show. Adjust your filters or wait for new messages."`
Replace: `"No messages to show. Adjust filters or wait for new messages."`

**Step 4: approval-queue.tsx:271**

Find: `"When agents need your sign-off, requests will appear here"`
Replace: `"When something needs sign-off, requests will appear here"`

**Step 5: command-center-tab.tsx:466**

Find: `<span>Connect Google Calendar to see your schedule</span>`
Replace: `<span>Connect Google Calendar to see the schedule</span>`

**Step 6: reports-tab.tsx:358**

Find: `"Monthly and weekly reports will appear here after your first full week"`
Replace: `"Monthly and weekly reports will appear here after the first full week"`

**Step 7: onboarding-tour.tsx:36**

Find: `'Ask me to draft an email, check on an invoice, or look something up. I work across all your connected tools.'`
Replace: `'We can draft emails, check invoices, look things up — across all connected tools.'`

**Step 8: onboarding-tour.tsx:44**

Find: `'Before I send anything or take action, I check with you here first.'`
Replace: `'Before sending anything or taking action, decisions that need sign-off come here first.'`

**Step 9: Commit all Phase 2 changes**

```bash
git add personal-assistant/src/components/dashboard/ personal-assistant/src/components/dashboard/tabs/
git commit -m "fix(ui): sweep 35+ 'your' → collective language per SOUL.md"
```

---

## Phase 3: Hide the Machinery (C1–C2)

---

### Task 3.1: Swarm run detail — outcome-first, details behind toggle

**Files:**
- Modify: `personal-assistant/src/components/swarm/swarm-run-detail.tsx`

**Step 1: Add outcome summary section**

At the top of the run detail (after the header/meta pills), add an "Outcome" section that displays the run's final result in plain language. This should be above the timeline.

Find the meta pills section (status, duration, cost, tokens). **Remove the cost and tokens pills from the default view** — these expose machinery. Keep status and duration (those describe the outcome).

The exact code depends on the component's props/data structure, but the pattern:

```tsx
{/* Outcome — what happened, in plain language */}
<div style={{
  padding: 16,
  borderRadius: 12,
  background: 'rgba(15, 20, 30, 0.6)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  marginBottom: 16,
}}>
  <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
    {run.trigger_text}
  </p>
  {run.status === 'completed' && (
    <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
      Completed in {formatDuration(run.duration_ms)}
    </p>
  )}
</div>
```

**Step 2: Wrap timeline in a collapsible "Show details" toggle**

The step-by-step timeline with agent names, negotiation, tokens should be behind a toggle:

```tsx
<button
  onClick={() => setShowDetails(!showDetails)}
  style={{
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '8px 0',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }}
>
  {showDetails ? 'Hide details' : 'Show details'}
  <ChevronDown size={14} style={{ transform: showDetails ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
</button>

{showDetails && (
  <div>
    {/* existing timeline code */}
  </div>
)}
```

**Step 3: Fix fontWeight: 600 in negotiation display (line 394)**

Find:
```tsx
<div style={{ color: '#8B5CF6', marginBottom: '4px', fontWeight: 600 }}>
```
Replace:
```tsx
<div style={{ color: '#8B5CF6', marginBottom: '4px', fontWeight: 500 }}>
```

**Step 4: Commit**

```bash
git add personal-assistant/src/components/swarm/swarm-run-detail.tsx
git commit -m "fix(swarm): outcome-first view, hide machinery behind toggle"
```

---

### Task 3.2: Chain of thought — default collapsed, human-readable label

**Files:**
- Modify: `personal-assistant/src/components/ai-elements/chain-of-thought.tsx`

**Step 1: Change defaultOpen from false to false (confirm)**

Line 41: `defaultOpen = false` — this is already correct. The component defaults to collapsed. Verify that consumers don't override with `defaultOpen={true}` or `open={true}`.

**Step 2: Search for consumers passing open={true}**

Run:
```bash
grep -rn "defaultOpen={true}\|open={true}" personal-assistant/src/components/ --include="*.tsx" | grep -i "chain"
```

If any are found, change them to `defaultOpen={false}`.

**Step 3: Rename the component's display text**

Check if the header renders "Chain of Thought" anywhere. The component itself is headless (it provides context, consumers provide the header content). Search:

```bash
grep -rn "Chain of Thought\|chain-of-thought\|chainOfThought" personal-assistant/src/ --include="*.tsx" -l
```

In any consumer that renders a visible label "Chain of Thought", replace with "How we worked this out" or "Reasoning" — something non-technical.

**Step 4: Commit**

```bash
git add personal-assistant/src/components/ai-elements/
git commit -m "fix(ai): ensure chain of thought defaults collapsed, non-technical label"
```

---

## Phase 4: Proactive UI Patterns (B1–B4)

These are larger UX changes. Each task adds an "insights" or "proactive" section above existing passive content. The passive content (forms, lists, charts) stays — it just becomes secondary.

---

### Task 4.1: Creator Studio — proactive drafts banner

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/creator-studio-tab.tsx`

**Step 1: Add proactive insights banner at the top**

Before the template selection form, add an insight banner that suggests content BitBit could create:

```tsx
{/* Proactive suggestions */}
<div style={{
  padding: 16,
  borderRadius: 12,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  marginBottom: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}}>
  <Sparkles size={20} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
    Content suggestions will appear here based on recent activity and upcoming milestones.
  </p>
</div>
```

**Why:** This is a placeholder that establishes the proactive pattern. When the content agent is wired up, it will populate with real suggestions like "Draft a LinkedIn post about the Acme Corp project win?" The important thing is the UI structure communicates: "We suggest, you refine" instead of "Fill out this form."

**Step 2: Fix fontSize: 10px violations (lines 393, 413)**

Find all instances of `fontSize: 10` in this file and replace with `fontSize: 14`.

**Step 3: Commit**

```bash
git add personal-assistant/src/components/dashboard/tabs/creator-studio-tab.tsx
git commit -m "feat(creator-studio): add proactive suggestions banner, fix 10px font"
```

---

### Task 4.2: Analytics tab — insight summary above charts

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/analytics-tab.tsx`

**Step 1: Add insight summary section**

At the top of the analytics tab (before the MRR dashboard), add an insights summary:

```tsx
{/* Insights summary — what the data means */}
<div style={{
  padding: 16,
  borderRadius: 12,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  marginBottom: 16,
}}>
  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
    Analytics insights will surface here — churn risks, growth trends, and recommended actions.
  </p>
</div>
```

**Why:** Same pattern as Creator Studio — establish the proactive UI surface. The analytics agent will populate this with insights like "3 accounts show churn signals — check-in emails scheduled for Monday."

**Step 2: Fix fontSize: 10px violations (lines 482, 516, 533, 548, 566)**

Find all `fontSize: 10` in this file and replace with `fontSize: 14`.

**Step 3: Commit**

```bash
git add personal-assistant/src/components/dashboard/tabs/analytics-tab.tsx
git commit -m "feat(analytics): add insights banner, fix 10px font violations"
```

---

### Task 4.3: Contacts tab — relationship pulse section

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/contacts-tab.tsx`

**Step 1: Add relationship pulse section above contact list**

```tsx
{/* Relationship pulse — proactive insights */}
<div style={{
  padding: 16,
  borderRadius: 12,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  marginBottom: 16,
}}>
  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
    Relationship insights will surface here — overdue follow-ups, upcoming deadlines, and engagement patterns.
  </p>
</div>
```

**Step 2: Fix fontSize: 10px violations (lines 384, 444, 456)**

Find all `fontSize: 10` in this file and replace with `fontSize: 14`.

**Step 3: Commit**

```bash
git add personal-assistant/src/components/dashboard/tabs/contacts-tab.tsx
git commit -m "feat(contacts): add relationship pulse section, fix 10px font"
```

---

### Task 4.4: Tenders tab — agent-driven framing

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/tenders-tab.tsx`

**Step 1: Fix fontSize: 10px violations (lines 831, 839, 847)**

Find all `fontSize: 10` in this file and replace with `fontSize: 14`.

**Step 2: Commit**

```bash
git add personal-assistant/src/components/dashboard/tabs/tenders-tab.tsx
git commit -m "fix(tenders): fix 10px font violations"
```

---

### Task 4.5: Inbox tab — fix 10px fonts

**Files:**
- Modify: `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx`

**Step 1: Fix fontSize: 10px violations (lines 1464, 1629, 2082, 2213)**

Find all `fontSize: 10` in this file and replace with `fontSize: 14`.

**Note:** For the group date divider (line 1629) and filter badge count (line 1464), `fontSize: 14` may look too large for these small metadata elements. If so, use the style guide minimum: `fontSize: 14`. There is no sanctioned size smaller than 14px. If 14px is truly too large visually, these elements may need a redesign (e.g., hide the text, use a dot badge instead of a number).

**Step 2: Commit**

```bash
git add personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
git commit -m "fix(inbox): fix 10px font violations per style guide"
```

---

## Phase 5: Remaining Style Guide Violations (E2–E3)

---

### Task 5.1: billing-settings.tsx — fix fontWeight violations

**Files:**
- Modify: `personal-assistant/src/components/settings/billing-settings.tsx:198,238,262,289,325,371`

**Step 1: Fix all fontWeight violations**

Line 198 — Find: `fontWeight: 600` → Replace: `fontWeight: 500`
Line 238 — Find: `fontWeight: 600` → Replace: `fontWeight: 500`
Line 262 — Find: `fontWeight: 700` → Replace: `fontWeight: 500`
Line 289 — Find: `fontWeight: 600` → Replace: `fontWeight: 500`
Line 325 — Find: `fontWeight: 600` → Replace: `fontWeight: 500`
Line 371 — Find: `fontWeight: 600` → Replace: `fontWeight: 500`

**Step 2: Fix "your" language**

Line 202 — Find: `Your last payment failed. Update your payment method`
Replace: `Last payment failed. Update the payment method`

Line 298 — Find: `Your trial ends on`
Replace: `Trial ends on`

**Step 3: Commit**

```bash
git add personal-assistant/src/components/settings/billing-settings.tsx
git commit -m "fix(billing): fontWeight 600/700→500, remove possessive language"
```

---

### Task 5.2: decision-log-viewer.tsx — fix fontWeight

**Files:**
- Modify: `personal-assistant/src/components/memory-palace/decision-log-viewer.tsx:127`

**Step 1: Fix fontWeight**

Find: `fontWeight: 700`
Replace: `fontWeight: 500`

**Step 2: Commit**

```bash
git add personal-assistant/src/components/memory-palace/decision-log-viewer.tsx
git commit -m "fix(memory-palace): fontWeight 700→500 per style guide"
```

---

### Task 5.3: chat-attachment.tsx — fix borderRadius

**Files:**
- Modify: `personal-assistant/src/components/chat/chat-attachment.tsx:63`

**Step 1: Fix borderRadius**

Find: `borderRadius: 10`
Replace: `borderRadius: 12`

**Why:** Style guide forbids borderRadius values of 10. Nearest allowed: 12.

**Step 2: Commit**

```bash
git add personal-assistant/src/components/chat/chat-attachment.tsx
git commit -m "fix(chat): borderRadius 10→12 per style guide"
```

---

## Verification Checklist

After all phases:

1. **Language audit**: `grep -rn "Your \|your " personal-assistant/src/components/dashboard/ --include="*.tsx"` — review remaining hits, confirm they're all from external service mock data (Asana, LinkedIn, etc.) or genuinely possessive contexts (e.g., "sign in with your email")
2. **fontSize audit**: `grep -rn "fontSize: 10\b\|fontSize: 11\b\|fontSize: 13\b" personal-assistant/src/components/ --include="*.tsx"` — should return zero results in dashboard components
3. **fontWeight audit**: `grep -rn "fontWeight: [67]00\|fontWeight: 600" personal-assistant/src/components/ --include="*.tsx"` — should return zero results
4. **borderRadius audit**: `grep -rn "borderRadius: 10\b\|borderRadius: 6\b\|borderRadius: 14\b\|borderRadius: 18\b" personal-assistant/src/components/ --include="*.tsx"` — should return zero results
5. **Build check**: `cd personal-assistant && npm run build` — no type errors
6. **Visual check**: Load marketing page, dashboard, each tab — verify copy reads naturally

---

## Summary of Changes

| Category | Conflicts | Files Touched | Commits |
|----------|-----------|---------------|---------|
| A: Marketing identity | 7 | 2 | 5 |
| D: "We" language | 35+ instances | 15 | 1 |
| C: Hide machinery | 2 | 2 | 2 |
| B: Proactive UI | 4 | 4 | 4 |
| E: Style violations | 20+ instances | 5 | 3 |
| **Total** | **~70 fixes** | **~22 files** | **~15** |
