"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"

interface SearchEntry {
  title: string
  section: string
  description: string
  href: string
  content: string
}


function getSnippet(content: string, query: string): string {
  if (!query || query.length < 2) return content.slice(0, 100)
  const lower = content.toLowerCase()
  const idx = lower.indexOf(query.toLowerCase())
  if (idx === -1) return content.slice(0, 100)
  const start = Math.max(0, idx - 40)
  const end = Math.min(content.length, idx + query.length + 60)
  let snippet = content.slice(start, end)
  if (start > 0) snippet = "..." + snippet
  if (end < content.length) snippet = snippet + "..."
  return snippet
}

export function SearchDialog({ entries }: { entries: SearchEntry[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

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
      document.body.style.overflow = "hidden"
    } else {
      setQuery("")
      setSelectedIndex(0)
      document.body.style.overflow = ""
    }
    return () => { document.body.style.overflow = "" }
  }, [open])

  const results = useMemo(() => {
    if (query.length < 2) return []
    const q = query.toLowerCase()
    const scored = entries
      .map((e) => {
        let score = 0
        if (e.title.toLowerCase().includes(q)) score += 10
        if (e.title.toLowerCase().startsWith(q)) score += 5
        if (e.description.toLowerCase().includes(q)) score += 5
        if (e.content.toLowerCase().includes(q)) score += 2
        return { entry: e, score }
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
    return scored.map((s) => s.entry)
  }, [query, entries])

  useEffect(() => {
    setSelectedIndex(0)
  }, [results])

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault()
        navigate(results[selectedIndex].href)
      }
    },
    [results, selectedIndex, navigate]
  )

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.children[selectedIndex] as HTMLElement
    if (selected) {
      selected.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  if (!open) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        justifyContent: "center",
        paddingTop: "min(20vh, 160px)",
        padding: "min(20vh, 160px) 16px 0",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.4)",
          backdropFilter: "blur(4px)",
        }}
      />
      {/* Dialog */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "560px",
          background: "#fff",
          borderRadius: "12px",
          border: "1px solid #e5e7eb",
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.08)",
          overflow: "hidden",
          maxHeight: "420px",
          display: "flex",
          flexDirection: "column",
          fontFamily: "inherit",
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9ca3af"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documentation..."
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontSize: "15px",
              background: "transparent",
              color: "#171717",
              fontFamily: "inherit",
            }}
          />
          <kbd
            style={{
              fontSize: "11px",
              fontFamily: "inherit",
              padding: "2px 6px",
              borderRadius: "4px",
              border: "1px solid #e5e7eb",
              color: "#9ca3af",
              background: "transparent",
              lineHeight: "16px",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div
            ref={listRef}
            style={{ overflowY: "auto", padding: "6px" }}
          >
            {results.map((r, i) => (
              <button
                key={r.href}
                onClick={() => navigate(r.href)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  background:
                    i === selectedIndex
                      ? "rgba(14, 14, 14, 0.08)"
                      : "transparent",
                  transition: "background-color 100ms ease",
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "2px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      color: "#9ca3af",
                    }}
                  >
                    {r.section}
                  </span>
                </div>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "14px",
                    color: "#171717",
                    lineHeight: "20px",
                  }}
                >
                  {r.title}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#6b7280",
                    marginTop: "2px",
                    lineHeight: "18px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.description || getSnippet(r.content, query)}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {query.length >= 2 && results.length === 0 && (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: "14px",
            }}
          >
            No results for &quot;{query}&quot;
          </div>
        )}

        {/* Hint when empty */}
        {query.length < 2 && (
          <div
            style={{
              padding: "32px 16px",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: "13px",
            }}
          >
            Type to search across all documentation pages
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: "12px",
            color: "#9ca3af",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <kbd style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #e5e7eb", borderRadius: "3px", fontFamily: "inherit" }}>↑</kbd>
            <kbd style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #e5e7eb", borderRadius: "3px", fontFamily: "inherit" }}>↓</kbd>
            navigate
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <kbd style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #e5e7eb", borderRadius: "3px", fontFamily: "inherit" }}>↵</kbd>
            open
          </span>
        </div>
      </div>
    </div>
  )
}
