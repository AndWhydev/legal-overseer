'use client'

import { useState, useCallback } from 'react'
import { X, Plus, Save } from 'lucide-react'
import { useEmailCampaigns } from '@/hooks/use-email-campaigns'
import type { EmailTemplate } from '@/lib/leads/campaign-types'

interface EmailTemplateBuilderProps {
  open: boolean
  onClose: () => void
  onSaved?: (template: EmailTemplate) => void
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  zIndex: 50,
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.6)',
  zIndex: 49,
}

const contentStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: 800,
  zIndex: 50,
  background: '#0a0f1a',
  borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: '20px 24px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: '#F1F5F9',
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
  background: 'rgba(255, 255, 255, 0.04)',
  color: '#475569',
  cursor: 'pointer',
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
}

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const labelStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: '#94a3b8',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid rgba(255, 255, 255, 0.05)',
  background: 'rgba(13, 17, 23, 0.6)',
  color: '#F1F5F9',
  fontSize: 14,
  outline: 'none',
}

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 200,
  fontFamily: 'monospace',
  resize: 'vertical',
}

const tagsContainer: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const tagStyle: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: 16,
  background: 'rgba(255, 90, 31, 0.2)',
  border: '1px solid rgba(255, 90, 31, 0.3)',
  color: '#FF5A1F',
  fontSize: 12,
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const addTagBtn: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: 16,
  border: '1px dashed rgba(255, 255, 255, 0.2)',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const footerStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
}

const saveBtn: React.CSSProperties = {
  padding: '8px 20px',
  borderRadius: 8,
  border: 'none',
  background: '#FF5A1F',
  color: '#000',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

export function EmailTemplateBuilder({ open, onClose, onSaved }: EmailTemplateBuilderProps) {
  const { createTemplate } = useEmailCampaigns()
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [variables, setVariables] = useState<string[]>([])
  const [newVar, setNewVar] = useState('')
  const [category, setCategory] = useState('cold_outreach')
  const [isSaving, setIsSaving] = useState(false)

  const handleAddVariable = useCallback(() => {
    if (newVar && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(newVar) && !variables.includes(newVar)) {
      setVariables((prev) => [...prev, newVar])
      setNewVar('')
    }
  }, [newVar, variables])

  const handleRemoveVariable = useCallback((varName: string) => {
    setVariables((prev) => prev.filter((v) => v !== varName))
  }, [])

  const handleSave = useCallback(async () => {
    if (!name || !subject || !body) {
      alert('Name, subject, and body are required')
      return
    }

    setIsSaving(true)
    try {
      const template = await createTemplate(name, subject, body, variables, category)
      onSaved?.(template)
      onClose()
      // Reset form
      setName('')
      setSubject('')
      setBody('')
      setVariables([])
      setCategory('cold_outreach')
    } finally {
      setIsSaving(false)
    }
  }, [name, subject, body, variables, category, createTemplate, onSaved, onClose])

  if (!open) return null

  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      <div style={contentStyle}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>Create Email Template</h2>
          <button style={closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={bodyStyle}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Template Name</label>
            <input
              type="text"
              style={inputStyle}
              placeholder="e.g., Cold Outreach - Services"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Email Subject</label>
            <input
              type="text"
              style={inputStyle}
              placeholder="e.g., Quick thought on {{company}}'s website"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Email Body (HTML)</label>
            <textarea
              style={textareaStyle}
              placeholder="Enter HTML email body. Use {{variable}} for dynamic content."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Variables (for personalization)</label>
            <div style={tagsContainer}>
              {variables.map((v) => (
                <div key={v} style={tagStyle}>
                  {v}
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: '#FF5A1F',
                    }}
                    onClick={() => handleRemoveVariable(v)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <input
                type="text"
                style={{
                  ...inputStyle,
                  flex: 1,
                  minWidth: 150,
                }}
                placeholder="e.g., name, company, phone"
                value={newVar}
                onChange={(e) => setNewVar(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleAddVariable()
                }}
              />
              <button style={addTagBtn} onClick={handleAddVariable}>
                <Plus size={14} />
                Add
              </button>
            </div>
          </div>

          <div style={fieldStyle}>
            <label style={labelStyle}>Category</label>
            <select
              style={{
                ...inputStyle,
                appearance: 'none',
              }}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="cold_outreach">Cold Outreach</option>
              <option value="followup">Follow-up</option>
              <option value="demo_request">Demo Request</option>
              <option value="proposal">Proposal</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div style={footerStyle}>
          <button
            style={{
              ...saveBtn,
              background: '#475569',
              color: '#fff',
              opacity: isSaving ? 0.5 : 1,
            }}
            onClick={onClose}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button style={saveBtn} onClick={handleSave} disabled={isSaving}>
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>
    </>
  )
}
