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
      <h4 style={{ fontSize: 14, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)', margin: '0 0 12px' }}>
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
            padding: '12px 12px',
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bb-surface)',
            color: 'var(--text-primary)',
            fontSize: 14,
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
              borderRadius: 12,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bb-surface)',
              color: 'var(--text-secondary)',
              fontSize: 14,
              outline: 'none',
            }}
          />

          <button
            onClick={handleSave}
            disabled={!hasChanged || saving}
            style={{
              height: 40,
              padding: '0 20px',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 12,
              border: 'none',
              background: hasChanged ? 'var(--bb-cyan)' : 'var(--hover-bg)',
              color: hasChanged ? '#fff' : 'var(--text-dim)',
              fontSize: 14,
              fontWeight: 500,
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
