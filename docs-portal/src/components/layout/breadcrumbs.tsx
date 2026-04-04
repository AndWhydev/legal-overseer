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
        color: "rgb(115, 114, 108)",
        marginBottom: "12px",
      }}
    >
      <Link
        href="/docs/overview"
        style={{ color: "rgb(115, 114, 108)", textDecoration: "none" }}
      >
        Docs
      </Link>
      {sectionTitle && (
        <>
          <span style={{ color: "rgb(115, 114, 108)" }}>/</span>
          <span>{sectionTitle}</span>
        </>
      )}
      {pageTitle && sectionTitle && (
        <>
          <span style={{ color: "rgb(115, 114, 108)" }}>/</span>
          <span style={{ color: "rgb(61, 61, 58)" }}>{pageTitle}</span>
        </>
      )}
    </nav>
  )
}
