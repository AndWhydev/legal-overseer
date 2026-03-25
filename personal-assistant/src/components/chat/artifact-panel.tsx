'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Copy, Check, ExternalLink } from 'lucide-react'
import type { Artifact } from './use-artifacts'

interface ArtifactPanelProps {
  artifact: Artifact | null
  onClose: () => void
}

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('preview')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!artifact) {
      setViewMode('preview')
    }
  }, [artifact])

  const handleCopy = async () => {
    if (!artifact) return
    try {
      await navigator.clipboard.writeText(artifact.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy content:', error)
    }
  }

  const handleOpenInNewTab = () => {
    if (!artifact) return

    if (artifact.type === 'html') {
      const blob = new Blob([artifact.content], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } else {
      // For code, open in a new tab with syntax highlighting via a data URL
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${artifact.title}</title>
          <style>
            body {
              background: #0a0f1a;
              color: #f1f5f9;
              font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
              margin: 0;
              padding: 16px;
            }
            pre {
              margin: 0;
              overflow: auto;
              padding: 16px;
              background: rgba(13, 17, 23, 0.8);
              border: 1px solid rgba(255, 255, 255, 0.06);
              border-radius: 8px;
              font-size: 13px;
              line-height: 20px;
            }
            code {
              font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
            }
          </style>
        </head>
        <body>
          <pre><code>${escapeHtml(artifact.content)}</code></pre>
        </body>
        </html>
      `
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 100)
    }
  }

  const isHtml = artifact?.type === 'html'
  const showModeToggle = isHtml

  return (
    <AnimatePresence>
      {artifact && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            height: '100vh',
            width: 'clamp(400px, 50vw, 700px)',
            backgroundColor: 'var(--bg-primary, #0a0f1a)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 40,
            boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              minHeight: '52px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary, #F1F5F9)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {artifact.title}
            </h2>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: '12px' }}>
              {showModeToggle && (
                <div
                  style={{
                    display: 'inline-flex',
                    gap: '0',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '4px',
                    padding: '2px',
                  }}
                >
                  {(['preview', 'code'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        backgroundColor:
                          viewMode === mode ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        color:
                          viewMode === mode
                            ? 'var(--text-primary, #F1F5F9)'
                            : 'var(--text-muted, rgba(255, 255, 255, 0.4))',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                        textTransform: 'capitalize',
                      }}
                      onMouseEnter={e => {
                        if (viewMode !== mode) {
                          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                            'rgba(255, 255, 255, 0.08)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (viewMode !== mode) {
                          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                            'transparent'
                        }
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={handleCopy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  padding: '4px 8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: copied ? 'var(--bb-green, #22C55E)' : 'var(--text-muted, rgba(255, 255, 255, 0.4))',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  if (!copied) {
                    ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      'rgba(255, 255, 255, 0.08)'
                    ;(e.currentTarget as HTMLButtonElement).style.color =
                      'var(--text-primary, #F1F5F9)'
                  }
                }}
                onMouseLeave={e => {
                  if (!copied) {
                    ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                      'rgba(255, 255, 255, 0.05)'
                    ;(e.currentTarget as HTMLButtonElement).style.color =
                      'var(--text-muted, rgba(255, 255, 255, 0.4))'
                  }
                }}
                title={copied ? 'Copied!' : 'Copy content'}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
              </button>

              <button
                onClick={handleOpenInNewTab}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  padding: '4px 8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-muted, rgba(255, 255, 255, 0.4))',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    'rgba(255, 255, 255, 0.08)'
                  ;(e.currentTarget as HTMLButtonElement).style.color =
                    'var(--text-primary, #F1F5F9)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    'rgba(255, 255, 255, 0.05)'
                  ;(e.currentTarget as HTMLButtonElement).style.color =
                    'var(--text-muted, rgba(255, 255, 255, 0.4))'
                }}
                title="Open in new tab"
              >
                <ExternalLink size={12} />
              </button>

              <button
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  padding: 0,
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-muted, rgba(255, 255, 255, 0.4))',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    'rgba(255, 255, 255, 0.08)'
                  ;(e.currentTarget as HTMLButtonElement).style.color =
                    'var(--text-primary, #F1F5F9)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLButtonElement).style.backgroundColor =
                    'rgba(255, 255, 255, 0.05)'
                  ;(e.currentTarget as HTMLButtonElement).style.color =
                    'var(--text-muted, rgba(255, 255, 255, 0.4))'
                }}
                aria-label="Close artifact panel"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {isHtml && viewMode === 'preview' ? (
              // HTML Preview
              <iframe
                srcDoc={artifact.content}
                style={{
                  flex: 1,
                  border: 'none',
                  backgroundColor: '#ffffff',
                }}
                title={artifact.title}
              />
            ) : (
              // Code view
              <div
                style={{
                  flex: 1,
                  padding: '14px',
                  fontSize: '13px',
                  lineHeight: '20px',
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
                  color: 'var(--text-primary, #F1F5F9)',
                  overflow: 'auto',
                  backgroundColor: 'rgba(13, 17, 23, 0.4)',
                }}
              >
                <pre
                  style={{
                    margin: 0,
                    padding: 0,
                    backgroundColor: 'transparent',
                    fontSize: 'inherit',
                    lineHeight: 'inherit',
                    fontFamily: 'inherit',
                    color: 'inherit',
                  }}
                >
                  <code>{artifact.content}</code>
                </pre>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, m => map[m])
}
