// src/components/dashboard/inbox-drawer-actions.tsx
'use client'

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
    <div className="shrink-0 flex items-center gap-3 px-5 pb-3 pt-1 text-[10px] text-sidebar-foreground/20">
      <button onClick={onDone} className="hover:text-sidebar-foreground/50 transition-colors">✓ Done</button>
      <button onClick={onArchive} className="hover:text-sidebar-foreground/50 transition-colors">📦 Archive</button>
      {channelFamily === 'email' && onForward && (
        <button onClick={onForward} className="hover:text-sidebar-foreground/50 transition-colors">↪ Forward</button>
      )}
      <button onClick={onSpam} className="hover:text-sidebar-foreground/50 transition-colors">⚠ Spam</button>
      <span className="ml-auto">
        <kbd className="rounded bg-sidebar-foreground/[0.04] px-1 py-0.5 text-[9px] font-mono">⌘↵</kbd> send
      </span>
    </div>
  )
}
