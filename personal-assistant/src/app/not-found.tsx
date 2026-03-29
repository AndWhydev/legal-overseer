'use client'

import Link from 'next/link'
import { motion } from 'motion/react'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-primary, #0a0f1a)',
      padding: '24px',
      gap: 24,
      fontFamily: 'var(--font-dm-sans, DM Sans, sans-serif)',
    }}>
      {/* Mascot image — theme-aware color via CSS filter */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
      >
        <img
          src="/error-mascot.png"
          alt="Lost BitBit mascot"
          width={240}
          height={240}
          style={{
            // Black fill image — invert for dark theme (white), keep black for light
            filter: 'var(--error-mascot-filter, brightness(0) invert(1))',
            opacity: 0.85,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
          draggable={false}
        />
      </motion.div>

      {/* 404 text */}
      <motion.div
        style={{ textAlign: 'center' }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.25 }}
      >
        <h1 style={{
          fontFamily: "var(--font-bb-mono, 'JetBrains Mono', monospace)",
          fontSize: 16,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary, #fff)',
          margin: 0,
          lineHeight: 1,
        }}>
          404
        </h1>
        <p style={{
          fontSize: 16,
          color: 'var(--text-secondary, rgba(255,255,255,0.5))',
          margin: '12px 0 0',
          maxWidth: 340,
          lineHeight: 1.5,
        }}>
          This page wandered off. Even BitBit can't find it.
        </p>
      </motion.div>

      {/* Action buttons */}
      <motion.div
        style={{ display: 'flex', gap: 12, marginTop: 8 }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.4 }}
      >
        <Link
          href="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 12,
            background: 'var(--text-primary, #fff)',
            color: 'var(--bg-primary, #0a0f1a)',
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          Go to Dashboard
        </Link>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 20px',
            borderRadius: 12,
            background: 'var(--glass-bg, rgba(255,255,255,0.06))',
            border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
            color: 'var(--text-secondary, rgba(255,255,255,0.6))',
            fontSize: 14,
            fontWeight: 500,
            textDecoration: 'none',
            backdropFilter: 'blur(8px)',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--glass-border-hover, rgba(255,255,255,0.2))'
            e.currentTarget.style.color = 'var(--text-primary, #fff)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--glass-border, rgba(255,255,255,0.1))'
            e.currentTarget.style.color = 'var(--text-secondary, rgba(255,255,255,0.6))'
          }}
        >
          Home
        </Link>
      </motion.div>
    </div>
  )
}
