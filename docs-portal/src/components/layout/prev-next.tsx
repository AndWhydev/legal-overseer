"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { navigation } from "@/docs.config"
import { useState } from "react"

export function PrevNext() {
  const pathname = usePathname()
  const [hoveredPrev, setHoveredPrev] = useState(false)
  const [hoveredNext, setHoveredNext] = useState(false)

  const allPages = navigation.flatMap((s) => s.items)
  const currentIndex = allPages.findIndex((p) => p.href === pathname)

  const prev = currentIndex > 0 ? allPages[currentIndex - 1] : null
  const next = currentIndex < allPages.length - 1 ? allPages[currentIndex + 1] : null

  if (!prev && !next) return null

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        borderTop: "1px solid #e5e7eb",
        marginTop: "48px",
        paddingTop: "24px",
      }}
    >
      {prev ? (
        <Link
          href={prev.href}
          style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: "4px" }}
          onMouseEnter={() => setHoveredPrev(true)}
          onMouseLeave={() => setHoveredPrev(false)}
        >
          <span style={{ fontSize: "13px", color: "#9ca3af" }}>
            {"\u2190"} Previous
          </span>
          <span style={{ fontSize: "15px", color: hoveredPrev ? "#6b7280" : "#171717", fontWeight: 500, transition: "color 150ms ease" }}>
            {prev.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={next.href}
          style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: "4px", textAlign: "right" }}
          onMouseEnter={() => setHoveredNext(true)}
          onMouseLeave={() => setHoveredNext(false)}
        >
          <span style={{ fontSize: "13px", color: "#9ca3af" }}>
            Next {"\u2192"}
          </span>
          <span style={{ fontSize: "15px", color: hoveredNext ? "#6b7280" : "#171717", fontWeight: 500, transition: "color 150ms ease" }}>
            {next.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
    </div>
  )
}
