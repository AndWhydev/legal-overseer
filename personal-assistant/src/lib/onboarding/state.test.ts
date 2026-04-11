import { describe, expect, it } from 'vitest'

import {
  getCanonicalOnboardingRedirect,
  getWorkspaceConfirmationTargetId,
  hasCompletedWorkspaceConfirmation,
  requiresWorkspaceConfirmation,
} from './state'

describe('onboarding state routing', () => {
  it('routes users without any workspace identity to onboard', () => {
    expect(getCanonicalOnboardingRedirect(null)).toBe('/onboard')
    expect(requiresWorkspaceConfirmation({ preferences: { workspace_setup_completed: true } })).toBe(true)
  })

  it('routes users with a workspace but no stage-2 confirmation back through onboard', () => {
    const profile = {
      personal_org_id: 'org-personal',
      preferences: {},
    }

    expect(hasCompletedWorkspaceConfirmation(profile)).toBe(false)
    expect(getCanonicalOnboardingRedirect(profile)).toBe('/onboard')
  })

  it('routes returning users with completed workspace confirmation to dashboard', () => {
    const profile = {
      active_org_id: 'org-shared',
      preferences: {
        workspace_setup_completed: true,
        onboarding_completed: true,
      },
    }

    expect(hasCompletedWorkspaceConfirmation(profile)).toBe(true)
    expect(getCanonicalOnboardingRedirect(profile)).toBe('/dashboard')
  })

  it('keeps users in the dedicated onboarding flow until the full first-run experience is complete', () => {
    const profile = {
      active_org_id: 'org-shared',
      preferences: {
        workspace_setup_completed: true,
        onboarding_completed: false,
      },
    }

    expect(hasCompletedWorkspaceConfirmation(profile)).toBe(true)
    expect(getCanonicalOnboardingRedirect(profile)).toBe('/onboard')
  })

  it('treats legacy onboarding_completed as a completion fallback', () => {
    const profile = {
      org_id: 'org-legacy',
      preferences: {
        onboarding_completed: true,
      },
    }

    expect(hasCompletedWorkspaceConfirmation(profile)).toBe(true)
    expect(getCanonicalOnboardingRedirect(profile)).toBe('/dashboard')
  })

  it('prefers the stable owned workspace when choosing a confirmation target', () => {
    expect(
      getWorkspaceConfirmationTargetId({
        personal_org_id: 'org-personal',
        org_id: 'org-shared',
        active_org_id: 'org-active',
      }),
    ).toBe('org-personal')

    expect(
      getWorkspaceConfirmationTargetId({
        personal_org_id: null,
        org_id: 'org-shared',
        active_org_id: 'org-active',
      }),
    ).toBe('org-shared')

    expect(
      getWorkspaceConfirmationTargetId({
        personal_org_id: null,
        org_id: null,
        active_org_id: 'org-active',
      }),
    ).toBe('org-active')
  })
})
