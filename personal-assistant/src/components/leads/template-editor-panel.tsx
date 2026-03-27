'use client'

import React, { useState, useCallback, memo } from 'react'
import { X, Plus, Variable } from 'lucide-react'
import { GlassDropdown } from '@/components/ui/glass-dropdown'

interface TemplateEditorPanelProps {
  open: boolean
  onClose: () => void
  onSave: (data: {
    name: string
    subject: string
    body: string
    variables: string[]
    category: string
  }) => void
  initial?: {
    name?: string
    subject?: string
    body?: string
    variables?: string[]
    category?: string
  }
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 52,
  backdropFilter: 'blur(2px)',
}

const panel: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: 600,
  zIndex: 53,
  background: 'var(--bg-primary, #0a0f1a)',
  borderLeft: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  animation: 'slideInRight 0.25s ease-out',
}

const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const panelTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  margin: 0,
}

const closeBtn: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  border: 'none',
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  color: 'var(--text-dim, #475569)',
  cursor: 'pointer',
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const fieldLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-dim, #475569)',
  display: 'block',
  marginBottom: 6,
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
  fontFamily: 'inherit',
  transition: 'border-color 200ms, box-shadow 200ms',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: 240,
  padding: '12px',
  resize: 'vertical' as const,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  fontSize: 13,
  lineHeight: 1.6,
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none' as const,
}

const variableChip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  borderRadius: 8,
  background: 'rgba(6, 182, 212, 0.1)',
  color: '#06b6d4',
  fontSize: 13,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  cursor: 'pointer',
  border: 'none',
  transition: 'background 200ms',
}

const saveBtn: React.CSSProperties = {
  height: 40,
  padding: '0 24px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--btn-primary-bg, #F1F5F9)',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
}

const AVAILABLE_VARIABLES = [
  { key: 'firstName', label: 'First Name' },
  { key: 'name', label: 'Full Name' },
  { key: 'company', label: 'Company' },
  { key: 'domain', label: 'Domain' },
  { key: 'services', label: 'Services' },
  { key: 'outreachAngle', label: 'Outreach Angle' },
]

const CATEGORIES = [
  { value: 'cold_outreach', label: 'Cold Outreach' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'demo_request', label: 'Demo Request' },
  { value: 'nurture', label: 'Nurture' },
]

// ─── Component ──────────────────────────────────────────────────────────────
function TemplateEditorPanelInner({ open, onClose, onSave, initial }: TemplateEditorPanelProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [subject, setSubject] = useState(initial?.subject ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'cold_outreach')

  const handleInsertVariable = useCallback((varKey: string) => {
    setBody(prev => prev + `{{${varKey}}}`)
  }, [])

  const handleSave = useCallback(() => {
    if (!name.trim() || !subject.trim() || !body.trim()) return

    // Extract used variables from body and subject
    const allText = subject + body
    const usedVars = AVAILABLE_VARIABLES
      .filter(v => allText.includes(`{{${v.key}}}`))
      .map(v => v.key)

    onSave({
      name: name.trim(),
      subject: subject.trim(),
      body: body.trim(),
      variables: usedVars,
      category,
    })
  }, [name, subject, body, category, onSave])

  if (!open) return null

  const canSave = name.trim() && subject.trim() && body.trim()

  return (
    <>
      <div onClick={onClose} style={backdrop} aria-hidden="true" />

      <aside style={panel} role="dialog" aria-label="Template Editor" aria-modal="true">
        <div style={headerStyle}>
          <h2 style={panelTitle}>Email Template</h2>
          <button onClick={onClose} style={closeBtn} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div style={bodyStyle}>
          <div>
            <label style={fieldLabel}>Template Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Cold Outreach - SEO Audit"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={fieldLabel}>Category</label>
            <GlassDropdown
              options={CATEGORIES.map(c => ({ value: c.value, label: c.label }))}
              value={category}
              onChange={v => setCategory(v)}
            />
          </div>

          <div>
            <label style={fieldLabel}>Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Quick question about {{company}}"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={fieldLabel}>Insert Variables</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {AVAILABLE_VARIABLES.map(v => (
                <button
                  key={v.key}
                  onClick={() => handleInsertVariable(v.key)}
                  style={variableChip}
                  title={`Insert {{${v.key}}}`}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(6, 182, 212, 0.2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(6, 182, 212, 0.1)' }}
                >
                  <Variable size={12} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={fieldLabel}>Email Body (HTML)</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`Hi {{firstName}},\n\nI noticed {{company}} doesn't have...\n\nWould you be open to a quick chat?\n\nBest regards`}
              style={textareaStyle}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8 }}>
            <button
              onClick={onClose}
              style={{
                ...saveBtn,
                background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
                color: 'var(--text-secondary, #94A3B8)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                ...saveBtn,
                opacity: canSave ? 1 : 0.4,
                cursor: canSave ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={e => { if (canSave) e.currentTarget.style.background = '#E2E8F0' }}
              onMouseLeave={e => { if (canSave) e.currentTarget.style.background = '#F1F5F9' }}
            >
              <Plus size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Save Template
            </button>
          </div>
        </div>
      </aside>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  )
}

export const TemplateEditorPanel = memo(TemplateEditorPanelInner)
