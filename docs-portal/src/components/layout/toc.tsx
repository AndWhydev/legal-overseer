"use client"

import { useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

interface TocItem {
  id: string
  text: string
  level: number
}

export function TableOfContents({ headings }: { headings: TocItem[] }) {
  const [activeId, setActiveId] = useState("")

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px" }
    )

    headings.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [headings])

  if (headings.length === 0) return null

  return (
    <aside
      className="hidden min-[1320px]:block shrink-0 sticky top-[56px] h-[calc(100vh-56px)]"
      style={{
        width: "288px",
        borderLeft: "1px solid rgba(38,38,38,0.10)",
      }}
    >
      <ScrollArea className="h-full">
        <div className="px-4 py-6">
          <div
            className="mb-3"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "rgba(38,38,38,0.40)",
            }}
          >
            On this page
          </div>
          {headings.map(({ id, text, level }) => (
            <a
              key={id}
              href={`#${id}`}
              className={cn(
                "block text-[13px] leading-snug py-1 no-underline transition-colors duration-150",
                level === 3 && "pl-3",
                activeId === id
                  ? "text-[var(--brand-primary)] font-medium"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              {text}
            </a>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
