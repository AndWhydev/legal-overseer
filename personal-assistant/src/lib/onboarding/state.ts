type OnboardingPreferences = Record<string, unknown>

export interface OnboardingProfileState {
  org_id?: string | null
  personal_org_id?: string | null
  active_org_id?: string | null
  preferences?: OnboardingPreferences | null
}

export function getWorkspaceId(profile: OnboardingProfileState | null | undefined) {
  return profile?.active_org_id ?? profile?.org_id ?? profile?.personal_org_id ?? null
}

export function getWorkspaceConfirmationTargetId(profile: OnboardingProfileState | null | undefined) {
  return profile?.personal_org_id ?? profile?.org_id ?? profile?.active_org_id ?? null
}

export function hasCompletedWorkspaceConfirmation(profile: OnboardingProfileState | null | undefined) {
  const preferences = (profile?.preferences as OnboardingPreferences | null | undefined) ?? {}
  const workspaceSetupCompleted = preferences.workspace_setup_completed

  if (typeof workspaceSetupCompleted === 'boolean') {
    return workspaceSetupCompleted
  }

  return preferences.onboarding_completed === true
}

export function hasCompletedFirstRunOnboarding(profile: OnboardingProfileState | null | undefined) {
  const preferences = (profile?.preferences as OnboardingPreferences | null | undefined) ?? {}
  return preferences.onboarding_completed === true
}

/**
 * When non-web `primary_chat_surface` is chosen in the onboarding chat, we
 * mark stage='connect-surface' before completion. Surfaces this to the
 * bootstrap guard so refreshing /onboard lands on /onboard/connect/<surface>
 * instead of showing the chat again.
 */
export function getPendingConnectSurface(
  profile: OnboardingProfileState | null | undefined,
): string | null {
  const preferences = (profile?.preferences as OnboardingPreferences | null | undefined) ?? {}
  if (preferences.onboarding_stage !== 'connect-surface') return null
  const surface = preferences.primary_chat_surface
  if (typeof surface !== 'string') return null
  if (surface === 'web') return null
  if (!['imessage', 'whatsapp', 'android-messages', 'telegram'].includes(surface)) return null
  return surface
}

export function requiresWorkspaceConfirmation(profile: OnboardingProfileState | null | undefined) {
  const workspaceId = getWorkspaceId(profile)

  if (!workspaceId) {
    return true
  }

  return !hasCompletedWorkspaceConfirmation(profile)
}

export function getCanonicalOnboardingRedirect(profile: OnboardingProfileState | null | undefined) {
  if (requiresWorkspaceConfirmation(profile)) {
    return '/onboard'
  }

  return hasCompletedFirstRunOnboarding(profile) ? '/dashboard' : '/onboard'
}
