import { redirect } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { NavLink } from '@/components/dashboard/nav-link'
import { BitBitLogo } from '@/components/ui/bitbit-logo'

const navItems = [
  { href: '/dashboard', label: 'Tasks', iconName: 'LayoutDashboard' as const },
  { href: '/dashboard/chat', label: 'Chat', iconName: 'MessageSquare' as const },
  { href: '/dashboard/channels', label: 'Channels', iconName: 'Cable' as const },
  { href: '/dashboard/medications', label: 'Medications', iconName: 'Pill' as const },
  { href: '/dashboard/contacts', label: 'Contacts', iconName: 'Users' as const },
  { href: '/dashboard/activity', label: 'Activity', iconName: 'Activity' as const },
  { href: '/dashboard/settings', label: 'Settings', iconName: 'Settings' as const },
]

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let displayName = 'Dev User'
  let initials = 'DU'

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase!.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    displayName =
      user.user_metadata?.display_name ||
      user.email?.split('@')[0] ||
      'User'
    initials = displayName
      .split(' ')
      .map((n: string) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="glass-sidebar flex w-64 flex-col border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5">
          <BitBitLogo size={32} className="rounded-lg" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            BitBit
          </span>
        </div>

        <Separator />

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} iconName={item.iconName} />
          ))}
        </nav>

        <Separator />

        {/* User section */}
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-secondary text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 truncate">
            <p className="truncate text-sm font-medium text-foreground">
              {displayName}
            </p>
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">{children}</main>
    </div>
  )
}
