'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'

interface GlassDropdownOption {
  value: string
  label: string
}

interface GlassDropdownProps {
  options: GlassDropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  size?: 'sm' | 'md'
}

export function GlassDropdown({ options, value, onChange, placeholder = 'Select...', size = 'md' }: GlassDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find(o => o.value === value)
  const h = size === 'sm' ? 36 : 40
  const px = size === 'sm' ? 12 : 16

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', zIndex: open ? 200 : 'auto' }}>
      {/* Trigger button — glassmorphic */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          height: h,
          paddingLeft: px,
          paddingRight: px + 20,
          borderRadius: 8,
          background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
          backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
          WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
          boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05))',
          border: 'none',
          color: value ? 'var(--text-primary, #F1F5F9)' : 'var(--text-secondary, #94A3B8)',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'inline-grid',
          alignItems: 'center',
          justifyItems: 'start',
          transition: 'background 200ms',
          position: 'relative',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg-strong, rgba(255,255,255,0.08))' }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'var(--hover-bg, rgba(255,255,255,0.04))' }}
      >
        {/* All labels stacked in same grid cell — widest one sets the width */}
        {[placeholder, ...options.map(o => o.label)].map((label, i) => (
          <span
            key={i}
            style={{
              gridArea: '1 / 1',
              visibility: label === (selected?.label || placeholder) ? 'visible' : 'hidden',
            }}
          >
            {label}
          </span>
        ))}
        <ChevronDown
          size={14}
          style={{
            position: 'absolute',
            right: px,
            top: '50%',
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            transition: 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: 0.5,
          }}
        />
      </button>

      {/* Menu — glassmorphic */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: 4,
          minWidth: '100%',
          padding: 4,
          borderRadius: 12,
          background: 'var(--glass-bg-heavy, rgba(12, 16, 24, 0.92))',
          backdropFilter: 'blur(40px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(40px) saturate(1.5)',
          boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255, 255, 255, 0.05)), 0 8px 32px rgba(0, 0, 0, 0.4)',
          border: 'none',
          zIndex: 200,
          animation: 'bb-fade-up 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 12px',
                marginBottom: 2,
                borderRadius: 8,
                border: 'none',
                background: opt.value === value ? 'var(--hover-bg-strong, rgba(255,255,255,0.08))' : 'transparent',
                color: opt.value === value ? 'var(--text-primary, #F1F5F9)' : 'var(--text-secondary, #94A3B8)',
                fontSize: 14,
                fontWeight: opt.value === value ? 500 : 400,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 150ms',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg, rgba(255,255,255,0.04))' }}
              onMouseLeave={e => { e.currentTarget.style.background = opt.value === value ? 'var(--hover-bg-strong, rgba(255,255,255,0.08))' : 'transparent' }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
