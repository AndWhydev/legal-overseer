'use client'

import React from 'react'
import { useRealtimeStatus, type RealtimeConnectionStatus } from '@/hooks/use-realtime-status'
import { SFWifi, SFWifiSlash, SFArrowClockwise } from 'sf-symbols-lib'

const STATUS_CONFIG: Record<RealtimeConnectionStatus, {
  icon: React.ElementType
  color: string
  label: string
  animate?: boolean
}> = {
  connected: {
    icon: SFWifi,
    color: 'var(--bb-green)',
    label: 'Live',
  },
  connecting: {
    icon: SFArrowClockwise,
    color: 'var(--bb-amber)',
    label: 'Reconnecting',
    animate: true,
  },
  disconnected: {
    icon: SFWifiSlash,
    color: 'var(--bb-red)',
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
        style={config.animate ? { animation: 'spin 1s linear infinite' } : undefined}
      />
      <span>{config.label}</span>
    </div>
  )
}
