'use client'

import {
  IconArchive,
  IconArrowForwardUp,
  IconAlertTriangle,
} from '@tabler/icons-react'
import type { ChannelFamily } from './use-drawer-state'

interface ActionsBarProps {
  channelFamily: ChannelFamily
  onArchive: () => void
  onForward?: () => void
  onSpam: () => void
}

export function InboxDrawerActions({ channelFamily, onArchive, onForward, onSpam }: ActionsBarProps) {
  return (
    <div className="shrink-0 flex items-center gap-4 px-5 py-3 text-sm text-sidebar-foreground/25">
      <button onClick={onArchive} className="flex items-center gap-1.5 hover:text-sidebar-foreground/60 transition-colors">
        <IconArchive className="size-4" />
        Archive
      </button>
      {channelFamily === 'email' && onForward && (
        <button onClick={onForward} className="flex items-center gap-1.5 hover:text-sidebar-foreground/60 transition-colors">
          <IconArrowForwardUp className="size-4" />
          Forward
        </button>
      )}
      <button onClick={onSpam} className="flex items-center gap-1.5 hover:text-sidebar-foreground/60 transition-colors">
        <IconAlertTriangle className="size-4" />
        Spam
      </button>
    </div>
  )
}
