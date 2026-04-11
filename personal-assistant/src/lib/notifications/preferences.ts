import type { SupabaseClient } from '@supabase/supabase-js'

export interface NotificationPreferences {
  email: boolean
  whatsapp: boolean
  dashboard: boolean
  digest_frequency: 'daily' | 'weekly' | 'never'
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: true,
  whatsapp: true,
  dashboard: true,
  digest_frequency: 'daily',
}

export async function getNotificationPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .single<{ notification_preferences: NotificationPreferences | null }>()

  if (error || !data) {
    return { ...DEFAULT_PREFERENCES }
  }

  return {
    ...DEFAULT_PREFERENCES,
    ...data.notification_preferences,
  }
}

export async function updateNotificationPreferences(
  supabase: SupabaseClient,
  userId: string,
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences(supabase, userId)
  const merged: NotificationPreferences = { ...current, ...prefs }

  const { error } = await supabase
    .from('profiles')
    .update({ notification_preferences: merged })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to update notification preferences: ${error.message}`)
  }

  return merged
}
