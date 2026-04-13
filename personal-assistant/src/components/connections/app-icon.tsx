'use client'

/**
 * AppIcon — dynamic logo for connection catalog cards.
 *
 * Fallback chain (each step degrades to the next on image load error):
 *   1. Composio `logo` URL (when provided by the catalog API)
 *   2. Clearbit logo service (guessed from the app name)
 *   3. Iconify MDI glyph (slugified app id)
 *   4. Initial-letter avatar (always succeeds)
 *
 * Renders with iOS-style ~22.37% corner radius to match the prior design.
 * Memoized so re-renders of the grid don't re-mount every icon.
 */

import React, { memo, useState, useMemo } from 'react'

export interface AppIconProps {
  id: string
  name: string
  logo?: string
  size?: number
}

function guessDomain(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? ''
  return `${firstWord.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`
}

function slugify(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Deterministic colour from a string — stable across renders. */
function colorFromString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 52%)`
}

type Stage = 'composio' | 'clearbit' | 'iconify' | 'letter'

function AppIconInner({ id, name, logo, size = 40 }: AppIconProps) {
  const initialStage: Stage = logo ? 'composio' : 'clearbit'
  const [stage, setStage] = useState<Stage>(initialStage)

  const radius = Math.round(size * 0.2237)
  const bgColor = useMemo(() => colorFromString(id || name), [id, name])
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()

  const nextStage = (): Stage => {
    if (stage === 'composio') return 'clearbit'
    if (stage === 'clearbit') return 'iconify'
    return 'letter'
  }

  const handleError = () => {
    setStage(nextStage())
  }

  const sharedStyle: React.CSSProperties = {
    borderRadius: radius,
    width: size,
    height: size,
  }

  if (stage === 'letter') {
    return (
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-center font-semibold text-white"
        style={{
          ...sharedStyle,
          backgroundColor: bgColor,
          fontSize: Math.round(size * 0.45),
          lineHeight: 1,
        }}
      >
        {initial}
      </div>
    )
  }

  let src: string
  if (stage === 'composio' && logo) {
    src = logo
  } else if (stage === 'clearbit') {
    src = `https://logo.clearbit.com/${guessDomain(name)}`
  } else {
    src = `https://api.iconify.design/mdi/${slugify(id)}.svg?color=%23999`
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={handleError}
      className="shrink-0 bg-muted object-contain"
      style={sharedStyle}
    />
  )
}

export const AppIcon = memo(AppIconInner)
AppIcon.displayName = 'AppIcon'
