'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Lightbulb, X, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyTip {
  id: string
  day_number: number
  title: string
  body: string
  cta_label: string | null
  cta_path: string | null
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const bannerContainer: React.CSSProperties = {
  background: 'var(--bg-card-solid, rgba(15, 20, 30, 0.6))',
  backdropFilter: 'blur(20px)',
  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
  borderRadius: 12,
  padding: '16px 20px',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  position: 'relative' as const,
}

const iconWrapper: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 10,
  background: 'rgba(234, 179, 8, 0.12)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const closeBtn: React.CSSProperties = {
  position: 'absolute' as const,
  top: 12,
  right: 12,
  background: 'none',
  border: 'none',
  color: 'var(--text-dim, #475569)',
  cursor: 'pointer',
  padding: 4,
}

const ctaButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  borderRadius: 6,
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: 'var(--text-primary, #F1F5F9)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'background 0.15s ease',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DailyTipBannerProps {
  onNavigate?: (tabId: string) => void
}

export function DailyTipBanner({ onNavigate }: DailyTipBannerProps) {
  const [tip, setTip] = useState<DailyTip | null>(null)
  const [day, setDay] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Check if already dismissed today
    const dismissedKey = 'bb-daily-tip-dismissed'
    const lastDismissed = sessionStorage.getItem(dismissedKey)
    const today = new Date().toISOString().slice(0, 10)

    if (lastDismissed === today) {
      setDismissed(true)
      setLoaded(true)
      return
    }

    const fetchTip = async () => {
      try {
        const client = createClient()
        if (!client) { setLoaded(true); return }

        const { data: { session } } = await client.auth.getSession()
        if (!session) { setLoaded(true); return }

        const res = await fetch('/api/beta/daily-tip', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })

        if (res.ok) {
          const data = await res.json()
          if (data.tip) {
            setTip(data.tip)
            setDay(data.day)
          }
        }
      } catch {
        // Silent fail -- tip is non-critical
      } finally {
        setLoaded(true)
      }
    }

    fetchTip()
  }, [])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    const today = new Date().toISOString().slice(0, 10)
    sessionStorage.setItem('bb-daily-tip-dismissed', today)
  }, [])

  const handleCta = useCallback(() => {
    if (!tip?.cta_path) return

    // Extract tab ID from path like /dashboard/chat -> chat
    const tabId = tip.cta_path.replace('/dashboard/', '').replace('/', '-')

    if (onNavigate) {
      onNavigate(tabId)
    } else {
      // Dispatch custom nav event as fallback
      window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: tabId } }))
    }
  }, [tip, onNavigate])

  // Don't render if loading, dismissed, or no tip
  if (!loaded || dismissed || !tip) return null

  return (
    <div style={bannerContainer}>
      <div style={iconWrapper}>
        <Lightbulb size={18} style={{ color: '#eab308' }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #F1F5F9)' }}>
            {tip.title}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim, #475569)', fontWeight: 500 }}>
            Day {day}
          </span>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-secondary, #94A3B8)', lineHeight: 1.5, margin: '0 0 8px 0' }}>
          {tip.body}
        </p>

        {tip.cta_label && tip.cta_path && (
          <button onClick={handleCta} style={ctaButton}>
            {tip.cta_label}
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      <button onClick={handleDismiss} style={closeBtn} aria-label="Dismiss tip">
        <X size={16} />
      </button>
    </div>
  )
}
