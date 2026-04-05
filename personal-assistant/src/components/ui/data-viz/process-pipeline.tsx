'use client'

import { DataConnector } from './data-connector'
import { type ReactNode } from 'react'

/**
 * Horizontal process pipeline visualization showing sequential stages
 * connected by animated data connectors. Each stage displays as a
 * surface card with status-colored glow.
 */
export interface PipelineStage {
  label: string
  sublabel?: string
  icon?: ReactNode
  status?: 'active' | 'warning' | 'error' | 'idle'
  color?: string
}

export interface ProcessPipelineProps {
  stages: PipelineStage[]
  connectorWidth?: number
  className?: string
}

const statusColors: Record<string, string> = {
  active: 'var(--bb-green)',
  warning: 'var(--bb-amber)',
  error: 'var(--bb-red)',
  idle: 'var(--text-dim)',
}

const rawStatusColors: Record<string, string> = {
  active: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  idle: 'var(--text-dim)',
}

export function ProcessPipeline({
  stages,
  connectorWidth = 40,
  className,
}: ProcessPipelineProps) {
  return (
    <div
      className={className}
      style={{ display: 'flex', alignItems: 'center', gap: 0 }}
    >
      {stages.map((stage, i) => {
        const color = stage.color || statusColors[stage.status || 'active']
        const rawColor = stage.color || rawStatusColors[stage.status || 'active']
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                position: 'relative',
                padding: '16px 20px 12px',
                borderRadius: 'var(--radius-xl)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                boxShadow: `var(--card-shadow), 0 0 20px ${rawColor}10`,
                backgroundImage: `linear-gradient(135deg, ${rawColor}08 0%, transparent 60%)`,
                minWidth: 110,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 40,
                  background: `linear-gradient(180deg, ${rawColor}12 0%, transparent 100%)`,
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'relative',
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-md)',
                  background: `${rawColor}18`,
                  boxShadow: `0 0 12px ${rawColor}20`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color,
                  fontSize: 16,
                }}
              >
                {stage.icon}
              </div>
              <div
                style={{
                  position: 'relative',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  textAlign: 'center',
                  letterSpacing: '0.01em',
                }}
              >
                {stage.label}
              </div>
              {stage.sublabel && (
                <div
                  style={{
                    position: 'relative',
                    fontSize: 14,
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-secondary)',
                    padding: '2px 12px',
                    borderRadius: 'var(--radius-full)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  {stage.sublabel}
                </div>
              )}
            </div>
            {i < stages.length - 1 && (
              <DataConnector
                status={stage.status || 'active'}
                width={connectorWidth}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
