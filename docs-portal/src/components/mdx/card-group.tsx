'use client'

import { ReactNode } from "react"
import Link from "next/link"

export function CardGroup({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: "16px",
        margin: "24px 0",
      }}
    >
      {children}
    </div>
  )
}

export function Card({
  title,
  href,
  icon,
  description,
  children,
}: {
  title: string
  href?: string
  icon?: string
  description?: string
  children?: ReactNode
}) {
  const content = (
    <div
      style={{
        border: "1px solid rgba(31, 30, 29, 0.15)",
        borderRadius: "12px",
        padding: "16px 20px",
        background: "transparent",
        transition: "border-color 150ms",
        cursor: href ? "pointer" : "default",
        height: "100%",
      }}
      onMouseEnter={(e) => {
        if (href) {
          e.currentTarget.style.borderColor = "rgba(31, 30, 29, 0.3)"
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(31, 30, 29, 0.15)"
      }}
    >
      {icon && (
        <span style={{ fontSize: "20px", marginBottom: "8px", display: "block" }}>
          {icon}
        </span>
      )}
      <h4
        style={{
          fontSize: "15px",
          fontWeight: 600,
          marginBottom: "6px",
          marginTop: 0,
          color: "rgb(20, 20, 19)",
        }}
      >
        {title}
      </h4>
      <div style={{ fontSize: "14px", color: "rgb(61, 61, 58)", lineHeight: "21px" }}>
        {description || children}
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </Link>
    )
  }
  return content
}
