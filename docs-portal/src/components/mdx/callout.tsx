import { ReactNode } from "react"

type CalloutType = "tip" | "note" | "warning" | "danger"

const icons: Record<CalloutType, string> = {
  tip: "\uD83D\uDCA1",
  note: "\u2139\uFE0F",
  warning: "\u26A0\uFE0F",
  danger: "\u26D4",
}

const labels: Record<CalloutType, string> = {
  tip: "Tip",
  note: "Note",
  warning: "Warning",
  danger: "Danger",
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
  return (
    <div
      style={{
        backgroundColor: "rgb(245, 244, 237)",
        border: "1px solid rgba(31, 30, 29, 0.3)",
        borderRadius: "8px",
        padding: "12px 16px",
        margin: "24px 0",
        fontSize: "15px",
        lineHeight: "24px",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: "14px",
          color: "rgb(20, 20, 19)",
          marginBottom: "4px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span>{icons[type]}</span>
        <span>{title || labels[type]}</span>
      </div>
      <div style={{ color: "rgb(61, 61, 58)" }}>{children}</div>
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
