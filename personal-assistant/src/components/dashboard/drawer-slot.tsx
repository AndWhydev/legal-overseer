'use client'

import { useDrawer } from './drawer-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'

const DRAWER_WIDTH = '25rem'

/**
 * DrawerSlot — mirrors the Sidebar architecture exactly:
 *
 * Desktop: gap div (takes flow space, pushes SidebarInset) + fixed div (visual panel)
 * Mobile: Sheet overlay from the right
 *
 * Must be a SIBLING of SidebarInset inside SidebarProvider, not a child of it.
 */
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
      data-slot="drawer"
      data-state={isOpen ? 'open' : 'closed'}
      className="text-sidebar-foreground hidden md:block"
    >
      {/* Gap: takes up space in the flow so SidebarInset shrinks */}
      <div
        data-slot="drawer-gap"
        className={cn(
          'relative bg-transparent transition-[width] duration-300 ease-[cubic-bezier(0.7,-0.15,0.25,1.15)]',
          isOpen ? 'w-(--drawer-width)' : 'w-0',
        )}
        style={{ '--drawer-width': DRAWER_WIDTH } as React.CSSProperties}
      />
      {/* Fixed panel: the actual visible drawer, pinned to right edge */}
      <div
        data-slot="drawer-container"
        className={cn(
          'fixed inset-y-0 right-0 z-10 hidden h-svh p-2 pr-2 pl-0 transition-[width] duration-300 ease-[cubic-bezier(0.75,0,0.25,1)] md:flex',
          isOpen ? 'w-(--drawer-width)' : 'w-0',
        )}
        style={{ '--drawer-width': DRAWER_WIDTH } as React.CSSProperties}
      >
        <div
          className={cn(
            'bg-sidebar flex h-full w-full flex-col overflow-hidden rounded-lg border border-sidebar-border shadow-sm transition-opacity duration-300',
            isOpen ? 'opacity-100' : 'opacity-0',
          )}
        >
          {content}
        </div>
      </div>
    </div>
  )
}
