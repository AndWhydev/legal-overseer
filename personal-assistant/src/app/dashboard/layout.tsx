import { redirect } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { SPAShell } from '@/components/dashboard/spa-shell'

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

  return <SPAShell displayName={displayName} initials={initials} />
}
