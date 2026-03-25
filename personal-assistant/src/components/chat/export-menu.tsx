'use client'

import React, { useState, useCallback } from 'react'
import { Download, Copy, Check, FileText, Code } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'

interface ExportMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ExportMenuProps {
  messages: ExportMessage[]
}

function messagesToMarkdown(messages: ExportMessage[]): string {
  return messages.map(m => {
    const role = m.role === 'user' ? 'You' : 'BitBit'
    const time = m.timestamp.toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' })
    return `### ${role} — ${time}\n\n${m.content}`
  }).join('\n\n---\n\n')
}

export function ExportMenu({ messages }: ExportMenuProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyMarkdown = useCallback(() => {
    const md = messagesToMarkdown(messages)
    navigator.clipboard.writeText(md).then(() => {
      setCopied(true)
      setTimeout(() => { setCopied(false); setOpen(false) }, 1500)
    })
  }, [messages])

  const handleDownloadMarkdown = useCallback(() => {
    const md = messagesToMarkdown(messages)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bitbit-conversation-${new Date().toISOString().slice(0, 10)}.md`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }, [messages])

  const handleDownloadJSON = useCallback(() => {
    const json = JSON.stringify(messages.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    })), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bitbit-conversation-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }, [messages])

  if (messages.length === 0) return null

  const btnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '8px 12px', background: 'none', border: 'none',
    color: 'var(--text-secondary, #94A3B8)', cursor: 'pointer', fontSize: 13,
    borderRadius: 0, textAlign: 'left' as const,
    transition: 'background 100ms',
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', padding: 4,
          color: 'var(--text-muted, rgba(255,255,255,0.35))', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="Export conversation"
        aria-label="Export conversation"
      >
        <Download size={16} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop to close */}
            <div
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 49 }}
            />
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: 'var(--bg-card, rgba(15, 20, 30, 0.95))',
                backdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10,
                overflow: 'hidden',
                minWidth: 200,
                zIndex: 50,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              }}
            >
              <button
                onClick={handleCopyMarkdown}
                style={btnStyle}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                {copied ? <Check size={14} style={{ color: 'var(--bb-green)' }} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy as Markdown'}
              </button>
              <button
                onClick={handleDownloadMarkdown}
                style={btnStyle}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                <FileText size={14} /> Download .md
              </button>
              <button
                onClick={handleDownloadJSON}
                style={btnStyle}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              >
                <Code size={14} /> Download .json
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
