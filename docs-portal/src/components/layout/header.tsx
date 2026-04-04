"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Kbd } from "@/components/kbd"
import { navigation } from "@/docs.config"

const tabs = [
  { label: "Getting Started", prefix: "/docs/getting-started", fallback: "/docs/overview" },
  { label: "Intelligence", prefix: "/docs/intelligence" },
  { label: "Knowledge Graph", prefix: "/docs/knowledge-graph" },
  { label: "Memory", prefix: "/docs/memory" },
  { label: "Autonomy", prefix: "/docs/autonomy" },
  { label: "Tools", prefix: "/docs/tools" },
  { label: "API", prefix: "/docs/api" },
  { label: "Decisions", prefix: "/docs/decisions" },
]

function getFirstHref(prefix: string): string {
  for (const section of navigation) {
    for (const item of section.items) {
      if (item.href.startsWith(prefix)) return item.href
    }
  }
  return prefix
}

export function Header() {
  const pathname = usePathname()

  const isTabActive = (tab: typeof tabs[number]) => {
    if (tab.fallback && (pathname === tab.fallback || pathname === "/docs/overview")) return true
    return pathname.startsWith(tab.prefix)
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backgroundColor: "#faf9f5",
      }}
    >
      {/* Top bar: logo + search */}
      <div
        style={{
          height: "56px",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
        }}
      >
        <Link href="/docs/overview" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2.5" fill="#141413" />
            <rect x="10" y="10" width="12" height="12" rx="2.5" fill="#141413" opacity="0.55" />
          </svg>
          <span
            style={{
              fontFamily: "Lora, Georgia, Times New Roman, serif",
              fontWeight: 400,
              fontSize: "16px",
              color: "rgb(23, 23, 23)",
            }}
          >
            BitBit
          </span>
          <span
            style={{
              color: "rgb(140, 140, 140)",
              fontSize: "14px",
              fontWeight: 400,
              fontFamily: "Inter, system-ui, sans-serif",
              marginLeft: "2px",
            }}
          >
            Docs
          </span>
        </Link>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => {
            window.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                bubbles: true,
              })
            )
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            border: "1px solid rgb(222, 222, 222)",
            borderRadius: "8px",
            background: "transparent",
            cursor: "pointer",
            color: "rgb(140, 140, 140)",
            fontSize: "14px",
            fontFamily: "inherit",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.5 }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <span>Search docs...</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
            <Kbd size="sm" variant="flat">{"\u2318"}</Kbd>
            <Kbd size="sm" variant="flat">K</Kbd>
          </span>
        </button>
      </div>

      {/* Tab navigation bar */}
      <div
        className="docs-tab-bar"
        style={{
          height: "48px",
          display: "flex",
          alignItems: "center",
          padding: "0 24px",
          gap: "0",
          overflowX: "auto",
          borderBottom: "1px solid rgb(222, 222, 222)",
        }}
      >
        {tabs.map((tab) => {
          const active = isTabActive(tab)
          const href = tab.fallback || getFirstHref(tab.prefix)
          return (
            <Link
              key={tab.prefix}
              href={href}
              className="docs-tab-item"
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                height: "48px",
                padding: "0 16px",
                fontSize: "14px",
                fontWeight: active ? 500 : 400,
                color: active ? "rgb(23, 23, 23)" : "rgb(80, 80, 80)",
                textDecoration: "none",
                whiteSpace: "nowrap",
                borderRadius: "6px",
                transition: "color 150ms ease, background-color 150ms ease",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "rgba(14, 14, 14, 0.05)"
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.backgroundColor = "transparent"
                }
              }}
            >
              {tab.label}
              {active && (
                <span
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: "16px",
                    right: "16px",
                    height: "2px",
                    backgroundColor: "rgb(23, 23, 23)",
                    borderRadius: "1px",
                    transition: "background-color 150ms ease",
                  }}
                />
              )}
            </Link>
          )
        })}
      </div>
    </header>
  )
}
