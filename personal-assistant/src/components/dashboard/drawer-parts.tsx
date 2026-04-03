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
