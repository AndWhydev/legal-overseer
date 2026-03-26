'use client'

import React, { useState, memo } from 'react'

interface NextActionPanelProps {
  nextAction: string | null
  nextActionAt: string | null
  onSave: (action: string, date: string | null) => void
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-dim, #475569)',
  margin: '0 0 12px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 40,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.05))',
  background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 200ms, box-shadow 200ms',
}

const dateInput: React.CSSProperties = {
  flex: 1,
  height: 40,
  padding: '0 12px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.05))',
  background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
  color: 'var(--text-secondary, #94A3B8)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 200ms, box-shadow 200ms',
}

// ─── Component ──────────────────────────────────────────────────────────────
function NextActionPanelInner({ nextAction, nextActionAt, onSave }: NextActionPanelProps) {
  const [action, setAction] = useState(nextAction ?? '')
  const [date, setDate] = useState(nextActionAt ? nextActionAt.split('T')[0] : '')
  const [saving, setSaving] = useState(false)

  const hasChanged = action !== (nextAction ?? '') || date !== (nextActionAt ? nextActionAt.split('T')[0] : '')

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(action, date || null)
    } finally {
      setSaving(false)
    }
  }

  const saveBtn: React.CSSProperties = {
    height: 40,
    padding: '0 20px',
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 8,
    border: 'none',
    background: hasChanged ? 'var(--btn-primary-bg, #F1F5F9)' : 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
    color: hasChanged ? 'var(--btn-primary-fg, #0a0f1a)' : 'var(--text-dim, #475569)',
    fontSize: 14,
    fontWeight: 500,
    cursor: hasChanged ? 'pointer' : 'not-allowed',
    opacity: saving ? 0.6 : 1,
    transition: 'background 200ms, color 200ms',
  }

  return (
    <div>
      <h4 style={sectionTitle}>Next Action</h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="What's the next step?"
          aria-label="Next action description"
          style={inputStyle}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Next action date"
            style={dateInput}
          />

          <button
            onClick={handleSave}
            disabled={!hasChanged || saving}
            style={saveBtn}
            aria-label="Save next action"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

export const NextActionPanel = memo(NextActionPanelInner)
