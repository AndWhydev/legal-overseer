'use client'

import { useState, useMemo } from 'react'
import type { Medication } from '@/lib/medications/types'
import type { MedicationCurve } from '@/lib/medications/protocol-types'
import { buildMedicationCurves } from '@/lib/medications/protocols'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface HalfLifeChartProps {
  medications: Medication[]
  doseTimes: Record<string, number[]>
  className?: string
}

const CHART_W = 720
const CHART_H = 280
const PAD = { top: 20, right: 20, bottom: 36, left: 44 }
const INNER_W = CHART_W - PAD.left - PAD.right
const INNER_H = CHART_H - PAD.top - PAD.bottom

const HOUR_LABELS = [
  { hour: 0, label: '12am' },
  { hour: 6, label: '6am' },
  { hour: 8, label: '8am' },
  { hour: 12, label: '12pm' },
  { hour: 18, label: '6pm' },
  { hour: 21, label: '9pm' },
  { hour: 24, label: '12am' },
]

export function HalfLifeChart({
  medications,
  doseTimes,
  className,
}: HalfLifeChartProps) {
  const [hoveredCurve, setHoveredCurve] = useState<string | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)

  const curves = useMemo(
    () => buildMedicationCurves(medications, doseTimes),
    [medications, doseTimes]
  )

  const maxConc = useMemo(
    () => Math.max(100, ...curves.flatMap((c) => c.points.map((p) => p.concentration))),
    [curves]
  )

  function x(hour: number) {
    return PAD.left + (hour / 24) * INNER_W
  }

  function y(concentration: number) {
    return PAD.top + INNER_H - (concentration / maxConc) * INNER_H
  }

  function curvePath(curve: MedicationCurve): string {
    return curve.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.hour).toFixed(1)},${y(p.concentration).toFixed(1)}`)
      .join(' ')
  }

  function areaPath(curve: MedicationCurve): string {
    const baseline = y(0)
    const line = curve.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.hour).toFixed(1)},${y(p.concentration).toFixed(1)}`)
      .join(' ')
    const last = curve.points[curve.points.length - 1]
    const first = curve.points[0]
    return `${line} L${x(last.hour).toFixed(1)},${baseline} L${x(first.hour).toFixed(1)},${baseline} Z`
  }

  function getConcentrationAtHour(curve: MedicationCurve, hour: number): number {
    const pts = curve.points
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].hour <= hour && pts[i + 1].hour >= hour) {
        const t = (hour - pts[i].hour) / (pts[i + 1].hour - pts[i].hour)
        return pts[i].concentration + t * (pts[i + 1].concentration - pts[i].concentration)
      }
    }
    return 0
  }

  const hoverHour = hoverX !== null
    ? ((hoverX - PAD.left) / INNER_W) * 24
    : null

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const scale = CHART_W / rect.width
    setHoverX(px * scale)
  }

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Active Blood Levels</h3>
        <span className="text-xs text-muted-foreground">24h pharmacokinetic estimate</span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {curves.map((curve) => (
          <button
            key={curve.medicationId}
            className={cn(
              'flex items-center gap-1.5 text-xs transition-opacity',
              hoveredCurve && hoveredCurve !== curve.medicationId ? 'opacity-30' : 'opacity-100'
            )}
            onMouseEnter={() => setHoveredCurve(curve.medicationId)}
            onMouseLeave={() => setHoveredCurve(null)}
          >
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: curve.color }}
            />
            <span className="text-muted-foreground">{curve.name}</span>
          </button>
        ))}
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoverX(null); setHoveredCurve(null) }}
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map((pct) => (
          <g key={pct}>
            <line
              x1={PAD.left}
              y1={y((pct / 100) * maxConc)}
              x2={CHART_W - PAD.right}
              y2={y((pct / 100) * maxConc)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 6}
              y={y((pct / 100) * maxConc) + 3}
              textAnchor="end"
              className="fill-muted-foreground"
              fontSize={9}
            >
              {pct}%
            </text>
          </g>
        ))}

        {/* Hour labels */}
        {HOUR_LABELS.map(({ hour, label }) => (
          <g key={`h-${hour}`}>
            <line
              x1={x(hour)}
              y1={PAD.top}
              x2={x(hour)}
              y2={CHART_H - PAD.bottom}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray="2,4"
            />
            <text
              x={x(hour)}
              y={CHART_H - PAD.bottom + 14}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={9}
            >
              {label}
            </text>
          </g>
        ))}

        {/* Curves */}
        {curves.map((curve) => {
          const isHovered = hoveredCurve === curve.medicationId
          const isDimmed = hoveredCurve !== null && !isHovered

          return (
            <g
              key={curve.medicationId}
              style={{ opacity: isDimmed ? 0.15 : 1, transition: 'opacity 0.2s' }}
              onMouseEnter={() => setHoveredCurve(curve.medicationId)}
              onMouseLeave={() => setHoveredCurve(null)}
            >
              {/* Area fill */}
              <path
                d={areaPath(curve)}
                fill={curve.color}
                fillOpacity={isHovered ? 0.2 : 0.08}
                style={{ transition: 'fill-opacity 0.2s' }}
              />
              {/* Stroke */}
              <path
                d={curvePath(curve)}
                fill="none"
                stroke={curve.color}
                strokeWidth={isHovered ? 2.5 : 1.5}
                strokeLinejoin="round"
                style={{ transition: 'stroke-width 0.2s' }}
              />
            </g>
          )
        })}

        {/* Hover line */}
        {hoverX !== null && hoverHour !== null && hoverHour >= 0 && hoverHour <= 24 && (
          <g>
            <line
              x1={x(hoverHour)}
              y1={PAD.top}
              x2={x(hoverHour)}
              y2={CHART_H - PAD.bottom}
              className="stroke-primary"
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.5}
            />

            {/* Intersection dots */}
            {curves
              .filter((c) => !hoveredCurve || hoveredCurve === c.medicationId)
              .map((curve) => {
                const conc = getConcentrationAtHour(curve, hoverHour)
                if (conc < 1) return null
                return (
                  <circle
                    key={curve.medicationId}
                    cx={x(hoverHour)}
                    cy={y(conc)}
                    r={3}
                    fill={curve.color}
                    className="stroke-background"
                    strokeWidth={1.5}
                  />
                )
              })}
          </g>
        )}

        {/* Tooltip */}
        {hoverX !== null && hoverHour !== null && hoverHour >= 0 && hoverHour <= 24 && (
          <HoverTooltip
            curves={curves}
            hour={hoverHour}
            xPos={x(hoverHour)}
            getConcentration={getConcentrationAtHour}
            hoveredCurve={hoveredCurve}
          />
        )}
      </svg>
    </Card>
  )
}

function HoverTooltip({
  curves,
  hour,
  xPos,
  getConcentration,
  hoveredCurve,
}: {
  curves: MedicationCurve[]
  hour: number
  xPos: number
  getConcentration: (c: MedicationCurve, h: number) => number
  hoveredCurve: string | null
}) {
  const h = Math.floor(hour)
  const m = Math.floor((hour % 1) * 60)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  const timeStr = `${h12}:${m.toString().padStart(2, '0')}${ampm}`

  const visible = curves
    .filter((c) => !hoveredCurve || hoveredCurve === c.medicationId)
    .map((c) => ({ ...c, conc: getConcentration(c, hour) }))
    .filter((c) => c.conc > 1)
    .sort((a, b) => b.conc - a.conc)

  if (visible.length === 0) return null

  const tooltipW = 140
  const tooltipH = 16 + visible.length * 14 + 8
  const flipX = xPos + tooltipW + 12 > CHART_W - PAD.right
  const tx = flipX ? xPos - tooltipW - 8 : xPos + 8

  return (
    <g>
      <rect
        x={tx}
        y={PAD.top}
        width={tooltipW}
        height={tooltipH}
        rx={6}
        className="fill-popover stroke-border"
        fillOpacity={0.95}
        strokeWidth={1}
      />
      <text
        x={tx + 8}
        y={PAD.top + 13}
        fontSize={10}
        className="fill-muted-foreground"
        fontWeight={600}
      >
        {timeStr}
      </text>
      {visible.map((c, i) => (
        <g key={c.medicationId}>
          <circle cx={tx + 12} cy={PAD.top + 24 + i * 14} r={3} fill={c.color} />
          <text
            x={tx + 20}
            y={PAD.top + 27 + i * 14}
            fontSize={9}
            className="fill-muted-foreground"
          >
            {c.name}
          </text>
          <text
            x={tx + tooltipW - 8}
            y={PAD.top + 27 + i * 14}
            fontSize={9}
            textAnchor="end"
            className="fill-foreground"
            fontWeight={500}
          >
            {Math.round(c.conc)}%
          </text>
        </g>
      ))}
    </g>
  )
}
