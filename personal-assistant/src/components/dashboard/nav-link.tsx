'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  MessageSquare,
  Cable,
  Radio,
  Users,
  Activity,
  Settings,
  Pill,
} from 'lucide-react'

const iconMap = {
  LayoutDashboard,
  MessageSquare,
  Cable,
  Radio,
  Users,
  Activity,
  Settings,
  Pill,
} as const

interface NavLinkProps {
  href: string
  label: string
  iconName: keyof typeof iconMap
}

export function NavLink({ href, label, iconName }: NavLinkProps) {
  const pathname = usePathname()
  const isActive =
    href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(href)

  const Icon = iconMap[iconName]

  return (
    <Link
      href={href}
      className={cn(
        'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
        isActive
          ? 'bg-primary/10 text-foreground'
          : 'text-text-secondary hover:bg-elevated hover:text-foreground'
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
      )}
      <Icon className={cn('h-4 w-4', isActive && 'text-primary')} />
      {label}
    </Link>
  )
}
