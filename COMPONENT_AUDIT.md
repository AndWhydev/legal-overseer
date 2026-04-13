# BitBit Component Audit

**Date:** 2026-04-13
**Scope:** `personal-assistant/src/components/**` + `personal-assistant/src/styles/**` + `personal-assistant/src/app/**/{page,layout}.tsx`
**Purpose:** Phase 1 of a full refactor. This audit is the basis for the style guide and the consolidation plan. No component ships in the refactor that is not on this list.

---

## 1. Executive Summary

| Metric | Count |
|---|---|
| Total component files | **350** |
| Atoms | 85 |
| Molecules | 181 |
| Organisms | 84 |
| Templates (app routes) | 51 |
| `components/ui/` primitives | 67 |
| Themes | 3 (light, midnight, aurora) |
| Files touching `framer-motion` | 62 |
| Files with `style={{ }}` inline styles | ~50 |
| Files using `cn()` for variants | 104 |
| Files using CVA | ~6 (built-in `ui/*` only) |

**The headline finding:** the codebase is not short on primitives — it is short on *conventions*. The `ui/` folder already has the atoms it needs (Button, Badge, Input, Card, Dialog, Drawer, Toast, Tabs, Kanban, data-viz/*, etc.). What is missing is (a) a consistent convention for composing those atoms into the ~10 repeating molecule patterns that appear 5–20× each across feature folders, and (b) disciplined use of the existing design tokens.

**The refactor lever:** introduce ~8 new molecule-level components (Surface, Pill, ListItem, IconButton, StatusBadge, InputBase-wrapped Field, AppShell, DetailDrawer) + formalize typography/weight scales + retire ~7 dead/orphan `ui/` files. That alone eliminates ~60 instances of duplicated class strings and gives every page the same lego set.

---

## 2. Design Tokens — Current State

Tokens live in `personal-assistant/src/styles/` across `bitbit-design-system.css` and three theme files.

### 2.1 Colors

| Token | light | midnight | aurora | Notes |
|---|---|---|---|---|
| `--bg-primary` | `#FAFAF9` | `#0A0A0B` | `#DDD0D3` | page background |
| `--bg-secondary` | `#F5F5F4` | `#141416` | `#f0f4f8` | secondary surface |
| `--bg-card` | `#FFFFFF` | `#18181b` | `#f8fafb` | card background |
| `--bg-elevated` | `#F0F0EE` | `#18181B` | `#ffffff` | elevated surface |
| `--bg-input` | `#F5F5F4` | `#1c1c1f` | `#ffffff` | input background |
| `--text-primary` | `#1A1A1B` | `#FAFAFA` | `#1A1A2E` | primary text |
| `--text-secondary` | `#5C5750` | `#b7b7b7` | `#4A5568` | secondary text |
| `--text-dim` | `#78736A` | `#9a9a9a` | `#718096` | dimmed text |
| `--bb-green` | `#15803D` | `#22C55E` | `#16A34A` | success status |
| `--bb-red` | `#DC2626` | `#EF4444` | `#DC2626` | error status |
| `--bb-blue` | `#2563EB` | `#3B82F6` | `#2563EB` | info status |
| `--bb-amber` | `#B45309` | `#F59E0B` | `#D97706` | warning status |
| `--bb-purple` | `#7C3AED` | `#A855F7` | `#7C3AED` | (legacy/unused as accent) |
| `--border-subtle` | `rgba(0,0,0,0.04)` | `#333` | `#e8ecf0` | default border |
| `--hover-bg` | `rgba(0,0,0,0.04)` | `#2d2d2d` | `#edf1f5` | hover overlay |

**Consistency gap:** light and midnight are intentionally monochrome (accent = foreground). Aurora sets `--primary: #E04E1A` (warm orange) as an accent. This is either a bug or an intentional brand-theme distinction — it should be decided on in Phase 2.

**Legacy tokens still present:** `--bb-orange`, `--bb-orange-light`, `--bb-orange-glow-*`, `--bb-cyan`, `--bb-teal`, `--bb-pink` — all mapped to `--foreground` or `--muted-foreground` for backwards compat. They should be audited for removal after the refactor.

### 2.2 Spacing

| Token | Value | Status |
|---|---|---|
| `--gap-xs` | 4px | defined |
| `--gap-sm` | 8px | defined |
| `--gap-md` | 16px | defined |
| `--gap-lg` | 24px | defined |
| `--gap-xl` | 32px | defined |
| `--gap-2xl` | 40px | defined |
| `--topbar-height` | 56px | defined |

**Gap:** tokens defined but heavily underused — components hardcode `px-3`, `py-2`, `gap-4`, `mt-1.5` in 123+ places instead of routing through the token scale.

### 2.3 Radii

`--radius-sm` 6px · `--radius-md` 8px · `--radius-lg` 10px · `--radius-xl` 12px · `--radius-container` 10px · `--radius-container-lg` 12px · `--radius-full` 9999px

Heavy consistent use of `rounded-lg`/`rounded-xl`/`rounded-full` (186+ occurrences). Standardize the component-level radius: atoms use `rounded-md`, surfaces use `rounded-xl`, pills use `rounded-full`.

### 2.4 Shadows

`--card-shadow` and `--card-shadow-hover` defined per theme. Light uses very soft shadow stacks; midnight uses harder dark shadows. No token for `shadow-lg`-equivalent elevation — currently inlined.

### 2.5 Z-index

`--z-base` 0 · `--z-dropdown` 100 · `--z-sticky` 200 · `--z-overlay` 500 · `--z-modal` 1000 · `--z-bitbit` 9999.

### 2.6 Motion

`--duration-fast` 150ms · `--duration-normal` 200ms · `--duration-slow` 300ms · `--ease-default` · `--ease-snap` · `--ease-spring` · `--ease-decel` · `--motion-fast`/`default`/`slow`.

**Compliance gap:** 15+ components hardcode `transition: "0.22s easeInOut"` or `duration: 0.6` in `framer-motion` instead of the tokens.

### 2.7 MISSING — Typography & weight scales

**No `--font-size-*` or `--font-weight-*` tokens exist.** Components freely use `text-[12px]`, `text-sm`, `text-base`, `text-lg` and `font-medium`, `font-semibold` without a canonical scale. This is the single biggest token gap and should be closed before the style guide is written.

**Proposed scale to add:**

```css
--text-xs: 12px;  --text-sm: 14px;  --text-base: 15px;
--text-lg: 17px;  --text-xl: 20px;  --text-2xl: 24px;
--text-3xl: 32px; --text-4xl: 40px;

--weight-regular: 400;
--weight-medium: 500;
--weight-semibold: 600;
--weight-bold: 700;

--line-tight: 1.15;
--line-normal: 1.45;
--line-relaxed: 1.65;
```

---

## 3. Component Inventory

Components are grouped by atomic level. Each row is `path — Name — usage — note`. Usage buckets: ☆ (0 imports, orphan) · • (1 import, single-use) · •• (2–5) · ••• (5+).

### 3.1 Atoms (85) — pure primitives, no business logic

#### 3.1.1 `components/ui/` — shadcn/Radix-style primitives

| Path | Name | Usage | Note |
|---|---|---|---|
| `ui/button.tsx` | Button | ••• | CVA variants |
| `ui/badge.tsx` | Badge | ••• | CVA variants |
| `ui/input.tsx` | Input | ••• | HTML input wrapper |
| `ui/textarea.tsx` | Textarea | ••• | — |
| `ui/label.tsx` | Label | ••• | Radix |
| `ui/field.tsx` | Field | •• | label+input grouping |
| `ui/input-group.tsx` | InputGroup | •• | — |
| `ui/checkbox.tsx` | Checkbox | ••• | Radix |
| `ui/radio-group.tsx` | RadioGroup | •• | Radix |
| `ui/switch.tsx` | Switch | •• | framer-motion |
| `ui/toggle.tsx` | Toggle | •• | — |
| `ui/toggle-group.tsx` | ToggleGroup | •• | — |
| `ui/select.tsx` | Select | ••• | Radix |
| `ui/avatar.tsx` | Avatar | ••• | Radix |
| `ui/spinner.tsx` | Spinner | • | Tabler icon wrapper — see §4 |
| `ui/loader.tsx` | CircularLoader | ••• | multi-variant — see §4 |
| `ui/skeleton.tsx` | Skeleton | ••• | — |
| `ui/progress.tsx` | Progress | •• | framer-motion |
| `ui/progress-ring.tsx` | ProgressRing | •• | — |
| `ui/dialog.tsx` | Dialog | ••• | Radix |
| `ui/drawer.tsx` | Drawer | ••• | Radix |
| `ui/popover.tsx` | Popover | ••• | Radix |
| `ui/tooltip.tsx` | Tooltip | ••• | Radix |
| `ui/hover-card.tsx` | HoverCard | •• | Radix |
| `ui/dropdown-menu.tsx` | DropdownMenu | ••• | Radix |
| `ui/scroll-area.tsx` | ScrollArea | ••• | Radix |
| `ui/separator.tsx` | Separator | ••• | Radix |
| `ui/tabs.tsx` | Tabs | ••• | Radix |
| `ui/tab-shell.tsx` | TabShell | • | tab-pane wrapper — see §4 |
| `ui/accordion.tsx` | Accordion | •• | Radix |
| `ui/collapsible.tsx` | Collapsible | •• | Radix |
| `ui/breadcrumb.tsx` | Breadcrumb | •• | — |
| `ui/pagination.tsx` | Pagination | •• | — |
| `ui/carousel.tsx` | Carousel | • | embla |
| `ui/calendar.tsx` | Calendar | •• | date picker |
| `ui/table.tsx` | Table | •• | HTML wrapper |
| `ui/command.tsx` | Command | ••• | cmdk |
| `ui/toast.tsx` | useToast | ••• | custom hook |
| `ui/alert.tsx` | Alert | ☆ | UNUSED — see §4 |
| `ui/alert-banner.tsx` | AlertBanner | •• | banner variant |
| `ui/empty.tsx` | Empty / EmptyHeader / EmptyTitle / EmptyDescription / EmptyContent / EmptyMedia | ••• | composable slots |
| `ui/empty-state.tsx` | EmptyState | ☆ | UNUSED — see §4 |
| `ui/card.tsx` | Card | ••• | slot system |
| `ui/section-card.tsx` | SectionCard | • | single-use — see §4 |
| `ui/error-boundary.tsx` | ErrorBoundary | •• | — |
| `ui/channel-icon.tsx` | ChannelIcon | ••• | — |
| `ui/steps.tsx` | Steps | • | framer-motion |
| `ui/tool-calls-section.tsx` | ToolCallsSection | • | framer-motion |
| `ui/bitbit-ascii-avatar.tsx` | BitBitAsciiAvatar | •• | brand mascot, canvas |
| `ui/clawd-login-face.tsx` | ClawdLoginFace | • | login art |
| `ui/code-block.tsx` | CodeBlock | •• | — |
| `ui/mini-waveform.tsx` | MiniWaveform | •• | — |
| `ui/flip-clock.tsx` | FlipClock | • | — |
| `ui/pixel-heading-word.tsx` | PixelHeadingWord | • | — |
| `ui/force-field-background.tsx` | ForceFieldBackground | • | — |
| `ui/canvas-like-background.tsx` | CanvasBackground | • | — |
| `ui/qr-auth-connect.tsx` | QrAuthConnect | • | MISPLACED — see §4 |
| `ui/resizable.tsx` | Resizable | •• | — |

#### 3.1.2 `components/animate-ui/` — motion primitives (duplicated tree — see §4)

- `animate-ui/primitives/effects/` — fade, slide, highlight, auto-height
- `animate-ui/primitives/radix/` — 17 animated Radix wrappers
- `animate-ui/primitives/animate/` — tooltip, slot
- `animate-ui/components/radix/` — sheet, sidebar, tabs (near-duplicate of primitives/)
- `animate-ui/components/animate/` — tooltip (near-duplicate)
- `animate-ui/components/community/` — notification-list

### 3.2 Molecules (181) — small compositions with light state

Organized by feature folder. Individual files listed only where merge-relevant.

| Folder | Count | Representative | Note |
|---|---|---|---|
| `ai-elements/` | 10 | Checkpoint, Confirmation, Plan, Reasoning, Shimmer, Suggestion, Task, Terminal, InlineCitation, CodeBlock | assistant-ui primitives |
| `chat/` (molecules) | 15 | MessageBubble, ChatInput, CommandPalette, EntityChip, ExportMenu, InvoiceArtifact, SmoothText, SourcesFooter, TaskProgressBubble, Whispers, BitBitHeader, ChatBitBitFace, ChatThreadsProvider, ArtifactPanel, CodeBlock | chat-interface is split across these |
| `ui/data-viz/` | 15 | KPIWidget, StatCard, MiniBarChart, MiniDonut, MiniGauge, MiniSparkline, ProcessPipeline, ProgressRingIcon, ChartTooltip, GlowIndicator, StatusBadge, DataConnector, HatchPattern, TimelineBar, Showcase | rich viz system; StatCard+KPIWidget overlap — see §4 |
| `widgets/` | 12 | widget-card + *-widget variants (agent-activity, channel-activity, agentic-browser, bridge-health, etc.) | dashboard widget grid |
| `dashboard/charts/` | 6 | chart-* (area, bar, donut, line, etc.) | separate from data-viz |
| `marketing/` | 11 | NavBar, HeroSection, FeaturesSection, CTASection, TestimonialsSection, SocialProofSection, Footer, PricingComparisonTable, CaseStudyContent, IndustryPageTemplate, RolesSection | stateless sections |
| `pitch/` | 20 | PitchDeck, Slide, SlideProgress, ComparisonTable, StatBlock, VideoClip + 13 slide-*.tsx | deck system |
| `activity/` | 3 | ActivityFeed, ActivityItem, RoleActivityFeed | |
| `builder/` | 2 | ProjectCard, ProjectList | |
| `channels/` | 4 | ChannelCard, MessagePreview, SyncButton, SyncResults | |
| `contacts/` | 1 | ContactCard | |
| `integrations/` | 2 | IntegrationCard, IntegrationIcons | |
| `leads/` | 6 | ProspectCard, NextActionPanel, ScoreBreakdownPanel, TemplateEditorPanel, OutreachIntelPanel, LeadCard | |
| `meetings/` | 2 | MeetingSearch, MeetingItem | |
| `memory-palace/` | 2 | MemoryCard, MemoryStatsBar | |
| `reports/` | 1 | ReportList | |
| `revenue/` | 7 | CashflowBar, ClientLeaderboard, RevenueDashboard, etc. | data-heavy |
| `roles/` | 4 | AutonomyToggle, IntelligenceWidgets, RoleDetailView, RoleStatusCards | |
| `portal/` (molecules) | 4 | shared pieces used by portal organisms | |
| `sentry/` | 1 | WatchManager | |
| `dashboard/tabs/` | 30+ | ActivityTab, ApprovalsTab, KanbanTab, etc. | tab-per-page proliferation |
| `dashboard/` (molecules) | 10+ | KanbanToolbar, SidebarNav, Topbar, BottomNav, MorningBriefingCard, etc. | |
| root-level | 3 | `markdown-renderer.tsx`, `section-cards.tsx`, `youtube-embed.tsx`, `zoomable-image.tsx` | orphaned at components/ root |

### 3.3 Organisms (84) — stateful feature compositions

| Folder | Count | Representative | Note |
|---|---|---|---|
| `dashboard/` | 30+ | KanbanBoard, KanbanColumn, KanbanCard, ApprovalQueue, AttentionQueue, NotificationCenter, InboxDrawer + 7 `inbox-drawer-*`, GlobalSearch, DrawerProvider, EntityDetailDrawer, ConnectionStatus, FinancialSnapshot, ProjectProgressCards, ProjectTimelinePanel, RelationshipHealth, TaskDialog, VoiceConversationOverlay, SplashScreen, SPAShell, DashboardRedesign | inbox-drawer is an 8-file family |
| `channels/` | 5 | ChannelGrid, ChannelConfigDrawer, ConnectModal, BridgeLinkModal | |
| `connections/` | 2 | ConnectionsGrid, ConnectionDetailDrawer | |
| `portal/` | 8 | PortalShell, PortalDashboard, PortalFilesView, PortalInvoicesView, PortalProjectsView, PortalRequestsView, PortalManagement, PortalNotificationBell | parallel to dashboard — see §4 |
| `chat/` | 5 | ChatInterface (2400 lines!), ChatSidebarPanel, ChatAttachment, MessageBubble, ArtifactPanel | chat-interface is split candidate |
| `leads/` | 9 | LeadsPage, LeadsKanbanView, LeadsListView, LeadsToolbar, LeadCard, LeadDetailDrawer, CampaignCreatePanel, ProspectDiscoveryPanel, OutreachDashboard | feature-complete lane |
| `memory-palace/` | 3 | MemoryExplorer, DecisionLogViewer, RelationshipTimeline | |
| `onboarding/` | 3 | FirstRunGuideProvider, OnboardingChat, WorldGraph | |
| `meetings/` | 4 | MeetingList, MeetingDetail, MeetingUpload, UploadModal | |
| `contacts/` | 1 | ContactDetailPanel | |
| `integrations/` | 2 | IntegrationGrid, IntegrationIcons | |
| `invoices/` | 3 | InvoiceList, InvoiceDetailCard, InvoiceTemplateEditor | |
| `reports/` | 2 | ReportGenerator, ReportPreview | |
| `swarm/` | 2 | SwarmDashboard, SwarmRunDetail | |
| `knowledge/` | 1 | GraphViewer | |
| `dev/` | 1 | DevToolbar | |

### 3.4 Templates (51) — page/route shells

Grouped by route segment.

| Segment | Routes |
|---|---|
| `(auth)` | layout, login/page, onboard/page |
| `(public)` | layout, blog/page + blog/[slug]/page, pricing/page, case-study/page, demo/page, industries/agencies/page + professional-services/page + trades/page, waitlist/page, terms/page, privacy/page |
| `dashboard` | layout + 18 page.tsx routes (home, chat, activity, channels, connections, contacts + [slug], leads, meetings, invoices, approvals, builder, portal, settings, sentry, creator-studio) |
| `(portal)` | layout, portal/[slug]/layout, portal/[slug]/page + files/invoices/projects/requests, portal/login |
| `pitch` | layout + page |
| misc | `app/page.tsx` (root), `app/layout.tsx`, `showcase/page.tsx`, `callback/page.tsx`, `oauth-done/page.tsx`, `global-error.tsx`, `not-found.tsx`, `dev/reset-first-run/page.tsx` |

---

## 4. Duplicates, Orphans, and Misplaced Files

### 4.1 Hard duplicates — delete the unused twin

| Cluster | Winner | Loser | Action | Effort |
|---|---|---|---|---|
| Empty state | `ui/empty.tsx` (composable slots, 100+ imports) | `ui/empty-state.tsx` (☆ 0 imports) | **Delete** empty-state.tsx | Trivial |
| Alert | `ui/alert-banner.tsx` (3 imports, variants, dismissible) | `ui/alert.tsx` (☆ likely 0 imports) | **Verify-then-delete** alert.tsx | Trivial if confirmed |

### 4.2 Soft duplicates — unify or document

| Cluster | Files | Recommendation | Effort |
|---|---|---|---|
| Card variants | `ui/card.tsx`, `ui/section-card.tsx`, `components/section-cards.tsx` (root), `ui/data-viz/stat-card.tsx`, `ui/data-viz/kpi-widget.tsx` | **Keep** `card.tsx` as primitive. **Delete** `section-card.tsx` + root `section-cards.tsx` (single-use/orphan). **Merge** `stat-card` + `kpi-widget` into one `StatCard` with optional `sparkline` prop. | Moderate |
| Spinner vs Loader | `ui/spinner.tsx` (Tabler icon, 10 uses), `ui/loader.tsx` (rich variants, 100+ uses) | **Keep both** but re-export `Spinner` as `<Loader variant="circular" />` alias + document separation | Trivial |
| Tabs vs TabShell | `ui/tabs.tsx`, `ui/tab-shell.tsx` | **Keep both** — not duplicates; tab-shell is a pane wrapper. Add header comment linking them. | Trivial |
| animate-ui duplication | `animate-ui/primitives/**` ↔ `animate-ui/components/**` (sheet, tabs, sidebar, tooltip appear in both trees) | **Pick one tree** (primitives/ is more complete) and delete the other. Collapse to a single convention. | Moderate |
| MarkdownRenderer | `components/markdown-renderer.tsx` (root), `components/dashboard/markdown-renderer.tsx` | Unify into one `ui/markdown-renderer.tsx` | Moderate |
| Tab proliferation | `dashboard/tabs/*.tsx` (30+) | Not duplicates, but each tab is a self-contained 100–500 LOC organism. Many share toolbar/header/empty-state structure that could be lifted into a `DashboardTabShell` molecule | Hard (out of scope for style guide; note for refactor Phase 2+) |

### 4.3 Orphans — single-use or unused

| File | Importers | Action |
|---|---|---|
| `ui/empty-state.tsx` | 0 | Delete |
| `ui/alert.tsx` | 0 (verify) | Delete if verified |
| `ui/section-card.tsx` | 1 | Delete; caller switches to `ui/card.tsx` |
| `components/section-cards.tsx` (root) | ? | Verify; likely delete |
| `components/markdown-renderer.tsx` (root) | ? | Move to `ui/` or merge with dashboard copy |
| `components/youtube-embed.tsx`, `zoomable-image.tsx` | ? | Verify; move to `ui/` if kept |

### 4.4 Misplaced

| File | Current | Should be | Reason |
|---|---|---|---|
| `ui/qr-auth-connect.tsx` | `components/ui/` | `components/channels/` or `components/auth/` | Contains Supabase client + polling + session tracking — business logic, not a primitive |

### 4.5 Split candidates

- **`chat/chat-interface.tsx` — 2400 lines.** Split into `ChatInterfaceShell`, `ChatMessageList`, `ChatComposer`, `ChatAttachmentTray`, `ChatArtifactRail`. Each becomes its own organism. This is out of scope for the style guide but should be flagged in the refactor plan.
- **`dashboard/inbox-drawer*` (8 files)** — already well-split; keep as a family.

---

## 5. Missing Component Abstractions

These are **repeated Tailwind class strings that signal a missing component**. Each cluster appears 5–20× across feature folders. Introducing the named component eliminates the repetition and becomes a canonical style-guide entry.

| # | Proposed component | Repeating pattern | Occurrences | Replaces |
|---|---|---|---|---|
| 1 | **`<Surface>`** (or `<Panel>`) | `rounded-xl border border-border bg-card p-4 space-y-3` + `...p-5 shadow-sm` variant | 15+ | generic content container with `size` & `padded` variants |
| 2 | **`<Pill>`** | `px-3 py-1 rounded-full text-base font-medium` + color variants | 8+ | non-semantic status chips (Badge is semantic) |
| 3 | **`<ListItem>`** | `flex items-center justify-between p-3 rounded-xl bg-muted border border-border` | 5+ | list rows in drawers, settings, leads, portal |
| 4 | **`<IconButton>`** | `rounded-lg h-8 w-8` / `size-9 rounded-full` | 5+ | 36/32/28px icon-only buttons with a11y baked in |
| 5 | **`<StatusDot>`** | `w-2 h-2 rounded-full bg-{status}` | 10+ | connection/state indicators |
| 6 | **`<InputBase>` / `<Field>`** | `w-full mt-1 px-3 py-2 rounded-lg border bg-input text-foreground text-base outline-none` | 10+ | already partially exists; formalize and enforce |
| 7 | **`<KPICard>`** (unify StatCard+KPIWidget) | various `flex flex-col gap-2 px-5 py-4 rounded-xl` patterns | 4+ | canonical dashboard KPI tile |
| 8 | **`<DetailDrawer>`** | shared scaffolding in `InboxDrawer`, `EntityDetailDrawer`, `LeadDetailDrawer`, `ConnectionDetailDrawer`, `ContactDetailPanel`, `ChannelConfigDrawer` | 6+ | side-drawer shell (header, body, footer slots) |
| 9 | **`<AppShell>`** / **`<PortalShell>` pair** | sidebar + topbar + content + drawer slot — currently inlined in `dashboard/layout.tsx`, `portal/layout.tsx`, `(auth)/layout.tsx` | 3 | unified two-column app shell with theme switcher |
| 10 | **`<SectionHeader>`** | `flex items-start justify-between` + `h2` + description + optional CTA | 12+ | page/card section titles |

---

## 6. Tech Debt Callouts

### 6.1 Inline styles (50+ files)

Highest offenders: `memory-palace/relationship-timeline.tsx`, `revenue/cashflow-bar.tsx`, `onboarding/onboarding-chat.tsx`, `memory-palace/decision-log-viewer.tsx`, `integrations/integration-card.tsx`.

Most are data-driven colors (`background: \`${categoryColor}15\``). Acceptable pattern — but they should derive from CSS vars, not hex, so they theme correctly.

### 6.2 Hardcoded colors in `.tsx` (23 findings)

Examples: `#22C55E` in `memory-card.tsx`, `border-amber-500/30` in `kanban-card.tsx`, `border-zinc-200` in `pitch/slides/market.tsx`. Replace with token-backed Tailwind classes.

### 6.3 Arbitrary Tailwind values

`h-[350px]`, `w-[400px]`, `text-[12px]` — roughly 20 instances. Every one is a sign that the scale (spacing or type) doesn't cover the case. Either add the token or change the design.

### 6.4 Motion inconsistency

15+ components use `transition={{ duration: 0.22, ease: 'easeInOut' }}` or CSS `transition: 0.6s ease` instead of `var(--duration-*)` + `var(--ease-*)`. The tokens exist; adoption is the gap.

### 6.5 CVA adoption

- Files using `cn()`: **104**
- Files using `class-variance-authority`: **~6** (all in `ui/` where shadcn installed it)

Conditional class logic (`cn('base', cond && 'variant-a', other ? 'b' : 'c')`) appears in 20+ feature components — these are CVA candidates. Every new molecule in the refactor should use CVA.

### 6.6 Accessibility

| Issue | Count | Examples |
|---|---|---|
| `<div onClick>` without role/tabindex/keyboard handler | 4 | `pitch-deck.tsx`, `project-timeline-panel.tsx` |
| Icon-only `<button>` without `aria-label` | 10+ | `memory-explorer.tsx`, `activity-feed.tsx` |
| `<img>` without `alt` | 10+ | `integration-icons.tsx`, `onboarding-chat.tsx`, `qr-auth-connect.tsx` |
| Ad-hoc `<div role="dialog">` instead of `<dialog>` | 5 | invoice overlays |

WCAG AA will not pass without resolving these.

### 6.7 Aurora theme accent mismatch

Aurora uses `--primary: #E04E1A` (warm orange) as an accent, but light and midnight treat the accent as `--foreground` (monochrome). Either:
- Decision A: Aurora is the "brand" theme and keeps the warm accent; light/midnight stay monochrome. Document the distinction.
- Decision B: Aurora drops the warm accent to match. Simpler.

This needs a decision before the style guide locks in the accent story.

---

## 7. Consolidation Proposal — "What Merges, What Dies, What Stays"

This is the single page you need to approve before Phase 2 begins.

### 7.1 Dies — delete these files

| File | Why |
|---|---|
| `components/ui/empty-state.tsx` | Unused; `ui/empty.tsx` is canonical |
| `components/ui/alert.tsx` | Unused (verify); `ui/alert-banner.tsx` covers the use case |
| `components/ui/section-card.tsx` | Single-use; caller switches to `ui/card.tsx` |
| `components/section-cards.tsx` (root) | Orphan at `components/` root |
| One of `animate-ui/primitives/` or `animate-ui/components/` | Pick the more complete tree; delete the other |

### 7.2 Merges — consolidate these pairs/groups

| Group | Result |
|---|---|
| `ui/data-viz/stat-card.tsx` + `ui/data-viz/kpi-widget.tsx` | One `StatCard` with optional `sparkline`, `delta`, `size` props |
| `components/markdown-renderer.tsx` + `components/dashboard/markdown-renderer.tsx` | One `ui/markdown-renderer.tsx` |
| `ui/spinner.tsx` | Keep file but re-export from `ui/loader.tsx` as a named alias; document |
| Aurora theme `--primary` token | Decision required — align to monochrome OR document as brand accent |

### 7.3 Moves — relocate these files

| File | From | To | Why |
|---|---|---|---|
| `ui/qr-auth-connect.tsx` | `components/ui/` | `components/channels/` | Business logic, not a primitive |
| `components/markdown-renderer.tsx` | root | `ui/` | Belongs with primitives |
| `components/youtube-embed.tsx` | root | `ui/` or `marketing/` | Scope-appropriate |
| `components/zoomable-image.tsx` | root | `ui/` | Primitive |

### 7.4 Creates — introduce these new components (the style guide contract)

| Name | Level | Replaces | Priority |
|---|---|---|---|
| `Surface` / `Panel` | Atom | `rounded-xl border border-border bg-card ...` (15+) | P0 |
| `Pill` | Atom | `px-3 py-1 rounded-full ...` clusters (8+) | P0 |
| `IconButton` | Atom | `h-8 w-8 rounded-lg` clusters (5+) + a11y | P0 |
| `StatusDot` | Atom | `w-2 h-2 rounded-full ...` (10+) | P1 |
| `SectionHeader` | Molecule | `flex items-start justify-between` + title/CTA (12+) | P0 |
| `ListItem` | Molecule | `flex items-center justify-between p-3 ...` (5+) | P1 |
| `DetailDrawer` | Organism | shared scaffolding across 6 detail drawers | P1 |
| `AppShell` | Template | inlined layouts in `dashboard`, `portal`, `(auth)` | P2 |

### 7.5 Tokens — add these before locking the style guide

- **Typography scale** — `--text-xs` through `--text-4xl` (8 steps)
- **Font weight scale** — `--weight-regular`, `--weight-medium`, `--weight-semibold`, `--weight-bold`
- **Line-height scale** — `--line-tight`, `--line-normal`, `--line-relaxed`
- **Aurora accent** — decision required (keep `#E04E1A` as brand OR align to monochrome)

### 7.6 Stays as-is — already correct

- `ui/button.tsx`, `ui/badge.tsx`, `ui/input.tsx`, `ui/label.tsx`, `ui/field.tsx` — good CVA baseline
- All Radix-wrapped atoms (Dialog, Drawer, Popover, Tooltip, Tabs, Accordion, DropdownMenu, ScrollArea, Command, HoverCard, Separator)
- `ui/data-viz/*` except the stat-card/kpi-widget merge — this is a differentiator
- `ui/kanban.tsx` + dashboard's Kanban organism family — canonical compound component
- `ui/empty.tsx`, `ui/loader.tsx`, `ui/toast.tsx` — actively used and well-designed
- All feature-folder organisms (portal, leads, memory-palace, etc.) — out of scope for the style guide but target for Phase 2+ refactor

---

## 8. Style Guide Scope (Phase 2 preview)

Once this audit is approved, the style guide page (`/style-guide` route or standalone HTML) must include:

1. **Tokens section** — every CSS var rendered with a swatch and the value, one column per theme.
2. **Atoms** — every atom listed in §3.1 with all states: default · hover · focus · active · disabled · loading · error · empty.
3. **Molecules** — every molecule listed in §3.2 with realistic content and all states.
4. **Organisms** — the Kanban family, Detail Drawer family, App Shell, Inbox Drawer family, Navigation (Topbar+Sidebar+Bottom), shown in isolation and assembled.
5. **Compound components** — Kanban board with realistic columns + cards + drag affordance + empty state + error state.
6. **Navigation** — sticky TOC, section anchors, theme switcher (cycles light/midnight/aurora).
7. **Accessible & responsive** — passes axe-core, keyboard-navigable, reflows to mobile.

The style guide is the contract. Nothing in the app refactor ships that isn't on it.

---

## 9. Open Decisions for You

Please confirm or redirect before Phase 2 begins:

1. **Aurora accent** — keep `#E04E1A` as a brand accent OR align to monochrome like light/midnight?
2. **Alert / empty-state deletion** — delete `alert.tsx` and `empty-state.tsx` now, or leave and mark `@deprecated`?
3. **animate-ui tree** — keep `primitives/` and delete `components/`, or vice versa? (Recommend: keep `primitives/`.)
4. **Typography scale** — approve the 8-step scale in §2.7, or prefer a different set of sizes?
5. **`chat-interface.tsx` 2400-line split** — include in the style guide refactor scope, or defer to a separate refactor?
6. **Style guide output** — JSX route at `app/style-guide/page.tsx`, or standalone HTML file?
7. **Naming convention** — standardize `*-panel` (right rail), `*-drawer` (modal side-sheet), `*-view` (full-pane), `*-card` (content tile), `*-widget` (dashboard cell)? Or your own scheme?

Reply "approve" to proceed with Phase 2 as described, or note any changes and I'll revise.
