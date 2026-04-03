// src/components/dashboard/inbox-drawer-triage.tsx
'use client'

import { IconSparkles, IconRobot } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import type { TriageState, DelegationAction } from './use-drawer-state'


interface TriagePanelProps {
  summary: string
  triageState: TriageState
  delegationActions: DelegationAction[]
  compact?: boolean // true for chat channels
  onDelegate: () => void
  onUndoDelegate: () => void
}

function ReadyState({
  summary,
  compact,
  onDelegate,
}: Pick<TriagePanelProps, 'summary' | 'compact' | 'onDelegate'>) {
  if (compact) {
    return (
      <div className="mx-3.5 mb-2 flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 shrink-0">
        <IconSparkles className="size-4 text-sidebar-foreground/60 shrink-0" />
        <span className="flex-1 text-xs text-sidebar-foreground/45 truncate">{summary}</span>
        <button
          onClick={onDelegate}
          className="shrink-0 rounded-lg bg-primary/10 px-2 py-0.5 text-xs text-sidebar-foreground/70 hover:bg-primary/20 transition-colors"
        >
          🤖
        </button>
      </div>
    )
  }

  return (
    <div className="mx-3.5 mb-2 rounded-lg bg-sidebar-accent px-3.5 py-3 shrink-0">
      <div className="flex items-start gap-2 mb-2.5">
        <IconSparkles className="size-4 text-sidebar-foreground/60 shrink-0 mt-0.5" />
        <p className="flex-1 text-xs text-sidebar-foreground/50 leading-relaxed [&_strong]:text-sidebar-foreground/70">
          {summary}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          className="bg-primary/10 text-sidebar-foreground/80 hover:bg-primary/20 font-medium"
          onClick={onDelegate}
        >
          <IconRobot className="size-4" />
          Handle with BitBit
        </Button>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="mx-3.5 mb-2 rounded-lg bg-sidebar-accent px-3.5 py-3 shrink-0">
      <div className="flex items-center gap-2">
        <IconRobot className="size-4 text-sidebar-foreground/60 animate-pulse" />
        <span className="text-xs text-sidebar-foreground/50">BitBit is thinking...</span>
      </div>
    </div>
  )
}

function DelegatedState({
  delegationActions,
  onUndo,
}: {
  delegationActions: DelegationAction[]
  onUndo: () => void
}) {
  return (
    <div className="mx-3.5 mb-2 rounded-lg bg-sidebar-accent px-3.5 py-3 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <IconRobot className="size-4 text-sidebar-foreground/60" />
        <span className="text-xs font-medium text-sidebar-foreground/70">BitBit is handling this</span>
      </div>
      <div className="flex flex-col gap-1.5 pl-1 mb-3">
        {delegationActions.map((action, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="text-sidebar-foreground/50">✓</span>
            <span className="text-sidebar-foreground/50">{action.label}</span>
            {action.targetRoute === 'approvals' && (
              <span className="ml-auto text-xs rounded bg-sidebar-foreground/[0.06] px-1.5 py-0.5 text-sidebar-foreground/50">
                In Approvals
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          className="bg-primary/10 text-sidebar-foreground/70 hover:bg-primary/20"
        >
          Review Draft →
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="text-sidebar-foreground/35 hover:text-sidebar-foreground/60"
          onClick={onUndo}
        >
          Undo All
        </Button>
      </div>
    </div>
  )
}

export function InboxDrawerTriage(props: TriagePanelProps) {
  switch (props.triageState) {
    case 'loading':
      return <LoadingState />
    case 'delegated':
      return <DelegatedState delegationActions={props.delegationActions} onUndo={props.onUndoDelegate} />
    default:
      return <ReadyState {...props} />
  }
}
