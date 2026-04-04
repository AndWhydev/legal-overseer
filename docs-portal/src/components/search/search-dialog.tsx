"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"

interface SearchEntry {
  title: string
  description: string
  href: string
  content: string
}

export function SearchDialog({ entries }: { entries: SearchEntry[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery("")
    }
  }, [open])

  const results =
    query.length > 1
      ? entries
          .filter((e) => {
            const q = query.toLowerCase()
            return (
              e.title.toLowerCase().includes(q) ||
              e.description.toLowerCase().includes(q) ||
              e.content.toLowerCase().includes(q)
            )
          })
          .slice(0, 8)
      : []

  if (!open) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "center",
        paddingTop: "20vh",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(4px)",
        }}
      />
      {/* Dialog */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "560px",
          background: "var(--bg-surface)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-md)",
          overflow: "hidden",
          maxHeight: "400px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--border-default)",
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search documentation..."
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              fontSize: "1rem",
              background: "transparent",
              color: "var(--text-primary)",
            }}
          />
        </div>
        {results.length > 0 && (
          <div style={{ overflowY: "auto", padding: "0.5rem" }}>
            {results.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "0.75rem",
                  borderRadius: "6px",
                  textDecoration: "none",
                  color: "var(--text-primary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent"
                }}
              >
                <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>
                  {r.title}
                </div>
                <div
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-tertiary)",
                    marginTop: "0.125rem",
                  }}
                >
                  {r.description || r.content.slice(0, 80)}
                </div>
              </Link>
            ))}
          </div>
        )}
        {query.length > 1 && results.length === 0 && (
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--text-tertiary)",
              fontSize: "0.875rem",
            }}
          >
            No results for &quot;{query}&quot;
          </div>
        )}
      </div>
    </div>
  )
}
