"use client"

import { useEffect, useState } from "react"

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
      style={{
        display: "none",
        width: "240px",
        flexShrink: 0,
        position: "sticky",
        top: "56px",
        height: "calc(100vh - 56px)",
        overflowY: "auto",
        padding: "24px 16px",
      }}
      className="hidden min-[1320px]:block"
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgb(160, 159, 153)",
          marginBottom: "12px",
        }}
      >
        On this page
      </div>
      {headings.map(({ id, text, level }) => (
        <a
          key={id}
          href={`#${id}`}
          style={{
            display: "block",
            fontSize: "13px",
            lineHeight: "20px",
            padding: "4px 0",
            paddingLeft: level === 3 ? "12px" : "0",
            textDecoration: "none",
            color:
              activeId === id
                ? "rgb(20, 20, 19)"
                : "rgb(115, 114, 108)",
            fontWeight: activeId === id ? 500 : 400,
            transition: "color 150ms",
          }}
        >
          {text}
        </a>
      ))}
    </aside>
  )
}
