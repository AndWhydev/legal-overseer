/**
 * Animated connector line between two nodes/stages showing data flow status.
 * Renders two endpoint dots with a gradient line and optional flowing animation.
 */
export interface DataConnectorProps {
  /** Connection status */
  status?: 'active' | 'warning' | 'error' | 'idle'
  /** Width of connector */
  width?: number
  /** Whether to show animated flow dots */
  showFlow?: boolean
  className?: string
}

const statusColors: Record<string, string> = {
  active: 'var(--bb-green, #22C55E)',
  warning: 'var(--bb-amber, #F59E0B)',
  error: 'var(--bb-red, #EF4444)',
  idle: 'var(--text-dim, #475569)',
}

export function DataConnector({
  status = 'active',
  width = 60,
  showFlow = true,
  className,
}: DataConnectorProps) {
  const color = statusColors[status]

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        width,
        height: 20,
        position: 'relative',
      }}
    >
      {/* Left dot */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 4px ${color}`,
          flexShrink: 0,
        }}
      />
      {/* Line */}
      <span
        style={{
          flex: 1,
          height: 2,
          background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 40%, transparent))`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {showFlow && (
          <span
            style={{
              position: 'absolute',
              width: 8,
              height: '100%',
              background: color,
              borderRadius: 2,
              animation: 'connector-flow 1.5s linear infinite',
            }}
          />
        )}
      </span>
      {/* Right dot */}
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 4px ${color}`,
          flexShrink: 0,
        }}
      />
      <style>{`
        @keyframes connector-flow {
          0% { left: -8px; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  )
}
