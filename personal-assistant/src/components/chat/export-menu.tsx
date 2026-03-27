'use client'

import React, { useState, useCallback } from 'react'
import { IconDownload, IconCopy, IconCheck, IconFileText, IconCode } from '@tabler/icons-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => setOpen(!open)}
        title="Export conversation"
        aria-label="Export conversation"
      >
        <IconDownload className="size-4" />
      </Button>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop to close */}
            <div
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[49]"
            />
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
            >
              <button
                onClick={handleCopyMarkdown}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copied ? <IconCheck className="size-3.5 text-emerald-500" /> : <IconCopy className="size-3.5" />}
                {copied ? 'Copied!' : 'Copy as Markdown'}
              </button>
              <button
                onClick={handleDownloadMarkdown}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconFileText className="size-3.5" /> Download .md
              </button>
              <button
                onClick={handleDownloadJSON}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconCode className="size-3.5" /> Download .json
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
