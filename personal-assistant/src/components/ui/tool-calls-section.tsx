"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  IconChevronDown,
  IconLoader2,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { cn } from "@/lib/utils"
import {
  getToolCategoryIcon,
  type IntegrationInfo,
  type ToolCallEntry,
} from "@/lib/tool-calls/presentation"

type ToolCallsSectionProps = {
  toolCalls: ToolCallEntry[]
  integrations?: Map<string, IntegrationInfo>
  maxIconsToShow?: number
  defaultExpanded?: boolean
  className?: string
  iconSize?: number
  renderIcon?: (call: ToolCallEntry, size: number) => React.ReactNode
  summary?: React.ReactNode
  animateEntrance?: boolean
  /** Auto-expand after icons + summary appear */
  autoExpand?: boolean
  /** Auto-collapse when set to true (reasoning finished, response starting) */
  autoCollapse?: boolean
}

// ── Single tool call row ────────────────────────────────────────────────────

function ToolCallRow({
  call,
  index,
  total,
  iconSize,
  integrations,
  renderIcon,
  staggerDelay,
  animateConnector,
}: {
  call: ToolCallEntry
  index: number
  total: number
  iconSize: number
  integrations?: Map<string, IntegrationInfo>
  renderIcon?: ToolCallsSectionProps["renderIcon"]
  staggerDelay: number
  animateConnector: boolean
}) {
  const iconNode = renderCallIcon({ call, iconSize, integrations, renderIcon })
  const showConnector = index < total - 1
  const isRunning = call.status === "running"
  const isError = call.status === "error"

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.24,
        delay: staggerDelay,
        ease: [0.2, 0.9, 0.2, 1],
      }}
    >
      <div className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
        <div className="relative flex justify-center">
          {showConnector && (
            <motion.span
              className="absolute bottom-[-14px] top-[34px] w-px bg-border/60 origin-top"
              initial={animateConnector ? { scaleY: 0 } : false}
              animate={{ scaleY: 1 }}
              transition={{
                duration: 0.35,
                delay: staggerDelay + 0.12,
                ease: [0.2, 0.9, 0.2, 1],
              }}
            />
          )}
          <span className="relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-border/55 bg-background/88 shadow-[0_12px_26px_-24px_rgba(0,0,0,0.85)]">
            {iconNode}
          </span>
        </div>
        <div className="min-w-0 pb-3 pt-0.5">
          <div className="min-w-0 truncate text-[14px] font-medium leading-6">
            {isRunning ? (
              <span className="inline-flex items-center gap-1.5">
                <Shimmer duration={1.4} as="span" className="text-foreground/84">
                  {call.message || call.tool_name}
                </Shimmer>
                <IconLoader2 size={13} className="inline-block shrink-0 animate-spin text-foreground/40" />
              </span>
            ) : isError ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-foreground/50">{call.message || call.tool_name}</span>
                <span className="text-[12px] text-destructive">{call.result_summary || "Failed"}</span>
              </span>
            ) : (
              <span className="text-foreground/50">
                {call.message || call.tool_name}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Icon rendering helper ───────────────────────────────────────────────────

function renderCallIcon({
  call,
  iconSize,
  integrations,
  renderIcon,
}: {
  call: ToolCallEntry
  iconSize: number
  integrations?: Map<string, IntegrationInfo>
  renderIcon?: ToolCallsSectionProps["renderIcon"]
}) {
  if (renderIcon) return renderIcon(call, iconSize)

  const integration = integrations?.get(call.tool_category)
  const customIcon = call.icon_url || integration?.iconUrl

  if (customIcon) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={customIcon} alt="" className="rounded-full object-cover" style={{ width: iconSize, height: iconSize }} />
  }

  const Icon = getToolCategoryIcon(call.tool_category)
  return <Icon size={iconSize} className="text-foreground/80" />
}

// ── Main component ──────────────────────────────────────────────────────────

export function ToolCallsSection({
  toolCalls,
  integrations,
  maxIconsToShow = 10,
  defaultExpanded = false,
  className,
  iconSize = 21,
  renderIcon,
  summary,
  animateEntrance = false,
  autoExpand = false,
  autoCollapse = false,
}: ToolCallsSectionProps) {
  const [open, setOpen] = useState(defaultExpanded)
  const [animatedVisibleIconCount, setAnimatedVisibleIconCount] = useState(0)
  const [animatedSummaryVisible, setAnimatedSummaryVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevAutoCollapseRef = useRef(autoCollapse)

  const stackedCalls = useMemo(() => {
    const seen = new Set<string>()

    return toolCalls.filter((call) => {
      const key = `${call.tool_category}:${call.icon_url || ""}:${call.integration_name || ""}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, maxIconsToShow)
  }, [maxIconsToShow, toolCalls])

  // Icon stagger animation — slower cadence
  useEffect(() => {
    if (!animateEntrance) return

    if (animatedVisibleIconCount < stackedCalls.length) {
      const timer = window.setTimeout(() => {
        setAnimatedVisibleIconCount((count) => Math.min(count + 1, stackedCalls.length))
      }, 180)
      return () => window.clearTimeout(timer)
    }

    if (!animatedSummaryVisible) {
      const timer = window.setTimeout(() => {
        setAnimatedSummaryVisible(true)
      }, 300)
      return () => window.clearTimeout(timer)
    }
  }, [animateEntrance, animatedSummaryVisible, animatedVisibleIconCount, stackedCalls.length])

  // Auto-expand: after summary appears, wait then open
  useEffect(() => {
    if (!autoExpand || !animatedSummaryVisible || open) return

    const timer = window.setTimeout(() => {
      setOpen(true)
    }, 700)
    return () => window.clearTimeout(timer)
  }, [autoExpand, animatedSummaryVisible, open])

  // Scroll the section into view when it first expands
  const hasScrolledOnOpenRef = useRef(false)
  useEffect(() => {
    if (open && !hasScrolledOnOpenRef.current) {
      hasScrolledOnOpenRef.current = true
      // Scroll the container into view so user sees the expand start
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
    if (!open) hasScrolledOnOpenRef.current = false
  }, [open])

  // Auto-collapse: smoothly close when autoCollapse transitions to true
  useEffect(() => {
    if (autoCollapse && !prevAutoCollapseRef.current && open) {
      const timer = window.setTimeout(() => {
        setOpen(false)
      }, 200)
      prevAutoCollapseRef.current = autoCollapse
      return () => window.clearTimeout(timer)
    }
    prevAutoCollapseRef.current = autoCollapse
  }, [autoCollapse, open])

  const failedCount = toolCalls.filter((call) => call.status === "error").length
  const runningCount = toolCalls.filter((call) => call.status === "running").length
  const visibleIconCount = animateEntrance ? animatedVisibleIconCount : stackedCalls.length
  const summaryVisible = animateEntrance ? animatedSummaryVisible : true
  const visibleCalls = stackedCalls.slice(0, visibleIconCount)
  const contentVisible = !animateEntrance || summaryVisible
  const shouldRenderRows = open && contentVisible

  const handleToggle = useCallback(() => {
    setOpen((prev) => !prev)
  }, [])

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      {/* Trigger row: icons + summary + chevron */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-3 py-2 text-left"
      >
        {/* Stacked tool icons */}
        <div className="flex shrink-0 items-center pr-1">
          <AnimatePresence initial={false}>
            {visibleCalls.map((call, index) => (
              <motion.span
                key={call.tool_call_id || `${call.tool_name}-${index}`}
                initial={{ opacity: 0, scale: 0.74, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.74, y: 6 }}
                transition={{ duration: 0.32, ease: [0.2, 0.9, 0.2, 1] }}
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-[18px] border border-border/60 bg-background/88 shadow-[0_16px_34px_-24px_rgba(0,0,0,0.9)]",
                  index > 0 && "-ml-3.5"
                )}
                style={{
                  rotate: `${index % 2 === 0 ? -7 : 6}deg`,
                  translateY: `${index % 2 === 0 ? -1 : 1}px`,
                  zIndex: visibleCalls.length - index,
                }}
              >
                {renderCallIcon({ call, iconSize: Math.max(20, iconSize + 1), integrations, renderIcon })}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* Summary text + chevron (inline, not right-aligned) */}
        <AnimatePresence initial={false}>
          {summaryVisible && (
            <motion.div
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 6 }}
              transition={{ duration: 0.28, ease: [0.2, 0.9, 0.2, 1] }}
              className="flex min-w-0 items-center gap-1.5"
            >
              <p className="truncate text-[14px] font-medium text-foreground/76">
                {summary || `${toolCalls.length} tool${toolCalls.length !== 1 ? "s" : ""}`}
              </p>

              {runningCount > 0 && (
                <Badge variant="secondary" className="rounded-full px-2 text-[11px]">
                  {runningCount} running
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge variant="destructive" className="rounded-full px-2 text-[11px]">
                  {failedCount} failed
                </Badge>
              )}

              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="shrink-0 text-foreground/50"
              >
                <IconChevronDown size={16} stroke={2.3} />
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Expandable tool call rows — CSS grid transition for GPU-composited expand/collapse */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.25,1,0.5,1)]"
        style={{
          gridTemplateRows: open && contentVisible ? "1fr" : "0fr",
          opacity: open && contentVisible ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div className="grid gap-0 pt-4">
            <AnimatePresence initial={false}>
              {shouldRenderRows && toolCalls.map((call, index) => (
                <ToolCallRow
                  key={call.tool_call_id || `${call.tool_name}-${index}`}
                  call={call}
                  index={index}
                  total={toolCalls.length}
                  iconSize={iconSize}
                  integrations={integrations}
                  renderIcon={renderIcon}
                  staggerDelay={Math.min(index * 0.08, 0.32)}
                  animateConnector
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}

export type { ToolCallEntry, IntegrationInfo, ToolCallsSectionProps }
