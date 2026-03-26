'use client'

import React, { useRef, useState, useEffect, useCallback } from 'react'

interface GlassToggleOption<T extends string> {
  key: T
  label: string
  icon?: React.ReactNode
  count?: number
}

interface GlassToggleProps<T extends string> {
  options: GlassToggleOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}

/**
 * Unified glass-morphic segmented toggle with sliding indicator.
 *
 * Strategy: the active button ALWAYS has a visible background (CSS, no JS).
 * After the user clicks a different option, a sliding indicator activates
 * for the animated transition, then the button background takes over again.
 */
export function GlassToggle<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: GlassToggleProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sliding, setSliding] = useState<{ left: number; width: number } | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevValue = useRef(value)

  const measureButton = useCallback((key: T) => {
    if (!containerRef.current) return null
    const idx = options.findIndex((o) => o.key === key)
    if (idx < 0) return null
    const buttons = containerRef.current.querySelectorAll<HTMLButtonElement>('[data-toggle-btn]')
    const btn = buttons[idx]
    if (!btn) return null
    const cr = containerRef.current.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    if (br.width === 0) return null
    return { left: br.left - cr.left, width: br.width }
  }, [options])

  // When value changes via user click, animate the sliding indicator
  useEffect(() => {
    if (prevValue.current === value) return
    const fromPos = measureButton(prevValue.current)
    const toPos = measureButton(value)
    prevValue.current = value

    if (!fromPos || !toPos) return

    // Start slide from previous position
    setSliding(fromPos)
    setIsAnimating(true)

    // Next frame: move to new position (triggers CSS transition)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSliding(toPos)
        // After animation completes, remove the slider and let button bg take over
        setTimeout(() => {
          setIsAnimating(false)
          setSliding(null)
        }, 280)
      })
    })
  }, [value, measureButton])

  const h = size === 'sm' ? 36 : 40
  const px = size === 'sm' ? 12 : 16
  const activeBg = 'var(--toggle-active-bg, rgba(255, 255, 255, 0.08))'
  const activeShadow = 'var(--toggle-active-shadow, none)'

  return (
    <div
      ref={containerRef}
      style={{
        display: 'inline-flex',
        position: 'relative',
        padding: 4,
        borderRadius: 12,
        background: 'var(--toggle-container-bg, rgba(15, 20, 30, 0.4))',
        backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
        WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        gap: 2,
      }}
    >
      {/* Sliding indicator — only during animation */}
      {isAnimating && sliding && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            left: sliding.left,
            width: sliding.width,
            height: h,
            borderRadius: 8,
            background: activeBg,
            boxShadow: activeShadow,
            transition: 'left 250ms cubic-bezier(0.34, 1.56, 0.64, 1), width 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}

      {options.map((opt) => {
        const active = opt.key === value
        // Show background on button when NOT animating (slider handles it during animation)
        const showBg = active && !isAnimating
        return (
          <button
            key={opt.key}
            data-toggle-btn
            onClick={() => onChange(opt.key)}
            style={{
              position: 'relative',
              zIndex: 1,
              height: h,
              padding: `0 ${px}px`,
              borderRadius: 8,
              border: 'none',
              background: showBg ? activeBg : 'transparent',
              boxShadow: showBg ? activeShadow : 'none',
              color: active
                ? 'var(--text-primary, #F1F5F9)'
                : 'var(--text-secondary, #94A3B8)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'color 200ms cubic-bezier(0.16, 1, 0.3, 1)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              whiteSpace: 'nowrap',
              fontFamily: 'inherit',
            }}
          >
            {opt.icon}
            {opt.label}
            {opt.count != null && (
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  color: active
                    ? 'var(--text-secondary, #94A3B8)'
                    : 'var(--text-dim, #475569)',
                  transition: 'color 200ms',
                }}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
