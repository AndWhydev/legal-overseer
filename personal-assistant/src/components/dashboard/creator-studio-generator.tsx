'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Copy, Check, Loader2, Trash2, Plus } from 'lucide-react'
import { logger } from '@/lib/core/logger'

interface Template {
  id: string
  label: string
  description: string
  icon: string
}

interface GeneratedItem {
  id: string
  template_type: string
  inputs: {
    product_name: string
    target_audience: string
    tone: string
    length: string
  }
  output: string
  created_at: string
}

const sectionWrapper: React.CSSProperties = {
  padding: '24px',
  overflow: 'auto',
  height: '100%',
}

const sectionTitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  marginBottom: 8,
}

const sectionDesc: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  marginBottom: 16,
}

const glassCard: React.CSSProperties = {
  padding: '16px',
  borderRadius: 12,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  WebkitBackdropFilter: 'var(--glass-blur, blur(20px) saturate(1.2))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
  marginBottom: 12,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: 12,
  background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  fontFamily: 'inherit',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const buttonStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderRadius: 12,
  background: 'var(--btn-primary-bg, #F1F5F9)',
  border: 'none',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 200ms',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
}

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  color: 'var(--text-primary, #F1F5F9)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
}

const historyItem: React.CSSProperties = {
  padding: '12px',
  borderRadius: 12,
  background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  marginBottom: 12,
}

export function CreatorStudioGenerator() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [history, setHistory] = useState<GeneratedItem[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('ad_scripts')
  const [loading, setLoading] = useState(false)
  const [copyState, setCopyState] = useState<Record<string, boolean>>({})

  const [formInputs, setFormInputs] = useState({
    product_name: '',
    target_audience: '',
    tone: 'professional' as const,
    length: 'medium' as const,
  })

  // Fetch templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch('/api/creator-studio/templates')
        const data = await res.json()
        setTemplates(data.templates || [])
      } catch (err) {
        logger.error('Failed to fetch templates:', err)
      }
    }
    fetchTemplates()
  }, [])

  // Fetch history
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/creator-studio/history?template_type=${selectedTemplate}&limit=20`)
      const data = await res.json()
      setHistory(data.items || [])
    } catch (err) {
      logger.error('Failed to fetch history:', err)
    }
  }, [selectedTemplate])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleGenerate = async () => {
    if (!formInputs.product_name || !formInputs.target_audience) {
      logger.warn('Missing required fields')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/creator-studio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_type: selectedTemplate,
          inputs: formInputs,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        logger.error('Generation failed:', error)
        return
      }

      const data = await res.json()
      setHistory([data, ...history.slice(0, 19)])

      // Reset form
      setFormInputs({
        product_name: '',
        target_audience: '',
        tone: 'professional',
        length: 'medium',
      })
    } catch (err) {
      logger.error('Generation request failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopyState({ ...copyState, [id]: true })
    setTimeout(() => setCopyState({ ...copyState, [id]: false }), 1500)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, height: '100%' }}>
      {/* Left column: Generator */}
      <div style={{ ...sectionWrapper, overflowY: 'auto' }}>
        <h2 style={sectionTitle}>Generate Content</h2>
        <p style={sectionDesc}>Create ad scripts, social posts, emails, and more using AI</p>

        <div>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            Template Type
          </label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            style={selectStyle}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {templates.find((t) => t.id === selectedTemplate)?.description && (
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
              {templates.find((t) => t.id === selectedTemplate)?.description}
            </p>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            Product Name
          </label>
          <input
            type="text"
            placeholder="e.g., SaaS Dashboard Pro"
            value={formInputs.product_name}
            onChange={(e) => setFormInputs({ ...formInputs, product_name: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
            Target Audience
          </label>
          <input
            type="text"
            placeholder="e.g., Small business owners"
            value={formInputs.target_audience}
            onChange={(e) => setFormInputs({ ...formInputs, target_audience: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              Tone
            </label>
            <select
              value={formInputs.tone}
              onChange={(e) => setFormInputs({ ...formInputs, tone: e.target.value as any })}
              style={selectStyle}
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="playful">Playful</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              Length
            </label>
            <select
              value={formInputs.length}
              onChange={(e) => setFormInputs({ ...formInputs, length: e.target.value as any })}
              style={selectStyle}
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || !formInputs.product_name || !formInputs.target_audience}
          style={{
            ...buttonStyle,
            marginTop: 24,
            width: '100%',
            justifyContent: 'center',
            opacity: loading || !formInputs.product_name || !formInputs.target_audience ? 0.5 : 1,
            cursor: loading || !formInputs.product_name || !formInputs.target_audience ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Plus size={16} />
              Generate Content
            </>
          )}
        </button>
      </div>

      {/* Right column: History */}
      <div style={{ ...sectionWrapper, overflowY: 'auto', borderLeft: '1px solid rgba(255, 255, 255, 0.05)' }}>
        <h2 style={sectionTitle}>Recent Generations</h2>
        <p style={sectionDesc}>Generated content appears here</p>

        {history.length === 0 ? (
          <div
            style={{
              ...glassCard,
              textAlign: 'center',
              padding: 32,
              marginTop: 24,
            }}
          >
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Nothing generated yet.</p>
          </div>
        ) : (
          <div>
            {history.map((item) => (
              <div key={item.id} style={historyItem}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                  <div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      {item.inputs.product_name}
                    </p>
                    <p style={{ fontSize: 14, color: 'var(--text-tertiary, #64748B)' }}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(item.output, item.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      fontSize: 14,
                    }}
                    title="Copy to clipboard"
                  >
                    {copyState[item.id] ? (
                      <Check size={14} style={{ color: '#10b981' }} />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-primary)', maxHeight: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.output}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
