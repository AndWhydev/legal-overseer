'use client'

import React, { useState, useCallback } from 'react'
import { Eye, Users, Rocket } from 'lucide-react'
import type { RoleType, AutonomyLevel } from '@/lib/bitbit-core'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutonomyToggleProps {
  roleType: RoleType
  currentLevel: AutonomyLevel
  enabled: boolean
  onLevelChange?: (roleType: RoleType, newLevel: AutonomyLevel) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEVELS: { level: AutonomyLevel; label: string; icon: React.ElementType; description: string }[] = [
  { level: 'observer', label: 'Observer', icon: Eye, description: 'Watch and report only' },
  { level: 'copilot', label: 'Co-pilot', icon: Users, description: 'Suggest actions, ask for approval' },
  { level: 'autopilot', label: 'Autopilot', icon: Rocket, description: 'Act autonomously within guardrails' },
]

const LEVEL_COLORS: Record<AutonomyLevel, string> = {
  observer: '#94A3B8',
  copilot: '#3b82f6',
  autopilot: '#22c55e',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutonomyToggle({ roleType, currentLevel, enabled, onLevelChange }: AutonomyToggleProps) {
  const [saving, setSaving] = useState(false)
  const [hoveredLevel, setHoveredLevel] = useState<AutonomyLevel | null>(null)
  const [optimisticLevel, setOptimisticLevel] = useState<AutonomyLevel>(currentLevel)

  // Sync optimistic level with prop changes
  React.useEffect(() => {
    setOptimisticLevel(currentLevel)
  }, [currentLevel])

  const handleChange = useCallback(async (newLevel: AutonomyLevel) => {
    if (newLevel === optimisticLevel || saving || !enabled) return

    setSaving(true)
    setOptimisticLevel(newLevel) // optimistic update

    try {
      const res = await fetch(`/api/roles/${roleType}/autonomy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autonomy_level: newLevel }),
      })

      if (!res.ok) {
        setOptimisticLevel(currentLevel) // revert on error
        return
      }

      onLevelChange?.(roleType, newLevel)
    } catch {
      setOptimisticLevel(currentLevel) // revert on error
    } finally {
      setSaving(false)
    }
  }, [roleType, optimisticLevel, currentLevel, saving, enabled, onLevelChange])

  const currentIndex = LEVELS.findIndex(l => l.level === optimisticLevel)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Track */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderRadius: 12,
        background: 'rgba(10, 14, 23, 0.5)',
        padding: 4,
        position: 'relative',
        opacity: enabled ? 1 : 0.4,
        pointerEvents: enabled ? 'auto' : 'none',
      }}>
        {LEVELS.map((lvl, idx) => {
          const isActive = optimisticLevel === lvl.level
          const isHovered = hoveredLevel === lvl.level
          const color = LEVEL_COLORS[lvl.level]
          const Icon = lvl.icon

          return (
            <button
              key={lvl.level}
              onClick={() => handleChange(lvl.level)}
              onMouseEnter={() => setHoveredLevel(lvl.level)}
              onMouseLeave={() => setHoveredLevel(null)}
              disabled={saving}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 12,
                border: 'none',
                fontSize: 14,
                fontWeight: isActive ? 500 : 500,
                cursor: saving ? 'wait' : 'pointer',
                transition: 'all 200ms',
                background: isActive
                  ? `${color}20`
                  : isHovered
                    ? 'rgba(255, 255, 255, 0.04)'
                    : 'transparent',
                color: isActive
                  ? color
                  : isHovered
                    ? 'var(--text-primary, #F1F5F9)'
                    : 'var(--text-dim, #475569)',
              }}
            >
              <Icon size={13} />
              <span>{lvl.label}</span>
            </button>
          )
        })}
      </div>

      {/* Description */}
      {(hoveredLevel || optimisticLevel) && (
        <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)', paddingLeft: 4 }}>
          {LEVELS.find(l => l.level === (hoveredLevel ?? optimisticLevel))?.description}
        </div>
      )}
    </div>
  )
}
