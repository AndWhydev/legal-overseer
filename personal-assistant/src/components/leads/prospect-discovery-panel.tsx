'use client'

import React, { useState, useCallback, useEffect, memo } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import { useProspectDiscovery } from '@/hooks/use-prospect-discovery'
import { ProspectCard } from './prospect-card'

interface ProspectDiscoveryPanelProps {
  open: boolean
  onClose: () => void
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const backdropStyle: React.CSSProperties = {
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
  maxWidth: 560,
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

const closeBtnStyle: React.CSSProperties = {
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
  transition: 'background 200ms',
}

const bodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '20px 24px',
}

const fieldLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-dim, #475569)',
  display: 'block',
  marginBottom: 8,
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

const limitInput: React.CSSProperties = {
  ...inputStyle,
  width: 80,
}

const progressContainer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  padding: '40px 0',
}

const progressTrack: React.CSSProperties = {
  width: '100%',
  maxWidth: 300,
  height: 4,
  borderRadius: 8,
  background: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))',
  overflow: 'hidden',
}

const retryBtn: React.CSSProperties = {
  height: 40,
  padding: '0 20px',
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 8,
  border: '1px solid var(--border-active, rgba(255, 255, 255, 0.1))',
  background: 'transparent',
  color: 'var(--text-secondary, #94A3B8)',
  fontSize: 14,
  cursor: 'pointer',
}

const newSearchBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  background: 'transparent',
  color: 'var(--text-dim, #475569)',
  fontSize: 14,
  cursor: 'pointer',
}

// ─── Component ──────────────────────────────────────────────────────────────
function ProspectDiscoveryPanelInner({ open, onClose }: ProspectDiscoveryPanelProps) {
  const { job, isSearching, startDiscovery, importProspect, reset } = useProspectDiscovery()
  const [businessType, setBusinessType] = useState('')
  const [location, setLocation] = useState('')
  const [limit, setLimit] = useState(20)

  const handleEsc = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleEsc)
      return () => document.removeEventListener('keydown', handleEsc)
    }
  }, [open, handleEsc])

  if (!open) return null

  function handleSearch() {
    if (!businessType.trim() || !location.trim()) return
    startDiscovery(businessType.trim(), location.trim(), limit)
  }

  function handleClose() {
    reset()
    onClose()
  }

  const canSearch = businessType.trim() && location.trim()

  const searchBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    padding: '0 24px',
    borderRadius: 8,
    border: 'none',
    background: canSearch ? 'var(--btn-primary-bg, #F1F5F9)' : 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
    color: canSearch ? 'var(--btn-primary-fg, #0a0f1a)' : 'var(--text-dim, #475569)',
    fontSize: 14,
    fontWeight: 500,
    cursor: canSearch ? 'pointer' : 'not-allowed',
    marginTop: 8,
    transition: 'all 200ms',
  }

  return (
    <>
      <div onClick={handleClose} style={backdropStyle} aria-hidden="true" />

      <aside style={panel} role="dialog" aria-label="Discover prospects" aria-modal="true">
        <div style={headerStyle}>
          <h2 style={panelTitle}>Discover Prospects</h2>
          <button
            onClick={handleClose}
            style={closeBtnStyle}
            aria-label="Close discovery panel"
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg-strong, rgba(255, 255, 255, 0.08))' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--hover-bg, rgba(255, 255, 255, 0.04))' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={bodyStyle}>
          {/* Search Form */}
          {!job && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={fieldLabel}>Business Type</label>
                <input
                  type="text"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  placeholder="plumber, accountant, buyer's agent"
                  style={inputStyle}
                  aria-label="Business type to search"
                />
              </div>

              <div>
                <label style={fieldLabel}>Location</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Brisbane, QLD"
                  style={inputStyle}
                  aria-label="Location to search"
                />
              </div>

              <div>
                <label style={fieldLabel}>Limit</label>
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Math.min(50, Math.max(1, Number(e.target.value))))}
                  min={1}
                  max={50}
                  style={limitInput}
                  aria-label="Maximum number of results"
                />
              </div>

              <button
                onClick={handleSearch}
                disabled={!canSearch}
                style={searchBtn}
                onMouseEnter={e => { if (canSearch) { e.currentTarget.style.background = '#E2E8F0'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                onMouseLeave={e => { if (canSearch) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.transform = 'translateY(0)' } }}
              >
                <Search size={16} />
                Search
              </button>
            </div>
          )}

          {/* Progress State */}
          {job && job.status !== 'complete' && job.status !== 'error' && (
            <div style={progressContainer}>
              <Loader2 size={24} style={{ color: 'var(--text-primary, #F1F5F9)', animation: 'spin 1s linear infinite' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)', marginBottom: 4 }}>
                  {job.status === 'searching' ? 'Searching...' : job.status === 'enriching' ? 'Enriching...' : 'Scoring...'}
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>{job.message}</div>
              </div>
              <div style={progressTrack}>
                <div style={{
                  width: `${job.progress}%`,
                  height: '100%',
                  borderRadius: 8,
                  background: 'var(--btn-primary-bg, #F1F5F9)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error State */}
          {job?.status === 'error' && (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: '#ef4444', marginBottom: 12 }}>{job.error}</div>
              <button onClick={reset} style={retryBtn}>
                Try Again
              </button>
            </div>
          )}

          {/* Results */}
          {job?.status === 'complete' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary, #F1F5F9)' }}>
                  {job.results.length} prospects found
                </span>
                <button onClick={reset} style={newSearchBtn}>
                  New Search
                </button>
              </div>

              {job.results.map((prospect, i) => (
                <ProspectCard key={`${prospect.domain ?? i}`} prospect={prospect} onImport={importProspect} />
              ))}
            </div>
          )}
        </div>
      </aside>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (max-width: 640px) {
          aside[role="dialog"] { max-width: 100% !important; }
        }
      `}</style>
    </>
  )
}

export const ProspectDiscoveryPanel = memo(ProspectDiscoveryPanelInner)
