export interface OnboardingProfileRecord {
  id?: string
  org_id?: string | null
  personal_org_id?: string | null
  active_org_id?: string | null
  display_name?: string | null
  preferences?: Record<string, unknown> | null
}

function isLegacyProfileSchemaError(error: { message?: string } | null): boolean {
  const message = error?.message ?? ''
  return (
    message.includes('column profiles.personal_org_id does not exist') ||
    message.includes('column profiles.active_org_id does not exist') ||
    message.includes("Could not find the 'personal_org_id' column of 'profiles' in the schema cache") ||
    message.includes("Could not find the 'active_org_id' column of 'profiles' in the schema cache")
  )
}

export async function loadOnboardingProfile(
  supabase: {
    from: (table: string) => {
      select: (selection: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: <T>() => Promise<{ data: T | null; error: { message?: string } | null }>
        }
      }
    }
  },
  userId: string,
  options: { includeId?: boolean } = {},
): Promise<{ data: OnboardingProfileRecord | null; error: { message?: string } | null }> {
  const modernSelection = [
    options.includeId ? 'id' : null,
    'org_id',
    'personal_org_id',
    'active_org_id',
    'display_name',
    'preferences',
  ]
    .filter(Boolean)
    .join(', ')

  const { data, error } = await supabase
    .from('profiles')
    .select(modernSelection)
    .eq('id', userId)
    .maybeSingle<OnboardingProfileRecord>()

  if (!isLegacyProfileSchemaError(error)) {
    return { data, error }
  }

  const legacySelection = [
    options.includeId ? 'id' : null,
    'org_id',
    'display_name',
    'preferences',
  ]
    .filter(Boolean)
    .join(', ')

  const { data: legacyData, error: legacyError } = await supabase
    .from('profiles')
    .select(legacySelection)
    .eq('id', userId)
    .maybeSingle<OnboardingProfileRecord>()

  if (legacyError || !legacyData) {
    return { data: null, error: legacyError }
  }

  return {
    data: {
      ...legacyData,
      personal_org_id: null,
      active_org_id: null,
    },
    error: null,
  }
}
