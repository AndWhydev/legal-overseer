"use client"

import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  IconCircleCheck,
  IconChevronDown,
  IconLoader2,
  IconSettings,
  IconCircleX,
} from "@tabler/icons-react"
import { useState } from "react"
import { motion } from "motion/react"

export type ToolStatus = "running" | "done" | "error"

export type ToolProps = {
  /** Tool display name (human-readable) */
  name: string
  /** Tool icon (tabler icon component) */
  icon?: React.ElementType
  /** Current tool status */
  status: ToolStatus
  /** Short detail string (e.g. search query, recipient) */
  detail?: string
  /** Brief result summary */
  resultSummary?: string
  /** Elapsed time in ms (shown while running) */
  elapsedMs?: number
  /** Expandable child content (sub-tasks, narration) */
  children?: React.ReactNode
  /** Whether the tool content is open by default */
  defaultOpen?: boolean
  /** Index for staggered entrance animation */
  index?: number
  className?: string
}

const Tool = ({
  name,
  icon: Icon,
  status,
  detail,
  resultSummary,
  elapsedMs,
  children,
  defaultOpen = false,
  index = 0,
  className,
}: ToolProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const hasContent = !!children

  const getStatusIcon = () => {
    switch (status) {
      case "running":
        return <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
      case "done":
        return <IconCircleCheck className="size-4 text-muted-foreground" />
      case "error":
        return <IconCircleX className="size-4 text-destructive" />
      default:
        return <IconSettings className="size-4 text-muted-foreground" />
    }
  }

  const getResultBadge = () => {
    if (status === "running") return null
    const text = status === "error" ? "Failed" : resultSummary
    if (!text) return null

    return (
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 text-xs",
          status === "error"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground"
        )}
      >
        {text}
      </span>
    )
  }

  const trigger = (
    <div className="flex min-w-0 items-center gap-2">
      {Icon ? (
        <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
          <span className={cn(
            "transition-opacity",
            hasContent && "group-hover/tool:opacity-0"
          )}>
            {status === "running" ? (
              <Icon className="size-4 animate-pulse text-muted-foreground" />
            ) : (
              <Icon className="size-4 text-muted-foreground/70" />
            )}
          </span>
          {hasContent && (
            <IconChevronDown className="absolute size-4 text-muted-foreground opacity-0 transition-opacity group-hover/tool:opacity-100 group-data-[state=open]/tool:rotate-180" />
          )}
        </span>
      ) : (
        getStatusIcon()
      )}
      <span className={cn(
        "truncate text-sm",
        status === "running" ? "text-muted-foreground" : "text-muted-foreground/80"
      )}>
        {name}
      </span>
      {detail && (
        <span className="max-w-[min(200px,40vw)] truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          {detail}
        </span>
      )}
      {status === "running" && elapsedMs != null && elapsedMs >= 2000 && (
        <span className="text-xs tabular-nums text-muted-foreground/60">
          {Math.ceil(elapsedMs / 1000)}s
        </span>
      )}
      {getResultBadge()}
    </div>
  )

  const staggerDelay = index * 0.1

  // No children — render as a simple row (no collapsible)
  if (!hasContent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: staggerDelay, ease: [0.25, 1, 0.5, 1] }}
        className={cn(
          "group/tool flex min-w-0 items-center gap-1 py-0.5 text-sm",
          className
        )}
      >
        {trigger}
      </motion.div>
    )
  }

  // Has children — wrap in collapsible
  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("group/tool", className)}
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1 py-0.5 text-sm transition-colors hover:text-foreground">
        {trigger}
        {!Icon && (
          <IconChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden">
        <div className="mt-1 space-y-1 border-l-2 border-muted pl-5">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export { Tool }
