'use client'

import { useEffect, useRef, useState } from 'react'

interface ProgressRingProps {
  value: number // 0-100
  size?: number // default 64
  strokeWidth?: number // default 4
  label?: string // "Today" or "Week"
  showValue?: boolean // show % in center
  className?: string
}

function getColor(value: number): string {
  if (value <= 25) return '#C47070' // coral
  if (value <= 50) return '#FBBF24' // amber
  if (value <= 75) return '#7CAA85' // sage
  return '#D4A574' // gold
}

export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 4,
  label,
  showValue = true,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  const dashOffset = circumference - (clamped / 100) * circumference
  const color = getColor(clamped)

  // Count-up animation for the displayed number
  const [displayValue, setDisplayValue] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const start = displayValue
    const end = Math.round(clamped)
    if (start === end) return

    const duration = 600
    const startTime = performance.now()

    function animate(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      // ease-out
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(Math.round(start + (end - start) * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // Only re-animate when clamped value changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped])

  return (
    <div className={`flex flex-col items-center gap-1 ${className ?? ''}`}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1A1A1D"
            strokeWidth={strokeWidth}
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference}
            className="animate-progress-ring"
            style={{
              '--circumference': `${circumference}`,
              '--dash-offset': `${dashOffset}`,
              transition: 'stroke 0.4s ease',
            } as React.CSSProperties}
          />
        </svg>
        {showValue && (
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground">
            {displayValue}%
          </span>
        )}
      </div>
      {label && (
        <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      )}
    </div>
  )
}
