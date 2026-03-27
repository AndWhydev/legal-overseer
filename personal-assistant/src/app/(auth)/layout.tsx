export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/*
        Nuclear override: the old theme CSS files (theme-midnight.css, theme-light.css,
        theme-aurora.css) apply !important background/border/color on all input types
        via [data-theme] selectors. Since data-theme lives on <html>, it cascades
        everywhere. This resets inputs on auth pages to inherit from Shadcn/Tailwind.
        Uses [data-auth] to boost specificity above the theme selectors.
      */}
      <style>{`
        [data-auth] input,
        [data-auth] input[type="text"],
        [data-auth] input[type="email"],
        [data-auth] input[type="password"],
        [data-auth] input[type="url"],
        [data-auth] input[type="number"],
        [data-auth] input[type="search"],
        [data-auth] textarea,
        [data-auth] select {
          background: transparent !important;
          border: 1px solid var(--border) !important;
          color: var(--foreground) !important;
          border-radius: calc(var(--radius) - 2px) !important;
          height: 2.5rem !important;
          padding: 0.5rem 0.75rem !important;
          font-size: 0.875rem !important;
        }
        [data-auth] input::placeholder,
        [data-auth] textarea::placeholder {
          color: var(--muted-foreground) !important;
        }
        [data-auth] input:focus,
        [data-auth] input:focus-visible {
          outline: none !important;
          border-color: var(--ring) !important;
          box-shadow: 0 0 0 2px color-mix(in oklch, var(--ring), transparent 75%) !important;
        }
      `}</style>
      <div className="min-h-screen" data-auth="">{children}</div>
    </>
  )
}
