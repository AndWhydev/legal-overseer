'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import type { ConnectionStatus } from '@/lib/connections'
import {
  IconCircleCheck,
  IconAlertTriangle,
  IconClockHour3,
  IconPlugConnected,
  IconPlugConnectedX,
  IconKey,
  IconPower,
} from '@tabler/icons-react'

export interface ConnectionStateBadgeProps {
  status: ConnectionStatus
  /** Optional last_error shown as tooltip title. */
  error?: string | null
  /** Optional auth_expires_at — when past, we flag the connection. */
  authExpiresAt?: string | null
  className?: string
}

interface Descriptor {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  Icon: typeof IconCircleCheck
  tone: string
}

function describe(
  status: ConnectionStatus,
  authExpiresAt?: string | null,
): Descriptor {
  // If the row is still marked 'connected' but expiry has passed, surface
  // it as `auth_expired` visually so the UI is consistent before the next
  // refresh cron flips the status.
  if (status === 'connected' && authExpiresAt) {
    const expiresAt = new Date(authExpiresAt).getTime()
    if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) {
      return describe('auth_expired')
    }
  }

  switch (status) {
    case 'connected':
      return { label: 'Connected', variant: 'default', Icon: IconCircleCheck, tone: 'text-emerald-500' }
    case 'provisioning':
      return { label: 'Setting up', variant: 'secondary', Icon: IconClockHour3, tone: 'text-blue-500' }
    case 'pending':
      return { label: 'Pending', variant: 'secondary', Icon: IconClockHour3, tone: 'text-blue-500' }
    case 'suspended':
      return { label: 'Suspended', variant: 'secondary', Icon: IconPower, tone: 'text-zinc-400' }
    case 'auth_expired':
      return { label: 'Reconnect required', variant: 'destructive', Icon: IconKey, tone: 'text-amber-500' }
    case 'needs_reauth':
      return { label: 'Needs re-auth', variant: 'destructive', Icon: IconKey, tone: 'text-amber-500' }
    case 'error':
      return { label: 'Error', variant: 'destructive', Icon: IconAlertTriangle, tone: 'text-red-500' }
    case 'disabled':
      return { label: 'Disabled', variant: 'outline', Icon: IconPlugConnectedX, tone: 'text-muted-foreground' }
    default:
      return { label: status, variant: 'outline', Icon: IconPlugConnected, tone: '' }
  }
}

export function ConnectionStateBadge({
  status,
  error,
  authExpiresAt,
  className,
}: ConnectionStateBadgeProps) {
  const d = describe(status, authExpiresAt)

  return (
    <Badge
      variant={d.variant}
      className={cn('inline-flex items-center gap-1 text-[11px]', className)}
      title={error || undefined}
    >
      <d.Icon size={11} className={d.tone} />
      {d.label}
    </Badge>
  )
}

export { describe as describeConnectionState }
