import Link from "next/link"

export default function NotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1
        style={{
          fontSize: "4rem",
          fontWeight: 700,
          color: "var(--text-tertiary)",
          marginBottom: "0.5rem",
        }}
      >
        404
      </h1>
      <p
        style={{
          fontSize: "1.125rem",
          color: "var(--text-secondary)",
          marginBottom: "1.5rem",
        }}
      >
        Page not found
      </p>
      <Link
        href="/docs/overview"
        style={{
          padding: "0.5rem 1.25rem",
          background: "var(--text-primary)",
          color: "white",
          borderRadius: "8px",
          fontSize: "0.875rem",
          fontWeight: 500,
          textDecoration: "none",
        }}
      >
        Back to docs
      </Link>
    </div>
  )
}
