'use client'

import { useState } from 'react'
import { Download, Copy, ExternalLink, Check, Send, Pencil } from 'lucide-react'

interface InvoiceArtifactProps {
  invoiceNumber: string
  recipient: string
  recipientEmail: string
  total: string
  dueDate: string
  description: string
  html: string
  subject: string
  onSend?: (recipientEmail: string, subject: string, html: string) => void
  onEdit?: () => void
}

export function InvoiceArtifact({
  invoiceNumber, recipient, recipientEmail, total, dueDate, description, html, subject, onSend, onEdit,
}: InvoiceArtifactProps) {
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  const handleCopy = () => { navigator.clipboard.writeText(html); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const handleOpenNew = () => { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close() } }
  const handleDownload = () => { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 500) } }

  const handleSend = async () => {
    if (onSend) { onSend(recipientEmail, subject, html); return }
    // Default: call the send API directly
    setSending(true)
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Send this invoice to ${recipientEmail} with subject "${subject}". Use send_outlook.` }),
      })
      setSent(true)
    } catch {
      setSending(false)
    }
  }

  const card: React.CSSProperties = {
    borderRadius: 12, overflow: 'hidden', maxWidth: 520, margin: '8px 0',
    border: '1px solid var(--glass-card-border, rgba(255,255,255,0.08))',
    background: 'var(--glass-card-bg, rgba(255,255,255,0.03))',
  }
  const header: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid var(--glass-card-border, rgba(255,255,255,0.08))',
    background: 'var(--glass-hover-bg, rgba(255,255,255,0.04))',
  }
  const iconBtn: React.CSSProperties = {
    width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 6, border: 'none', background: 'transparent',
    color: 'var(--text-dim, #64748B)', cursor: 'pointer', transition: 'all 0.15s',
  }
  const actionBar: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px',
    borderTop: '1px solid var(--glass-card-border, rgba(255,255,255,0.08))',
    gap: 8,
  }
  const primaryBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 18px', borderRadius: 8, border: 'none',
    background: '#2563EB', color: '#FFFFFF',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'opacity 0.15s',
  }
  const secondaryBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8,
    border: '1px solid var(--glass-card-border, rgba(255,255,255,0.12))',
    background: 'transparent', color: 'var(--text-secondary, #94A3B8)',
    fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
  }

  return (
    <div style={card}>
      <div style={header}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #E2E8F0)', letterSpacing: '-0.01em' }}>
            Invoice {invoiceNumber}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim, #64748B)', marginTop: 2 }}>
            {recipient} · {total}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={iconBtn} onClick={handleCopy} title="Copy HTML">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          <button style={iconBtn} onClick={handleDownload} title="Save as PDF"><Download size={14} /></button>
          <button style={iconBtn} onClick={handleOpenNew} title="Open in new tab"><ExternalLink size={14} /></button>
        </div>
      </div>

      <iframe
        srcDoc={html}
        style={{ width: '100%', height: 340, border: 'none', background: '#ffffff' }}
        sandbox="allow-same-origin"
        title={`Invoice ${invoiceNumber}`}
      />

      <div style={actionBar}>
        <div style={{ fontSize: 11, color: 'var(--text-dim, #64748B)' }}>
          {description} · Due {dueDate}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onEdit && (
            <button style={secondaryBtn} onClick={onEdit}>
              <Pencil size={13} /> Edit
            </button>
          )}
          {!sent ? (
            <button style={{ ...primaryBtn, opacity: sending ? 0.6 : 1 }} onClick={handleSend} disabled={sending}>
              <Send size={13} /> {sending ? 'Sending...' : `Send to ${recipient.split(' ')[0]}`}
            </button>
          ) : (
            <div style={{ ...primaryBtn, background: '#16A34A', cursor: 'default' }}>
              <Check size={13} /> Sent
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
