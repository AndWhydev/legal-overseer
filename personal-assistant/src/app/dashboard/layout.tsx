import { redirect } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { SPAShell } from '@/components/dashboard/spa-shell'
import { getCanonicalOnboardingRedirect } from '@/lib/onboarding/state'
import { loadOnboardingProfile } from '@/lib/onboarding/profile'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let displayName = 'Dev User'
  let initials = 'DU'
  let isNewUser = false

  const devBypass = process.env.DEV_BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production'

  if (isSupabaseConfigured() && !devBypass) {
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
    const { data: profile } = await loadOnboardingProfile(supabase! as never, user.id)
    const onboardingRedirect = getCanonicalOnboardingRedirect(profile)
    if (onboardingRedirect !== '/dashboard') redirect(onboardingRedirect)

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
