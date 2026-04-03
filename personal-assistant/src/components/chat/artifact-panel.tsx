'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  IconX,
  IconCopy,
  IconCheck,
  IconExternalLink,
  IconCode,
  IconEye,
  IconShare,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import type { Artifact } from './use-artifacts'

interface ArtifactPanelProps {
  artifact: Artifact | null
  onClose: () => void
}

type ViewMode = 'preview' | 'code'

export function ArtifactPanel({ artifact, onClose }: ArtifactPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('preview')
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Reset view mode when artifact changes or panel closes
  useEffect(() => {
    if (artifact) {
      setViewMode(artifact.type === 'html' ? 'preview' : 'code')
    }
  }, [artifact?.id, artifact?.type])

  // Reset copied states when artifact changes
  useEffect(() => {
    setCopied(false)
    setLinkCopied(false)
  }, [artifact?.id])

  // Close on Escape key
  useEffect(() => {
    if (!artifact) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [artifact, onClose])

  const handleCopy = useCallback(async () => {
    if (!artifact) return
    try {
      await navigator.clipboard.writeText(artifact.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy content:', error)
    }
  }, [artifact])

  const handleCopyLink = useCallback(async () => {
    if (!artifact?.projectId) return
    try {
      const url = `${window.location.origin}/api/builder/preview/${artifact.projectId}`
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy link:', error)
    }
  }, [artifact])

  const handleOpenInNewTab = useCallback(() => {
    if (!artifact) return

    // If we have a projectId, open the shareable preview URL
    if (artifact.projectId) {
      window.open(`/api/builder/preview/${artifact.projectId}`, '_blank')
      return
    }

    if (artifact.type === 'html') {
      const blob = new Blob([artifact.content], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } else {
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(artifact.title)}</title>
  <style>
    body { background: #0a0f1a; color: #f1f5f9; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; margin: 0; padding: 24px; }
    pre { margin: 0; overflow: auto; padding: 20px; background: rgba(13, 17, 23, 0.8); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body><pre><code>${escapeHtml(artifact.content)}</code></pre></body>
</html>`
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 100)
    }
  }, [artifact])

  const isHtml = artifact?.type === 'html'
  const showModeToggle = isHtml

  return (
    <AnimatePresence mode="wait">
      {artifact && (
        <>
          {/* Mobile backdrop overlay */}
          <motion.div
            key="artifact-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Panel */}
          <motion.div
            key="artifact-panel"
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 400,
              damping: 35,
              mass: 0.8,
            }}
            className={[
              // Base
              'fixed top-0 right-0 z-50 flex h-dvh flex-col',
              'bg-background border-l border-border',
              'shadow-2xl shadow-black/20',
              // Desktop: side panel that pushes content
              'w-full md:w-[clamp(420px,50vw,720px)]',
            ].join(' ')}
          >
            {/* ── Toolbar ── */}
            <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 min-h-[48px]">
              {/* Title */}
              <div className="flex-1 min-w-0 mr-2">
                <h2 className="truncate text-sm font-medium text-foreground leading-tight">
                  {artifact.title}
                </h2>
                {artifact.type !== 'html' && artifact.language && (
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    {artifact.language}
                  </span>
                )}
              </div>

              {/* View mode toggle */}
              {showModeToggle && (
                <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode('preview')}
                    className={[
                      'inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-xs font-medium transition-colors',
                      viewMode === 'preview'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                    title="Preview"
                  >
                    <IconEye size={13} />
                    <span className="hidden sm:inline">Preview</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('code')}
                    className={[
                      'inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-xs font-medium transition-colors',
                      viewMode === 'code'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                    title="View source"
                  >
                    <IconCode size={13} />
                    <span className="hidden sm:inline">Code</span>
                  </button>
                </div>
              )}

              {/* Divider */}
              <div className="h-5 w-px bg-border mx-0.5" />

              {/* Action buttons */}
              <div className="flex items-center gap-0.5">
                {/* Share link (only if projectId exists) */}
                {artifact.projectId && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleCopyLink}
                    className={linkCopied ? 'text-emerald-400' : 'text-muted-foreground'}
                    title={linkCopied ? 'Link copied!' : 'Copy shareable link'}
                  >
                    {linkCopied ? <IconCheck size={14} /> : <IconShare size={14} />}
                  </Button>
                )}

                {/* Copy content */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCopy}
                  className={copied ? 'text-emerald-400' : 'text-muted-foreground'}
                  title={copied ? 'Copied!' : 'Copy source'}
                >
                  {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </Button>

                {/* Open in new tab */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleOpenInNewTab}
                  className="text-muted-foreground"
                  title="Open in new tab"
                >
                  <IconExternalLink size={14} />
                </Button>

                {/* Close */}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  className="text-muted-foreground ml-0.5"
                  aria-label="Close artifact panel"
                >
                  <IconX size={16} />
                </Button>
              </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 min-h-0 relative">
              {isHtml && viewMode === 'preview' ? (
                <iframe
                  ref={iframeRef}
                  sandbox="allow-scripts allow-same-origin"
                  srcDoc={artifact.content}
                  className="absolute inset-0 h-full w-full border-none bg-white"
                  title={artifact.title}
                />
              ) : (
                <div className="h-full overflow-auto bg-muted/20">
                  <div className="p-4">
                    <pre className="m-0 text-[13px] leading-relaxed font-mono text-foreground whitespace-pre-wrap break-words">
                      <code>{artifact.content}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* ── Bottom status bar ── */}
            <div className="flex items-center justify-between border-t border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
              <span>
                {artifact.type === 'html' ? 'HTML' : artifact.language?.toUpperCase() || artifact.type.toUpperCase()}
                {' · '}
                {formatBytes(new Blob([artifact.content]).size)}
              </span>
              {artifact.projectId && (
                <span className="truncate ml-2 opacity-60">
                  Project: {artifact.projectId.slice(0, 8)}…
                </span>
              )}
            </div>
          </motion.div>
        </>
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
