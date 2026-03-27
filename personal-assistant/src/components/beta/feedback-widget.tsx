'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import { MessageSquarePlus, X, Camera, Send, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FeedbackCategory = 'bug' | 'feature' | 'ux' | 'performance' | 'other'

const CATEGORIES: { id: FeedbackCategory; label: string; icon: string }[] = [
  { id: 'bug', label: 'Bug Report', icon: '!' },
  { id: 'feature', label: 'Feature Request', icon: '+' },
  { id: 'ux', label: 'UX Feedback', icon: '*' },
  { id: 'performance', label: 'Performance', icon: '~' },
  { id: 'other', label: 'Other', icon: '?' },
]

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const fabButton: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  right: 24,
  width: 48,
  height: 48,
  borderRadius: 9999,
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.8))',
  backdropFilter: 'blur(20px)',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  color: 'var(--text-primary, #F1F5F9)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
}

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(4px)',
  zIndex: 10000,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'flex-end',
  padding: 24,
}

const modalContainer: React.CSSProperties = {
  width: 380,
  maxHeight: 'calc(100vh - 48px)',
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.95))',
  backdropFilter: 'blur(24px)',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
  borderRadius: 16,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column' as const,
}

const headerStyle: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
}

const categoryPill: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
  background: 'transparent',
  color: 'var(--text-secondary, #94A3B8)',
  transition: 'all 0.15s ease',
}

const categoryPillActive: React.CSSProperties = {
  ...categoryPill,
  background: 'var(--bg-elevated, rgba(25, 35, 50, 0.8))',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  color: 'var(--text-primary, #F1F5F9)',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 100,
  padding: 12,
  borderRadius: 8,
  background: 'var(--bg-input, rgba(13, 17, 23, 0.6))',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 14,
  lineHeight: 1.5,
  resize: 'vertical' as const,
  fontFamily: 'inherit',
  outline: 'none',
}

const submitButton: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  background: 'var(--btn-primary-bg, #F1F5F9)',
  color: 'var(--btn-primary-fg, #0a0f1a)',
  border: 'none',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  transition: 'opacity 0.15s ease',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeedbackWidget() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [message, setMessage] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea when modal opens
  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }, [open])

  const handleCapture = useCallback(async () => {
    // Use the browser screenshot API if available (html2canvas pattern)
    // For MVP, we capture via the File input approach
    setCapturing(true)
    try {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (!file) { setCapturing(false); return }

        // Convert to base64 data URL for simplicity (could upload to storage later)
        const reader = new FileReader()
        reader.onload = () => {
          setScreenshotUrl(reader.result as string)
          setCapturing(false)
        }
        reader.onerror = () => setCapturing(false)
        reader.readAsDataURL(file)
      }
      input.click()
    } catch {
      setCapturing(false)
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!category || !message.trim() || message.trim().length < 5) {
      setError('Select a category and write at least 5 characters')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const client = createClient()
      if (!client) throw new Error('Not connected')

      const { data: { session } } = await client.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch('/api/beta/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          category,
          message: message.trim(),
          screenshot_url: screenshotUrl,
          page_url: window.location.pathname,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Submission failed')
      }

      setSubmitted(true)
      setTimeout(() => {
        setOpen(false)
        setSubmitted(false)
        setCategory(null)
        setMessage('')
        setScreenshotUrl(null)
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit')
    } finally {
      setSubmitting(false)
    }
  }, [category, message, screenshotUrl])

  const handleClose = useCallback(() => {
    setOpen(false)
    setError(null)
  }, [])

  // Close on escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, handleClose])

  return (
    <>
      {/* Floating action button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={fabButton}
          aria-label="Send feedback"
          title="Send feedback"
        >
          <MessageSquarePlus size={20} />
        </button>
      )}

      {/* Modal */}
      {open && (
        <div style={modalOverlay} onClick={handleClose}>
          <div style={modalContainer} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div style={headerStyle}>
              <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary, #F1F5F9)' }}>
                Send Feedback
              </span>
              <button
                onClick={handleClose}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
              {submitted ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <Check size={32} style={{ color: '#22c55e', marginBottom: 12 }} />
                  <p style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                    Thanks for your feedback
                  </p>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '8px 0 0 0' }}>
                    We review every submission.
                  </p>
                </div>
              ) : (
                <>
                  {/* Categories */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
                      Category
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {CATEGORIES.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setCategory(c.id)}
                          style={category === c.id ? categoryPillActive : categoryPill}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
                      What's on your mind?
                    </label>
                    <textarea
                      ref={textareaRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Describe the issue or suggestion..."
                      style={textareaStyle}
                      maxLength={5000}
                    />
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>
                      {message.length}/5000
                    </div>
                  </div>

                  {/* Screenshot */}
                  <div>
                    <button
                      onClick={handleCapture}
                      disabled={capturing}
                      style={{
                        ...categoryPill,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        opacity: capturing ? 0.5 : 1,
                      }}
                    >
                      <Camera size={14} />
                      {screenshotUrl ? 'Replace Screenshot' : 'Attach Screenshot'}
                    </button>
                    {screenshotUrl && (
                      <div style={{ marginTop: 8, position: 'relative', display: 'inline-block' }}>
                        <img
                          src={screenshotUrl}
                          alt="Screenshot preview"
                          style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}
                        />
                        <button
                          onClick={() => setScreenshotUrl(null)}
                          style={{
                            position: 'absolute', top: -6, right: -6,
                            width: 20, height: 20, borderRadius: 9999,
                            background: 'var(--bg-card-solid)', border: '1px solid var(--border-subtle)',
                            color: 'var(--text-secondary)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12,
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Error */}
                  {error && (
                    <div style={{ fontSize: 13, color: '#ef4444', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                      {error}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !category || message.trim().length < 5}
                    style={{
                      ...submitButton,
                      opacity: submitting || !category || message.trim().length < 5 ? 0.5 : 1,
                      alignSelf: 'flex-end',
                    }}
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {submitting ? 'Sending...' : 'Submit'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
