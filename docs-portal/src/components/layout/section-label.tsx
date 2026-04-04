export function SectionLabel({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: "12px",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "rgb(140, 140, 140)",
        marginBottom: "8px",
      }}
    >
      {label}
    </div>
  )
}
