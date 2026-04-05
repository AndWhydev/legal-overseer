"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { navigation } from "@/docs.config"
import { SidebarContent } from "@/components/layout/sidebar"

const tabs = [
  { label: "Connections", prefix: "/docs/connections", fallback: "/docs/connections/overview", visibility: "public" as const },
  { label: "Getting Started", prefix: "/docs/getting-started", fallback: "/docs/overview", visibility: "public" as const },
  { label: "Intelligence", prefix: "/docs/intelligence", visibility: "internal" as const },
  { label: "Knowledge Graph", prefix: "/docs/knowledge-graph", visibility: "internal" as const },
  { label: "Memory", prefix: "/docs/memory", visibility: "internal" as const },
  { label: "Autonomy", prefix: "/docs/autonomy", visibility: "internal" as const },
  { label: "Tools", prefix: "/docs/tools", visibility: "internal" as const },
  { label: "API", prefix: "/docs/api", visibility: "internal" as const },
  { label: "Decisions", prefix: "/docs/decisions", visibility: "internal" as const },
]

function getFirstHref(prefix: string): string {
  for (const section of navigation) {
    for (const item of section.items) {
      if (item.href.startsWith(prefix)) return item.href
    }
  }
  return prefix
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  useEffect(() => { onClose() }, [pathname])
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [open])

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 90,
          background: "rgba(0,0,0,0.3)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 150ms ease",
        }}
      />
      <div
        style={{
          position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 91,
          width: "min(300px, 85vw)",
          background: "#fff",
          borderRight: "1px solid #e5e7eb",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 150ms ease",
          display: "flex", flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e5e7eb" }}>
          <Link href="/docs/overview" onClick={onClose} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
            <img src="/bitbit-icon-mark-light.png" alt="BitBit" width={24} height={24} style={{ borderRadius: "5px" }} />
            <span style={{ fontSize: "18px", fontWeight: 600, color: "#171717" }}>BitBit</span>
          </Link>
          <button onClick={onClose} aria-label="Close navigation" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "32px", height: "32px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "6px", color: "#6b7280" }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <SidebarContent navigation={navigation} />
        </div>
      </div>
    </>
  )
}

export function Header() {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isAuthed, setIsAuthed] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setIsAuthed(!!data.user))
  }, [])

  const visibleTabs = tabs.filter(t => t.visibility === "public" || isAuthed)

  const isTabActive = (tab: typeof tabs[number]) => {
    if (tab.fallback && (pathname === tab.fallback || pathname === "/docs/overview")) return true
    return pathname.startsWith(tab.prefix)
  }

  return (
    <>
      <header style={{ position: "sticky", top: 0, zIndex: 50, backgroundColor: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ height: "56px", display: "flex", alignItems: "center", padding: "0 20px", gap: "16px" }}>
          {/* Hamburger - mobile only */}
          <button
            className="flex md:hidden items-center justify-center"
            onClick={() => setDrawerOpen(true)}
            style={{ width: "36px", height: "36px", border: "none", background: "transparent", cursor: "pointer", borderRadius: "6px", color: "#171717", flexShrink: 0 }}
            aria-label="Open navigation"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
          </button>

          {/* Logo */}
          <Link href="/docs/overview" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            <img src="/bitbit-icon-mark-light.png" alt="BitBit" width={28} height={28} style={{ borderRadius: "6px" }} />
            <span style={{ fontSize: "20px", fontWeight: 600, color: "#171717", lineHeight: "28px" }}>BitBit</span>
            <span style={{ fontSize: "20px", fontWeight: 400, color: "#9ca3af", lineHeight: "28px", marginLeft: "-6px" }}>Docs</span>
          </Link>

          {/* Divider */}
          <div style={{ width: "1px", height: "24px", background: "#e5e7eb", flexShrink: 0, marginLeft: "16px" }} className="hidden lg:block" />

          {/* Tab navigation - visible only on lg+ */}
          <nav className="hidden lg:flex" style={{ alignItems: "center", gap: "4px", overflow: "hidden", flex: 1, minWidth: 0 }}>
            {visibleTabs.map((tab) => {
              const active = isTabActive(tab)
              const href = tab.fallback || getFirstHref(tab.prefix)
              return (
                <Link
                  key={tab.prefix}
                  href={href}
                  style={{
                    display: "flex", alignItems: "center", height: "56px",
                    padding: "0 12px", fontSize: "14px", fontWeight: active ? 500 : 400,
                    color: active ? "#171717" : "#6b7280",
                    textDecoration: "none", whiteSpace: "nowrap",
                    borderBottom: active ? "2px solid #171717" : "2px solid transparent",
                    transition: "color 150ms ease",
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#374151" }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "#6b7280" }}
                >
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  )
}
