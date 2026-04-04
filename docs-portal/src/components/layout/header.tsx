"use client"

export function Header() {
  return (
    <header
      style={{
        height: "56px",
        backgroundColor: "rgb(250, 249, 245)",
        borderBottom: "1px solid rgba(31, 30, 29, 0.15)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="rgb(20, 20, 19)" />
          <path
            d="M7 12h10M12 7v10"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            fontFamily: "Lora, Georgia, Times New Roman, serif",
            fontWeight: 500,
            fontSize: "16px",
            color: "rgb(20, 20, 19)",
          }}
        >
          BitBit
        </span>
        <span
          style={{
            color: "rgb(160, 159, 153)",
            fontSize: "14px",
            fontWeight: 400,
            marginLeft: "2px",
          }}
        >
          Docs
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
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          border: "1px solid rgba(31, 30, 29, 0.15)",
          borderRadius: "8px",
          background: "transparent",
          cursor: "pointer",
          color: "rgb(115, 114, 108)",
          fontSize: "14px",
          fontFamily: "inherit",
        }}
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
          style={{ opacity: 0.5 }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span>Search docs...</span>
        <kbd
          style={{
            display: "inline-flex",
            height: "20px",
            alignItems: "center",
            gap: "2px",
            borderRadius: "4px",
            border: "1px solid rgba(31, 30, 29, 0.15)",
            backgroundColor: "rgb(250, 249, 245)",
            padding: "0 6px",
            fontFamily: "JetBrains Mono, ui-monospace, monospace",
            fontSize: "11px",
            fontWeight: 500,
            color: "rgb(160, 159, 153)",
          }}
        >
          <span style={{ fontSize: "12px" }}>&#8984;</span>K
        </kbd>
      </button>
    </header>
  )
}
