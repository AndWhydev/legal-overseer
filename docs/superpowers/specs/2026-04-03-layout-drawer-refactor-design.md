# Layout Refactor — Fixed Frame, Scroll Content, Right Drawer

**Date:** 2026-04-03
**Status:** Approved design, pending implementation plan
**Scope:** Refactor the dashboard layout to fix the border frame, centralize scrolling, and add a shared right-side drawer slot

---

## Overview

The current dashboard layout has three problems: the bordered container scrolls with content rather than staying fixed as a viewport frame, the `DetailSidebar` component escapes the layout via portal to `document.body`, and only the inbox tab has a right-side panel. This refactor fixes all three by restructuring `SidebarInset` into a fixed frame with a scrolling content area and an integrated drawer slot that any tab can render content into.

## Design Principles

- **The border is the viewport** — `SidebarInset`'s `rounded-xl` border stays fixed on screen. Everything inside it scrolls or transitions, but the frame never moves.
- **Tabs own their drawer content** — Each tab decides what (if anything) to show in the drawer. The shell provides the slot and animation; the tab provides the content.
- **No portals** — The drawer renders in the DOM where it visually appears, inside the bordered frame. No `createPortal` to `document.body`.
- **Incremental adoption** — Only the inbox tab migrates initially. Other tabs can adopt the drawer whenever they're ready. Tabs that don't use the drawer are unaffected.

## Layout Structure

### Current

```
SidebarProvider
├── SidebarNav (left sidebar)
└── SidebarInset (m-2 rounded-xl — the border)
    ├── header (topbar, 48px)
    ├── main (flex-1 overflow-hidden)
    │   └── KeepAliveTabPanel
    └── BottomNav (mobile)

DetailSidebar (portalled to document.body, position: fixed)
```

### New

```
SidebarProvider
├── SidebarNav (left sidebar, unchanged)
└── SidebarInset (m-2 rounded-xl overflow-hidden — fixed frame)
    ├── header (topbar, 48px, shrink-0, unchanged)
    ├── div.content-row (flex-1 flex overflow-hidden)    ← NEW
    │   ├── main (flex-1 overflow-y-auto)                ← NOW scrollable
    │   │   └── KeepAliveTabPanel (unchanged)
    │   └── DrawerSlot (shrink-0, animated width)        ← NEW
    └── BottomNav (mobile, unchanged)
```

The key change is the new **content row** — a horizontal flex container that splits the remaining space (below the topbar, above the mobile nav) between scrolling tab content and the drawer. The `main` element becomes the single scroll container. The drawer is a flex sibling, not a portal.

## Components

### 1. DrawerContext & DrawerProvider

**File:** `personal-assistant/src/components/dashboard/drawer-context.tsx`

A React context providing:

```typescript
interface DrawerContextValue {
  content: React.ReactNode | null
  isOpen: boolean
  setDrawer: (content: React.ReactNode) => void
  closeDrawer: () => void
}
```

**DrawerProvider** wraps the content row in `spa-shell.tsx`. It holds `content` in state and derives `isOpen` from `content !== null`.

**Auto-close on tab change:** The provider receives the active tab ID as a prop. When it changes, the drawer closes automatically. This prevents stale drawer content from a previous tab persisting when the user switches tabs.

```tsx
// In DrawerProvider:
useEffect(() => {
  closeDrawer()
}, [activeTab])
```

### 2. DrawerSlot

**File:** `personal-assistant/src/components/dashboard/drawer-slot.tsx`

A pure layout component that renders the drawer content in the correct position with animation.

**Desktop behavior (push):**
- `shrink-0` flex sibling of the main content area
- Width transitions between `w-0` and `w-[25rem]` via `transition-[width] duration-300 ease-out`
- `overflow-hidden` during animation so content doesn't leak
- `border-l` separator when open
- Inner container is `w-[25rem] h-full flex flex-col overflow-hidden` — fixed inner width prevents content reflow during the width animation

**Mobile behavior (overlay):**
- Renders as a shadcn `Sheet` from the right side
- Full viewport, no push
- Controlled by `isOpen` from drawer context

```tsx
// Desktop:
<div
  className={cn(
    "shrink-0 overflow-hidden transition-[width] duration-300 ease-out",
    isOpen ? "w-[25rem] border-l" : "w-0"
  )}
>
  <div className="w-[25rem] h-full flex flex-col overflow-hidden">
    {content}
  </div>
</div>

// Mobile:
<Sheet open={isOpen} onOpenChange={open => !open && closeDrawer()}>
  <SheetContent side="right" className="w-full p-0">
    {content}
  </SheetContent>
</Sheet>
```

### 3. Drawer Helper Components

**File:** `personal-assistant/src/components/dashboard/drawer-parts.tsx`

Convenience components for consistent drawer inner layout. These mirror the existing `DetailSidebarHeader/Body/Footer` API:

- **`DrawerHeader`** — `shrink-0 border-b px-5 py-4` — title area with optional close button
- **`DrawerBody`** — `flex-1 overflow-y-auto px-6 py-5` — scrollable content area
- **`DrawerFooter`** — `shrink-0 border-t px-5 py-4` — action area (reply composer, save buttons, etc.)

Tabs compose these inside their drawer content:

```tsx
setDrawer(
  <>
    <DrawerHeader>
      <h2>Contact Detail</h2>
      <Button variant="ghost" size="icon" onClick={closeDrawer}>
        <X className="h-4 w-4" />
      </Button>
    </DrawerHeader>
    <DrawerBody>
      <ContactProfile contact={selected} />
    </DrawerBody>
  </>
)
```

### 4. useDrawer Hook

**File:** exported from `drawer-context.tsx`

Convenience hook for tabs:

```typescript
export function useDrawer() {
  const context = useContext(DrawerContext)
  if (!context) throw new Error('useDrawer must be used within DrawerProvider')
  return context
}
```

## Layout Changes

### SidebarInset

No changes to the component itself. The `SidebarInset` already renders as a `<main>` with `flex flex-col` and the border classes. The restructuring happens in `spa-shell.tsx` where it's consumed.

Ensure `SidebarInset` has `overflow-hidden` so it acts as a true viewport boundary. It already has this class.

### spa-shell.tsx

The main modification. Current structure inside `SidebarInset`:

```tsx
<SidebarInset>
  <header>{/* topbar */}</header>
  <main id="main-content" className="flex-1 overflow-hidden">
    <KeepAliveTabPanel>{/* tabs */}</KeepAliveTabPanel>
  </main>
  <BottomNav />
</SidebarInset>
```

New structure:

```tsx
<SidebarInset>
  <header>{/* topbar — unchanged */}</header>
  <DrawerProvider activeTab={activeTab}>
    <div className="flex flex-1 overflow-hidden">
      <main id="main-content" className="flex-1 overflow-y-auto">
        <KeepAliveTabPanel>{/* tabs — unchanged */}</KeepAliveTabPanel>
      </main>
      <DrawerSlot />
    </div>
  </DrawerProvider>
  <BottomNav />
</SidebarInset>
```

### Scroll Behavior

The `main` element gains `overflow-y-auto`, making it the single scroll container for all tab content. Currently, tabs manage their own scroll internally. Two compatibility considerations:

1. **Tabs with internal scroll containers** (sticky headers, split panes): These already set `overflow: hidden` or `overflow-y-auto` on their root element, which will prevent double-scrollbars. No changes needed.

2. **Window scroll reset on tab change:** Currently `spa-shell.tsx` calls `window.scrollTo({ top: 0 })` on tab switch. This should change to reset the `main` element's `scrollTop` instead, since the window no longer scrolls.

## Inbox Migration

The inbox tab (`inbox-tab.tsx`) is the only current consumer of `DetailSidebar`. Migration:

### Before

```tsx
<DetailSidebar open={!!selected} onOpenChange={...}>
  <DetailSidebarContent side="right">
    <DetailSidebarHeader>...</DetailSidebarHeader>
    <DetailSidebarBody>...</DetailSidebarBody>
    <DetailSidebarFooter>...</DetailSidebarFooter>
  </DetailSidebarContent>
</DetailSidebar>
```

### After

```tsx
const { setDrawer, closeDrawer } = useDrawer()

useEffect(() => {
  if (selected) {
    setDrawer(
      <>
        <DrawerHeader>...</DrawerHeader>
        <DrawerBody>...</DrawerBody>
        <DrawerFooter>...</DrawerFooter>
      </>
    )
  } else {
    closeDrawer()
  }
}, [selected])
```

The `InboxDrawer` component (`inbox-drawer.tsx`) stays intact — it just renders inside the new drawer slot instead of inside a portalled `DetailSidebar`. Its internal layout (AI summary, thread view, reply composer, keyboard shortcuts) is unchanged.

### Post-migration

Once inbox is migrated and verified, `detail-sidebar.tsx` becomes unused and can be removed. The inbox-specific `InboxDrawer` component continues to work as before — only its mounting point changes.

## What Changes

### Modified
- `personal-assistant/src/components/dashboard/spa-shell.tsx` — add content row wrapper, mount DrawerProvider + DrawerSlot
- `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx` — migrate from DetailSidebar to useDrawer
- `personal-assistant/src/components/dashboard/inbox-drawer.tsx` — remove DetailSidebar wrapper, render drawer content directly

### New
- `personal-assistant/src/components/dashboard/drawer-context.tsx` — DrawerContext, DrawerProvider, useDrawer hook
- `personal-assistant/src/components/dashboard/drawer-slot.tsx` — animated layout slot (desktop push + mobile sheet)
- `personal-assistant/src/components/dashboard/drawer-parts.tsx` — DrawerHeader, DrawerBody, DrawerFooter helpers

### Removed (after migration verified)
- `personal-assistant/src/components/ui/detail-sidebar.tsx` — replaced by drawer system

### Unchanged
- Left sidebar (`sidebar-nav.tsx`)
- Tab keep-alive system (`tab-transition.tsx`)
- All tab components except inbox
- Mobile bottom nav
- Topbar
- Command palette, keyboard shortcuts, onboarding tour

## Error Handling

- **Drawer content throws:** The DrawerProvider should wrap the drawer slot in an error boundary so a crashing drawer doesn't take down the whole dashboard. Falls back to closed drawer with a "Something went wrong" message.
- **Multiple setDrawer calls:** Last one wins. No queueing.
- **Tab unmounts while drawer open:** Auto-close on tab change handles this. The content is just React nodes — they unmount naturally when replaced with null.

## Success Criteria

1. The bordered frame (`rounded-xl`) stays fixed on screen — never scrolls
2. Tab content scrolls within the frame, below the fixed topbar
3. Any tab can open a right-side drawer via `useDrawer()` with a single line
4. Drawer pushes content on desktop (≥768px), overlays as Sheet on mobile
5. Drawer auto-closes when switching tabs
6. Inbox tab works identically to before but uses the new drawer system
7. No portals to `document.body` — everything renders inside the bordered frame
8. Tabs that don't use the drawer are completely unaffected
