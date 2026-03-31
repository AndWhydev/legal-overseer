'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PixelWordmark } from '@/components/ui/pixel-heading-word'

/** Routes where the NavBar should NOT render */
const HIDDEN_PREFIXES = ['/dashboard', '/login', '/onboard', '/callback', '/chat']

export function NavBar() {
  const pathname = usePathname()

  // Hide on dashboard, auth, and app routes
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
    return null
  }

  return (
    <nav className="sticky top-0 z-[1000] border-b border-border/30 bg-[rgba(10,10,15,0.85)] px-5 py-3 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 no-underline">
          <PixelWordmark className="text-base font-medium text-foreground">
            BitBit
          </PixelWordmark>
        </Link>

        {/* Nav Links */}
        <div className="flex items-center gap-7">
          <NavLink href="/industries/agencies">Industries</NavLink>
          <NavLink href="/pricing">Pricing</NavLink>
          <NavLink href="/case-study">Case Study</NavLink>

          <div className="ml-1 flex gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Log In</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/onboard">Sign Up</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  )
}
