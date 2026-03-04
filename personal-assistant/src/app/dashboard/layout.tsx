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
  let isNewUser = false

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

    // Check onboarding state from profile preferences
    const { data: profile } = await supabase!
      .from('profiles')
      .select('org_id, display_name, preferences')
      .eq('id', user.id)
      .maybeSingle()

    // No profile means no org — send to workspace setup
    if (!profile?.org_id) {
      redirect('/onboard')
    }

    // Prefer the stored display_name over auth metadata
    if (profile?.display_name) {
      displayName = profile.display_name
      initials = displayName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }

    const preferences = (profile?.preferences as Record<string, unknown>) ?? {}
    isNewUser = !preferences.onboarding_completed
  }

  return <SPAShell displayName={displayName} initials={initials} isNewUser={isNewUser} />
}
