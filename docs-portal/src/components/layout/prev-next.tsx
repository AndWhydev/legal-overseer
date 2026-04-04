"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { navigation } from "@/docs.config"

export function PrevNext() {
  const pathname = usePathname()

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
        borderTop: "1px solid rgb(222, 222, 222)",
        marginTop: "48px",
        paddingTop: "24px",
      }}
    >
      {prev ? (
        <Link
          href={prev.href}
          style={{
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "12px", color: "rgb(140, 140, 140)" }}>
            Previous
          </span>
          <span
            style={{ fontSize: "14px", color: "rgb(23, 23, 23)", fontWeight: 500 }}
          >
            {prev.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={next.href}
          style={{
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            textAlign: "right",
          }}
        >
          <span style={{ fontSize: "12px", color: "rgb(140, 140, 140)" }}>
            Next
          </span>
          <span
            style={{ fontSize: "14px", color: "rgb(23, 23, 23)", fontWeight: 500 }}
          >
            {next.title}
          </span>
        </Link>
      ) : (
        <div />
      )}
    </div>
  )
}
