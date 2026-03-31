'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type PixelFontKey = 'square' | 'grid' | 'circle' | 'triangle' | 'line'

export const PIXEL_FONTS: Record<PixelFontKey, string> = {
  square: 'var(--font-geist-pixel-square)',
  grid: 'var(--font-geist-pixel-grid)',
  circle: 'var(--font-geist-pixel-circle)',
  triangle: 'var(--font-geist-pixel-triangle)',
  line: 'var(--font-geist-pixel-line)',
}

export const FONT_ORDER: PixelFontKey[] = ['square', 'grid', 'circle', 'triangle', 'line']

interface PixelHeadingProps {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  initialFont?: PixelFontKey
  hoverFont?: PixelFontKey
  cycleInterval?: number
  defaultFontIndex?: number
  showLabel?: boolean
  onFontIndexChange?: (index: number) => void
  className?: string
  children: React.ReactNode
}

export function PixelHeading({
  as: Tag = 'h1',
  initialFont = 'square',
  hoverFont,
  cycleInterval = 300,
  defaultFontIndex = 0,
  showLabel = false,
  onFontIndexChange,
  className,
  children,
}: PixelHeadingProps) {
  const initialIndex = FONT_ORDER.indexOf(initialFont) ?? defaultFontIndex
  const [fontIndex, setFontIndex] = useState(initialIndex)
  const [isActive, setIsActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    onFontIndexChange?.(fontIndex)
  }, [fontIndex, onFontIndexChange])

  useEffect(() => {
    if (hoverFont) {
      setFontIndex(isActive ? FONT_ORDER.indexOf(hoverFont) : initialIndex)
      return
    }
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setFontIndex(i => (i + 1) % FONT_ORDER.length)
      }, cycleInterval)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive, hoverFont, initialIndex, cycleInterval])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (hoverFont) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setFontIndex(i => (i + 1) % FONT_ORDER.length)
    }
  }

  return (
    <>
      <Tag
        className={cn('transition-all duration-150', className)}
        style={{ fontFamily: PIXEL_FONTS[FONT_ORDER[fontIndex]] }}
        onMouseEnter={() => setIsActive(true)}
        onMouseLeave={() => setIsActive(false)}
        onFocus={() => setIsActive(true)}
        onBlur={() => setIsActive(false)}
        onKeyDown={handleKeyDown}
        tabIndex={hoverFont ? undefined : 0}
      >
        {children}
      </Tag>
      {showLabel && (
        <output aria-live="polite" className="block text-xs text-muted-foreground mt-1">
          {FONT_ORDER[fontIndex]}
        </output>
      )}
    </>
  )
}

/** Inline span variant — use inside flex/inline contexts (nav, sidebar, chat header) */
interface PixelWordmarkProps {
  initialFont?: PixelFontKey
  cycleInterval?: number
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

export function PixelWordmark({
  initialFont = 'square',
  cycleInterval = 300,
  className,
  style,
  children,
}: PixelWordmarkProps) {
  const initialIndex = FONT_ORDER.indexOf(initialFont)
  const [fontIndex, setFontIndex] = useState(initialIndex)
  const [isActive, setIsActive] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setFontIndex(i => (i + 1) % FONT_ORDER.length)
      }, cycleInterval)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      setFontIndex(initialIndex)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive, initialIndex, cycleInterval])

  return (
    <span
      className={cn('transition-all duration-150', className)}
      style={{ fontFamily: PIXEL_FONTS[FONT_ORDER[fontIndex]], ...style }}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
    >
      {children}
    </span>
  )
}
