"use client"

import { useMemo, useState } from "react"
import { motion } from "motion/react"
import {
  IconAlertCircle,
  IconChevronDown,
  IconCircleCheck,
  IconLoader2,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  getToolCategoryIcon,
  getToolCategoryLabel,
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
  renderContent?: (content: unknown) => React.ReactNode
  summary?: React.ReactNode
}

function DefaultContent({ content }: { content: unknown }) {
  const text = typeof content === "string" ? content : JSON.stringify(content, null, 2)

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-[16px] border border-border/50 bg-background/55 p-3 text-[13px] leading-6 text-foreground/76">
      {text}
    </pre>
  )
}

function ToolStatusBadge({
  status,
  elapsedMs,
  resultSummary,
}: {
  status?: ToolCallEntry["status"]
  elapsedMs?: number
  resultSummary?: string
}) {
  if (status === "running") {
    return (
      <Badge variant="secondary" className="gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 text-[11px] text-muted-foreground">
        <IconLoader2 className="animate-spin" />
        {elapsedMs && elapsedMs >= 1000 ? `${Math.ceil(elapsedMs / 1000)}s` : "Running"}
      </Badge>
    )
  }

  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1 rounded-full px-2.5 text-[11px]">
        <IconAlertCircle />
        {resultSummary || "Failed"}
      </Badge>
    )
  }

  return null
}

function ToolCallRow({
  call,
  index,
  total,
  iconSize,
  integrations,
  renderIcon,
  renderContent,
}: {
  call: ToolCallEntry
  index: number
  total: number
  iconSize: number
  integrations?: Map<string, IntegrationInfo>
  renderIcon?: ToolCallsSectionProps["renderIcon"]
  renderContent?: ToolCallsSectionProps["renderContent"]
}) {
  const [open, setOpen] = useState(call.status === "running")
  const hasDetails = Boolean(call.inputs) || Boolean(call.output)
  const contentRenderer = renderContent ?? ((content: unknown) => <DefaultContent content={content} />)
  const label = call.integration_name || integrations?.get(call.tool_category)?.name || getToolCategoryLabel(call.tool_category)
  const iconNode = renderCallIcon({ call, iconSize, integrations, renderIcon })
  const showConnector = index < total - 1
  const showDoneMarker = call.status === "done"

  const header = (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-4">
      <div className="relative flex justify-center">
        {showConnector && (
          <span className="absolute bottom-[-20px] top-[56px] w-px bg-border/65" />
        )}
        <span className="relative z-10 inline-flex size-12 shrink-0 items-center justify-center rounded-[16px] border border-border/55 bg-background/80 shadow-[0_10px_28px_-22px_rgba(0,0,0,0.85)]">
          {iconNode}
        </span>
      </div>
      <div className="min-w-0 pb-5 pt-0.5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="min-w-0 text-[15px] font-medium leading-8 text-foreground/82">
              {call.message || call.tool_name}
            </p>
            {call.show_category !== false && (
              <p className="mt-[-1px] text-[12px] leading-6 text-muted-foreground/95">
                {label}
              </p>
            )}
            {call.result_summary && call.status === "error" && (
              <p className="mt-1 text-[12px] leading-5 text-destructive">
                {call.result_summary}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-1">
            <ToolStatusBadge
              status={call.status}
              elapsedMs={call.elapsed_ms}
              resultSummary={call.result_summary}
            />
            {showDoneMarker && (
              <IconCircleCheck size={16} className="text-foreground/28" />
            )}
            {hasDetails && (
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: 0.16 }}
                className="text-foreground/70"
              >
                <IconChevronDown size={18} stroke={2.3} />
              </motion.span>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  if (!hasDetails) {
    return <div>{header}</div>
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left">
            {header}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-[80px] grid gap-3 pb-5 pr-2">
            {call.inputs && (
              <div className="grid gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Inputs
                </p>
                {contentRenderer(call.inputs)}
              </div>
            )}
            {call.output && (
              <div className="grid gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Output
                </p>
                {contentRenderer(call.output)}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

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

export function ToolCallsSection({
  toolCalls,
  integrations,
  maxIconsToShow = 10,
  defaultExpanded = false,
  className,
  iconSize = 21,
  renderIcon,
  renderContent,
  summary,
}: ToolCallsSectionProps) {
  const [open, setOpen] = useState(defaultExpanded)

  const stackedCalls = useMemo(() => {
    const seen = new Set<string>()

    return toolCalls.filter((call) => {
      const key = `${call.tool_category}:${call.icon_url || ""}:${call.integration_name || ""}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, maxIconsToShow)
  }, [maxIconsToShow, toolCalls])

  const failedCount = toolCalls.filter((call) => call.status === "error").length
  const runningCount = toolCalls.filter((call) => call.status === "running").length

  const supportingLabels = [...new Set(
    toolCalls
      .filter((call) => call.show_category !== false)
      .map((call) => call.integration_name || integrations?.get(call.tool_category)?.name || getToolCategoryLabel(call.tool_category)),
  )].slice(0, 3)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("w-full", className)}>
      <div>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center gap-4 py-2 text-left">
            <div className="flex shrink-0 items-center">
              {stackedCalls.map((call, index) => (
                <span
                  key={call.tool_call_id || `${call.tool_name}-${index}`}
                  className={cn("inline-flex rounded-[18px] border border-border/60 bg-background/82 p-2 shadow-[0_16px_34px_-24px_rgba(0,0,0,0.9)]", index > 0 && "-ml-3")}
                  style={{
                    rotate: `${index % 2 === 0 ? -6 : 6}deg`,
                    zIndex: stackedCalls.length - index,
                  }}
                >
                  {renderCallIcon({ call, iconSize: Math.max(20, iconSize + 1), integrations, renderIcon })}
                </span>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-foreground/72">
                {summary || `${toolCalls.length} tool call${toolCalls.length !== 1 ? "s" : ""}`}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground/92">
                {supportingLabels.length > 0 && (
                  <span className="truncate">
                    {supportingLabels.join(" · ")}
                  </span>
                )}
                {runningCount > 0 && <Badge variant="secondary" className="rounded-full">{runningCount} running</Badge>}
                {failedCount > 0 && <Badge variant="destructive" className="rounded-full">{failedCount} failed</Badge>}
              </div>
            </div>

            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.16 }}
              className="shrink-0 text-foreground/68"
            >
              <IconChevronDown size={18} stroke={2.3} />
            </motion.span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid gap-0 pt-5">
            {toolCalls.map((call, index) => (
              <ToolCallRow
                key={call.tool_call_id || `${call.tool_name}-${call.message}`}
                call={call}
                index={index}
                total={toolCalls.length}
                iconSize={iconSize}
                integrations={integrations}
                renderIcon={renderIcon}
                renderContent={renderContent}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

export type { ToolCallEntry, IntegrationInfo, ToolCallsSectionProps }
