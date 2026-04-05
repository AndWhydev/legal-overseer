import { ReactNode } from "react"
import { Lightbulb, Info, AlertTriangle, AlertCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"

type CalloutType = "tip" | "note" | "warning" | "danger"

const config: Record<CalloutType, { icon: LucideIcon; label: string }> = {
  tip: { icon: Lightbulb, label: "Tip" },
  note: { icon: Info, label: "Note" },
  warning: { icon: AlertTriangle, label: "Warning" },
  danger: { icon: AlertCircle, label: "Danger" },
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
  const Icon = c.icon

  return (
    <div
      style={{
        backgroundColor: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "24px 0",
        fontSize: "14px",
        lineHeight: "28px",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: "14px",
          color: "#171717",
          marginBottom: "6px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <Icon size={16} className="shrink-0" style={{ color: "#9ca3af", marginTop: "1px" }} />
        <span>{title || c.label}</span>
      </div>
      <div style={{ color: "#374151" }}>{children}</div>
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
