'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const FOOTER_LINKS = {
  product: [
    { name: 'Features', href: '/#features' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'For Agencies', href: '/industries/agencies' },
    { name: 'For Trades', href: '/industries/trades' },
    { name: 'For Professional Services', href: '/industries/professional-services' },
  ],
  company: [
    { name: 'About', href: '/about' },
    { name: 'Case Study', href: '/case-study' },
    { name: 'Blog', href: '/blog' },
    { name: 'Contact', href: 'mailto:support@bitbit.chat' },
  ],
  legal: [
    { name: 'Privacy Policy', href: '/privacy' },
    { name: 'Terms of Service', href: '/terms' },
  ],
}

export default function Footer() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault()
    if (email) {
      setSubscribed(true)
      setEmail('')
      setTimeout(() => setSubscribed(false), 3000)
    }
  }

  return (
    <footer className="border-t border-border/30 bg-[#0a0a0f] px-5 pb-10 pt-[60px]">
      <div className="mx-auto max-w-[1200px]">
        {/* Main Footer Content */}
        <div className="mb-[60px] grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-12">
          {/* Product Column */}
          <FooterColumn title="Product" links={FOOTER_LINKS.product} />

          {/* Company Column */}
          <FooterColumn title="Company" links={FOOTER_LINKS.company} />

          {/* Legal Column */}
          <FooterColumn title="Legal" links={FOOTER_LINKS.legal} />

          {/* Newsletter Column */}
          <div>
            <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.04em] text-foreground">
              Stay Updated
            </h4>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              Get updates on new features and tips for AI operations.
            </p>
            <form onSubmit={handleSubscribe} className="mb-4">
              <div className="mb-2 flex gap-2">
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" size="sm">
                  Subscribe
                </Button>
              </div>
              {subscribed && (
                <p className="text-xs text-muted-foreground">
                  Thanks for subscribing!
                </p>
              )}
            </form>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-8 border-t border-border/30 pt-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <p className="mb-1 text-xs text-muted-foreground/60">
                2026 BitBit. All rights reserved.
              </p>
              <p className="text-xs text-muted-foreground">
                Built in Australia
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: Array<{ name: string; href: string }>
}) {
  return (
    <div>
      <h4 className="mb-5 text-xs font-medium uppercase tracking-[0.04em] text-foreground">
        {title}
      </h4>
      <ul className="m-0 list-none p-0">
        {links.map((link) => (
          <li key={link.name} className="mb-3">
            <Link
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
