'use client'

import React from 'react'

export type StatusVariant =
  | 'success' | 'warning' | 'error' | 'info'
  | 'neutral' | 'orange' | 'purple' | 'cyan'

interface StatusPillProps {
  variant: StatusVariant
  label: string
  icon?: React.ReactNode
  dot?: boolean
  minimal?: boolean
  className?: string
}

/**
 * Monochrome glass status pill.
 *
 * All variants use the same glass surface with white text at varying
 * brightness. No colored borders, no transparent+color backgrounds.
 * Status meaning is conveyed through the dot color only (the sole
 * exception to monochrome), keeping the pill itself visually uniform.
 */

const DOT_COLOR: Record<StatusVariant, string> = {
  success: '#22c55e',
  warning: '#eab308',
  error: '#ef4444',
  info: '#94A3B8',
  neutral: '#475569',
  // Legacy variants — map to monochrome
  orange: '#94A3B8',
  purple: '#94A3B8',
  cyan: '#94A3B8',
}

const TEXT_COLOR: Record<StatusVariant, string> = {
  success: 'var(--text-primary, #F1F5F9)',
  warning: 'var(--text-primary, #F1F5F9)',
  error: 'var(--text-primary, #F1F5F9)',
  info: 'var(--text-secondary, #94A3B8)',
  neutral: 'var(--text-dim, #475569)',
  orange: 'var(--text-secondary, #94A3B8)',
  purple: 'var(--text-secondary, #94A3B8)',
  cyan: 'var(--text-secondary, #94A3B8)',
}

export function StatusPill({ variant, label, icon, dot = true, minimal = false, className }: StatusPillProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        borderRadius: minimal ? 0 : 8,
        border: 'none',
        padding: minimal ? 0 : '4px 12px',
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.3,
        color: TEXT_COLOR[variant],
        background: minimal ? 'transparent' : 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 8,
            height: 8,
            borderRadius: 9999,
            background: DOT_COLOR[variant],
            flexShrink: 0,
          }}
        />
      )}
      {icon && <span style={{ display: 'flex' }} aria-hidden="true">{icon}</span>}
      {label}
    </span>
  )
}
