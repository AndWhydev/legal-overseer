"use client"

import { cn } from "@/lib/utils"

export function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "my-4 overflow-hidden rounded-lg border bg-zinc-950 text-sm",
        className
      )}
    >
      {children}
    </div>
  )
}

export function CodeBlockCode({
  code,
  language,
}: {
  code: string
  language: string
}) {
  return (
    <pre className="overflow-x-auto p-4">
      <code data-language={language} className="text-zinc-100">
        {code}
      </code>
    </pre>
  )
}
