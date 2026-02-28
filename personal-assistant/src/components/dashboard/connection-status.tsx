'use client'

import React from 'react'
import { useRealtimeStatus, type RealtimeConnectionStatus } from '@/hooks/use-realtime-status'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'

const STATUS_CONFIG: Record<RealtimeConnectionStatus, {
  icon: React.ElementType
  color: string
  label: string
  animate?: boolean
}> = {
  connected: {
    icon: Wifi,
    color: 'var(--bb-green, #22c55e)',
    label: 'Live',
  },
  connecting: {
    icon: Loader2,
    color: 'var(--bb-yellow, #eab308)',
    label: 'Reconnecting',
    animate: true,
  },
  disconnected: {
    icon: WifiOff,
    color: 'var(--bb-red, #ef4444)',
    label: 'Offline',
  },
}

export function ConnectionStatus() {
  const status = useRealtimeStatus()
  const config = STATUS_CONFIG[status]
  const Icon = config.icon

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 500,
        color: config.color,
        opacity: status === 'connected' ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
      title={`Realtime: ${config.label}`}
      aria-label={`Connection status: ${config.label}`}
    >
      <Icon
        size={12}
        strokeWidth={2}
        style={config.animate ? { animation: 'spin 1s linear infinite' } : undefined}
      />
      <span>{config.label}</span>
    </div>
  )
}
