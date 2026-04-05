"use client"

import { useEffect, useState } from "react"

interface TocItem {
  id: string
  text: string
  level: number
}

function TocLink({ id, text, level, isActive }: TocItem & { isActive: boolean }) {
  const [hovered, setHovered] = useState(false)

  return (
    <a
      href={`#${id}`}
      style={{
        display: "block",
        fontSize: "13px",
        lineHeight: "20px",
        padding: "4px 0",
        paddingLeft: level === 3 ? "12px" : "0",
        textDecoration: "none",
        color: isActive ? "#171717" : hovered ? "#374151" : "#6b7280",
        fontWeight: isActive ? 500 : 400,
        transition: "color 150ms ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {text}
    </a>
  )
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
        width: "220px",
        flexShrink: 0,
        position: "sticky",
        top: "56px",
        height: "calc(100vh - 56px)",
        overflowY: "auto",
        padding: "24px 16px",
        backgroundColor: "transparent",
        alignSelf: "flex-start",
      }}
      className="hidden min-[1280px]:block"
    >
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9ca3af",
          marginBottom: "12px",
        }}
      >
        On this page
      </div>
      {headings.map(({ id, text, level }) => (
        <TocLink
          key={id}
          id={id}
          text={text}
          level={level}
          isActive={activeId === id}
        />
      ))}
    </aside>
  )
}
