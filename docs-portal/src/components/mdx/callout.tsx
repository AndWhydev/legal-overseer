import { ReactNode } from "react"
import { cn } from "@/lib/utils"

type CalloutType = "tip" | "note" | "warning" | "danger"

const config: Record<
  CalloutType,
  { bg: string; border: string; label: string }
> = {
  tip: {
    bg: "bg-[hsl(270,95%,97%)]",
    border: "border-l-[#9333ea]",
    label: "Tip",
  },
  note: {
    bg: "bg-[hsl(215,95%,97%)]",
    border: "border-l-[#155dfc]",
    label: "Note",
  },
  warning: {
    bg: "bg-[hsl(45,95%,97%)]",
    border: "border-l-[#ca8a04]",
    label: "Warning",
  },
  danger: {
    bg: "bg-[hsl(0,95%,97%)]",
    border: "border-l-[#d01e22]",
    label: "Danger",
  },
}

export function Callout({
  type = "note",
  title,
  children,
}: {
  type?: CalloutType
  title?: string
  children: ReactNode
}) {
  const c = config[type]
  return (
    <div
      className={cn(
        c.bg,
        c.border,
        "border-l-[3px] rounded-r-lg px-5 py-4 my-6 text-[15px] leading-[1.7]"
      )}
    >
      {title && (
        <div className="font-semibold text-[var(--text-primary)] text-sm mb-1">
          {title}
        </div>
      )}
      <div className="text-[var(--text-body)]">{children}</div>
    </div>
  )
}

export function Tip({ children }: { children: ReactNode }) {
  return <Callout type="tip">{children}</Callout>
}

export function Note({ children }: { children: ReactNode }) {
  return <Callout type="note">{children}</Callout>
}

export function Warning({ children }: { children: ReactNode }) {
  return <Callout type="warning">{children}</Callout>
}

export function Danger({ children }: { children: ReactNode }) {
  return <Callout type="danger">{children}</Callout>
}
