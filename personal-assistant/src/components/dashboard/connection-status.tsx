'use client'

import React from 'react'
import { useRealtimeStatus, type RealtimeConnectionStatus } from '@/hooks/use-realtime-status'
import { IconWifi, IconWifiOff, IconLoader2 } from '@tabler/icons-react'

const STATUS_CONFIG: Record<RealtimeConnectionStatus, {
  icon: React.ElementType
  colorClass: string
  label: string
  animate?: boolean
}> = {
  connected: {
    icon: IconWifi,
    colorClass: 'text-emerald-500',
    label: 'Live',
  },
  connecting: {
    icon: IconLoader2,
    colorClass: 'text-amber-500',
    label: 'Reconnecting',
    animate: true,
  },
  disconnected: {
    icon: IconWifiOff,
    colorClass: 'text-red-500',
    label: 'Offline',
  },
}

export function ConnectionStatus() {
  const status = useRealtimeStatus()
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded-lg text-sm font-medium transition-opacity ${config.colorClass} ${status === 'connected' ? 'opacity-60' : 'opacity-100'}`}
      title={`Realtime: ${config.label}`}
      aria-label={`Connection status: ${config.label}`}
    >
      <Icon
        size={12}
        stroke={2}
        className={config.animate ? 'animate-spin' : ''}
      />
      <span>{config.label}</span>
    </div>
  )
}
