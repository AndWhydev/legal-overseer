'use client'

import { useState } from 'react'
import { Download, Copy, Send, ExternalLink, Check } from 'lucide-react'

interface InvoiceArtifactProps {
  invoiceNumber: string
  recipient: string
  recipientEmail: string
  total: string
  dueDate: string
  description: string
  html: string
  subject: string
  onSend?: () => void
}

export function InvoiceArtifact({
  invoiceNumber,
  recipient,
  recipientEmail,
  total,
  dueDate,
  description,
  html,
  subject,
  onSend,
}: InvoiceArtifactProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(html)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenNew = () => {
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
    }
  }

  const handleDownload = () => {
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      setTimeout(() => w.print(), 500)
    }
  }

  const container: React.CSSProperties = {
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid var(--glass-card-border, rgba(255,255,255,0.08))',
    background: 'var(--glass-card-bg, rgba(255,255,255,0.03))',
    maxWidth: 520,
    margin: '8px 0',
  }

  const titleBar: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--glass-card-border, rgba(255,255,255,0.08))',
    background: 'var(--glass-hover-bg, rgba(255,255,255,0.04))',
  }

  const titleText: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary, #E2E8F0)',
    letterSpacing: '-0.01em',
  }

  const subtitle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-dim, #64748B)',
    marginTop: 2,
  }

  const actions: React.CSSProperties = {
    display: 'flex',
    gap: 4,
  }

  const actionBtn: React.CSSProperties = {
    width: 30,
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'var(--text-dim, #64748B)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  }

  const preview: React.CSSProperties = {
    width: '100%',
    height: 360,
    border: 'none',
    background: '#ffffff',
  }

  const footer: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderTop: '1px solid var(--glass-card-border, rgba(255,255,255,0.08))',
    fontSize: 12,
    color: 'var(--text-dim, #64748B)',
  }

  const sendBtn: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    border: 'none',
    background: 'var(--text-primary, #1A1A1B)',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
  }

  return (
    <div style={container}>
      <div style={titleBar}>
        <div>
          <div style={titleText}>Invoice {invoiceNumber}</div>
          <div style={subtitle}>{recipient} · {total}</div>
        </div>
        <div style={actions}>
          <button
            style={actionBtn}
            onClick={handleCopy}
            title="Copy HTML"
            onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--glass-hover-bg, rgba(255,255,255,0.08))' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <button
            style={actionBtn}
            onClick={handleDownload}
            title="Save as PDF"
            onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--glass-hover-bg, rgba(255,255,255,0.08))' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
          >
            <Download size={14} />
          </button>
          <button
            style={actionBtn}
            onClick={handleOpenNew}
            title="Open in new tab"
            onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--glass-hover-bg, rgba(255,255,255,0.08))' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent' }}
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>

      <iframe
        srcDoc={html}
        style={preview}
        sandbox="allow-same-origin"
        title={`Invoice ${invoiceNumber}`}
      />

      <div style={footer}>
        <span>{description} · Due {dueDate}</span>
        {onSend && (
          <button style={sendBtn} onClick={onSend}>
            <Send size={12} />
            Send to {recipient.split(' ')[0]}
          </button>
        )}
      </div>
    </div>
  )
}
