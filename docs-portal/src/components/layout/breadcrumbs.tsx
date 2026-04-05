"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { navigation } from "@/docs.config"

export function Breadcrumbs() {
  const pathname = usePathname()

  let sectionTitle = ""
  let pageTitle = ""
  for (const section of navigation) {
    for (const item of section.items) {
      if (item.href === pathname) {
        sectionTitle = section.title
        pageTitle = item.title
      }
    }
  }

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "14px",
        color: "#9ca3af",
        marginBottom: "12px",
      }}
    >
      <Link
        href="/docs/overview"
        style={{ color: "#9ca3af", textDecoration: "none", transition: "color 150ms ease" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#6b7280" }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#9ca3af" }}
      >
        Docs
      </Link>
      {sectionTitle && (
        <>
          <span style={{ color: "#9ca3af" }}>/</span>
          <span>{sectionTitle}</span>
        </>
      )}
      {pageTitle && sectionTitle && (
        <>
          <span style={{ color: "#9ca3af" }}>/</span>
          <span style={{ color: "#374151" }}>{pageTitle}</span>
        </>
      )}
    </nav>
  )
}
