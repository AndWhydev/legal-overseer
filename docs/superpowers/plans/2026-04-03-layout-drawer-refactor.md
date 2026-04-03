# Layout & Drawer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the dashboard layout so the border frame is fixed, content scrolls inside it, and any tab can render into a shared right-side drawer slot.

**Architecture:** A `DrawerProvider` at the SPA shell level holds drawer state. A new flex row inside `SidebarInset` splits space between a scrollable `main` and an animated `DrawerSlot`. Tabs call `useDrawer().setDrawer(<Content />)` to push content into the slot. The inbox tab migrates from the portalled `DetailSidebar` to this new system.

**Tech Stack:** React 19, shadcn/ui (Sheet), motion/react (animations), existing SPA shell architecture

**Spec:** `docs/superpowers/specs/2026-04-03-layout-drawer-refactor-design.md`

---

## File Structure

### New files

```
personal-assistant/src/components/dashboard/
  drawer-context.tsx     — DrawerContext, DrawerProvider, useDrawer hook
  drawer-slot.tsx        — Animated layout slot (desktop push + mobile sheet)
  drawer-parts.tsx       — DrawerHeader, DrawerBody, DrawerFooter helpers
```

### Modified files

```
personal-assistant/src/components/dashboard/spa-shell.tsx        — Add content row, mount DrawerProvider + DrawerSlot
personal-assistant/src/components/dashboard/inbox-drawer.tsx     — Remove DetailSidebar wrapper, export raw content
personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx   — Use useDrawer() instead of rendering InboxDrawer inline
```

---

## Task 1: DrawerContext & DrawerProvider

**Files:**
- Create: `personal-assistant/src/components/dashboard/drawer-context.tsx`

- [ ] **Step 1: Create the drawer context and provider**

```typescript
// personal-assistant/src/components/dashboard/drawer-context.tsx
'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

interface DrawerContextValue {
  content: ReactNode | null
  isOpen: boolean
  setDrawer: (content: ReactNode) => void
  closeDrawer: () => void
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

interface DrawerProviderProps {
  activeTab: string
  children: ReactNode
}

export function DrawerProvider({ activeTab, children }: DrawerProviderProps) {
  const [content, setContent] = useState<ReactNode | null>(null)

  const setDrawer = useCallback((node: ReactNode) => {
    setContent(node)
  }, [])

  const closeDrawer = useCallback(() => {
    setContent(null)
  }, [])

  // Auto-close on tab change
  useEffect(() => {
    setContent(null)
  }, [activeTab])

  const value: DrawerContextValue = {
    content,
    isOpen: content !== null,
    setDrawer,
    closeDrawer,
  }

  return (
    <DrawerContext.Provider value={value}>
      {children}
    </DrawerContext.Provider>
  )
}

export function useDrawer() {
  const context = useContext(DrawerContext)
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider')
  }
  return context
}
```

- [ ] **Step 2: Commit**

```bash
git add personal-assistant/src/components/dashboard/drawer-context.tsx
git commit -m "feat(layout): drawer context and provider with auto-close on tab change"
```

---

## Task 2: DrawerSlot Component

**Files:**
- Create: `personal-assistant/src/components/dashboard/drawer-slot.tsx`

- [ ] **Step 1: Create the drawer slot**

```typescript
// personal-assistant/src/components/dashboard/drawer-slot.tsx
'use client'

import { useDrawer } from './drawer-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'

export function DrawerSlot() {
  const { content, isOpen, closeDrawer } = useDrawer()
  const isMobile = useIsMobile()

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={open => { if (!open) closeDrawer() }}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex h-[100svh] w-full flex-col gap-0 overflow-hidden rounded-none p-0"
        >
          {content}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
        isOpen ? 'w-[25rem] border-l' : 'w-0',
      )}
    >
      <div className="w-[25rem] h-full flex flex-col overflow-hidden">
        {content}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add personal-assistant/src/components/dashboard/drawer-slot.tsx
git commit -m "feat(layout): drawer slot with desktop push and mobile sheet"
```

---

## Task 3: Drawer Helper Components

**Files:**
- Create: `personal-assistant/src/components/dashboard/drawer-parts.tsx`

- [ ] **Step 1: Create drawer part components**

These mirror the existing `DetailSidebarHeader/Body/Footer` styling but without the portal/Sheet wrapper.

```typescript
// personal-assistant/src/components/dashboard/drawer-parts.tsx
'use client'

import { cn } from '@/lib/utils'

export function DrawerHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn('shrink-0 border-b px-5 py-4', className)}
      {...props}
    />
  )
}

export function DrawerBody({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-body"
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5', className)}
      {...props}
    />
  )
}

export function DrawerFooter({
  className,
  style,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn('shrink-0 border-t px-5 pt-4 pb-5', className)}
      style={{
        paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))',
        ...style,
      }}
      {...props}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add personal-assistant/src/components/dashboard/drawer-parts.tsx
git commit -m "feat(layout): drawer header, body, footer helper components"
```

---

## Task 4: Wire DrawerProvider + DrawerSlot into SPA Shell

**Files:**
- Modify: `personal-assistant/src/components/dashboard/spa-shell.tsx`

This is the core layout refactor — wrapping the main content area in a flex row with the drawer slot.

- [ ] **Step 1: Add imports**

At the top of `spa-shell.tsx`, add these imports (near the other component imports around line 20-38):

```typescript
import { DrawerProvider } from './drawer-context';
import { DrawerSlot } from './drawer-slot';
```

- [ ] **Step 2: Restructure the content area**

Find the current main content area (lines 427-452 of spa-shell.tsx):

```tsx
              {/* SPA Content Area — keep-alive: visited tabs stay mounted */}
              <main
                id="main-content"
                className="relative flex-1 overflow-hidden bg-background"
                tabIndex={-1}
              >
                <KeepAliveTabPanel
                  activeTabId={TABS[activeNavIndex]?.id ?? 'dashboard'}
                  direction={transitionDir}
                  tabs={TABS
                    .filter(t => visitedTabs.has(t.id))
                    .map(t => {
                      const Comp = TabComponents[t.id];
                      return {
                        id: t.id,
                        children: (
                          <ErrorBoundary>
                            <Suspense fallback={<TabSkeleton variant={TAB_SKELETON_VARIANTS[t.id]} />}>
                              <Comp />
                            </Suspense>
                          </ErrorBoundary>
                        ),
                      };
                    })}
                />
              </main>
```

Replace with:

```tsx
              {/* Content row: scrollable tabs + drawer slot */}
              <DrawerProvider activeTab={TABS[activeNavIndex]?.id ?? 'dashboard'}>
                <div className="flex flex-1 overflow-hidden">
                  {/* SPA Content Area — keep-alive: visited tabs stay mounted */}
                  <main
                    id="main-content"
                    className="relative flex-1 overflow-y-auto bg-background"
                    tabIndex={-1}
                  >
                    <KeepAliveTabPanel
                      activeTabId={TABS[activeNavIndex]?.id ?? 'dashboard'}
                      direction={transitionDir}
                      tabs={TABS
                        .filter(t => visitedTabs.has(t.id))
                        .map(t => {
                          const Comp = TabComponents[t.id];
                          return {
                            id: t.id,
                            children: (
                              <ErrorBoundary>
                                <Suspense fallback={<TabSkeleton variant={TAB_SKELETON_VARIANTS[t.id]} />}>
                                  <Comp />
                                </Suspense>
                              </ErrorBoundary>
                            ),
                          };
                        })}
                    />
                  </main>
                  <DrawerSlot />
                </div>
              </DrawerProvider>
```

Key changes:
- `DrawerProvider` wraps the content row, receiving the active tab ID
- New `div.flex.flex-1.overflow-hidden` is the content row
- `main` changes from `overflow-hidden` to `overflow-y-auto` (now the scroll container)
- `DrawerSlot` is a flex sibling of `main`

- [ ] **Step 3: Update scroll reset**

Find the scroll reset effect (lines 305-308):

```tsx
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeNavIndex]);
```

Replace with:

```tsx
  useEffect(() => {
    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [activeNavIndex]);
```

This resets the new scroll container on tab change while keeping the window reset as a safety net.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd personal-assistant && npx tsc --noEmit 2>&1 | grep 'error TS' | head -10`
Expected: No new errors related to drawer or spa-shell changes.

- [ ] **Step 5: Commit**

```bash
git add personal-assistant/src/components/dashboard/spa-shell.tsx
git commit -m "feat(layout): wire drawer provider and slot into SPA shell with scroll fix"
```

---

## Task 5: Migrate Inbox Drawer

**Files:**
- Modify: `personal-assistant/src/components/dashboard/inbox-drawer.tsx`
- Modify: `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx`

- [ ] **Step 1: Refactor InboxDrawer to export raw content**

The current `InboxDrawer` wraps everything in `<DetailSidebar>` + `<DetailSidebarContent>`. We need to remove that wrapper and have it render the drawer content directly. The inbox-tab will use `useDrawer()` to mount it.

In `personal-assistant/src/components/dashboard/inbox-drawer.tsx`:

Remove the imports of DetailSidebar components (lines 18-25):
```typescript
// REMOVE these imports:
import {
  DetailSidebar,
  DetailSidebarBody,
  DetailSidebarContent,
  DetailSidebarDescription,
  DetailSidebarFooter,
  DetailSidebarHeader,
  DetailSidebarTitle,
} from '@/components/ui/detail-sidebar';
```

Find the return statement (around line 489-490):
```tsx
    <DetailSidebar open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DetailSidebarContent
        side="right"
        showCloseButton={false}
      >
```

Replace the opening wrapper with a fragment:
```tsx
    <>
```

Find the closing tags (around line 644-646):
```tsx
        </DetailSidebarFooter>
      </DetailSidebarContent>
    </DetailSidebar>
```

Replace with:
```tsx
        </div>
    </>
```

Also update the inner layout components:
- Replace `<DetailSidebarHeader ...>` with `<div className="shrink-0 border-b px-5 py-4" ...>`
- Replace `</DetailSidebarHeader>` with `</div>`
- Replace `<DetailSidebarBody ...>` with `<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5" ...>`
- Replace `</DetailSidebarBody>` with `</div>`
- Replace `<DetailSidebarFooter ...>` with `<div className="shrink-0 border-t px-5 pt-4 pb-5" ...>`
- Replace `</DetailSidebarFooter>` with `</div>`
- Replace `<DetailSidebarTitle ...>` with `<h2 className="truncate text-base font-medium" ...>`
- Replace `</DetailSidebarTitle>` with `</h2>`
- Replace `<DetailSidebarDescription ...>` with `<p className="text-xs text-muted-foreground" ...>`
- Replace `</DetailSidebarDescription>` with `</p>`

Remove the `open` prop from the component interface since the drawer visibility is now controlled by the parent via `useDrawer()`. Keep `onClose` since the inbox drawer needs to signal when the user clicks close/escape.

- [ ] **Step 2: Update inbox-tab to use useDrawer**

In `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx`:

Add the import (near the top):
```typescript
import { useDrawer } from '@/components/dashboard/drawer-context'
```

Inside the component, add the hook:
```typescript
const { setDrawer, closeDrawer: closeDrawerSlot } = useDrawer()
```

Find where `InboxDrawer` is rendered (around line 1017):
```tsx
        <InboxDrawer
          message={drawerMessage}
          open={Boolean(selectedMessage)}
          onClose={closeDrawer}
          onArchive={handleArchive}
          onDone={handleDone}
          onReply={handleReply}
          onNavigate={handleNavigate}
          threadMessages={drawerMessage ? SEED_THREAD_MESSAGES[drawerMessage.id] : undefined}
        />
```

Replace with a `useEffect` that pushes content into the drawer slot:

```tsx
        {/* Drawer content managed via useDrawer */}
```

Add the effect near the other effects in the component:
```typescript
  // Push inbox drawer content into the layout drawer slot
  useEffect(() => {
    if (selectedMessage && drawerMessage) {
      setDrawer(
        <InboxDrawer
          message={drawerMessage}
          onClose={() => { closeDrawer(); closeDrawerSlot(); }}
          onArchive={handleArchive}
          onDone={handleDone}
          onReply={handleReply}
          onNavigate={handleNavigate}
          threadMessages={SEED_THREAD_MESSAGES[drawerMessage.id]}
        />
      )
    } else {
      closeDrawerSlot()
    }
  }, [selectedMessage, drawerMessage])
```

Note: `closeDrawer` is the inbox tab's own state reset (deselects the message). `closeDrawerSlot` is the layout drawer's close. Both need to fire when the user closes the drawer.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd personal-assistant && npx tsc --noEmit 2>&1 | grep 'error TS' | head -10`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add personal-assistant/src/components/dashboard/inbox-drawer.tsx personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
git commit -m "refactor(inbox): migrate from DetailSidebar to drawer slot"
```

---

## Task 6: Clean Up & Verify

**Files:**
- Check: `personal-assistant/src/components/ui/detail-sidebar.tsx`

- [ ] **Step 1: Check if DetailSidebar is still imported anywhere**

```bash
cd personal-assistant && grep -rn 'detail-sidebar\|DetailSidebar' src/ --include='*.ts' --include='*.tsx' | grep -v 'node_modules' | grep -v '.test.'
```

If no results (inbox-drawer was the only consumer), the file is safe to remove later. Do NOT remove it in this task — leave it for a follow-up cleanup.

- [ ] **Step 2: Run TypeScript check**

Run: `cd personal-assistant && npx tsc --noEmit 2>&1 | grep 'error TS' | head -20`
Expected: No new errors from the refactor.

- [ ] **Step 3: Run the build**

Run: `cd personal-assistant && npm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 4: Commit any remaining fixes**

If the build revealed issues, fix and commit:
```bash
git add -A
git commit -m "fix(layout): resolve build issues from drawer refactor"
```

If no issues, skip this step.

---

## Summary

| Task | What it builds | Dependencies |
|------|---------------|--------------|
| 1 | DrawerContext + DrawerProvider + useDrawer | None |
| 2 | DrawerSlot (desktop push + mobile sheet) | Task 1 |
| 3 | DrawerHeader, DrawerBody, DrawerFooter | None |
| 4 | Wire into SPA shell + scroll fix | Tasks 1, 2 |
| 5 | Inbox migration from DetailSidebar | Tasks 1, 4 |
| 6 | Verify build + cleanup check | Task 5 |

**Parallelizable:** Tasks 1 + 3 can run in parallel. Tasks 2 depends on 1. Task 4 depends on 1 + 2. Task 5 depends on 4. Task 6 depends on 5.
