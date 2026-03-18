'use client'

import { useMemo } from 'react'

interface MarkdownRendererProps {
  content: string
  compact?: boolean
  style?: React.CSSProperties
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderInline(text: string): string {
  let r = escapeHtml(text)
  // Bold
  r = r.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  r = r.replace(/__(.*?)__/g, '<strong>$1</strong>')
  // Italic (avoid matching underscores in_words)
  r = r.replace(/\*(.*?)\*/g, '<em>$1</em>')
  // Inline code
  r = r.replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.06);padding:4px 4px;border-radius:4px;font-size:0.9em">$1</code>')
  return r
}

function renderMarkdown(content: string): string {
  const lines = content.split('\n')
  const html: string[] = []
  let inList = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      if (inList) { html.push('</ul>'); inList = false }
      continue
    }

    // Headers
    if (trimmed.startsWith('### ')) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<div style="margin:8px 0 4px;font-size:14px;font-weight:500;color:var(--text-primary)">${renderInline(trimmed.slice(4))}</div>`)
      continue
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<div style="margin:8px 0 4px;font-size:14px;font-weight:500;color:var(--text-primary)">${renderInline(trimmed.slice(3))}</div>`)
      continue
    }
    if (trimmed.startsWith('# ')) {
      if (inList) { html.push('</ul>'); inList = false }
      html.push(`<div style="margin:8px 0 4px;font-size:16px;font-weight:500;color:var(--text-primary)">${renderInline(trimmed.slice(2))}</div>`)
      continue
    }

    // List items
    if (/^[-*]\s/.test(trimmed)) {
      if (!inList) {
        html.push('<ul style="margin:4px 0;padding-left:16px">')
        inList = true
      }
      html.push(`<li style="margin:4px 0">${renderInline(trimmed.slice(2))}</li>`)
      continue
    }

    // Paragraph
    if (inList) { html.push('</ul>'); inList = false }
    html.push(`<div style="margin:4px 0">${renderInline(trimmed)}</div>`)
  }

  if (inList) html.push('</ul>')
  return html.join('')
}

export function MarkdownRenderer({ content, compact, style }: MarkdownRendererProps) {
  const html = useMemo(() => {
    if (compact) {
      // Card preview: inline formatting only, collapsed to single line
      return renderInline(content.split('\n').filter(l => l.trim()).join(' '))
    }
    return renderMarkdown(content)
  }, [content, compact])

  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      style={{
        fontSize: 14,
        lineHeight: 1.5,
        color: 'var(--text-secondary)',
        wordBreak: 'break-word',
        ...style,
      }}
    />
  )
}
