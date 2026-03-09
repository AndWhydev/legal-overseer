'use client'

import { useState } from 'react'

interface NextActionPanelProps {
  nextAction: string | null
  nextActionAt: string | null
  onSave: (action: string, date: string | null) => void
}

export function NextActionPanel({ nextAction, nextActionAt, onSave }: NextActionPanelProps) {
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

  return (
    <div>
      <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', margin: '0 0 12px' }}>
        Next Action
      </h4>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="What's the next step?"
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bb-surface)',
            color: 'var(--text-primary)',
            fontSize: 13,
            outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bb-surface)',
              color: 'var(--text-secondary)',
              fontSize: 12,
              outline: 'none',
            }}
          />

          <button
            onClick={handleSave}
            disabled={!hasChanged || saving}
            style={{
              padding: '8px 16px',
              borderRadius: 10,
              border: 'none',
              background: hasChanged ? 'var(--bb-cyan)' : 'var(--hover-bg)',
              color: hasChanged ? '#fff' : 'var(--text-dim)',
              fontSize: 12,
              fontWeight: 600,
              cursor: hasChanged ? 'pointer' : 'not-allowed',
              opacity: saving ? 0.6 : 1,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
