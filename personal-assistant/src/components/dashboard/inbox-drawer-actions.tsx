'use client'

import {
  IconCircleCheck,
  IconArchive,
  IconArrowForwardUp,
  IconAlertTriangle,
} from '@tabler/icons-react'
import type { ChannelFamily } from './use-drawer-state'

interface ActionsBarProps {
  channelFamily: ChannelFamily
  onDone: () => void
  onArchive: () => void
  onForward?: () => void
  onSpam: () => void
}

export function InboxDrawerActions({ channelFamily, onDone, onArchive, onForward, onSpam }: ActionsBarProps) {
  return (
    <div className="shrink-0 flex items-center gap-4 px-5 pb-3 pt-1 text-xs text-sidebar-foreground/20">
      <button onClick={onDone} className="flex items-center gap-1 hover:text-sidebar-foreground/50 transition-colors">
        <IconCircleCheck className="size-4" />
        Done
      </button>
      <button onClick={onArchive} className="flex items-center gap-1 hover:text-sidebar-foreground/50 transition-colors">
        <IconArchive className="size-4" />
        Archive
      </button>
      {channelFamily === 'email' && onForward && (
        <button onClick={onForward} className="flex items-center gap-1 hover:text-sidebar-foreground/50 transition-colors">
          <IconArrowForwardUp className="size-4" />
          Forward
        </button>
      )}
      <button onClick={onSpam} className="flex items-center gap-1 hover:text-sidebar-foreground/50 transition-colors">
        <IconAlertTriangle className="size-4" />
        Spam
      </button>
      <span className="ml-auto">
        <kbd className="rounded bg-sidebar-foreground/[0.04] px-1 py-0.5 text-xs font-mono">⌘↵</kbd> send
      </span>
    </div>
  )
}
