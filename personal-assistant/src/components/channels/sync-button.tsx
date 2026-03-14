'use client'

import { SFArrowClockwise } from 'sf-symbols-lib'
import { cn } from '@/lib/utils'

interface SyncButtonProps {
  onClick: () => void
  syncing: boolean
}

export function SyncButton({ onClick, syncing }: SyncButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={syncing}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200',
        'hover:opacity-90 active:scale-[0.98]',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
    >
      <SFArrowClockwise className={cn('h-4 w-4', syncing && 'animate-spin')} />
      {syncing ? 'Syncing...' : 'Sync All Channels'}
    </button>
  )
}
