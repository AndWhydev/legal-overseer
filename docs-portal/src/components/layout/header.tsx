"use client"

export function Header() {
  return (
    <header
      style={{
        height: "var(--header-height)",
        borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-surface)",
        display: "flex",
        alignItems: "center",
        padding: "0 1.5rem",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="#1C1C1C" />
          <path
            d="M7 12h10M12 7v10"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            fontWeight: 600,
            fontSize: "1rem",
            letterSpacing: "-0.01em",
          }}
        >
          BitBit Docs
        </span>
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "k",
              metaKey: true,
              bubbles: true,
            })
          )
        }}
        style={{
          background: "var(--bg-code)",
          border: "1px solid var(--border-default)",
          borderRadius: "8px",
          padding: "0.375rem 0.75rem",
          fontSize: "0.8125rem",
          color: "var(--text-secondary)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <span>Search docs...</span>
        <kbd
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            borderRadius: "4px",
            padding: "0.1rem 0.35rem",
            fontSize: "0.75rem",
          }}
        >
          Cmd+K
        </kbd>
      </button>
    </header>
  )
}
