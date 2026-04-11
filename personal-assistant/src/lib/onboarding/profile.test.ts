import { describe, expect, it } from 'vitest'
import { loadOnboardingProfile } from './profile'

function result<T>(data: T | null, error: { message: string } | null = null) {
  return Promise.resolve({ data, error })
}

describe('loadOnboardingProfile', () => {
  it('falls back to the legacy profile shape when modern tenancy columns are unavailable', async () => {
    const modernError = {
      message: "Could not find the 'personal_org_id' column of 'profiles' in the schema cache",
    }

    const supabase = {
      from(table: string) {
        expect(table).toBe('profiles')

        return {
          select(selection: string) {
            if (selection === 'org_id, personal_org_id, active_org_id, display_name, preferences') {
              return {
                eq() {
                  return {
                    maybeSingle: () => result(null, modernError),
                  }
                },
              }
            }

            if (selection === 'org_id, display_name, preferences') {
              return {
                eq() {
                  return {
                    maybeSingle: () =>
                      result({
                        org_id: 'org-legacy',
                        display_name: 'Legacy User',
                        preferences: { onboarding_completed: false },
                      }),
                  }
                },
              }
            }

            throw new Error(`Unexpected selection: ${selection}`)
          },
        }
      },
    }

    await expect(loadOnboardingProfile(supabase as any, 'user-1')).resolves.toEqual({
      data: {
        org_id: 'org-legacy',
        personal_org_id: null,
        active_org_id: null,
        display_name: 'Legacy User',
        preferences: { onboarding_completed: false },
      },
      error: null,
    })
  })
})
