'use client'

import { useState, useCallback, useEffect } from 'react'
import { X, Search, Loader2 } from 'lucide-react'
import type { DiscoveryJob } from '@/lib/leads/types'
import { useProspectDiscovery } from '@/hooks/use-prospect-discovery'
import { ProspectCard } from './prospect-card'

interface ProspectDiscoveryPanelProps {
  open: boolean
  onClose: () => void
}

export function ProspectDiscoveryPanel({ open, onClose }: ProspectDiscoveryPanelProps) {
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

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-overlay)',
          zIndex: 52,
          backdropFilter: 'blur(2px)',
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: 560,
        zIndex: 53,
        background: 'var(--bg-primary)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'slideInRight 0.25s ease-out',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Discover Prospects
          </h2>
          <button
            onClick={handleClose}
            style={{
              padding: 6,
              borderRadius: 8,
              border: 'none',
              background: 'var(--hover-bg)',
              color: 'var(--text-dim)',
              cursor: 'pointer',
            }}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {/* Search Form */}
          {!job && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                  Business Type
                </label>
                <input
                  type="text"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  placeholder="plumber, accountant, buyer's agent"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bb-surface)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                  Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Brisbane, QLD"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bb-surface)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', display: 'block', marginBottom: 6 }}>
                  Limit
                </label>
                <input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Math.min(50, Math.max(1, Number(e.target.value))))}
                  min={1}
                  max={50}
                  style={{
                    width: 80,
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bb-surface)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </div>

              <button
                onClick={handleSearch}
                disabled={!businessType.trim() || !location.trim()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 24px',
                  borderRadius: 12,
                  border: 'none',
                  background: businessType.trim() && location.trim()
                    ? 'linear-gradient(135deg, var(--bb-cyan) 0%, var(--bb-blue) 100%)'
                    : 'var(--hover-bg)',
                  color: businessType.trim() && location.trim() ? '#fff' : 'var(--text-dim)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: businessType.trim() && location.trim() ? 'pointer' : 'not-allowed',
                  marginTop: 8,
                }}
              >
                <Search style={{ width: 16, height: 16 }} />
                Search
              </button>
            </div>
          )}

          {/* Progress State */}
          {job && job.status !== 'complete' && job.status !== 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 0' }}>
              <Loader2 style={{ width: 32, height: 32, color: 'var(--bb-cyan)', animation: 'spin 1s linear infinite' }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {job.status === 'searching' ? 'Searching...' : job.status === 'enriching' ? 'Enriching...' : 'Scoring...'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{job.message}</div>
              </div>
              <div style={{
                width: '100%',
                maxWidth: 300,
                height: 4,
                borderRadius: 2,
                background: 'var(--hover-bg)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${job.progress}%`,
                  height: '100%',
                  borderRadius: 2,
                  background: 'var(--bb-cyan)',
                  transition: 'width 0.3s ease',
                }} />
              </div>

              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error State */}
          {job?.status === 'error' && (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--bb-red)', marginBottom: 12 }}>{job.error}</div>
              <button
                onClick={reset}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border-active)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Results */}
          {job?.status === 'complete' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {job.results.length} prospects found
                </span>
                <button
                  onClick={reset}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    color: 'var(--text-dim)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  New Search
                </button>
              </div>

              {job.results.map((prospect, i) => (
                <ProspectCard key={`${prospect.domain ?? i}`} prospect={prospect} onImport={importProspect} />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @media (max-width: 640px) {
          [style*="maxWidth: 560"] { max-width: 100% !important; }
        }
      `}</style>
    </>
  )
}
