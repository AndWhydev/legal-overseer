'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { IconX, IconCopy, IconCheck, IconExternalLink } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${artifact.title}</title>
          <style>
            body { background: #0a0f1a; color: #f1f5f9; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; margin: 0; padding: 16px; }
            pre { margin: 0; overflow: auto; padding: 16px; background: rgba(13, 17, 23, 0.8); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 8px; font-size: 13px; line-height: 20px; }
            code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
          </style>
        </head>
        <body><pre><code>${escapeHtml(artifact.content)}</code></pre></body>
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
          className="fixed top-0 right-0 h-screen w-[clamp(400px,50vw,700px)] bg-background border-l border-border flex flex-col z-40 shadow-lg"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border min-h-[52px] bg-muted/30">
            <h2 className="m-0 text-sm font-semibold text-foreground flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
              {artifact.title}
            </h2>

            {/* Controls */}
            <div className="flex gap-2 items-center ml-3">
              {showModeToggle && (
                <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'preview' | 'code')}>
                  <TabsList className="h-7">
                    <TabsTrigger value="preview" className="text-xs px-2.5 h-5">Preview</TabsTrigger>
                    <TabsTrigger value="code" className="text-xs px-2.5 h-5">Code</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleCopy}
                className={copied ? 'text-emerald-500' : 'text-muted-foreground'}
                title={copied ? 'Copied!' : 'Copy content'}
              >
                {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
              </Button>

              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleOpenInNewTab}
                className="text-muted-foreground"
                title="Open in new tab"
              >
                <IconExternalLink size={12} />
              </Button>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="text-muted-foreground"
                aria-label="Close artifact panel"
              >
                <IconX size={16} />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto flex flex-col">
            {isHtml && viewMode === 'preview' ? (
              <iframe
                sandbox="allow-scripts"
                srcDoc={artifact.content}
                className="flex-1 border-none bg-white"
                title={artifact.title}
              />
            ) : (
              <div className="flex-1 p-3.5 text-[13px] leading-5 font-mono text-foreground overflow-auto bg-muted/20">
                <pre className="m-0 p-0 bg-transparent text-inherit leading-inherit font-inherit">
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
