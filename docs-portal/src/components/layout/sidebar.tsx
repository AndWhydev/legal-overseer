"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"

interface NavItem {
  title: string
  href?: string
  items?: NavItem[]
}

interface SidebarProps {
  navigation: { title: string; items: NavItem[] }[]
}

export function Sidebar({ navigation }: SidebarProps) {
  const pathname = usePathname()

  const activeSectionTitle = useMemo(() => {
    for (const section of navigation) {
      if (section.items.some((item) => item.href === pathname)) {
        return section.title
      }
    }
    return ""
  }, [navigation, pathname])

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (activeSectionTitle) initial.add(activeSectionTitle)
    return initial
  })

  const isExpanded = (title: string) =>
    title === activeSectionTitle || expanded.has(title)

  const toggleSection = (title: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(title)) {
        next.delete(title)
      } else {
        next.add(title)
      }
      return next
    })
  }

  return (
    <aside
      style={{
        width: "240px",
        height: "calc(100vh - 56px)",
        position: "sticky",
        top: "56px",
        overflowY: "auto",
        flexShrink: 0,
        padding: "24px 0",
      }}
    >
      <nav>
        {navigation.map((section) => {
          const open = isExpanded(section.title)
          return (
            <Collapsible
              key={section.title}
              open={open}
              onOpenChange={() => toggleSection(section.title)}
            >
              <div style={{ marginBottom: "4px" }}>
                <CollapsibleTrigger
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 24px",
                    fontSize: "11px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "rgb(160, 159, 153)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {section.title}
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    style={{
                      flexShrink: 0,
                      transition: "transform 150ms",
                      transform: open ? "rotate(90deg)" : "rotate(0deg)",
                    }}
                  >
                    <path
                      d="M4.5 2.5L8 6L4.5 9.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {section.items.map((item) => {
                    const isActive = pathname === item.href
                    return (
                      <Link
                        key={item.href || item.title}
                        href={item.href || "#"}
                        style={{
                          display: "block",
                          padding: "6px 12px 6px 24px",
                          fontSize: "14px",
                          lineHeight: "20px",
                          textDecoration: "none",
                          fontWeight: isActive ? 500 : 400,
                          color: isActive
                            ? "rgb(20, 20, 19)"
                            : "rgb(115, 114, 108)",
                          transition: "color 150ms",
                        }}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.color = "rgb(61, 61, 58)"
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.color = "rgb(115, 114, 108)"
                          }
                        }}
                      >
                        {item.title}
                      </Link>
                    )
                  })}
                </CollapsibleContent>
              </div>
            </Collapsible>
          )
        })}
      </nav>
    </aside>
  )
}
