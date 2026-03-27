export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/* Reset old theme CSS input overrides so Shadcn Input renders correctly */}
      <style>{`
        [data-theme] input[type="text"],
        [data-theme] input[type="email"],
        [data-theme] input[type="password"],
        [data-theme] input[type="url"],
        [data-theme] input[type="number"],
        [data-theme] input[type="search"],
        [data-theme] textarea,
        [data-theme] select {
          background: unset !important;
          border: unset !important;
          color: unset !important;
        }
      `}</style>
      <div className="min-h-screen">{children}</div>
    </>
  )
}
