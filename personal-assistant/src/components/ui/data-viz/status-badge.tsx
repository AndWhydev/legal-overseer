/**
 * Pill-shaped status badge with a colored dot indicator and optional glow effect.
 * Used for displaying system/process status labels.
 */
export interface StatusBadgeProps {
  label: string
  color?: string
  glow?: boolean
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({
  label,
  color = 'var(--bb-green)',
  glow = false,
  size = 'sm',
  className,
}: StatusBadgeProps) {
  const px = size === 'sm' ? '8px 12px' : '8px 16px'
  const fs = size === 'sm' ? 14 : 14

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: px,
        borderRadius: 9999,
        fontSize: fs,
        fontWeight: 500,
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        border: 'none',
        boxShadow: glow ? `0 0 16px color-mix(in srgb, ${color} 25%, transparent)` : undefined,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: glow ? `0 0 8px ${color}` : undefined,
        }}
      />
      {label}
    </span>
  )
}
