---
phase: quick
plan: 2
type: execute
wave: 1
depends_on: []
autonomous: false
requirements: [UI-SKELETON, UI-EMPTY, UI-KANBAN, UI-ANALYTICS, UI-INVOICES, UI-CONTACTS]
files_modified:
  # Task 1 — Install + Skeletons
  - personal-assistant/src/components/dashboard/tabs/tab-skeleton.tsx
  - personal-assistant/src/components/dashboard/tabs/activity-tab.tsx
  - personal-assistant/src/components/dashboard/tabs/ad-scripts-tab.tsx
  - personal-assistant/src/components/dashboard/tabs/analytics-tab.tsx
  - personal-assistant/src/components/dashboard/tabs/sentry-tab.tsx
  - personal-assistant/src/components/dashboard/tabs/tenders-tab.tsx
  - personal-assistant/src/components/dashboard/tabs/invoices-tab.tsx
  - personal-assistant/src/components/dashboard/tabs/contacts-tab.tsx
  # Task 2 — Kanban + Analytics redesign
  - personal-assistant/src/components/dashboard/kanban-board.tsx
  - personal-assistant/src/components/dashboard/kanban-column.tsx
  - personal-assistant/src/components/dashboard/kanban-card.tsx
  - personal-assistant/src/components/dashboard/kanban-toolbar.tsx
  - personal-assistant/src/components/dashboard/tabs/tasks-tab.tsx
  - personal-assistant/src/components/invoices/invoice-list.tsx
  - personal-assistant/src/components/leads/leads-kanban-view.tsx
  # Task 3 — Visual verification
  - personal-assistant/src/components/dashboard/entity-detail-drawer.tsx

must_haves:
  truths:
    - "Every tab shows a contextual skeleton (not a generic spinner) while loading"
    - "Every empty data state uses the @coss/empty component pattern consistently"
    - "Tasks and leads kanban boards use @diceui/kanban with drag overlay"
    - "Analytics tab uses shadcn UI components (Card, Badge, etc.) instead of inline CSSProperties"
    - "Contact detail drawer 'Related' section shows animated notification list"
  artifacts:
    - path: "personal-assistant/src/components/ui/kanban.tsx"
      provides: "@diceui/kanban component (shadcn registry install)"
    - path: "personal-assistant/src/components/ui/notification-list.tsx"
      provides: "@animate-ui notification-list component (shadcn registry install)"
    - path: "personal-assistant/src/components/dashboard/tabs/tab-skeleton.tsx"
      provides: "Shared skeleton variants for different tab layouts"
  key_links:
    - from: "tasks-tab.tsx"
      to: "kanban.tsx (@diceui)"
      via: "import { Kanban, KanbanBoard, KanbanColumn, KanbanCard } from ui/kanban"
      pattern: "import.*from.*ui/kanban"
    - from: "entity-detail-drawer.tsx"
      to: "notification-list.tsx"
      via: "import NotificationList for Related section"
      pattern: "import.*notification-list"
---

<objective>
UI polish pass: consistent loading skeletons across all tabs, replace old EmptyState with @coss/empty pattern, replace custom @dnd-kit kanban with @diceui/kanban, redesign analytics-tab from inline styles to shadcn UI, and improve contacts entity detail drawer with animated notification list.

Purpose: Bring all dashboard tabs to consistent quality -- no spinners, proper skeletons, proper empty states, modern component library replacements.
Output: Polished tab UX across activity, ad-scripts, analytics, sentry, tenders, invoices, contacts tabs + modernized kanban + analytics redesign.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/components/dashboard/tabs/tab-skeleton.tsx
@personal-assistant/src/components/ui/empty.tsx
@personal-assistant/src/components/ui/empty-state.tsx
@personal-assistant/src/components/ui/skeleton.tsx
@personal-assistant/src/components/ui/tab-shell.tsx
@personal-assistant/src/components/ui/card.tsx
@personal-assistant/src/components/dashboard/tabs/activity-tab.tsx
@personal-assistant/src/components/dashboard/tabs/ad-scripts-tab.tsx
@personal-assistant/src/components/dashboard/tabs/analytics-tab.tsx
@personal-assistant/src/components/dashboard/tabs/sentry-tab.tsx
@personal-assistant/src/components/dashboard/tabs/tenders-tab.tsx
@personal-assistant/src/components/dashboard/tabs/invoices-tab.tsx
@personal-assistant/src/components/dashboard/tabs/contacts-tab.tsx
@personal-assistant/src/components/dashboard/tabs/tasks-tab.tsx
@personal-assistant/src/components/dashboard/kanban-board.tsx
@personal-assistant/src/components/dashboard/kanban-column.tsx
@personal-assistant/src/components/dashboard/kanban-card.tsx
@personal-assistant/src/components/dashboard/kanban-toolbar.tsx
@personal-assistant/src/components/invoices/invoice-list.tsx
@personal-assistant/src/components/invoices/invoice-template-editor.tsx
@personal-assistant/src/components/leads/leads-kanban-view.tsx
@personal-assistant/src/components/dashboard/entity-detail-drawer.tsx

<interfaces>
<!-- @coss/empty — already installed at src/components/ui/empty.tsx -->
export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia }

<!-- Old EmptyState — to be replaced everywhere -->
export function EmptyState({ icon, title, description, action, secondaryAction }: EmptyStateProps)
<!-- uses inline React styles, glassmorphic design tokens — DEPRECATED -->

<!-- Skeleton primitive — already installed -->
export { Skeleton } // from @/components/ui/skeleton

<!-- Existing TabSkeleton — will be enhanced with variants -->
export function TabSkeleton() // generic skeleton, no variants
export default TabSkeleton;

<!-- KanbanBoard — current @dnd-kit implementation to be replaced -->
interface KanbanBoardProps { initialColumns: ColumnType[]; initialTasks: Task[]; doneColumnId?: string }
<!-- 524 lines, uses @dnd-kit/core + @dnd-kit/sortable -->

<!-- Tasks tab imports -->
import { KanbanBoard } from '../kanban-board';
import type { KanbanColumn, Task } from '@/lib/types';
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install shadcn registry components + add contextual loading skeletons to all tabs</name>
  <files>
    personal-assistant/src/components/ui/kanban.tsx (new — registry install)
    personal-assistant/src/components/ui/notification-list.tsx (new — registry install)
    personal-assistant/src/components/dashboard/tabs/tab-skeleton.tsx
    personal-assistant/src/components/dashboard/tabs/activity-tab.tsx
    personal-assistant/src/components/dashboard/tabs/ad-scripts-tab.tsx
    personal-assistant/src/components/dashboard/tabs/sentry-tab.tsx
    personal-assistant/src/components/dashboard/tabs/tenders-tab.tsx
    personal-assistant/src/components/dashboard/tabs/invoices-tab.tsx
    personal-assistant/src/components/dashboard/tabs/contacts-tab.tsx
    personal-assistant/src/components/dashboard/tabs/analytics-tab.tsx
  </files>
  <action>
**Step 1 — Install registry components:**
```bash
cd personal-assistant
npx shadcn@latest add @diceui/kanban -y
npx shadcn@latest add "https://animate-ui.com/r/notification-list" -y
```
The @coss/empty component is already installed at `src/components/ui/empty.tsx` — no install needed.

**Step 2 — Enhance `tab-skeleton.tsx` with contextual variants:**

Expand the existing `TabSkeleton` to support a `variant` prop for different tab layout shapes. Keep the existing default. Add variants:

- `variant="list"` — For activity-tab, sentry-tab: header skeleton + 6 stacked row skeletons (h-16 each, full width)
- `variant="form-cards"` — For ad-scripts-tab: header + a tall card skeleton (h-48) + 2 smaller card skeletons
- `variant="grid-stats"` — For analytics-tab: 4 stat card skeletons in a row + 2 chart skeletons (h-64) in 2-col grid
- `variant="table"` — For tenders-tab: header + table header row + 8 table row skeletons
- `variant="kanban"` — For invoices-tab/tasks-tab: header + 4 column skeletons side by side
- `variant="contacts"` — For contacts-tab: stat pills row + search bar + 5 contact card rows (already exists inline, extract here)

Each variant: `aria-busy="true" role="status"`, wrapped in `<div className="flex flex-col gap-4 p-6">`.

**Step 3 — Wire skeletons into each tab:**

For each tab, replace the existing loading state with the appropriate `<TabSkeleton variant="..." />`:

1. **activity-tab.tsx** — already has decent inline skeleton at lines 206-220. Replace with `<TabSkeleton variant="list" />`. Keep existing `@coss/empty` usage (already correct).

2. **ad-scripts-tab.tsx** — has basic skeleton at lines 442-448. Replace with `<TabSkeleton variant="form-cards" />`. Empty state already uses `@coss/empty` (correct).

3. **analytics-tab.tsx** — use `<TabSkeleton variant="grid-stats" />` for loading state. (Full redesign is Task 2, but wire the skeleton now.)

4. **sentry-tab.tsx** — currently has NO loading state (just renders WatchManager). The WatchManager component itself has a loading skeleton internally — but add a top-level `<TabSkeleton variant="list" />` that WatchManager can use. Pass a `loading` prop or let WatchManager handle its own Suspense/loading. Read WatchManager to determine approach — if it manages its own loading state, just ensure it uses `<TabSkeleton variant="list" />` internally instead of custom skeletons.

5. **tenders-tab.tsx** — read the full file to find its loading state pattern. Replace with `<TabSkeleton variant="table" />`.

6. **invoices-tab.tsx** — thin wrapper around InvoiceList + InvoiceTemplateEditor. The loading state lives inside `invoice-list.tsx`. Read `invoice-list.tsx` to find its loading pattern and replace with `<TabSkeleton variant="kanban" />` since invoices uses a kanban-style DnD layout.

7. **contacts-tab.tsx** — has inline skeleton at lines 200-218. Replace with `<TabSkeleton variant="contacts" />`.

**Step 4 — Ensure ALL empty states use @coss/empty pattern:**

Scan each tab for any remaining old `EmptyState` import from `empty-state.tsx`. If found, replace with the `@coss/empty` pattern:
```tsx
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
```

Most tabs already use `@coss/empty` (activity, ad-scripts, tenders, contacts, tasks). Check sentry/WatchManager and invoice-list for any remaining old pattern usage.

For any tab that has a bare "no data" message or uses the old `<EmptyState>` component, convert to:
```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><IconRelevant size={20} /></EmptyMedia>
    <EmptyTitle>Contextual title</EmptyTitle>
    <EmptyDescription>Helpful description with next action hint</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button variant="outline" size="sm">Action</Button>
  </EmptyContent>
</Empty>
```
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - All 7 target tabs import and use TabSkeleton with a contextual variant (no generic spinners)
    - TabSkeleton has 6+ variants covering list, form, grid-stats, table, kanban, contacts layouts
    - All empty states across target tabs use @coss/empty (Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia, EmptyContent)
    - No imports of old EmptyState from empty-state.tsx remain in target tabs
    - @diceui/kanban and @animate-ui/notification-list installed successfully
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace kanban system with @diceui/kanban + redesign analytics-tab to shadcn UI</name>
  <files>
    personal-assistant/src/components/dashboard/kanban-board.tsx
    personal-assistant/src/components/dashboard/kanban-column.tsx
    personal-assistant/src/components/dashboard/kanban-card.tsx
    personal-assistant/src/components/dashboard/kanban-toolbar.tsx
    personal-assistant/src/components/dashboard/tabs/tasks-tab.tsx
    personal-assistant/src/components/invoices/invoice-list.tsx
    personal-assistant/src/components/leads/leads-kanban-view.tsx
    personal-assistant/src/components/dashboard/tabs/analytics-tab.tsx
  </files>
  <action>
**Part A — Replace kanban system with @diceui/kanban:**

Read the installed `src/components/ui/kanban.tsx` to understand the @diceui/kanban API (component names, props, patterns). Then:

1. **Rewrite `kanban-board.tsx`** — Replace the entire @dnd-kit based implementation with @diceui/kanban. The @diceui/kanban provides `Kanban`, `KanbanBoard`, `KanbanColumn`, `KanbanHeader`, `KanbanItem`, `KanbanOverlay` (with dynamic overlay support). Keep the same external interface (`KanbanBoardProps` with `initialColumns`, `initialTasks`, `doneColumnId`). Preserve existing features:
   - Drag and drop between columns
   - DragOverlay (use @diceui's built-in KanbanOverlay with dynamic overlay)
   - Column reordering
   - Task completion animation (CompletionAnimation component)
   - Undo toast on column move
   - Realtime subscription (useRealtime hook)
   - Toolbar integration (KanbanToolbar for filters)
   Map old @dnd-kit events (DragStart, DragOver, DragEnd) to @diceui's onValueChange / onDragEnd callbacks.

2. **Simplify `kanban-column.tsx`** — Rewrite using @diceui's KanbanColumn + KanbanHeader primitives. Remove all @dnd-kit/sortable usage (SortableContext, useDroppable). Keep column header with count badge and collapse functionality.

3. **Simplify `kanban-card.tsx`** — Rewrite using @diceui's KanbanItem. Remove useSortable and CSS.Transform from @dnd-kit. Keep the card content: priority badge, title, assignee avatar, due date.

4. **Update `kanban-toolbar.tsx`** — No structural changes needed, just ensure it still exports FilterState and composes with the new board.

5. **Update `tasks-tab.tsx`** — Should work with same import since kanban-board.tsx keeps same props interface. Verify.

6. **Update `invoice-list.tsx`** — This 1750-line file uses @dnd-kit directly for invoice kanban. Replace its DnD imports and SortableContext/useSortable usage with @diceui/kanban primitives. The invoice list has 4 sections (attention, awaiting, drafts, completed) that act as kanban columns. Keep all invoice-specific business logic (status transitions, PDF generation, send flow). Only replace the drag-and-drop mechanics.

7. **Update `leads-kanban-view.tsx`** — Same pattern: replace @dnd-kit imports with @diceui/kanban. Read the file to understand its column/card structure and migrate.

**Part B — Redesign analytics-tab.tsx from inline styles to shadcn UI:**

The analytics tab is 1103 lines using old glassmorphic inline CSSProperties (`glassCard`, `listRow`, `sectionHeader`, `bigNumber`, `badge()`, `skeletonStyle`). Redesign using shadcn primitives:

1. Remove ALL `React.CSSProperties` constants (`glassCard`, `listRow`, `sectionHeader`, `bigNumber`, `badge`, `skeletonStyle`).

2. Replace with shadcn UI components:
   - `glassCard` div → `<Card><CardContent>` with Tailwind classes
   - `listRow` div → use `<div className="flex items-center gap-4 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/50">`
   - `sectionHeader` → `<h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">`
   - `bigNumber` → `<span className="text-lg font-semibold tabular-nums tracking-tight">`
   - `badge()` → `<Badge variant="...">` from shadcn
   - `skeletonStyle` → `<Skeleton>` from shadcn

3. Replace any `style={...}` attributes on divs with equivalent Tailwind classes. The analytics tab has sections:
   - MRR dashboard (stats cards)
   - Usage/cost breakdown (by agent, by client)
   - Churn risk indicators
   - Cohort matrix
   - Trends with anomaly detection

   Each section: use `<Card>` for containers, `<Badge>` for status indicators, Tailwind grid for layouts. Use the tab's existing shadcn imports (it already imports TabShell, Empty, icons) and add Card, Badge, Separator, etc.

4. Wire `<TabSkeleton variant="grid-stats" />` for loading state (replacing any custom shimmer skeleton).

5. Keep all data fetching, type definitions, and business logic untouched. Only change the rendering/styling layer.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | head -30</automated>
  </verify>
  <done>
    - kanban-board.tsx uses @diceui/kanban (no @dnd-kit/core or @dnd-kit/sortable imports)
    - kanban-column.tsx and kanban-card.tsx use @diceui primitives
    - invoice-list.tsx DnD replaced with @diceui/kanban (no @dnd-kit imports)
    - leads-kanban-view.tsx DnD replaced with @diceui/kanban
    - KanbanOverlay (dynamic) is used for drag feedback in all kanban instances
    - analytics-tab.tsx has ZERO React.CSSProperties constants and ZERO style={} attributes
    - analytics-tab.tsx uses Card, Badge, Skeleton, and Tailwind classes exclusively
    - All kanban drag-and-drop functionality preserved (cross-column moves, reorder)
    - TypeScript compiles without errors
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Visual verification of UI polish pass</name>
  <files>personal-assistant/src/components/dashboard/tabs/</files>
  <action>
User visually verifies the full UI polish pass across all dashboard tabs. This checkpoint confirms:
1. Loading skeletons render correctly per tab (contextual shapes, not generic)
2. Empty states use @coss/empty consistently
3. Kanban drag-and-drop works with @diceui
4. Analytics tab renders with shadcn Card/Badge/Tailwind (no inline glassmorphic styles)

Steps:
1. Run `npm run dev` and open http://localhost:3000
2. Navigate to each tab and verify loading skeleton appears briefly (throttle network in DevTools to 3G to see it clearly):
   - Activity: list-style skeleton rows
   - Ad Scripts: form + card skeletons
   - Analytics: stat cards + chart grid skeleton
   - Sentry: list-style skeleton
   - Tenders: table-style skeleton
   - Invoices: kanban column skeletons
   - Contacts: stat pills + search + card row skeletons
3. For each tab, verify empty state shows @coss/empty pattern (dashed border, centered icon + title + description) when no data present
4. Go to Tasks tab -- drag a task between columns, verify smooth @diceui overlay animation
5. Go to Invoices -- drag an invoice between status sections, verify smooth @diceui overlay
6. Go to Analytics -- verify no glassy/glassmorphic inline styles, all cards use shadcn Card component with proper Tailwind classes
7. Check there are no console errors related to missing imports or undefined components
  </action>
  <verify>User confirms visual quality across all tabs</verify>
  <done>User types "approved" confirming all skeletons, empty states, kanban DnD, and analytics redesign look correct</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes (zero type errors)
- `npm run build` completes successfully
- No imports of `@dnd-kit/core` or `@dnd-kit/sortable` remain in kanban-board, kanban-column, kanban-card, invoice-list, or leads-kanban-view
- No imports of `EmptyState` from `empty-state.tsx` in target tab files
- No `React.CSSProperties` constants in analytics-tab.tsx
- `grep -r "style=" src/components/dashboard/tabs/analytics-tab.tsx` returns zero matches (except possibly for dynamic computed values like chart widths)
</verification>

<success_criteria>
All 7 target tabs have contextual loading skeletons. All empty states use @coss/empty. Kanban boards use @diceui/kanban with dynamic overlay. Analytics tab fully converted to shadcn UI. User visually confirms polish pass.
</success_criteria>

<output>
After completion, create `.planning/quick/2-ui-polish-loading-skeletons-empty-states/2-SUMMARY.md`
</output>
