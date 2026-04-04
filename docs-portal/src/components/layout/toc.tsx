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
      { rootMargin: "-120px 0px -60% 0px" }
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
        width: "244px",
        flexShrink: 0,
        position: "sticky",
        top: "104px",
        height: "calc(100vh - 104px)",
        overflowY: "auto",
        padding: "24px 20px",
        backgroundColor: "rgb(253, 253, 247)",
        borderRadius: "12px",
        marginTop: "24px",
        marginRight: "24px",
        alignSelf: "flex-start",
      }}
      className="hidden min-[1320px]:block"
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "rgb(140, 140, 140)",
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
              activeId === id ? "rgb(14, 14, 14)" : "rgb(80, 80, 80)",
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
