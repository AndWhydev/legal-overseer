"use client"

import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header
      className="h-[var(--header-height)] bg-[var(--bg-surface)] flex items-center px-6 sticky top-0 z-50"
      style={{ borderBottom: "0.5px solid var(--border-default)" }}
    >
      <div className="flex items-center gap-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#262626" />
          <path
            d="M7 12h10M12 7v10"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span
          className="font-semibold text-base tracking-[-0.01em] text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-heading, Lora, Georgia, serif)" }}
        >
          BitBit
        </span>
        <span className="text-[var(--text-tertiary)] text-sm font-normal ml-0.5">
          Docs
        </span>
      </div>

      <div className="flex-1" />

      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "k",
              metaKey: true,
              bubbles: true,
            })
          )
        }}
        className="gap-2 text-[var(--text-secondary)] font-normal"
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
          className="opacity-50"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="text-[13px]">Search docs...</span>
        <kbd
          className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-[var(--border-default)] bg-[var(--bg-page)] px-1.5 font-mono text-[11px] font-medium text-[var(--text-tertiary)]"
        >
          <span className="text-xs">&#8984;</span>K
        </kbd>
      </Button>
    </header>
  )
}
