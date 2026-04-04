"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

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

  return (
    <aside
      className="hidden md:block"
      style={{
        width: "256px",
        height: "calc(100vh - 104px)",
        position: "sticky",
        top: "104px",
        overflowY: "auto",
        flexShrink: 0,
        padding: "24px 16px 24px 24px",
        background: "transparent",
      }}
    >
      <nav>
        {navigation.map((section) => (
          <div key={section.title} style={{ marginBottom: "20px" }}>
            <div
              style={{
                fontSize: "12px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "rgb(140, 140, 140)",
                padding: "0 16px",
                marginBottom: "6px",
              }}
            >
              {section.title}
            </div>
            {section.items.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href || item.title}
                  href={item.href || "#"}
                  style={{
                    display: "block",
                    padding: "6px 12px 6px 16px",
                    fontSize: "14px",
                    lineHeight: "20px",
                    textDecoration: "none",
                    fontWeight: isActive ? 400 : 500,
                    color: isActive ? "rgb(14, 14, 14)" : "rgb(80, 80, 80)",
                    background: isActive ? "rgba(14, 14, 14, 0.1)" : "transparent",
                    borderRadius: isActive ? "12px" : "8px",
                    transition: "color 150ms ease, background-color 150ms ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "rgb(23, 23, 23)"
                      e.currentTarget.style.backgroundColor = "rgba(14, 14, 14, 0.05)"
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.color = "rgb(80, 80, 80)"
                      e.currentTarget.style.backgroundColor = "transparent"
                    }
                  }}
                >
                  {item.title}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
