import { getServiceClient } from '@/lib/supabase/service-client'
import { logger } from '@/lib/core/logger'

interface OrgNotificationConfig {
  name: string
  fromEmail: string
  notifyEmail: string
  notifyPhone: string | null
}

export async function getOrgNotificationConfig(orgId: string): Promise<OrgNotificationConfig> {
  const supabase = getServiceClient()

  const { data: org, error } = await supabase
    .from('organisations')
    .select('name, settings')
    .eq('id', orgId)
    .single()

  if (error) {
    logger.warn(`[notification-config] Failed to load org ${orgId}`, { error: error.message })
  }

  return {
    name: org?.name ?? 'BitBit User',
    fromEmail: org?.settings?.from_email ?? `noreply@${process.env.NEXT_PUBLIC_APP_DOMAIN ?? 'bitbit.app'}`,
    notifyEmail: org?.settings?.notify_email ?? '',
    notifyPhone: org?.settings?.notify_phone ?? null,
  }
}
