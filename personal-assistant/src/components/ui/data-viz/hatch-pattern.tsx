/**
 * SVG hatch pattern definition for use as fill in charts and visualizations.
 * Supports configurable angle, spacing, and optional gradient fade masking.
 */
export interface HatchPatternProps {
  id: string
  color?: string
  spacing?: number
  strokeWidth?: number
  angle?: number
  /** If true, generates a gradient-masked hatch (requires companion mask + gradient defs) */
  gradientFade?: boolean
}

/**
 * SVG hatch pattern with optional gradient fade support.
 * 
 * For gradient fade, this generates:
 * - Pattern: `{id}` — the hatch lines
 * - Gradient: `{id}-grad` — vertical fade from color to transparent
 * - Mask: `{id}-mask` — gradient mask for the hatch
 * 
 * Usage with gradient: fill="url(#{id})" mask="url(#{id}-mask)"
 * Or use the combined rect: fill the area with the pattern and apply the mask.
 */
export function HatchPattern({
  id,
  color = 'var(--bb-orange)',
  spacing = 4,
  strokeWidth = 1,
  angle = 45,
  gradientFade = false,
}: HatchPatternProps) {
  return (
    <defs>
      <pattern
        id={id}
        patternUnits="userSpaceOnUse"
        width={spacing}
        height={spacing}
        patternTransform={`rotate(${angle})`}
      >
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={spacing}
          stroke={color}
          strokeWidth={strokeWidth}
          opacity={0.35}
        />
      </pattern>
      {gradientFade && (
        <>
          <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={0.6} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </linearGradient>
          <mask id={`${id}-mask`}>
            <rect width="100%" height="100%" fill={`url(#${id}-grad)`} />
          </mask>
        </>
      )}
    </defs>
  )
}
