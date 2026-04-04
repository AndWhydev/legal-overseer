"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

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
      className="shrink-0 sticky top-[56px] h-[calc(100vh-56px)] overflow-y-auto"
      style={{
        width: "256px",
        backgroundColor: "#FFFFFF",
        borderRight: "1px solid rgba(38,38,38,0.10)",
      }}
    >
      <ScrollArea className="h-full">
        <nav className="py-6">
          {navigation.map((section) => {
            const open = isExpanded(section.title)
            return (
              <Collapsible
                key={section.title}
                open={open}
                onOpenChange={() => toggleSection(section.title)}
              >
                <div className="mb-1">
                  <CollapsibleTrigger
                    className={cn(
                      "flex w-full items-center justify-between px-6 py-2",
                      "text-[11px] font-semibold uppercase tracking-[0.05em]",
                      "text-[var(--text-tertiary)] bg-transparent border-none cursor-pointer text-left",
                      "hover:text-[var(--text-secondary)] transition-colors"
                    )}
                  >
                    {section.title}
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className={cn(
                        "shrink-0 transition-transform duration-150",
                        open && "rotate-90"
                      )}
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
                          className={cn(
                            "block px-6 py-1.5 text-sm no-underline transition-all duration-150",
                            isActive
                              ? "text-[var(--brand-primary)] font-medium bg-[var(--bg-hover)] border-l-2 border-l-[var(--brand-primary)]"
                              : "text-[var(--text-body)] font-normal border-l-2 border-l-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                          )}
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
      </ScrollArea>
    </aside>
  )
}
