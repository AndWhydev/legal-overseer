'use client'

import React from 'react'

interface ToggleSwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}

export function ToggleSwitch({ checked, onChange, label, disabled = false }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        position: 'relative',
        display: 'inline-flex',
        height: 24,
        width: 44,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 12,
        transition: 'background-color 200ms ease',
        border: 'none',
        background: checked && !disabled ? '#22C55E' : 'var(--toggle-off-bg, rgba(255, 255, 255, 0.1))',
        outline: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onFocus={e => {
        if (!disabled) {
          e.currentTarget.style.boxShadow = '0 0 0 2px rgba(34, 197, 94, 0.3)'
        }
      }}
      onBlur={e => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <span
        style={{
          pointerEvents: 'none',
          display: 'inline-block',
          height: 20,
          width: 20,
          borderRadius: 9999,
          background: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
          transition: 'transform 200ms ease',
          transform: checked ? 'translateX(20px)' : 'translateX(2px)',
          marginTop: 2,
        }}
      />
    </button>
  )
}
