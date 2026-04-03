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
