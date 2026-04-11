'use client'

import React from 'react'

/**
 * AI/magic action button with animated gradient background and noise texture.
 * Styled via the `.bb-ai-btn` CSS class from the BitBit design system.
 */
export interface AIButtonProps {
  children: React.ReactNode
  onClick?: () => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
}

export function AIButton({
  children,
  onClick,
  size = 'md',
  className = '',
  disabled = false,
}: AIButtonProps) {
  const sizeClass = `bb-ai-btn--${size}`

  return (
    <button
      className={`bb-ai-btn ${sizeClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export default AIButton
