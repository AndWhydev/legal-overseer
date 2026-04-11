'use client'

import { useState } from 'react'
import { IconDownload, IconCopy, IconExternalLink, IconCheck, IconPencil } from '@tabler/icons-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

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
      await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Send this invoice to ${recipientEmail} with subject "${subject}". Use send_outlook.` }),
      })
      setSent(true)
    } catch {
      setSending(false)
    }
  }

  return (
    <Card className="max-w-[520px] my-2 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 bg-muted border-b border-border">
        <div>
          <div className="text-sm font-medium text-foreground tracking-tight">
            Invoice {invoiceNumber}
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            {recipient} · {total}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title="Copy HTML">
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} title="Save as PDF">
            <IconDownload size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleOpenNew} title="Open in new tab">
            <IconExternalLink size={14} />
          </Button>
        </div>
      </CardHeader>

      <div className="border-b border-border overflow-hidden relative h-[693px]">
        <iframe
          srcDoc={html}
          className="w-[794px] h-[1123px] border-none bg-white block"
          style={{
            transform: 'scale(0.617)',
            transformOrigin: 'top left',
          }}
          sandbox="allow-same-origin"
          title={`Invoice ${invoiceNumber}`}
        />
      </div>

      <CardContent className="flex items-center justify-between gap-3 py-3 flex-wrap">
        <div className="flex-1 min-w-0 text-sm text-muted-foreground leading-snug">
          {description}
          <span className="opacity-60"> · Due {dueDate}</span>
        </div>
        <div className="flex gap-2 shrink-0">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <IconPencil size={13} /> Edit
            </Button>
          )}
          {!sent ? (
            <Button size="sm" onClick={handleSend} disabled={sending}>
              {sending ? 'Sending...' : `Send to ${recipient.split(' ')[0]}`}
            </Button>
          ) : (
            <Badge variant="default" className="bg-emerald-600 text-white gap-1.5 py-1.5 px-3">
              <IconCheck size={13} /> Sent
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
