'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Copy, Check, Loader2, Trash2, Plus, Eye, EyeOff } from 'lucide-react'
import { logger } from '@/lib/core/logger'
import { S, C } from '@/lib/styles/design-tokens'

interface ApiKey {
  id: string
  name: string
  displayKey: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
  isRevoked: boolean
}

interface NewKeyResponse {
  id: string
  name: string
  key: string
  displayKey: string
  scopes: string[]
  createdAt: string
  warning: string
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
  border: `1px solid ${C.borderHover}`,
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  fontFamily: 'inherit',
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
  border: `1px solid ${C.borderHover}`,
}

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: C.statusErrorBg,
  color: '#ef4444',
  border: `1px solid ${C.statusError}`,
  padding: '8px 12px',
  fontSize: 14,
}

const listRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px',
  borderRadius: 12,
  background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.03))',
  marginBottom: 12,
}

export function ApiKeyManagement() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewKey, setShowNewKey] = useState(false)
  const [newKeyForm, setNewKeyForm] = useState({ name: '' })
  const [newKeyDisplay, setNewKeyDisplay] = useState<NewKeyResponse | null>(null)
  const [copyState, setCopyState] = useState(false)
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null)

  // Fetch keys on mount
  useEffect(() => {
    const fetchKeys = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/keys')
        const data = await res.json()
        setKeys(data.keys || [])
      } catch (err) {
        logger.error('Failed to fetch API keys:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchKeys()
  }, [])

  const handleGenerateKey = async () => {
    if (!newKeyForm.name.trim()) {
      logger.warn('Key name is required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyForm.name }),
      })

      if (!res.ok) {
        const error = await res.json()
        logger.error('Failed to create key:', error)
        return
      }

      const data: NewKeyResponse = await res.json()
      setNewKeyDisplay(data)
      setKeys([
        {
          id: data.id,
          name: data.name,
          displayKey: data.displayKey,
          scopes: data.scopes,
          lastUsedAt: null,
          createdAt: data.createdAt,
          isRevoked: false,
        },
        ...keys,
      ])
      setNewKeyForm({ name: '' })
      setShowNewKey(false)
    } catch (err) {
      logger.error('Failed to generate key:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRevokeKey = async (keyId: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId }),
      })

      if (!res.ok) {
        logger.error('Failed to revoke key')
        return
      }

      setKeys(keys.map((k) => (k.id === keyId ? { ...k, isRevoked: true } : k)))
      setRevokeConfirm(null)
    } catch (err) {
      logger.error('Failed to revoke key:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopyState(true)
    setTimeout(() => setCopyState(false), 1500)
  }

  return (
    <div style={sectionWrapper}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 24 }}>
        <div>
          <h2 style={sectionTitle}>API Keys</h2>
          <p style={sectionDesc}>Manage API keys for partner integrations and automations</p>
        </div>
        {!showNewKey && (
          <button
            onClick={() => setShowNewKey(true)}
            style={{ ...buttonStyle, marginBottom: 0 }}
          >
            <Plus size={16} />
            Generate Key
          </button>
        )}
      </div>

      {showNewKey && (
        <div style={{ ...glassCard, padding: 20, marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 16 }}>
            Generate New API Key
          </h3>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
              Key Name
            </label>
            <input
              type="text"
              placeholder="e.g., Production API Key"
              value={newKeyForm.name}
              onChange={(e) => setNewKeyForm({ name: e.target.value })}
              style={inputStyle}
            />
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
              Use a descriptive name to identify where this key is used
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={handleGenerateKey}
              disabled={loading || !newKeyForm.name.trim()}
              style={{
                ...buttonStyle,
                opacity: loading || !newKeyForm.name.trim() ? 0.5 : 1,
                cursor: loading || !newKeyForm.name.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating...
                </>
              ) : (
                'Create Key'
              )}
            </button>
            <button
              onClick={() => setShowNewKey(false)}
              style={secondaryButtonStyle}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {newKeyDisplay && (
        <div
          style={{
            ...glassCard,
            padding: 20,
            marginBottom: 24,
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              Your API Key
            </h3>
            <button
              onClick={() => setNewKeyDisplay(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Dismiss
            </button>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
            {newKeyDisplay.warning}
          </p>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 8,
              background: 'var(--bb-surface, rgba(10, 14, 23, 0.5))',
              border: `1px solid ${C.borderSubtle}`,
              marginBottom: 12,
              fontFamily: 'monospace',
              fontSize: 14,
              wordBreak: 'break-all',
            }}
          >
            <span style={{ flex: 1, color: 'var(--text-primary)' }}>{newKeyDisplay.key}</span>
            <button
              onClick={() => handleCopyKey(newKeyDisplay.key)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px 8px',
                flexShrink: 0,
              }}
              title="Copy to clipboard"
            >
              {copyState ? (
                <Check size={14} style={{ color: '#10b981' }} />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 12, marginTop: 24 }}>
        Active Keys
      </h3>

      {keys.length === 0 ? (
        <div
          style={{
            ...glassCard,
            textAlign: 'center',
            padding: 32,
          }}
        >
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No API keys yet. Generate one to get started.</p>
        </div>
      ) : (
        <div>
          {keys.map((key) => (
            <div key={key.id} style={listRow}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {key.name}
                </p>
                <div style={{ display: 'flex', gap: 16, fontSize: 14, color: 'var(--text-secondary)' }}>
                  <span>Key: {key.displayKey}</span>
                  {key.lastUsedAt && <span>Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                  <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                  {key.isRevoked && (
                    <span style={{ color: '#ef4444' }}>Revoked</span>
                  )}
                </div>
              </div>
              {!key.isRevoked && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {revokeConfirm === key.id ? (
                    <>
                      <button
                        onClick={() => handleRevokeKey(key.id)}
                        disabled={loading}
                        style={{
                          ...dangerButtonStyle,
                          opacity: loading ? 0.5 : 1,
                          cursor: loading ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {loading ? 'Revoking...' : 'Confirm Revoke'}
                      </button>
                      <button
                        onClick={() => setRevokeConfirm(null)}
                        style={secondaryButtonStyle}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setRevokeConfirm(key.id)}
                      style={dangerButtonStyle}
                    >
                      <Trash2 size={12} />
                      Revoke
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
