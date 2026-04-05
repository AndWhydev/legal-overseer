'use client'

import React, { useState, useCallback } from 'react'
import { IconEye, IconUsers, IconRocket } from '@tabler/icons-react'
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
  { level: 'observer', label: 'Observer', icon: IconEye, description: 'Watch and report only' },
  { level: 'copilot', label: 'Co-pilot', icon: IconUsers, description: 'Suggest actions, ask for approval' },
  { level: 'autopilot', label: 'Autopilot', icon: IconRocket, description: 'Act autonomously within guardrails' },
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

  return (
    <div className="flex flex-col gap-2">
      {/* Track */}
      <div className={`flex rounded-xl bg-muted p-1 ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
        {LEVELS.map((lvl) => {
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
              className={`flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-xl border-none text-sm font-medium transition-all ${
                saving ? 'cursor-wait' : 'cursor-pointer'
              }`}
              style={{
                background: isActive
                  ? `${color}20`
                  : isHovered
                    ? 'rgba(255, 255, 255, 0.04)'
                    : 'transparent',
                color: isActive
                  ? color
                  : isHovered
                    ? 'var(--foreground)'
                    : 'var(--muted-foreground)',
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
        <div className="text-sm text-muted-foreground pl-1">
          {LEVELS.find(l => l.level === (hoveredLevel ?? optimisticLevel))?.description}
        </div>
      )}
    </div>
  )
}
