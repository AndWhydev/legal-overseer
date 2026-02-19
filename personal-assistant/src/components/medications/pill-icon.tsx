'use client'

import { cn } from '@/lib/utils'
import type { PillStyle } from '@/lib/medications/types'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'

interface PillIconProps {
  style: PillStyle
  size?: number
  taken?: boolean
  onClick?: () => void
  tooltip?: string
}

function RoundTablet({ style, size }: { style: PillStyle; size: number }) {
  const r = size / 2 - 1
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id={`round-grad-${style.primaryColor.replace('#', '')}`} cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="50%" stopColor={style.primaryColor} stopOpacity="1" />
          <stop offset="100%" stopColor={style.primaryColor} stopOpacity="0.7" />
        </radialGradient>
        <filter id="pill-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={`url(#round-grad-${style.primaryColor.replace('#', '')})`}
        filter="url(#pill-shadow)"
      />
      {/* Glossy highlight */}
      <ellipse
        cx={size * 0.38}
        cy={size * 0.32}
        rx={r * 0.35}
        ry={r * 0.2}
        fill="white"
        opacity="0.35"
      />
      {/* Score line */}
      {style.scoreLine && (
        <line
          x1={size / 2 - r * 0.6}
          y1={size / 2}
          x2={size / 2 + r * 0.6}
          y2={size / 2}
          stroke="rgba(0,0,0,0.12)"
          strokeWidth="0.6"
        />
      )}
    </svg>
  )
}

function Capsule({ style, size }: { style: PillStyle; size: number }) {
  const w = size * 1.8
  const h = size
  const r = h / 2 - 1
  const half = w / 2
  const leftColor = style.primaryColor
  const rightColor = style.secondaryColor || style.primaryColor

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <clipPath id={`cap-left-${size}`}>
          <rect x="0" y="0" width={half} height={h} />
        </clipPath>
        <clipPath id={`cap-right-${size}`}>
          <rect x={half} y="0" width={half} height={h} />
        </clipPath>
        <linearGradient id={`cap-shine-${size}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
        </linearGradient>
        <filter id="cap-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#000" floodOpacity="0.25" />
        </filter>
      </defs>
      {/* Left half */}
      <rect
        x="1"
        y="1"
        width={w - 2}
        height={h - 2}
        rx={r}
        ry={r}
        fill={leftColor}
        opacity={style.transparent ? 0.5 : 1}
        clipPath={`url(#cap-left-${size})`}
        filter="url(#cap-shadow)"
      />
      {/* Right half */}
      <rect
        x="1"
        y="1"
        width={w - 2}
        height={h - 2}
        rx={r}
        ry={r}
        fill={rightColor}
        opacity={style.transparent ? 0.5 : 1}
        clipPath={`url(#cap-right-${size})`}
        filter="url(#cap-shadow)"
      />
      {/* Fill powder inside */}
      {style.transparent && style.fillColor && (
        <rect
          x={w * 0.15}
          y={h * 0.35}
          width={w * 0.7}
          height={h * 0.35}
          rx="1"
          fill={style.fillColor}
          opacity="0.6"
        />
      )}
      {/* Shine overlay */}
      <rect
        x="1"
        y="1"
        width={w - 2}
        height={h - 2}
        rx={r}
        ry={r}
        fill={`url(#cap-shine-${size})`}
      />
      {/* Center seam */}
      <line
        x1={half}
        y1="2"
        x2={half}
        y2={h - 2}
        stroke="rgba(0,0,0,0.1)"
        strokeWidth="0.5"
      />
    </svg>
  )
}

function Softgel({ style, size }: { style: PillStyle; size: number }) {
  const w = size * 1.4
  const h = size
  const color = style.fillColor || style.primaryColor

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <radialGradient id={`sg-grad-${color.replace('#', '')}-${size}`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="40%" stopColor={color} stopOpacity="0.85" />
          <stop offset="100%" stopColor={color} stopOpacity="0.6" />
        </radialGradient>
        <filter id="sg-shadow">
          <feDropShadow dx="0" dy="1" stdDeviation="0.8" floodColor="#000" floodOpacity="0.3" />
        </filter>
      </defs>
      {/* Main softgel body */}
      <ellipse
        cx={w / 2}
        cy={h / 2}
        rx={w / 2 - 1}
        ry={h / 2 - 1}
        fill={`url(#sg-grad-${color.replace('#', '')}-${size})`}
        filter="url(#sg-shadow)"
      />
      {/* Glossy highlight */}
      <ellipse
        cx={w * 0.36}
        cy={h * 0.3}
        rx={w * 0.18}
        ry={h * 0.12}
        fill="white"
        opacity="0.4"
      />
      {/* Secondary highlight */}
      <ellipse
        cx={w * 0.55}
        cy={h * 0.72}
        rx={w * 0.12}
        ry={h * 0.06}
        fill="white"
        opacity="0.12"
      />
    </svg>
  )
}

function DiskTablet({ style, size }: { style: PillStyle; size: number }) {
  const r = size / 2 - 1
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={`disk-grad-${size}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.1" />
        </linearGradient>
        <filter id="disk-shadow">
          <feDropShadow dx="0" dy="0.5" stdDeviation="0.5" floodColor="#000" floodOpacity="0.2" />
        </filter>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={style.primaryColor}
        filter="url(#disk-shadow)"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={`url(#disk-grad-${size})`}
      />
    </svg>
  )
}

function CheckOverlay({ size }: { size: number }) {
  const s = size * 0.5
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 16 16"
      className="absolute -bottom-0.5 -right-0.5"
    >
      <circle cx="8" cy="8" r="7" fill="#7CAA85" />
      <path
        d="M5 8.5L7 10.5L11 6"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function PillIcon({ style, size = 20, taken, onClick, tooltip }: PillIconProps) {
  const sizeMap = { tiny: size * 0.7, small: size, medium: size * 1.2, large: size * 1.4 }
  const resolvedSize = sizeMap[style.size] || size

  const pillContent = (
    <div
      className={cn(
        'relative inline-flex items-center justify-center transition-all duration-150',
        onClick && 'cursor-pointer hover:scale-110',
        taken && 'opacity-45',
      )}
      onClick={onClick}
    >
      {style.shape === 'round' && <RoundTablet style={style} size={resolvedSize} />}
      {style.shape === 'capsule' && <Capsule style={style} size={resolvedSize} />}
      {style.shape === 'softgel' && <Softgel style={style} size={resolvedSize} />}
      {style.shape === 'oval' && <Softgel style={style} size={resolvedSize} />}
      {style.shape === 'disk' && <DiskTablet style={style} size={resolvedSize} />}
      {taken && <CheckOverlay size={resolvedSize} />}
    </div>
  )

  if (!tooltip) return pillContent

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{pillContent}</TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          <span className="text-xs">{tooltip}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
