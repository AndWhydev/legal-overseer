export function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: "12px",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "var(--text-faint)",
        marginBottom: "8px",
      }}
    >
      {label}
    </div>
  )
}
